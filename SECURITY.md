# SkyOps Security Architecture & Vulnerability Reporting Policy

## 1. Security Architecture & Trust Boundaries

SkyOps is architected with defense-in-depth across both its cloud-hosted (Mode A) and self-hosted (Mode B) deployment configurations.

### Dual Identity & Persistence Trust Boundaries
- **Hosted Mode A (Firebase/Firestore)**: Firebase Authentication verifies identity only. Organization membership and roles are strictly resolved server-side. Direct client access to Firestore and Storage is blocked via deny-by-default security rules.
- **Self-Hosted Mode B (PostgreSQL)**: Employs a local identity engine using Node.js `crypto.scrypt` with random 16-byte salts and timing-safe equality comparison. JWT session tokens expire in 24 hours and are stored in `HttpOnly`, `SameSite=Lax` cookies.

### Strict Multi-Tenant Isolation
- Client-supplied organization IDs, cluster IDs, and roles are never trusted as authorization evidence.
- Every API route validates tenant boundaries via `validateTenantBoundary()`. Cross-tenant queries are blocked and raise `UnauthorizedTenantAccessException`, logged immutably to the audit trail.

---

## 2. RBAC & Action Approvals

- **Roles**: `OWNER`, `ADMIN`, `OPERATOR`, and `VIEWER`.
- **Workload Remediation Safety**: Remediation actions (pod restarts, rollout restarts, workload scaling) require explicit human approval by an `OPERATOR`, `ADMIN`, or `OWNER`.
- **AI Action Invariant**: AI providers (Gemini, OpenAI, Local models) can **only analyze and suggest**. They have **zero capability to execute actions autonomously**.

---

## 3. Cryptographic Standards & Licensing

- **License Signatures**: Digital signatures use asymmetric **Ed25519** (RFC 8032). The vendor private key is maintained in an air-gapped HSM/KMS and never included in customer distributions.
- **Offline Integrity**: Customer installations verify licenses locally using the public key (`server/licensing/vendorKey.ts`).
- **No Remote Kill-Switch**: License expiration never triggers platform shutdown or data deletion.

---

## 4. Container & Network Hardening

- **Unprivileged Execution**: The control plane runs as user `skyops` (UID 10001, GID 10001) in Alpine Linux with `/sbin/tini` as PID 1.
- **Database Isolation**: PostgreSQL binds strictly to Docker internal bridge network `skyops-network` and is never exposed to host interfaces.
- **Agent Least Privilege**: The Kubernetes Go agent runs with `runAsNonRoot: true`, `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`, and drops `ALL` capabilities.

---

## 5. Automated Data Privacy & Secret Redaction

Before telemetry or incident logs are passed to any AI model, `dataPrivacy.ts` automatically scrubs:
- Bearer tokens and JWTs (`Bearer [REDACTED_TOKEN]`)
- Database connection strings containing passwords
- AWS and cloud access credentials
- RSA/EC private keys (`-----BEGIN PRIVATE KEY-----`)
- Sensitive environment variables (`DB_PASS`, `API_KEY`, etc.)

---

## 6. Vulnerability Reporting Policy

We welcome vulnerability disclosures from security researchers and customers.

- **Reporting Email**: `security@skyops.io`
- **PGP Encryption**: Please encrypt sensitive reports using our public PGP key available at `https://skyops.io/security.asc`.
- **Response Commitment**: We acknowledge vulnerability reports within **24 hours** and provide remediation timelines within **72 hours**.
- **Coordinated Disclosure**: We adhere to standard 90-day coordinated disclosure guidelines.
