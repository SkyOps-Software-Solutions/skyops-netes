# SkyOps PostgreSQL Setup & Administration Guide

This guide describes how to configure, provision, migrate, and maintain the PostgreSQL database for self-hosted SkyOps deployments (Mode B).

---

## 1. Prerequisites & Version Requirements

- **Supported PostgreSQL Versions**: PostgreSQL 14, 15, or 16 (PostgreSQL 16 recommended).
- **Extensions Required**: `uuid-ossp` or `pgcrypto` (optional, schema uses built-in UUID and gen_random_uuid functions).
- **RAM Recommendation**: Minimum 1 GB RAM allocated to PostgreSQL for workloads up to 10 clusters; 4 GB+ for large-scale telemetry retention.
- **Disk Storage**: NVMe SSD recommended. Minimum 20 GB free space for metric rollups, logs, and audit trails.

---

## 2. Environment Configuration

To enable PostgreSQL persistence in SkyOps, set the following environment variables in your `.env` or system environment:

```bash
# Deployment Mode Selection
SKYOPS_DEPLOYMENT_MODE=self_hosted
PERSISTENCE_PROVIDER=postgres

# PostgreSQL Connection Configuration
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DB=skyops
POSTGRES_USER=skyops_user
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_SSL=false

# Alternatively, specify a complete connection URI (takes precedence):
# DATABASE_URL=postgresql://skyops_user:your_secure_password_here@127.0.0.1:5432/skyops?sslmode=disable

# Connection Pool Settings
POSTGRES_MAX_CONNECTIONS=20
POSTGRES_IDLE_TIMEOUT_MILLIS=30000
POSTGRES_CONNECTION_TIMEOUT_MILLIS=5000
```

---

## 3. Database & User Provisioning

Connect to your PostgreSQL server as the `postgres` superuser and run:

```sql
-- 1. Create a dedicated database user
CREATE USER skyops_user WITH PASSWORD 'your_secure_password_here';

-- 2. Create the SkyOps database owned by this user
CREATE DATABASE skyops OWNER skyops_user;

-- 3. Grant schema permissions
\c skyops
GRANT ALL ON SCHEMA public TO skyops_user;
```

---

## 4. Automated Database Migrations

SkyOps includes an automated, transactional schema migrator (`server/persistence/migrator.ts`).

### Automatic Execution on Startup
When SkyOps starts with `PERSISTENCE_PROVIDER=postgres`, `PostgresMigrator` automatically checks the `schema_migrations` table, applies any pending SQL migration files from `server/persistence/migrations/` in transactional sequence (`BEGIN ... COMMIT`), and logs execution.

### Manual Migration Check
You can run migrations programmatically or via a script before launching SkyOps:

```bash
# Execute migrator via tsx
npx tsx -e "
import { PostgresMigrator } from './server/persistence/migrator';
const migrator = new PostgresMigrator();
migrator.runMigrations()
  .then(() => { console.log('Migrations complete'); process.exit(0); })
  .catch((err) => { console.error('Migration failed:', err); process.exit(1); });
"
```

### Migration History
Applied migrations are recorded in `schema_migrations`:
```sql
SELECT version, name, applied_at, execution_time_ms FROM schema_migrations ORDER BY version ASC;
```

---

## 5. Schema Architecture & Tables

SkyOps implements 27 relational tables matching the 26 logical persistence entities plus the internal authentication credential table:

| Table Name | Entity Description | Primary Key & Indexes |
|---|---|---|
| `clusters` | Registered Kubernetes clusters & agent states | `id`, index on `tenant_id` |
| `agent_tokens` | Ephemeral & static agent registration tokens | `token`, index on `cluster_id` |
| `agent_configs` | Remote agent configurations & push schedules | `id`, index on `cluster_id` |
| `users` | User accounts, display names, and roles | `id`, unique `email` |
| `local_credentials` | Argon2id/bcrypt password hashes and salts | `user_id` (FK to `users.id`) |
| `incidents` | Incident management records, severity, status | `id`, composite index on `(tenant_id, status)` |
| `telemetry_snapshots` | Health check reports, cluster status | `id`, composite index on `(cluster_id, timestamp)` |
| `nodes` | Node resource metrics, statuses, and taints | `id`, composite index on `(cluster_id, name)` |
| `workloads` | Pods, Deployments, StatefulSets, DaemonSets | `id`, composite index on `(cluster_id, namespace)` |
| `cost_metrics` | Monthly, daily, and resource cost allocations | `id`, composite index on `(tenant_id, cluster_id)` |
| `audit_logs` | Security, user, and agent audit event logs | `id`, composite index on `(tenant_id, timestamp)` |
| `auto_healing_policies`| Automated mitigation policies & guardrails | `id`, index on `tenant_id` |
| `remediation_records` | Remediation execution history & results | `id`, index on `tenant_id` |
| `remediation_approvals`| Multi-stage approval requests and status | `id`, index on `tenant_id` |
| `investigation_graphs`| Graph relations between nodes, pods, events | `id`, index on `incident_id` |
| `diagnostic_runs` | Automated diagnostic executions & outputs | `id`, index on `incident_id` |
| `slos` | Service Level Objectives & error budgets | `id`, index on `tenant_id` |
| `slo_burn_events` | SLO burn alerts and incident triggers | `id`, index on `slo_id` |
| `cost_policies` | FinOps budgets, threshold alerts, rules | `id`, index on `tenant_id` |
| `cost_recommendations`| Workload right-sizing & node recommendations | `id`, index on `tenant_id` |
| `tenants` | Multi-tenant organization isolation records | `id` |
| `api_keys` | Programmatic API access tokens and scopes | `id`, unique `key_hash` |
| `agent_audit_logs` | Dedicated agent lifecycle and command audits | `id`, index on `cluster_id` |
| `log_entries` | Ingested container logs and search indexes | `id`, composite index on `(cluster_id, timestamp)` |
| `event_entries` | Kubernetes events (Warning, Normal) | `id`, composite index on `(cluster_id, timestamp)` |
| `time_series_metrics` | High-frequency metric telemetry samples | `id`, composite index on `(cluster_id, metric_name, timestamp)` |
| `evidence_records` | Incident evidence attachments and references | `id`, index on `incident_id` |

---

## 6. Connection Pool Configuration & Best Practices

The SkyOps `PostgresStore` maintains an active `pg.Pool`. Tuning recommendations:

| Workload Size | Monitored Clusters | `POSTGRES_MAX_CONNECTIONS` | Recommended DB Server vCPU / RAM |
|---|---|---|---|
| Starter | 1 – 3 | 10 | 2 vCPU / 2 GB RAM |
| Mid-Market | 4 – 15 | 20 (default) | 4 vCPU / 4 GB RAM |
| Enterprise | 16 – 50+ | 50 | 8 vCPU / 8 GB RAM |

### Connection Health & Graceful Shutdown
- `PostgresStore` registers process lifecycle listeners (`SIGTERM`, `SIGINT`) to drain active queries and close the connection pool cleanly.
- Idle client connections are pruned after `POSTGRES_IDLE_TIMEOUT_MILLIS` (default: 30 seconds).

---

## 7. Backup and Recovery

### Taking a Database Backup
```bash
pg_dump -h 127.0.0.1 -U skyops_user -d skyops -F c -b -v -f /var/backups/skyops_$(date +%Y%m%d_%H%M%S).dump
```

### Restoring a Database Backup
```bash
# 1. Stop SkyOps
systemctl stop skyops # or docker compose stop

# 2. Restore database
pg_restore -h 127.0.0.1 -U skyops_user -d skyops -v --clean /var/backups/skyops_20250101_120000.dump

# 3. Restart SkyOps
systemctl start skyops
```

---

## 8. Troubleshooting

### Connection Refused (`ECONNREFUSED 127.0.0.1:5432`)
- Ensure PostgreSQL is running: `sudo systemctl status postgresql`
- Verify `listen_addresses` in `postgresql.conf` includes `localhost` or `*`.
- Check `pg_hba.conf` allows MD5/SCRAM authentication for `skyops_user`.

### SSL Connection Errors
- If connecting locally or across a private Docker network without SSL, set `POSTGRES_SSL=false`.
- If using Amazon RDS or Google Cloud SQL, set `POSTGRES_SSL=true`.
