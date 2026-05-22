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
    // Users table remains the same
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(255) UNIQUE NOT NULL,
        current_challenge TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Updated authenticators table with metadata columns
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
        nickname TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log(
      "Database tables initialized successfully with metadata support",
    );
  } catch (error) {
    console.error("Database initialization error:", error);
    throw error;
  } finally {
    client.release();
  }
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
    "SELECT * FROM authenticators WHERE user_id = $1",
    [userId],
  );
  return result.rows;
};

/**
 * Updated saveAuthenticator to include device metadata
 */
// export const saveAuthenticator = async (userId, credential) => {
//   const {
//     credentialID,
//     publicKey,
//     counter,
//     transports,
//     aaguid,
//     deviceType,
//     backedUp,
//     attachmentType,
//   } = credential;

//   await pool.query(
//     `INSERT INTO authenticators (
//       credential_id,
//       public_key,
//       counter,
//       user_id,
//       transports,
//       aaguid,
//       device_type,
//       backed_up,
//       attachment_type
//     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
//     [
//       credentialID,
//       publicKey,
//       counter,
//       userId,
//       transports,
//       aaguid,
//       deviceType,
//       backedUp,
//       attachmentType,
//     ],
//   );
// };

// Update saveAuthenticator to accept and insert the nickname
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
      aaguid, device_type, backed_up, attachment_type, nickname
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
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
    await client.query(
      "TRUNCATE TABLE users, authenticators RESTART IDENTITY CASCADE;",
    );
    console.log("Database wiped successfully.");
  } catch (error) {
    console.error("Error wiping database:", error);
    throw error;
  } finally {
    client.release();
  }
};
