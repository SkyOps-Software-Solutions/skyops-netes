# SkyOps Self-Hosted — Upgrade & Version Management Guide

This guide describes how to safely upgrade your self-hosted SkyOps control plane to new versions while preserving operational data, cluster registrations, and incident history.

---

## 1. Upgrade Architecture & Safeguards

SkyOps upgrades are designed to be reliable, predictable, and recoverable:

1. **Explicit Administrator Approval**: Upgrades are **never** applied automatically in the background. An administrator must explicitly review and trigger updates.
2. **Automated Pre-Update Backup**: Before applying new container images or executing database schema migrations, SkyOps automatically triggers an atomic PostgreSQL snapshot and archives persistent files to `/opt/skyops/backups`.
3. **Transactional Database Migrations**: All PostgreSQL schema migrations execute inside atomic database transactions (`BEGIN ... COMMIT`). If a migration fails, the transaction automatically rolls back without leaving corrupted tables.
4. **Volume Preservation**: Named Docker volumes (`skyops_pgdata` and `skyops_appdata`) are independent of container images and persist across container recreation.

---

## 2. Upgrading via Dashboard (UI)

1. Open the SkyOps Dashboard as an Administrator.
2. Navigate to **Settings** → **Software Updates**.
3. The dashboard will show:
   - Your current installed version (e.g. `v1.5.1`).
   - The latest available verified release (e.g. `v1.6.0`).
   - Release notes and changelog summary.
4. Review the release notes and breaking changes notice.
5. Click **Apply Update & Restart**.
6. The platform creates a pre-update safety backup, pulls the verified container images, runs migrations, and restarts services.

---

## 3. Upgrading via CLI (Command Line)

To upgrade directly from the host terminal:

```bash
# 1. SSH into your host
cd /opt/skyops

# 2. Run the update command
skyops update
```

### What `skyops update` Does:
1. Verifies release metadata and SHA-256 signatures from the distribution channel.
2. Executes `./scripts/backup.sh` to capture an immediate pre-update snapshot.
3. Pulls the new container images from the official registry.
4. Recreates the control plane container while keeping the database volume mounted.
5. Runs `PostgresMigrator` to apply any new SQL migrations.
6. Probes `/api/v1/auth/status` until healthy.

---

## 4. Disaster Recovery & Rollback Procedure

If an upgrade fails or you need to roll back to a prior release:

1. **Inspect Available Backups**:
   ```bash
   ls -la /opt/skyops/backups/
   ```

2. **Restore Previous Snapshot**:
   ```bash
   skyops restore /opt/skyops/backups/skyops_backup_YYYYMMDD_HHMMSS.tar.gz
   ```

3. **Verify Restored Health**:
   ```bash
   skyops status
   ```
   All users, clusters, incident timelines, and settings will be restored to the exact state captured at the time of the backup snapshot.
