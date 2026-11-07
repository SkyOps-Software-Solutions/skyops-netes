# SkyOps Self-Hosted Authentication Architecture & Administration

This document describes the identity, credential security, token lifecycle, and session management architecture in self-hosted SkyOps (Mode B).

---

## 1. Overview & Dual-Mode Compatibility

SkyOps supports two distinct authentication modes:

- **Mode A (Hosted Cloud)**: Firebase Authentication (Google Cloud Identity Platform, Firebase ID tokens, OAuth with Google).
- **Mode B (Self-Hosted)**: Standalone local identity engine (`server/auth/localAuth.ts`), eliminating any dependency on external authentication providers or outbound internet access.

The runtime detects which mode to use via `SKYOPS_AUTH_PROVIDER=local` or `SKYOPS_DEPLOYMENT_MODE=self_hosted`.

```
                    ┌────────────────────────────┐
                    │ Client (Browser / Agent)   │
                    └─────────────┬──────────────┘
                                  │
         ┌────────────────────────┴────────────────────────┐
         │                                                 │
[Mode B: Local Auth]                              [Mode A: Hosted Firebase]
  • httpOnly Cookie: skyops_session                  • Bearer: <Firebase-ID-Token>
  • Header: Bearer <SkyOps-JWT>                      • Google OAuth2
         │                                                 │
         ▼                                                 ▼
┌─────────────────────────────────┐               ┌─────────────────────────────────┐
│ server/auth/localAuth.ts        │               │ Firebase Admin SDK              │
│ - HMAC-SHA256 Signed JWT        │               │ - Google Public Keys Verification│
│ - bcrypt password hash & salt   │               │                                 │
└────────────────┬────────────────┘               └────────────────┬────────────────┘
                 │                                                 │
                 └────────────────────────┬────────────────────────┘
                                          ▼
                         ┌─────────────────────────────────┐
                         │ requireUserAuth Middleware       │
                         │ Injects req.user: AuthenticatedUser
                         └─────────────────────────────────┘
```

---

## 2. Initial Setup Wizard (First-Run Admin Bootstrap)

When a self-hosted SkyOps instance starts with a fresh database, no administrator account exists.

### Setup Detection
- Endpoint: `GET /api/v1/auth/status`
- Response:
  ```json
  {
    "authProvider": "local",
    "deploymentMode": "self_hosted",
    "setupRequired": true,
    "userCount": 0,
    "adminCount": 0
  }
  ```

### First-Run Admin Account Creation
- The SkyOps frontend displays the **Create Initial Administrator** wizard.
- API Endpoint: `POST /api/v1/auth/setup`
- Request Payload:
  ```json
  {
    "email": "admin@example.com",
    "password": "StrongPassword123!",
    "displayName": "Platform Administrator",
    "tenantId": "default"
  }
  ```
- **Security Guardrail**: Once the first administrator is created, this endpoint is permanently locked. Any subsequent invocation returns `403 Forbidden: Setup already completed`.

---

## 3. Password Security & Storage

All local authentication credentials are stored in the dedicated `local_credentials` table:

```sql
CREATE TABLE IF NOT EXISTS local_credentials (
    user_id VARCHAR(128) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Password Policies & Hashing Algorithm
1. **Hashing Scheme**: `bcrypt` with 12 salt rounds (`bcryptjs`).
2. **Password Length**: Minimum 8 characters, maximum 128 characters.
3. **Complexity Requirements**:
   - At least one uppercase letter (`[A-Z]`)
   - At least one lowercase letter (`[a-z]`)
   - At least one number (`[0-9]`)
   - At least one special character (`[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]`)
4. **Zero Plaintext Storage**: Passwords are never logged, never cached in memory, and never sent back across any API.

---

## 4. Session Tokens & Cookie Security

When a user logs in via `POST /api/v1/auth/login`, SkyOps issues a cryptographically signed JSON Web Token (JWT).

### JWT Properties:
- **Algorithm**: HMAC-SHA256 (`HS256`).
- **Secret Key**: `SKYOPS_JWT_SECRET` (if not supplied, generated securely at startup).
- **Expiry**: Configurable via `SKYOPS_SESSION_DURATION` (default: `86400s` / 24 hours).
- **Payload Claims**:
  ```json
  {
    "sub": "user_id",
    "email": "admin@example.com",
    "role": "admin",
    "tenantId": "default",
    "displayName": "Platform Administrator",
    "iat": 1740000000,
    "exp": 1740086400
  }
  ```

### Cookie Transport & Storage:
- **Cookie Name**: `skyops_session`
- **httpOnly**: `true` (prohibits JavaScript access, mitigating XSS token theft).
- **SameSite**: `Lax` (safeguards against Cross-Site Request Forgery while allowing standard app navigations).
- **Secure**: `true` if `NODE_ENV=production` or `COOKIE_SECURE=true`.

---

## 5. Brute-Force Rate Limiting

To prevent automated credential stuffing and dictionary attacks against `POST /api/v1/auth/login`:

- **Threshold**: 5 failed login attempts per client IP within a 5-minute rolling window.
- **Backoff Duration**: The IP is locked out for 15 minutes (`900,000 ms`).
- **Response**: HTTP `429 Too Many Requests` with `Retry-After: 900`.
- **Reset**: Successful authentication immediately clears the failed attempt counter for that IP.

---

## 6. Local User Management & Roles

SkyOps supports 4 primary authorization roles:

| Role | Permissions |
|---|---|
| `admin` | Full control: cluster registration, user management, policy creation, auto-healing approvals |
| `sre` / `engineer` | Cluster operations: trigger mitigations, run diagnostics, view logs and metrics |
| `viewer` | Read-only access: view dashboards, incidents, SLOs, and telemetry |
| `agent` | Monitored Kubernetes cluster agent identity: submit telemetry, poll approved tasks |

---

## 7. Administrator CLI / Emergency Password Reset

In case the administrator password is lost on an air-gapped server without an email service, run the password reset CLI tool:

```bash
# Reset administrator password directly on the server
npx tsx -e "
import bcrypt from 'bcryptjs';
import { getPersistenceStore } from './server/persistence';

async function resetAdmin(email, newPassword) {
  const store = getPersistenceStore();
  const user = await store.getUserByEmail(email);
  if (!user) { console.error('User not found'); process.exit(1); }
  const salt = await bcrypt.genSalt(12);
  const hash = await bcrypt.hash(newPassword, salt);
  await (store as any).saveLocalCredential(user.id, email, hash, salt);
  console.log('Password reset successfully for:', email);
  process.exit(0);
}

resetAdmin('admin@example.com', 'NewSecurePassword123!');
"
```
