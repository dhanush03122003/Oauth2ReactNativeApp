import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const initializeDatabase = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(255) UNIQUE NOT NULL,
        current_challenge TEXT,
        created_at TIMESTAMP DEFAULT timezone('Asia/Kolkata', now())
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS authenticators (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        credential_id TEXT UNIQUE NOT NULL,
        public_key BYTEA NOT NULL,
        counter INTEGER NOT NULL DEFAULT 0,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        transports TEXT[],
        aaguid TEXT,
        device_type TEXT,
        backed_up BOOLEAN,
        attachment_type TEXT,
        nickname VARCHAR(255),
        last_used_at TIMESTAMP, 
        created_at TIMESTAMP DEFAULT timezone('Asia/Kolkata', now())
      );
    `);

    // --- NEW: AUDIT LOGS TABLE ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        credential_id TEXT NOT NULL,
        ip_address TEXT,
        location TEXT,
        user_agent TEXT,
        login_time TIMESTAMP DEFAULT timezone('Asia/Kolkata', now())
      );
    `);

    console.log("Database tables initialized successfully");
  } catch (error) {
    console.error("Database initialization error:", error);
    throw error;
  } finally {
    client.release();
  }
};

// db.js -> Update logAuthEvent function
export const logAuthEvent = async (
  userId,
  credentialId,
  ipAddress,
  userAgent,
  location,
) => {
  // 1. Insert into the permanent audit log
  await pool.query(
    `INSERT INTO audit_logs (user_id, credential_id, ip_address, location, user_agent, login_time) 
     VALUES ($1, $2, $3, $4, $5, timezone('Asia/Kolkata', now()))`,
    [userId, credentialId, ipAddress, location, userAgent], // <-- Added location
  );

  // 2. Update the "last used" timestamp on the authenticator itself
  await pool.query(
    `UPDATE authenticators 
     SET last_used_at = timezone('Asia/Kolkata', now()) 
     WHERE credential_id = $1`,
    [credentialId],
  );
};
export const findUserByUsername = async (username) => {
  const result = await pool.query("SELECT * FROM users WHERE username = $1", [
    username,
  ]);
  return result.rows[0];
};

export const findUserById = async (id) => {
  const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  return result.rows[0];
};

export const createUser = async (username) => {
  const result = await pool.query(
    "INSERT INTO users (username) VALUES ($1) RETURNING *",
    [username],
  );
  return result.rows[0];
};

export const updateUserChallenge = async (userId, challenge) => {
  await pool.query(
    "UPDATE users SET current_challenge = $1::text WHERE id = $2",
    [challenge, userId],
  );
};

export const clearUserChallenge = async (userId) => {
  await pool.query(
    "UPDATE users SET current_challenge = NULL::text WHERE id = $1",
    [userId],
  );
};

export const getAuthenticatorsForUser = async (userId) => {
  const result = await pool.query(
    `SELECT a.*, 
            (SELECT al.location 
             FROM audit_logs al 
             WHERE al.credential_id = a.credential_id 
             ORDER BY al.login_time DESC LIMIT 1) as last_location
     FROM authenticators a 
     WHERE a.user_id = $1`,
    [userId],
  );
  return result.rows;
};
// Update saveAuthenticator to accept nickname and force last_used_at to IST
export const saveAuthenticator = async (userId, credential) => {
  const {
    credentialID,
    publicKey,
    counter,
    transports,
    aaguid,
    deviceType,
    backedUp,
    attachmentType,
    nickname, // ACCEPT NICKNAME
  } = credential;

  await pool.query(
    `INSERT INTO authenticators (
      credential_id, public_key, counter, user_id, transports, 
      aaguid, device_type, backed_up, attachment_type, nickname, last_used_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, timezone('Asia/Kolkata', now()))`,
    [
      credentialID,
      publicKey,
      counter,
      userId,
      transports,
      aaguid,
      deviceType,
      backedUp,
      attachmentType,
      nickname,
    ],
  );
};

export const deleteAuthenticatorById = async (authId, userId) => {
  const result = await pool.query(
    "DELETE FROM authenticators WHERE id = $1 AND user_id = $2 RETURNING *",
    [authId, userId],
  );
  return result.rowCount > 0;
};

/**
 * Updates the nickname of a specific authenticator
 */
export const updateAuthenticatorNickname = async (
  authId,
  userId,
  newNickname,
) => {
  const result = await pool.query(
    "UPDATE authenticators SET nickname = $1 WHERE id = $2 AND user_id = $3 RETURNING *",
    [newNickname, authId, userId],
  );
  return result.rowCount > 0;
};

export const updateAuthenticatorCounter = async (credentialId, newCounter) => {
  await pool.query(
    "UPDATE authenticators SET counter = $1 WHERE credential_id = $2",
    [newCounter, credentialId],
  );
};

export const findAuthenticatorByCredentialId = async (credentialId) => {
  const result = await pool.query(
    "SELECT * FROM authenticators WHERE credential_id = $1",
    [credentialId],
  );
  return result.rows[0];
};

export const wipeAllData = async () => {
  const client = await pool.connect();
  try {
    // Also clearing audit_logs to ensure a clean wipe
    await client.query(
      "TRUNCATE TABLE users, authenticators, audit_logs RESTART IDENTITY CASCADE;",
    );
    console.log("Database wiped successfully.");
  } catch (error) {
    console.error("Error wiping database:", error);
    throw error;
  } finally {
    client.release();
  }
};
