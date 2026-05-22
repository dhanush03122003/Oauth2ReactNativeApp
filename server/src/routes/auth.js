import express from "express";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
// MISSING PATH ADDED: Required for the isoBase64URL.toBuffer conversion
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { SignJWT, jwtVerify } from "jose";

import {
  findUserByUsername,
  findUserById,
  createUser,
  updateUserChallenge,
  clearUserChallenge,
  getAuthenticatorsForUser,
  saveAuthenticator,
  findAuthenticatorByCredentialId,
  updateAuthenticatorCounter,
  deleteAuthenticatorById,
  updateAuthenticatorNickname,
  wipeAllData,
} from "../db.js";

const router = express.Router();
const encoder = new TextEncoder();

const JWT_SECRET = encoder.encode(process.env.JWT_SECRET || "default-secret");
const RP_ID = process.env.RP_ID || "localhost";
const RP_NAME = process.env.RP_NAME || "WebAuthn App";
const RP_ORIGIN = process.env.RP_ORIGIN || "http://localhost:5173";

// --- Registration ---

router.get("/generate-registration-options", async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: "Username required" });

  try {
    let user = await findUserByUsername(username);
    if (!user) user = await createUser(username);

    const userPasskeys = await getAuthenticatorsForUser(user.id);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: encoder.encode(user.id),
      userName: user.username,
      attestationType: "none",
      excludeCredentials: userPasskeys.map((pk) => ({
        id: pk.credential_id,
        transports: pk.transports,
      })),
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "preferred",
      },
    });

    await updateUserChallenge(user.id, options.challenge);
    res.json(options);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// router.post("/verify-registration", async (req, res) => {
//   const { username, verification } = req.body;
//   try {
//     const user = await findUserByUsername(username);
//     if (!user?.current_challenge) throw new Error("No challenge found");

//     const verificationResult = await verifyRegistrationResponse({
//       response: verification,
//       expectedChallenge: user.current_challenge,
//       expectedOrigin: RP_ORIGIN,
//       expectedRPID: RP_ID,
//       requireUserVerification: false,
//     });

//     if (verificationResult.verified) {
//       const { registrationInfo } = verificationResult;
//       const { credential, credentialDeviceType, credentialBackedUp } =
//         registrationInfo;

//       await saveAuthenticator(user.id, {
//         credentialID: credential.id,
//         publicKey: Buffer.from(credential.publicKey),
//         counter: credential.counter,
//         transports: credential.transports || ["internal"],
//         deviceType: credentialDeviceType,
//         backedUp: credentialBackedUp,
//       });

//       await clearUserChallenge(user.id);

//       const token = await new SignJWT({
//         userId: user.id,
//         username: user.username,
//       })
//         .setProtectedHeader({ alg: "HS256" })
//         .setIssuedAt()
//         .setExpirationTime("1d")
//         .sign(JWT_SECRET);

//       return res.json({
//         success: true,
//         token,
//         user: { id: user.id, username: user.username },
//       });
//     }
//     res.status(400).json({ error: "Registration verification failed" });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// --- Authentication ---

// router file (e.g., auth.js)

router.post("/verify-registration", async (req, res) => {
  // Add 'nickname' to the destructured body parameters
  const { username, verification, nickname } = req.body;
  try {
    const user = await findUserByUsername(username);
    if (!user?.current_challenge) throw new Error("No challenge found");

    const verificationResult = await verifyRegistrationResponse({
      response: verification,
      expectedChallenge: user.current_challenge,
      expectedOrigin: RP_ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: false,
    });

    if (verificationResult.verified) {
      const { registrationInfo } = verificationResult;
      const { credential, credentialDeviceType, credentialBackedUp, aaguid } =
        registrationInfo;

      const attachmentType = credential.transports?.includes("internal")
        ? "platform"
        : "cross-platform";

      await saveAuthenticator(user.id, {
        credentialID: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports || ["internal"],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        aaguid: aaguid,
        attachmentType: attachmentType,
        nickname: nickname || "Unnamed Passkey", // <-- Fallback default name
      });

      await clearUserChallenge(user.id);

      const token = await new SignJWT({
        userId: user.id,
        username: user.username,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("1d")
        .sign(JWT_SECRET);

      return res.json({
        success: true,
        token,
        user: { id: user.id, username: user.username },
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.get("/generate-authentication-options", async (req, res) => {
  const { username } = req.query;
  try {
    const user = await findUserByUsername(username);
    if (!user) return res.status(404).json({ error: "User not found" });

    const userPasskeys = await getAuthenticatorsForUser(user.id);

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: userPasskeys.map((pk) => ({
        id: pk.credential_id,
        type: "public-key",
        transports: pk.transports || ["internal"],
      })),
      userVerification: "preferred",
    });

    await updateUserChallenge(user.id, options.challenge);
    res.json(options);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// router.post("/verify-authentication", async (req, res) => {
//   const { username, verification } = req.body;
//   try {
//     const user = await findUserByUsername(username);
//     const passkey = await findAuthenticatorByCredentialId(verification.id);

//     if (!user || !passkey) {
//       return res.status(400).json({ error: "User or Passkey not found" });
//     }

//     const verificationResult = await verifyAuthenticationResponse({
//       response: verification,
//       expectedChallenge: user.current_challenge,
//       expectedOrigin: RP_ORIGIN,
//       expectedRPID: RP_ID,
//       credential: {
//         id: passkey.credential_id,
//         // Using the newly imported isoBase64URL helper here:
//         credentialID: isoBase64URL.toBuffer(passkey.credential_id),
//         publicKey: new Uint8Array(passkey.public_key),
//         counter: Number(passkey.counter),
//         transports: passkey.transports,
//       },
//       requireUserVerification: false,
//     });

//     if (verificationResult.verified) {
//       const { authenticationInfo } = verificationResult;

//       await updateAuthenticatorCounter(
//         passkey.credential_id,
//         authenticationInfo.newCounter,
//       );
//       console.log("new counter ", authenticationInfo.newCounter);

//       await clearUserChallenge(user.id);

//       const token = await new SignJWT({
//         userId: user.id,
//         username: user.username,
//       })
//         .setProtectedHeader({ alg: "HS256" })
//         .setIssuedAt()
//         .setExpirationTime("1d")
//         .sign(JWT_SECRET);

//       return res.json({
//         success: true,
//         token,
//         user: { id: user.id, username: user.username },
//       });
//     }
//     res.status(400).json({ error: "Authentication failed" });
//   } catch (error) {
//     console.error("Auth Error:", error);
//     res.status(500).json({ error: error.message });
//   }
// });

// --- Profile & Token Utility ---

router.post("/verify-authentication", async (req, res) => {
  const { username, verification } = req.body;
  try {
    let user;
    let expectedChallenge;

    // --- UPDATED LOGIC HERE ---
    if (username) {
      // 1. Manual Login Path: If the frontend sent a username, use the database challenge
      user = await findUserByUsername(username);
      expectedChallenge = user?.current_challenge;
    } else if (req.cookies?.auth_challenge) {
      // 2. Conditional UI Path: No username sent, so rely on the secure cookie
      expectedChallenge = req.cookies.auth_challenge;
    }

    if (!expectedChallenge)
      throw new Error("No active authentication challenge found.");

    // 2. Identify the passkey used from the incoming verification ID
    const passkey = await findAuthenticatorByCredentialId(verification.id);
    if (!passkey)
      return res.status(400).json({ error: "Passkey not recognized." });

    // 3. Identify the user if we haven't already (Conditional UI mode)
    if (!user) {
      user = await findUserById(passkey.user_id);
    }
    if (!user) return res.status(400).json({ error: "User not found." });

    // 4. Verify the cryptographic signature
    const verificationResult = await verifyAuthenticationResponse({
      response: verification,
      expectedChallenge: expectedChallenge,
      expectedOrigin: RP_ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: passkey.credential_id,
        credentialID: isoBase64URL.toBuffer(passkey.credential_id),
        publicKey: new Uint8Array(passkey.public_key),
        counter: Number(passkey.counter),
        transports: passkey.transports,
      },
      requireUserVerification: false,
    });

    if (verificationResult.verified) {
      const { authenticationInfo } = verificationResult;

      await updateAuthenticatorCounter(
        passkey.credential_id,
        authenticationInfo.newCounter,
      );

      // Clean up challenges
      await clearUserChallenge(user.id);
      res.clearCookie("auth_challenge");

      const token = await new SignJWT({
        userId: user.id,
        username: user.username,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("1d")
        .sign(JWT_SECRET);

      return res.json({
        success: true,
        token,
        user: { id: user.id, username: user.username },
      });
    }
    res.status(400).json({ error: "Authentication failed." });
  } catch (error) {
    console.error("Auth Error:", error);
    res.status(500).json({ error: error.message });
  }
});
router.post("/verify-token", async (req, res) => {
  const { token } = req.body;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const user = await findUserById(payload.userId);
    res.json({ user: { id: user.id, username: user.username } });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

router.get("/generate-additional-device-options", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];
  try {
    // 1. Identify the logged-in user from their JWT
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const user = await findUserById(payload.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // 2. Fetch their existing keys to avoid duplicates
    const userPasskeys = await getAuthenticatorsForUser(user.id);

    // 3. Generate registration options with exclusions
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: encoder.encode(user.id),
      userName: user.username,
      attestationType: "none",
      excludeCredentials: userPasskeys.map((pk) => ({
        id: pk.credential_id,
        type: "public-key",
        transports: pk.transports,
      })),
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "preferred",
      },
    });

    // 4. Save the new challenge to their user account
    await updateUserChallenge(user.id, options.challenge);

    res.json(options);
  } catch (error) {
    res.status(401).json({ error: "Invalid token or session expired" });
  }
});

router.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer "))
    return res.status(401).json({ error: "Unauthorized" });

  const token = authHeader.split(" ")[1];
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const user = await findUserById(payload.userId);
    const authenticators = await getAuthenticatorsForUser(user.id);

    res.json({
      user: { id: user.id, username: user.username },
      authenticators: authenticators.map((auth) => ({
        id: auth.id,
        credentialId: auth.credential_id,
        counter: auth.counter,
        createdAt: auth.created_at,
        // --- ADD THESE NEW FIELDS ---
        attachmentType: auth.attachment_type, // 'platform' or 'cross-platform'
        deviceType: auth.device_type, // 'singleDevice' or 'multiDevice'
        backedUp: auth.backed_up, // true/false
        aaguid: auth.aaguid,
        nickname: auth.nickname,
      })),
    });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

// router file (e.g., auth.js)

// --- 1. Delete Endpoint with "At Least One Key" safety guard ---
router.delete("/authenticator/:id", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer "))
    return res.status(401).json({ error: "Unauthorized" });

  const token = authHeader.split(" ")[1];
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.userId;
    const authId = req.params.id;

    // Fetch all keys to ensure we aren't deleting the absolute last one
    const userPasskeys = await getAuthenticatorsForUser(userId);
    if (userPasskeys.length <= 1) {
      return res.status(400).json({
        error:
          "Safety Check: You must keep at least one security key registered.",
      });
    }

    const success = await deleteAuthenticatorById(authId, userId);
    if (success) {
      return res.json({
        success: true,
        message: "Authenticator removed successfully.",
      });
    }
    res.status(404).json({ error: "Authenticator not found or unauthorized." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- 2. Edit Nickname Endpoint ---
router.put("/authenticator/:id/nickname", async (req, res) => {
  const { nickname } = req.body;
  if (!nickname || !nickname.trim())
    return res.status(400).json({ error: "Nickname is required." });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer "))
    return res.status(401).json({ error: "Unauthorized" });

  const token = authHeader.split(" ")[1];
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.userId;
    const authId = req.params.id;

    const success = await updateAuthenticatorNickname(
      authId,
      userId,
      nickname.trim(),
    );
    if (success) {
      return res.json({
        success: true,
        message: "Nickname updated successfully.",
      });
    }
    res.status(404).json({ error: "Authenticator not found or unauthorized." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// router file (e.g., auth.js)

// --- NEW: Generate Generic Options for Conditional UI Autofill ---
router.get("/generate-conditional-options", async (req, res) => {
  try {
    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      // Leave allowCredentials empty or undefined!
      // This tells the browser to search its internal storage for ANY key matching this RP_ID
      allowCredentials: [],
      userVerification: "preferred",
    });

    // NOTE: Because we don't know who the user is yet, we cannot save the challenge
    // against a specific user row in the DB. Instead, we save it to a short-lived,
    // secure HttpOnly cookie so we can verify it when they respond.
    res.cookie("auth_challenge", options.challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // true in production over HTTPS
      sameSite: "lax",
      maxAge: 60000, // 1 minute timeout
    });

    res.json(options);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/dev/wipe-database", async (req, res) => {
  try {
    await wipeAllData();
    res.json({ success: true, message: "All records have been destroyed." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
export default router;
