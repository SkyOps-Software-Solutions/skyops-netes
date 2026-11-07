# SkyOps Self-Hosted Platform — Release Notes

## Version v1.5.1-rc1 (Commercial Release Candidate)

**Release Date**: November 2026  
**Channel**: `stable-candidate`  
**Target Platform**: Ubuntu Server 20.04 / 22.04 / 24.04 LTS (x86_64)  
**Agent Version**: `v1.5.1` (Helm Chart `1.5.1`)  

---

### Overview

SkyOps v1.5.1-rc1 represents the transition of the SkyOps Kubernetes Incident Management and FinOps platform into a commercial self-hosted distribution. Organizations can now install and operate the complete SkyOps control plane entirely within their own private infrastructure and on-premises environments, ensuring complete sovereignty over cluster telemetry, incident logs, and credentials.

---

### Key Capabilities & Enhancements

#### 1. Self-Hosted PostgreSQL Persistence Layer
- Introduced a production-grade relational database backend powered by PostgreSQL 16 Alpine.
- Implemented transactional schema migrator (`migrator.ts`) with versioned migrations (`001_initial_schema.sql` and `002_license_and_ai_config.sql`).
- Dual-mode persistence: Hosted Firebase/Firestore (Mode A) remains 100% compatible and operational for cloud customers, while Self-Hosted PostgreSQL (Mode B) operates independently with zero Google Cloud dependencies.

#### 2. Local Authentication & RBAC Engine
- Built-in local identity provider utilizing Node.js native `crypto.scrypt` password hashing with random salt and timing-safe equality comparison.
- Stateless, cryptographically signed JWT sessions with 24-hour expiration.
- Brute-force protection with automated sliding-window account lockout (10 attempts / 15 minutes).
- First-run administrator onboarding wizard that locks immediately upon completion.
- Multi-tenant boundary enforcement rejecting unauthorized cross-organization or cross-cluster access.

#### 3. Production Docker Packaging & One-Command Installer
- Production multi-stage Alpine Dockerfile running as unprivileged user `skyops:skyops` (UID 10001) with `tini` process supervision and container health check.
- Production `docker-compose.yml` with isolated internal database network and persistent volume mounts.
- Production-grade Ubuntu installer script (`install.sh`) with comprehensive preflight checks (OS, CPU, RAM, disk, root privileges) and automated secret generation.
- Sysadmin management CLI (`bin/skyops`) with standard verbs: `status`, `start`, `stop`, `restart`, `logs`, `backup`, `restore`, and `update`.

#### 4. Commercial Licensing & Offline Verification
- Asymmetric Ed25519 digital signature verification engine operating completely offline with zero vendor call-home.
- Canonical JSON normalization (`canonicalizeJson`) eliminating key-order and formatting tampering vulnerabilities.
- Safe expiration handling: Expiration never deletes data, halts monitoring, or triggers a remote kill-switch; only premium enterprise add-ons are paused.
- Default Community Edition entitlements (up to 3 clusters and 30 nodes) available out of the box.

#### 5. Configurable AI Providers & Data Privacy Shield
- **Offline No-AI Default**: Runs deterministic heuristic rule engine (`NoAIProvider`) with zero external network transmission.
- **Multi-Provider Support**: Pluggable adapters for Google Gemini, OpenAI-compatible APIs, and local private models (Ollama, vLLM, LocalAI).
- **Data Privacy Engine (`dataPrivacy.ts`)**: Automated scrubbing of bearer tokens, passwords, database credentials, AWS secrets, and private keys from outgoing context.
- **Consent Gating**: External AI providers are blocked until an administrator explicitly authorizes data-sharing consent.

#### 6. Disaster Recovery & Safe Upgrades
- Pre-upgrade automated backup snapshots created before applying schema changes.
- PostgreSQL binary dump (`pg_dump -F c`) and application file archiving with SHA-256 verification manifests.
- Safe restore utility (`scripts/restore.sh`) guarded by confirmation gates.

---

### Component Version Matrix

| Component | Version | Artifact Digest / Path |
|---|---|---|
| **Control Plane Server** | `v1.5.1` | `skyops/control-plane:v1.5.1` |
| **Database** | `16-alpine` | `postgres:16-alpine` |
| **Go Kubernetes Agent** | `v1.5.1` | `ghcr.io/skyops-software-solutions/skyops-agent:v1.5.1` |
| **Agent Helm Chart** | `1.5.1` | `https://charts.skyops.io/skyops-agent-1.5.1.tgz` |
| **PostgreSQL Migrations** | `001`, `002` | `server/persistence/migrations/` |

---

### Installation Command

On a clean Ubuntu Server x86_64 machine:
```bash
curl -fsSL https://get.skyops.io/install.sh | sudo bash
```

---

### Known Limitations & Roadmap

1. **Architecture Support**: Release Candidate v1.5.1 is officially certified for `x86_64` (amd64) Ubuntu Server. ARM64 support is scheduled for v1.6.0.
2. **Reverse Proxy TLS**: The Docker container binds to HTTP port 3000. Customers deploying to production must terminate TLS via an ingress load balancer, Nginx, or Traefik with valid SSL certificates.
3. **SSO / SAML / OIDC**: Built-in local authentication is fully implemented; SAML/OIDC federated single sign-on is slated for commercial enterprise release.
