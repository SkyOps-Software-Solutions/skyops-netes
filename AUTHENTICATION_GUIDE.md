# SkyOps Self-Hosted — Authentication & User Management Guide

This guide covers the self-hosted authentication architecture, user lifecycle, password policies, session security, and Role-Based Access Control (RBAC) in SkyOps.

---

## 1. Authentication Architecture

SkyOps Self-Hosted operates a fully independent identity system that does not depend on Firebase or external cloud authentication services.

- **Password Storage**: Passwords are cryptographically hashed using Node.js `crypto.scrypt` with a unique 16-byte random salt per user. Passwords are never stored in plaintext or reversible formats.
- **Session Tokens**: Authenticated sessions are issued as JSON Web Tokens (JWT) signed with HMAC-SHA256 (`JWT_SECRET`). Tokens expire after 24 hours.
- **Cookie Transport**: Tokens are transported via `HttpOnly` and `SameSite=Lax` cookies, protecting sessions against cross-site scripting (XSS) and cross-site request forgery (CSRF).

---

## 2. First-Run Administrator Setup

When a new SkyOps instance is deployed, the database has zero user accounts.

1. Navigate to your dashboard: `http://YOUR_SERVER_IP:3000`.
2. The setup wizard displays automatically at `/setup`.
3. Provide your Organization Name, Administrator Name, Work Email, and Password.
4. Upon submission:
   - The primary organization and initial `OWNER` account are created.
   - The setup endpoint (`/api/v1/auth/setup-admin`) is permanently locked against further execution.

---

## 3. User Roles & Permissions Matrix

SkyOps enforces four distinct organizational roles:

| Role | Cluster Management | Incident Triage | Workload Remediation | System Settings & License | User Management |
|---|:---:|:---:|:---:|:---:|:---:|
| **OWNER** | Full Control | Full Control | Full Control | Full Control | Full Control |
| **ADMIN** | Full Control | Full Control | Full Control | Full Control | Invite & Manage |
| **OPERATOR** | View Only | Full Control | Execute (Approved) | View Only | View Only |
| **VIEWER** | View Only | View Only | View Only | View Only | View Only |

### Permission Definitions:
- **Cluster Management**: Registering clusters, rotating agent credentials, deleting clusters.
- **Incident Triage**: Viewing incident alerts, modifying incident status (`OPEN`, `RESOLVED`), adding operational notes.
- **Workload Remediation**: Executing remediation actions (restarting pods, rolling back deployments) after human approval.
- **System Settings**: Updating license files, configuring AI providers, applying software updates.

---

## 4. Security Policies & Hardening

### Password Policy
- Minimum length: 8 characters (12+ characters recommended for administrative accounts).
- Passwords must contain alphanumeric characters.

### Brute-Force Rate Limiting
To prevent automated credential stuffing and brute-force attacks:
- The authentication endpoint tracks failed login attempts per email address.
- After **10 consecutive failed attempts**, the account is temporarily locked for **15 minutes**.
- All authentication failures are recorded in the PostgreSQL audit log table.

### Resetting Administrator Passwords
If an administrator loses access to their password, access can be reset directly from the host server using the CLI:

```bash
# Generate a new password hash and update user via SQL
sudo docker compose exec postgres psql -U skyops -d skyops -c \
  "UPDATE users SET password_hash = '...' WHERE email = 'admin@yourdomain.com';"
```
*(Or use `skyops reset-admin-password` if supported by your CLI version).*
