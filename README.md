# WebAuthn Passwordless Authentication Application

A full-stack WebAuthn (Passkeys) application that enables passwordless authentication using biometrics (fingerprint, face) or security keys.

## Overview

This application implements the WebAuthn API specification to provide secure, passwordless authentication. Users can register and login using their device's built-in biometric sensor (Touch ID, Face ID) or external security keys (YubiKey, etc.).

## How WebAuthn Works

### Registration Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │     │   Backend   │     │  Database   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │  1. GET /generate-registration-options│
       │ ─────────────────────────────────────>│
       │                   │                   │
       │                   │  Create/find user │
       │                   │  Generate challenge│
       │                   │ ─────────────────>│
       │                   │                   │
       │  2. Return options (challenge in Base64URL)
       │ <──────────────────────────────────────│
       │                   │                   │
       │  3. startRegistration(options)         │
       │  Browser prompts for biometric        │
       │                   │                   │
       │  4. Attestation Response               │
       │ ─────────────────────────────────────>│
       │                   │                   │
       │                   │  Verify signature │
       │                   │  Save public key  │
       │                   │ ─────────────────>│
       │                   │                   │
       │  5. JWT Token + Success                │
       │ <──────────────────────────────────────│
       │                   │                    │
```

**Step-by-step registration:**

1. **User enters username** on the registration page
2. **Frontend calls** `GET /api/auth/generate-registration-options?username=...`
3. **Backend:**
   - Finds or creates user in database
   - Generates a random challenge (Buffer)
   - Returns registration options including the challenge
4. **Frontend calls** `@simplewebauthn/browser` `startRegistration(options)`
5. **Browser** prompts user for biometric verification
6. **Browser returns** attestation response (contains signed challenge + public key)
7. **Frontend sends** attestation to `POST /api/auth/verify-registration`
8. **Backend:**
   - Verifies the signature using the public key
   - Saves the credential (credential_id, public_key, counter) to database
   - Clears the challenge
   - Issues a JWT token

### Authentication Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │     │   Backend   │     │  Database   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │  1. GET /generate-authentication-options
       │ ─────────────────────────────────────>│
       │                   │                   │
       │                   │  Find user        │
       │                   │  Get credentials │
       │                   │ ─────────────────>│
       │                   │                   │
       │  2. Return options (allowCredentials) │
       │ <──────────────────────────────────────│
       │                   │                   │
       │  3. startAuthentication(options)      │
       │  Browser prompts for biometric        │
       │                   │                   │
       │  4. Assertion Response                │
       │ ─────────────────────────────────────>│
       │                   │                   │
       │                   │  Verify signature │
       │                   │  Update counter   │
       │                   │ ─────────────────>│
       │                   │                   │
       │  5. JWT Token + Success               │
       │ <──────────────────────────────────────│
       │                   │                   │
```

**Step-by-step authentication:**

1. **User enters username** on the login page
2. **Frontend calls** `GET /api/auth/generate-authentication-options?username=...`
3. **Backend:**
   - Finds user
   - Gets their registered credentials
   - Generates a new challenge
   - Returns authentication options
4. **Frontend calls** `@simplewebauthn/browser` `startAuthentication(options)`
5. **Browser** prompts user to verify with their registered device
6. **Browser returns** assertion response (signed challenge)
7. **Frontend sends** assertion to `POST /api/auth/verify-authentication`
8. **Backend:**
   - Looks up the stored public key
   - Verifies the signature
   - Updates the authenticator counter (prevents replay attacks)
   - Clears the challenge
   - Issues a JWT token

## Project Structure

```
webauthn-app/
├── docker-compose.yml         # PostgreSQL container
├── README.md                  # This file
├── server/                    # Express.js Backend
│   ├── package.json
│   ├── .env                  # Environment variables
│   └── src/
│       ├── index.js          # Express server entry
│       ├── db.js             # PostgreSQL connection & queries
│       └── routes/
│           ├── index.js       # Route aggregator
│           └── auth.js       # WebAuthn endpoints
└── client/                   # React Frontend (Vite)
    ├── package.json
    ├── vite.config.js        # Vite config with proxy
    ├── tailwind.config.js
    ├── index.html
    └── src/
        ├── main.jsx          # React entry
        ├── App.jsx           # Main app with routing
        ├── index.css         # Tailwind styles
        ├── components/
        │   └── Navbar.jsx    # Navigation
        └── pages/
            ├── Register.jsx  # Registration page
            ├── Login.jsx     # Login page
            └── Dashboard.jsx # Protected dashboard
```

## Database Schema

### users table

| Column            | Type         | Description                      |
| ----------------- | ------------ | -------------------------------- |
| id                | UUID         | Primary key                      |
| username          | VARCHAR(255) | Unique username                  |
| current_challenge | TEXT         | Temporary challenge for WebAuthn |
| created_at        | TIMESTAMP    | Account creation time            |

### authenticators table

| Column        | Type      | Description                                      |
| ------------- | --------- | ------------------------------------------------ |
| id            | UUID      | Primary key                                      |
| credential_id | TEXT      | Unique credential identifier                     |
| public_key    | BYTEA     | Stored public key for verification               |
| counter       | INTEGER   | Usage counter (replay attack prevention)         |
| user_id       | UUID      | Foreign key to users                             |
| transports    | TEXT[]    | Device transport types (usb, nfc, ble, internal) |
| created_at    | TIMESTAMP | Registration time                                |

## API Endpoints

### Registration

| Method | Endpoint                                                      | Description                |
| ------ | ------------------------------------------------------------- | -------------------------- |
| GET    | `/api/auth/generate-registration-options?username={username}` | Get registration options   |
| POST   | `/api/auth/verify-registration`                               | Verify and save credential |

### Authentication

| Method | Endpoint                                                        | Description                      |
| ------ | --------------------------------------------------------------- | -------------------------------- |
| GET    | `/api/auth/generate-authentication-options?username={username}` | Get authentication options       |
| POST   | `/api/auth/verify-authentication`                               | Verify assertion and issue token |

### User

| Method | Endpoint                 | Description           |
| ------ | ------------------------ | --------------------- |
| POST   | `/api/auth/verify-token` | Verify JWT token      |
| GET    | `/api/auth/me`           | Get current user info |

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS
- **Backend**: Node.js, Express
- **Database**: PostgreSQL
- **WebAuthn Library**: @simplewebauthn/server v13.3.0, @simplewebauthn/browser v13.3.0
- **Authentication**: JWT (jose)

## Prerequisites

1. **Node.js** (v18+)
2. **Docker** (for PostgreSQL)
3. A browser with WebAuthn support (Chrome, Firefox, Safari, Edge)
4. A device with:
   - Touch ID / Face ID (Mac)
   - Windows Hello
   - Android fingerprint
   - Or a physical security key (YubiKey)

## Setup & Installation

### 1. Start PostgreSQL

```bash
cd webauthn-app
docker-compose up -d
```

This starts a PostgreSQL container on port 5432 with:

- Database: `webauthn`
- User: `webauthn`
- Password: `webauthn_password`

### 2. Install Backend Dependencies

```bash
cd server
npm install
```

### 3. Configure Environment

Edit `server/.env`:

```env
PORT=3000
DATABASE_URL=postgresql://webauthn:webauthn_password@localhost:5432/webauthn
JWT_SECRET=your-super-secret-jwt-key-change-in-production
RP_ID=localhost
RP_NAME=WebAuthn App
RP_ORIGIN=http://localhost:5173
```

### 4. Start Backend

```bash
npm run dev
```

Server will start on http://localhost:3000

### 5. Install Frontend Dependencies

```bash
cd client
npm install
```

### 6. Start Frontend

```bash
npm run dev
```

Frontend will start on http://localhost:5173

## Usage

### Registration

1. Open http://localhost:5173/register
2. Enter a username (min 3 characters)
3. Click "Register with Biometrics"
4. Your browser will prompt for biometric verification
5. After successful registration, you'll be redirected to the dashboard

### Login

1. Open http://localhost:5173/login
2. Enter your username
3. Click "Sign in with Biometrics"
4. Your browser will prompt for biometric verification
5. After successful authentication, you'll be redirected to the dashboard

### Dashboard

The dashboard shows:

- Your username
- All registered security keys/devices
- Device details (transport type, counter, creation date)

## Security Features

1. **No Passwords**: Eliminated password-based authentication
2. **Challenge-Response**: Each registration/authentication uses a unique random challenge
3. **Counter Updates**: Authenticator counter is updated on each use to prevent replay attacks
4. **Public Key Only**: Only the public key is stored server-side, private key never leaves the device
5. **JWT Tokens**: Secure session management with expiring JWTs

## Browser Support

| Browser | Platform                       | Support                 |
| ------- | ------------------------------ | ----------------------- |
| Chrome  | macOS, Windows, Linux, Android | ✅                      |
| Safari  | macOS, iOS                     | ✅ (Touch ID / Face ID) |
| Firefox | macOS, Windows, Linux          | ✅                      |
| Edge    | Windows                        | ✅ (Windows Hello)      |

## Troubleshooting

### "WebAuthn not supported" error

- Ensure you're using HTTPS or localhost
- Check browser supports WebAuthn

### "Authenticator already registered" error

- The device is already registered for this user
- Try logging in instead

### "Registration cancelled" error

- User cancelled the biometric prompt
- Try again

### Database connection error

- Ensure PostgreSQL container is running: `docker ps`
- Check DATABASE_URL in .env file

## License

MIT
