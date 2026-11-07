# SkyOps Cloud Firestore to PostgreSQL Data Migration Guide

This guide documents the data extraction, transformation, validation, and reconciliation process for migrating existing SkyOps instances from Google Cloud Firestore (Mode A) to self-hosted PostgreSQL (Mode B).

---

## 1. Overview & Principles

The migration utility is located at `scripts/migrate-firestore-to-postgres.ts`.

Key architectural principles:
1. **Zero Data Destruction**: The migration script only reads from Firestore. It never modifies, updates, or deletes documents in the source Firestore database.
2. **Idempotence / UPSERT**: All destination inserts in PostgreSQL use `ON CONFLICT (id) DO UPDATE` or `DO NOTHING`, allowing the script to be run repeatedly without duplicating records or corrupting foreign keys.
3. **Dry-Run Validation**: Always execute in `--dry-run` mode first to inspect record counts, identify validation errors, and check schema compatibility before modifying the destination database.
4. **Tenant Isolation Preservation**: Every entity with a `tenantId` in Firestore retains its exact tenant mapping in PostgreSQL.

---

## 2. Prerequisites

Before running the migration:
1. Set up and start PostgreSQL (see `POSTGRESQL_SETUP.md`).
2. Run database migrations to ensure the destination schema is up-to-date:
   ```bash
   npx tsx -e "import { PostgresMigrator } from './server/persistence/migrator'; new PostgresMigrator().runMigrations();"
   ```
3. Set the required environment variables:
   ```bash
   # Source Firestore Credentials
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
   # OR use the active gcloud/ADC session
   FIREBASE_PROJECT_ID=skyops-a1143

   # Destination PostgreSQL Credentials
   POSTGRES_HOST=127.0.0.1
   POSTGRES_PORT=5432
   POSTGRES_DB=skyops
   POSTGRES_USER=skyops_user
   POSTGRES_PASSWORD=your_secure_password
   ```

---

## 3. Migration Sequence & Entity Dependency Order

Entities are migrated strictly in dependency order to satisfy foreign key constraints:

1. `tenants` (Root organizations)
2. `users` (User accounts)
3. `clusters` (Registered Kubernetes clusters)
4. `agent_tokens` (Associated cluster tokens)
5. `agent_configs` (Cluster agent configurations)
6. `incidents` (Incidents mapped to clusters/tenants)
7. `nodes` & `workloads` (Cluster topology)
8. `telemetry_snapshots` (Cluster telemetry rollups)
9. `cost_metrics` & `cost_policies` & `cost_recommendations`
10. `auto_healing_policies` & `remediation_records` & `remediation_approvals`
11. `slos` & `slo_burn_events`
12. `investigation_graphs` & `diagnostic_runs` & `evidence_records`
13. `audit_logs` & `agent_audit_logs` & `api_keys`
14. High-frequency telemetry: `time_series_metrics`, `log_entries`, `event_entries`

---

## 4. Execution Step-by-Step

### Step 1: Execute Dry-Run Validation
```bash
npx tsx scripts/migrate-firestore-to-postgres.ts --dry-run
```
Output example:
```
[INFO] Connecting to Source Firestore (Project: skyops-a1143)...
[INFO] Connecting to Destination PostgreSQL (Host: 127.0.0.1:5432/skyops)...
[INFO] Validating source collections...
  Found 1 tenants
  Found 4 users
  Found 3 clusters
  Found 12 incidents
  Found 48 nodes
  Found 230 workloads
[INFO] DRY RUN MODE: No changes will be committed to PostgreSQL.
[INFO] Validation passed: 0 schema errors detected. Ready for execution.
```

### Step 2: Execute Live Migration
```bash
npx tsx scripts/migrate-firestore-to-postgres.ts --execute
```

Output example:
```
[INFO] Migrating collection: tenants (1 records)... Done (42ms)
[INFO] Migrating collection: users (4 records)... Done (65ms)
[INFO] Migrating collection: clusters (3 records)... Done (80ms)
[INFO] Migrating collection: incidents (12 records)... Done (110ms)
...
[INFO] Migration complete! 26 collections processed. Total records migrated: 1,420. Errors: 0.
```

---

## 5. Post-Migration Verification

Run reconciliation checks to verify row counts between systems:

```sql
-- In PostgreSQL:
SELECT 'users' as entity, COUNT(*) FROM users
UNION ALL
SELECT 'clusters', COUNT(*) FROM clusters
UNION ALL
SELECT 'incidents', COUNT(*) FROM incidents
UNION ALL
SELECT 'nodes', COUNT(*) FROM nodes
UNION ALL
SELECT 'workloads', COUNT(*) FROM workloads
UNION ALL
SELECT 'telemetry_snapshots', COUNT(*) FROM telemetry_snapshots;
```

---

## 6. Cutover & Rollback Strategy

### Cutover Plan
1. Put the SkyOps frontend into maintenance mode (or stop the service).
2. Run the final delta migration with `scripts/migrate-firestore-to-postgres.ts --execute`.
3. Update server configuration:
   ```bash
   SKYOPS_DEPLOYMENT_MODE=self_hosted
   PERSISTENCE_PROVIDER=postgres
   SKYOPS_AUTH_PROVIDER=local
   ```
4. Start SkyOps.
5. Log in with an administrator account to verify all clusters, incidents, and telemetry appear properly.

### Rollback Plan
Because the source Firestore database was never modified, rollback is instant and risk-free:
1. Revert environment variables to:
   ```bash
   SKYOPS_DEPLOYMENT_MODE=hosted
   PERSISTENCE_PROVIDER=firestore
   SKYOPS_AUTH_PROVIDER=firebase
   ```
2. Restart SkyOps.
3. The platform immediately resumes reading and writing to Firestore.
