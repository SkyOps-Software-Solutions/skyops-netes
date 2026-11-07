# SkyOps Self-Hosted Platform — Comprehensive Security Audit

## 1. Audit Scope & Executive Summary

This security audit covers the self-hosted distribution of the **SkyOps Kubernetes Incident Management Platform** (Release Candidate v1.5.1 / v1.6.0). The audit evaluates the system against the OWASP Top 10, CIS Docker Benchmark, Kubernetes Hardening Guidance, and enterprise cryptographic standards.

### Threat Model & Assumptions
- **Host Environment**: The customer operates an Ubuntu Server x86_64 host under their administrative control.
- **Network Boundaries**: Monitored Kubernetes clusters transmit telemetry to the SkyOps Control Plane over TLS (HTTPS port 3000 / reverse proxy 443).
- **Adversary Capabilities**:
  - Malicious or compromised workloads in monitored clusters attempting cross-tenant injection or privilege escalation.
  - Untrusted network actors probing the public control-plane endpoint.
  - Malicious internal users attempting unauthorized actions across clusters or workspaces.
  - Tampered license files attempting entitlement spoofing.

---

## 2. Authentication & Session Security

| Security Control | Implementation | Verification Status |
|---|---|---|
| **Password Hashing** | Node.js native `crypto.scrypt` with 16-byte cryptographically random salt, 64-byte key length, and constant-time timing-safe comparison (`crypto.timingSafeEqual`). Plaintext passwords are never logged or persisted. | **VERIFIED** |
| **Session Tokens** | Cryptographically signed JWT tokens with 24-hour expiration (`24h`), signed with HMAC-SHA256 (`JWT_SECRET`). Local tokens store `userId`, `email`, `role`, and `orgId`. | **VERIFIED** |
| **Token Verification** | `server/auth/localAuth.ts` validates token signatures, expiration timestamps, and issuer claims. Invalidation occurs immediately on logout or password update. | **VERIFIED** |
| **Brute-Force Protection** | Rate limiter locks accounts after 10 consecutive failed attempts within a 15-minute sliding window. Rate limits are tracked in-memory and in PostgreSQL audit records. | **VERIFIED** |
| **First-Run Administrator Setup** | The `/api/v1/auth/setup-admin` endpoint is accessible **only** when the database contains zero users. As soon as the initial administrator is created, the setup gate permanently locks. | **VERIFIED** |
| **Cookie Security** | Session cookies enforce `HttpOnly` (preventing XSS access) and `SameSite=Lax`. In production HTTPS environments, the `Secure` flag is enforced. | **VERIFIED** |

---

## 3. API Security & Input Validation

| Threat Vector | Mitigation Strategy | Verification Status |
|---|---|---|
| **SQL Injection** | All database interactions in `PostgresStore.ts`, `localAuth.ts`, `migrator.ts`, and `licenseService.ts` use parameterized SQL queries (`$1, $2, ...`) via `pg.Pool`. No raw string concatenation is permitted. | **VERIFIED** |
| **Cross-Tenant Telemetry Injection** | All telemetry ingestion endpoints (`/api/v1/agent/*`) require Bearer token validation matching the specific registered cluster. Cross-tenant access is blocked via `validateTenantBoundary()` which raises `UnauthorizedTenantAccessException`. | **VERIFIED** |
| **Path Traversal (File Storage)** | `LocalStorageDriver.ts` validates target file paths using `path.resolve` and `path.normalize`, rejecting any path that escapes the designated storage root. | **VERIFIED** |
| **Denial of Service (DoS)** | Express middleware enforces JSON body size limits (10MB for bulk metrics) and rate limiting on public endpoints. | **VERIFIED** |
| **HTTP Security Headers** | Helmet middleware injects `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, and strips `X-Powered-By`. | **VERIFIED** |

---

## 4. Cryptographic Security & Commercial Licensing

### 4.1 Asymmetric Ed25519 License Verification
- **Cryptographic Standard**: Digital signatures use Ed25519 (Edwards-curve Digital Signature Algorithm, RFC 8032), providing 128-bit security level without vulnerable parameter negotiation.
- **Key Separation**:
  - The vendor **private key** is kept strictly air-gapped and never bundled into the customer repository, Docker images, or npm packages.
  - Only the vendor **public key** (`server/licensing/vendorKey.ts`) is distributed with the software. Customers can optionally supply an enterprise public key via `SKYOPS_LICENSE_PUBLIC_KEY`.
- **Canonical Serialization**: `canonicalizeJson` sorts all JSON keys recursively before hashing and verification. This prevents signature bypass through whitespace or key-ordering variations.
- **Tamper Rejection**: Any modification of license attributes (`maxClusters`, `maxNodes`, `features`, `expiresAt`) invalidates the cryptographic signature, instantly downgrading the instance to Community Edition guardrails.
- **Absence of Remote Kill-Switch**: The license engine operates 100% offline. License expiration never deletes data, halts monitoring, or triggers a remote shutdown.

### 4.2 Release Metadata & Update Signatures
- Software updates distribute a signed `ReleaseMetadata` manifest containing image digests and SHA-256 tarball checksums.
- Automatic updates are **strictly forbidden**. Updates require explicit administrative approval (`confirm: true`), trigger an automated pre-update database backup, and apply versioned migrations safely inside transactions.

---

## 5. AI Data Privacy & Credential Redaction

### 5.1 Privacy by Design
- **No-AI Default**: SkyOps runs out of the box in deterministic heuristic mode (`NoAIProvider`). Zero network requests are made to third-party AI APIs without explicit configuration.
- **Consent Gating**: If a customer configures Google Gemini or an OpenAI-compatible endpoint, outbound telemetry transmission remains disabled until an administrator explicitly checks the **Data Sharing Consent** toggle.
- **Local Inference Option**: Customers with strict data-residency mandates can configure local models (Ollama, vLLM, or LocalAI) running on their internal private network.

### 5.2 Automated Secret Redaction (`dataPrivacy.ts`)
Before any incident context or logs are passed to an AI model, the payload passes through `sanitizeIncidentContext`:
1. **Bearer Tokens & JWTs**: Replaced with `Bearer [REDACTED_TOKEN]`.
2. **Database Connection Strings**: Passwords stripped (e.g. `postgres://user:***@host/db`).
3. **AWS / Cloud Credentials**: Access keys and secret keys scrubbed.
4. **Private Keys**: `-----BEGIN RSA/EC PRIVATE KEY-----` blocks completely removed.
5. **Key-Value Secrets**: Fields containing `password`, `passwd`, `pass`, `token`, `secret`, `apikey`, or `credential` are replaced with `[REDACTED_VALUE]`.
6. **Masking on Client Read**: API keys configured in the settings dashboard are masked server-side (`sk-1••••••••90ab`) and never returned in plaintext.

---

## 6. Docker & Linux Container Hardening

### 6.1 Control Plane Container (`Dockerfile`)
- **Non-Root Execution**: Runs under unprivileged user `skyops` (UID 10001, GID 10001). No privileges are escalated.
- **Base Image**: Minimal `node:22-alpine` image to minimize CVE surface area.
- **Process Supervision**: Uses `/sbin/tini` as PID 1 to ensure proper zombie reaping and signal forwarding.
- **Secret Isolation**: Secrets in `.env` are set to permission `0600` (readable only by the host user running Docker).

### 6.2 PostgreSQL Database Container
- **Network Isolation**: The PostgreSQL container binds only to Docker bridge network `skyops-network`. Port 5432 is **not published** to the host.
- **Data Persistence**: Stored on named Docker volume `skyops_pgdata` with container-managed file permissions.

### 6.3 Kubernetes Go Agent Security (`agent/deploy/helm/values.yaml`)
- **Non-Root Execution**: `runAsNonRoot: true`, `runAsUser: 65532`, `runAsGroup: 65532`.
- **Filesystem Security**: `readOnlyRootFilesystem: true`. Temporary files are written to in-memory `emptyDir` volumes.
- **Privilege Escalation**: `allowPrivilegeEscalation: false`.
- **Linux Capabilities**: All Linux capabilities are dropped (`capabilities: drop: [ALL]`).
- **RBAC Tiers**: Customers select from:
  - `observer`: Read-only cluster telemetry and watches. Zero mutation capability.
  - `operator` (default): Workload operations (Pod restarts, Deployment rollouts).
  - `admin`: Node cordon/uncordon operations.

---

## 7. Security Findings Matrix & Resolution

| ID | Component | Severity | Description | Status | Verification |
|---|---|---|---|---|---|
| **SEC-01** | Database | **HIGH** | Potential SQL injection in dynamic filter queries | **RESOLVED** | Enforced parameterized queries across all PostgreSQL repository files (`$1, $2, ...`). |
| **SEC-02** | AI Pipeline | **HIGH** | Leakage of Kubernetes Secrets & database passwords into external AI prompts | **RESOLVED** | Implemented regex-based scrubbing in `dataPrivacy.ts` covering tokens, JWTs, private keys, and environment variables. |
| **SEC-03** | Auth | **HIGH** | Brute-force credential guessing against local administrator login | **RESOLVED** | Implemented sliding-window rate limiter locking accounts after 10 failed attempts for 15 minutes. |
| **SEC-04** | Container | **MEDIUM** | Container processes running as root inside container | **RESOLVED** | Enforced `USER skyops:skyops` (UID 10001) in Dockerfile and `65532` in Kubernetes agent. |
| **SEC-05** | Host Ports | **MEDIUM** | Unintended public exposure of PostgreSQL database port 5432 | **RESOLVED** | Removed host port mapping in `docker-compose.yml`. Database is accessible only via Docker private network. |
| **SEC-06** | File Storage | **MEDIUM** | Path traversal vulnerability during local artifact upload/download | **RESOLVED** | Applied `path.resolve` boundary verification in `LocalStorageDriver.ts` rejecting traversal escapes. |
| **SEC-07** | Licensing | **MEDIUM** | License spoofing or entitlement tampering | **RESOLVED** | Enforced Ed25519 asymmetric signature verification with recursive canonical JSON key sorting. |
| **SEC-08** | Operations | **LOW** | Accidental automated execution of AI-generated cluster mutations | **RESOLVED** | Implemented human-in-the-loop approval requirement for all auto-healing actions with audit logging. |

---

## 8. Residual Risks & Staging Recommendations

1. **Reverse Proxy TLS Termination**: SkyOps container listens on HTTP port 3000. In production customer environments, customers must terminate TLS via Nginx, Traefik, Caddy, or an AWS/GCP/Cloudflare load balancer with valid certificates.
2. **PostgreSQL Encryption at Rest**: Self-hosted volume encryption relies on host-level disk encryption (LUKS / encrypted EBS). Customers handling regulated data (PCI-DSS / HIPAA) should configure full-disk encryption on `/var/lib/docker/volumes`.
3. **Agent Network Access**: Egress from the monitored Kubernetes cluster to the SkyOps Control Plane URL must be permitted through corporate firewalls.
