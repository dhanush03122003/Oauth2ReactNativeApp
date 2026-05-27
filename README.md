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

| Column          | Type         | Description                                      |
| --------------- | ------------ | ------------------------------------------------ |
| id              | UUID         | Primary key                                      |
| credential_id   | TEXT         | Unique credential identifier                     |
| public_key      | BYTEA        | Stored public key for verification               |
| counter         | INTEGER      | Usage counter (replay attack prevention)         |
| user_id         | UUID         | Foreign key to users                             |
| transports      | TEXT[]       | Device transport types (usb, nfc, ble, internal) |
| aaguid          | TEXT         | Authenticator Attestation GUID                   |
| device_type     | TEXT         | Platform or cross-platform indicator             |
| backed_up       | BOOLEAN      | Whether the credential is backed up (syncable)   |
| attachment_type | TEXT         | The way the authenticator is attached            |
| nickname        | VARCHAR(255) | User-defined name for the device                 |
| last_used_at    | TIMESTAMP    | When the credential was last used for auth       |
| created_at      | TIMESTAMP    | Registration time                                |

### audit_logs table

| Column        | Type         | Description                                    |
| ------------- | ------------ | ---------------------------------------------- |
| id            | UUID         | Primary key                                    |
| user_id       | UUID         | Foreign key to users                           |
| credential_id | TEXT         | Used credential identifier                     |
| ip_address    | TEXT         | User's IP address during the action            |
| location      | TEXT         | GeoIP derived location                         |
| user_agent    | TEXT         | Browser user agent string                      |
| action_type   | VARCHAR(50)  | Action performed (e.g. LOGIN, CREATED, DELETED)|
| login_time    | TIMESTAMP    | Time of the action                             |

## API Endpoints

### Registration

| Method | Endpoint                                                        | Description                               |
| ------ | --------------------------------------------------------------- | ----------------------------------------- |
| GET    | `/api/auth/generate-registration-options?username={username}`   | Get registration options for a new user   |
| GET    | `/api/auth/generate-additional-device-options`                  | Get registration options for extra device |
| POST   | `/api/auth/verify-registration`                                 | Verify and save credential                |

### Authentication

| Method | Endpoint                                                        | Description                      |
| ------ | --------------------------------------------------------------- | -------------------------------- |
| GET    | `/api/auth/generate-authentication-options?username={username}` | Get authentication options       |
| GET    | `/api/auth/generate-conditional-options`                        | Get autofill (conditional) options|
| POST   | `/api/auth/verify-authentication`                               | Verify assertion and issue token |

### User & Device Management

| Method | Endpoint                                | Description                     |
| ------ | --------------------------------------- | ------------------------------- |
| POST   | `/api/auth/verify-token`                | Verify JWT token                |
| GET    | `/api/auth/me`                          | Get current user info & devices |
| DELETE | `/api/auth/authenticator/:id`           | Delete a specific device        |
| PUT    | `/api/auth/authenticator/:id/nickname`  | Update device nickname          |

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

## Production Deployment

### Phase 1: Server Preparation
Install Nginx, Certbot, and PM2:

```bash
sudo apt install nginx -y
sudo apt install certbot python3-certbot-nginx -y
sudo npm install -g pm2
```

### Phase 2: Database Setup
Log into the PostgreSQL prompt:

```bash
sudo -u postgres psql
```

Create the WebAuthn user and database:

```sql
CREATE DATABASE webauthn;
CREATE USER webauthn WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE webauthn TO webauthn;
\c webauthn
GRANT ALL ON SCHEMA public TO webauthn;
\q
```

### Phase 3: Application Setup
Clone/upload your repository to the server (e.g., in `/var/www/webauthn-backend` or `/home/ubuntu/webauthn`).

Install dependencies:

```bash
cd /path/to/your/backend
npm install
```
*(Ensure you have installed `cors` and `geoip-lite` as required by the backend logic).*

Create the `.env` file:

```bash
nano .env
```
Paste your sanitized configuration (replace placeholders with your actual Server IP and DB details):

```env
PORT=3000

# Database Configuration
DB_USER=webauthn
DB_PASSWORD=your_secure_password
DB_NAME=webauthn
DB_HOST=localhost
DB_PORT=5432
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}

# Security
JWT_SECRET=your_super_secure_random_string

# WebAuthn Configuration (Replace 168.144.113.245 with your Server IP)
RP_ID=168.144.113.245.nip.io
RP_NAME="WebAuthn App"
RP_ORIGIN=https://168.144.113.245.nip.io
```

### Phase 4: Nginx & HTTPS Configuration
We use Nginx to catch all traffic, enforce HTTPS, and securely proxy requests to Node.js while passing the user's real IP address for our GeoIP audit logs.

Create the Nginx configuration file:

```bash
sudo nano /etc/nginx/sites-available/webauthn
```
Paste the following configuration (Ensure you replace `168.144.113.245` with your actual Server IP):

```nginx
# --- BLOCK 1: THE HTTP CATCHER (PORT 80) ---
server {
    listen 80;
    server_name 168.144.113.245.nip.io;
    
    # Force redirect to HTTPS
    return 301 https://$host$request_uri;
}

# --- BLOCK 2: THE SECURE SERVER (PORT 443) ---
server {
    listen 443 ssl;
    server_name 168.144.113.245.nip.io;

    # Note: Certbot will automatically inject SSL certificates here later.

    # Enforce HTTPS strictly
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Route /api traffic to the Node.js backend
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        
        # CRITICAL: Pass real IPs for audit logs (geoip-lite)
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site and verify Nginx syntax:

```bash
sudo ln -s /etc/nginx/sites-available/webauthn /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

Generate the free SSL Certificate via Certbot:

```bash
sudo certbot --nginx -d 168.144.113.245.nip.io
```
*(Follow the prompts. Certbot will automatically update your Nginx config to include the certificates).*

### Phase 5: Security Firewall (UFW)
Lock down the server so nobody can bypass Nginx and access the Node API directly.

```bash
# Allow SSH access so you do not lock yourself out!
sudo ufw allow OpenSSH

# Allow Nginx to handle public HTTP/HTTPS traffic
sudo ufw allow 'Nginx Full'

# Block external access to the Node.js port
sudo ufw deny 3000

# Enable the firewall
sudo ufw enable
```

### Phase 6: Process Management & Persistence (PM2)
Keep the Node.js app running forever and ensure it starts automatically if the server reboots.

Start the backend application:

```bash
cd /path/to/your/backend
pm2 start server.js --name "webauthn-backend"
```

Generate the startup script:

```bash
pm2 startup
```
*Execute the generated command: Copy the exact `sudo env PATH...` command output from the previous step, paste it into the terminal, and press Enter.*

Save the PM2 process list:

```bash
pm2 save
```

## License

MIT
