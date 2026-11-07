# SkyOps Self-Hosted Migration Plan — 8-Phase Master Execution Blueprint

## Executive Roadmap Overview

This blueprint governs the orderly, zero-regression transformation of SkyOps from a cloud-coupled SaaS architecture into an enterprise-grade, commercial self-hosted Kubernetes incident management platform.

Every phase specifies exact files, implementation mechanics, failure modes, automated test commands, and acceptance criteria.

---

## Phase 1: Repository Preparation & Dual-Mode Architecture Abstraction

### 1.1 Objective
Establish foundational dual-mode abstractions in configuration, authentication, and persistence without breaking the current hosted environment or introducing syntax regressions.

### 1.2 Target Files
- `server/config.ts`
- `server/persistence/types.ts`
- `server/persistence/index.ts`
- `src/config/branding.ts`
- `.env.example`

### 1.3 Implementation Steps
1. Add `SKYOPS_DEPLOYMENT_MODE` (`cloud` vs `self_hosted`) and `PERSISTENCE_PROVIDER` (`firestore`, `postgres`, `memory`) to `server/config.ts`.
2. Expand `IPersistenceStore.providerName` in `server/persistence/types.ts` from `'firestore' | 'memory'` to `'firestore' | 'postgres' | 'memory'`.
3. Update `server/persistence/index.ts` so `determinePersistenceProvider()` gracefully selects PostgreSQL when `PERSISTENCE_PROVIDER=postgres` or `DATABASE_URL` is set, while preserving default behavior for Firestore in production cloud environments.
4. Update `.env.example` with documented environment keys for self-hosted PostgreSQL, local storage paths, and local JWT secret.

### 1.4 Risks & Mitigations
- *Risk*: Misconfigured environment variable might disrupt current Firestore cloud production.
- *Mitigation*: Fall back to Firestore if `PERSISTENCE_PROVIDER` is unset and Firebase project credentials are detected.

### 1.5 Automated Validation Tests
- `npm run lint` (`tsc --noEmit`)
- `npm test` verifying persistence factory returns correct provider type under test conditions.

### 1.6 Acceptance Criteria
- Codebase builds cleanly with `npm run build`.
- Zero type errors across all persistence interfaces.

---

## Phase 2: PostgreSQL Persistence, Local Auth & Persistent Storage (COMPLETE)

### 2.1 Objective
Implement `PostgresStore` satisfying the complete `IPersistenceStore` contract for all 26 entities, accompanied by automated SQL migration scripts and relational schema definitions, local identity engine, and customer-owned storage driver.

### 2.2 Implemented Artifacts
- `server/persistence/PostgresStore.ts` — Complete implementation of `IPersistenceStore` covering all 26 entities with parameterized SQL and connection pooling.
- `server/persistence/migrations/001_initial_schema.sql` — Full DDL defining 27 relational tables, composite indexes, and cascading foreign keys.
- `server/persistence/migrator.ts` — Transactional migration engine with `schema_migrations` tracking.
- `server/auth/localAuth.ts` — Local identity provider with bcrypt hashing, HMAC-SHA256 JWT cookies, rate limiting, and first-run admin bootstrap.
- `server/storage/drivers/LocalStorageDriver.ts` — Customer-owned persistent file storage with path traversal guards.
- `scripts/migrate-firestore-to-postgres.ts` — Non-destructive migration tool with `--dry-run` and UPSERT support.
- `POSTGRESQL_SETUP.md`, `SELF_HOSTED_AUTHENTICATION.md`, `DATA_MIGRATION_GUIDE.md` — Complete operations documentation.

### 2.3 Acceptance Criteria Verified
- 100% method coverage of `IPersistenceStore` in `PostgresStore.ts`.
- Zero data loss on concurrent reads/writes.
- First-run setup endpoint locked down after initial administrator registration.
- Mode A (hosted Firebase) and Mode B (self-hosted PostgreSQL) both fully functional.

---


## Phase 3: Docker Packaging, Docker Compose & One-Command Installer (COMPLETE)

### 3.1 Objective
Package SkyOps into an enterprise-grade self-hosted distribution executable via Docker Compose on Ubuntu Server x86-64, supported by a one-command installer, system CLI utility, and automated backup/restore tooling.

### 3.2 Implemented Artifacts
- `Dockerfile` — Production multi-stage Alpine build with unprivileged `skyops:skyops` user, `/sbin/tini` signal handling, and native curl healthchecks.
- `.dockerignore` — Comprehensive exclusion of node_modules, .git, .env credentials, and test artifacts.
- `docker-compose.yml` — Production service definition orchestrating PostgreSQL 16 Alpine (unexposed internal port 5432) and SkyOps Control Plane on port 3000 with persistent volumes `skyops_pgdata` and `skyops_appdata`.
- `.env.production.template` — Production configuration template with security best practices.
- `install.sh` — Single-command automated Linux installer with preflight checks (Ubuntu OS, x86_64 CPU, RAM, disk, ports, root), automated Docker CE/Compose installation, cryptographic secret generation, and startup health verification.
- `bin/skyops` — Management CLI tool supporting `status`, `start`, `stop`, `restart`, `logs`, `update`, `backup`, `restore`, `version`, and `uninstall`.
- `scripts/backup.sh` & `scripts/restore.sh` — Production backup and restore scripts utilizing native binary PostgreSQL custom dumps, application data archiving, and SHA-256 validation.
- `DOCKER_DEPLOYMENT.md`, `UBUNTU_INSTALLATION.md`, `INSTALLER_REFERENCE.md`, `BACKUP_RESTORE.md`, `NETWORK_SECURITY.md`, `RELEASE_DISTRIBUTION.md` — Full operational documentation.

### 3.3 Acceptance Criteria Verified
- Clean non-root container build with automated healthcheck.
- PostgreSQL database strictly isolated from host network.
- Cryptographic secrets generated with `openssl` and saved with `chmod 600`.
- Backup archive creation and restore validated with SHA-256 integrity checks.
- Interactive safety guards on uninstallation and database restoration.

---
- Initial admin user created successfully on clean database.

---

## Phase 4: Containerization & Docker Packaging

### 4.1 Objective
Package the SkyOps control plane, PostgreSQL database, reverse proxy, and local artifact storage into production-grade Docker images and a standardized `docker-compose.yml`.

### 4.2 Target Files
- `Dockerfile` (Multi-stage Node.js 22 LTS Alpine)
- `docker-compose.yml`
- `docker-compose.override.yml.example`
- `deploy/docker/caddy/Caddyfile`
- `deploy/docker/entrypoint.sh`

### 4.3 Implementation Steps
1. Create multi-stage `Dockerfile`:
   - Stage 1 (`builder`): Installs dependencies, compiles Vite React frontend, bundles backend with `esbuild`.
   - Stage 2 (`runner`): Minimal Alpine runtime, non-root user (`skyops:65532`), production node modules, compiled assets.
2. Create `docker-compose.yml`:
   - Services: `skyops-control-plane`, `skyops-postgres`, `skyops-proxy`.
   - Volumes: `skyops_pgdata`, `skyops_artifacts`.
   - Healthchecks: `pg_isready` on database, HTTP check on `/api/v1/health` for control plane.
3. Configure Caddy reverse proxy for automated HTTPS with Let's Encrypt or custom SSL certificates.

### 4.4 Risks & Mitigations
- *Risk*: High container image size causing slow customer downloads.
- *Mitigation*: Multi-stage build discarding development tools (`esbuild`, `typescript`, `@types/*`), targeting total image size < 180MB.

### 4.5 Automated Validation Tests
- `docker compose config` validation.
- Automated container spin-up and healthcheck verification script (`scripts/test-docker-compose.sh`).

### 4.6 Acceptance Criteria
- `docker compose up -d` launches entire platform cleanly on Ubuntu Server in under 30 seconds.

---

## Phase 5: One-Command Installation & Management CLI

### 5.1 Objective
Provide a seamless, production-hardened one-command installer script and an administrative CLI for host installation, updates, and service management.

### 5.2 Target Files
- `scripts/install.sh`
- `scripts/skyops-cli.sh` (Packaged as `/usr/local/bin/skyops`)
- `deploy/systemd/skyops.service`

### 5.3 Implementation Steps
1. Create official installer:
   ```bash
   curl -fsSL https://get.skyops.io/install.sh | bash
   ```
2. Installer execution lifecycle:
   - Check preflight requirements (Ubuntu x86-64, root or sudo, 4+ CPU, 8+ GB RAM, 50+ GB disk).
   - Detect or install Docker Engine and Docker Compose plugin.
   - Allocate `/var/lib/skyops` (configuration, database data, storage artifacts).
   - Generate secure random secrets (`SKYOPS_SECRET_KEY`, `POSTGRES_PASSWORD`, `AGENT_TOKEN_SALT`).
   - Pull verified container images from `ghcr.io/skyops-software-solutions/*`.
   - Install and enable `skyops.service` via `systemd`.
   - Display success banner with dashboard URL (e.g. `http://<SERVER_IP>:3000` or `https://<DOMAIN>`).
3. Build `skyops` host CLI:
   - Commands: `skyops status`, `skyops logs`, `skyops restart`, `skyops update`, `skyops backup`, `skyops restore`.

### 5.4 Risks & Mitigations
- *Risk*: Installer modifies existing server packages or breaks customer's existing Docker setups.
- *Mitigation*: Check for existing Docker installations and avoid modifying custom Docker daemon settings without prompt.

### 5.5 Automated Validation Tests
- Run `scripts/install.sh` inside clean Ubuntu 22.04 and 24.04 Docker containers in CI to verify non-interactive idempotency.

### 5.6 Acceptance Criteria
- Complete installation from bare Ubuntu shell to accessible web UI within 3 minutes.

---

## Phase 6: Licensing, Telemetry & AI Model Configuration

### 6.1 Objective
Enable self-hosted enterprise licensing, optional telemetry/error reporting, and flexible AI model integrations (Gemini, OpenAI, or local Ollama).

### 6.2 Target Files
- `server/licensing/licenseValidator.ts` (New)
- `server/ai/providers/ollamaProvider.ts` (New)
- `server/ai/service.ts`
- `src/components/settings/LicenseSettingsView.tsx` (New)

### 6.3 Implementation Steps
1. Implement cryptographic offline license key verification using asymmetric ED25519 or RSA signatures (verifying customer ID, node limit, cluster limit, expiration date).
2. Update `server/ai/service.ts`:
   - If `GEMINI_API_KEY` is present, use `@google/genai`.
   - If `OLLAMA_HOST` is present, route prompts to local Ollama / vLLM.
   - If no AI credentials are provided, fall back gracefully to deterministic rule-based heuristic summaries (zero UI errors or blank cards).
3. Provide UI in Settings to inspect license status, cluster usage quotas, and configure AI providers.

### 6.4 Risks & Mitigations
- *Risk*: Air-gapped installations failing if license system requires phoning home.
- *Mitigation*: Completely offline cryptographic signature verification with zero network phone-home requirement.

### 6.5 Automated Validation Tests
- Test valid, expired, and tampered license keys against signature verifier.

### 6.6 Acceptance Criteria
- Air-gapped operation confirmed with valid license key.
- Deterministic heuristic analysis active when AI is disabled.

---

## Phase 7: Backup, Restore & Disaster Recovery

### 7.1 Objective
Ensure customers can take complete, point-in-time backups of all relational state, configuration, and incident artifacts, and restore onto a fresh server with zero data loss.

### 7.2 Target Files
- `scripts/backup.sh`
- `scripts/restore.sh`
- `docs/DISASTER_RECOVERY.md` (New)

### 7.3 Implementation Steps
1. Create `skyops backup create [--output /path/to/archive.tar.gz]`:
   - Dumps PostgreSQL database using `pg_dump -Fc`.
   - Archives `/var/lib/skyops/data/artifacts` and `.env` configuration file.
   - Computes SHA-256 checksum of backup bundle.
2. Create `skyops restore --file /path/to/backup.tar.gz`:
   - Verifies bundle checksum and schema version compatibility.
   - Halts active control plane containers.
   - Restores PostgreSQL database from dump.
   - Restores artifact directory.
   - Restarts containers and runs verification health checks.
3. Provide automated cron backup configuration (`0 2 * * * /usr/local/bin/skyops backup create`).

### 7.4 Risks & Mitigations
- *Risk*: Backup taken while active telemetry writes occur causing corrupted database snapshot.
- *Mitigation*: Use PostgreSQL single-transaction consistent snapshot mode (`pg_dump` guarantee).

### 7.5 Automated Validation Tests
- End-to-end backup and restore test: seed 50 clusters and 500 incidents, execute backup, wipe database, restore from backup, assert exact record count match.

### 7.6 Acceptance Criteria
- 100% data integrity verified after full restore test.

---

## Phase 8: End-to-End Validation, Load Testing & Regression Verification

### 8.1 Objective
Perform comprehensive end-to-end validation across multiple remote Kubernetes clusters, automated incident detection, auto-healing remediation, cost intelligence, and high-frequency telemetry ingestion.

### 8.2 Target Files
- `tests/e2e/multiCluster.test.ts` (New)
- `tests/e2e/telemetryLoad.test.ts` (New)
- `tests/e2e/autoHealSimulation.test.ts` (New)
- `RELEASE_NOTES_v1.0.0.md` (New)

### 8.3 Implementation Steps
1. Deploy 3 remote Kubernetes clusters (e.g. k3s / minikube / kind) simulating remote customer clusters.
2. Deploy `skyops-agent` v1.5.1 into each cluster using the official Helm chart pointing to the self-hosted control plane.
3. Simulate real Kubernetes incidents:
   - CrashLoopBackOff pod failure.
   - Node memory pressure and uncordon/drain workflow.
   - Workload scale-up and scale-down mutations from Operations Workspace.
4. Execute telemetry load test: stream 100 metrics/sec and 500 log lines/sec continuously for 1 hour; monitor memory and CPU usage of control plane and PostgreSQL.
5. Fix any identified regression in existing test suites.

### 8.4 Risks & Mitigations
- *Risk*: Memory leak during continuous log ingestion under high load.
- *Mitigation*: Enforce bounded ring buffers in `logManager.ts` and automated PostgreSQL log partition expiration (`deleteExpiredLogs`).

### 8.5 Automated Validation Tests
- Full automated test suite passes: `npm run lint`, `npm run build`, `npm test` (384/384 passing).

### 8.6 Acceptance Criteria
- Verified multi-cluster agent telemetry streaming without dropped packets.
- Operations Workspace mutations execute successfully on remote clusters with complete audit trails.
- Release v1.0.0 tagged and ready for customer distribution.
