# SkyOps Backup & Disaster Recovery Guide

This document describes procedures for backing up, restoring, and validating the state of a self-hosted SkyOps installation.

---

## 1. Backup Strategy & Architecture

A complete SkyOps backup contains two primary components:
1. **PostgreSQL Relational Database**: All users, organizations, cluster configurations, incident records, timeline notes, remediation actions, policies, and audit logs.
2. **Persistent Application Storage**: Uploaded files, generated PDF incident reports, offline telemetry snapshots, and audit exports stored under `/var/lib/skyops/data`.

The backup utility packages both items alongside a JSON metadata manifest and an independent SHA-256 checksum file into a single compressed archive.

```
skyops_backup_20261105_085000.tar.gz
├── postgres_dump.pgc          (Native binary custom pg_dump)
├── appdata/                   (Persistent file storage snapshot)
│   └── data/
└── backup-manifest.json       (Metadata, schema versions, timestamps)
```

Beside the archive, a checksum file is generated:
```
skyops_backup_20261105_085000.tar.gz.sha256
```

---

## 2. Creating a Backup

Run the backup command using the `skyops` CLI:

```bash
# Store backup in default directory (/opt/skyops/backups)
skyops backup

# Or specify a custom target directory (e.g., an NFS mount or external volume)
skyops backup /mnt/secure-backups/skyops
```

### Automation via Cron
To establish an automated daily backup schedule at 02:00 UTC, add the following cron job to root's crontab (`sudo crontab -e`):

```cron
0 2 * * * /usr/local/bin/skyops backup /var/backups/skyops >> /var/log/skyops-backup.log 2>&1
```

---

## 3. Restoring from a Backup

Restoring replaces the current database and file storage state with the snapshot contained in the archive.

```bash
# Interactive restore (prompts to type "RESTORE" to prevent accidental data loss)
skyops restore /opt/skyops/backups/skyops_backup_20261105_085000.tar.gz

# Automated / non-interactive restore (for disaster recovery pipelines)
skyops restore /opt/skyops/backups/skyops_backup_20261105_085000.tar.gz --yes
```

### Step-by-Step Restore Workflow:
1. **Integrity Validation**: Computes the SHA-256 checksum of the target archive and compares it with `.sha256`. If the checksum fails, restoration terminates immediately.
2. **Manifest Inspection**: Verifies archive contents and prints the backup timestamp, database name, and application version.
3. **Safety Confirmation**: Requires the operator to confirm by typing `RESTORE` (unless `--yes` is passed).
4. **Service Isolation**: Gracefully stops the `skyops-control-plane` container so that active database connections and web traffic do not interrupt the database restoration.
5. **Database Restoration**: Executes `pg_restore --clean --if-exists` inside the PostgreSQL container to cleanly reconstruct tables, foreign keys, and indexes.
6. **Storage File Restoration**: Extracts and restores persistent application files to `/var/lib/skyops/data`.
7. **Platform Restart & Health Probe**: Starts the `skyops-control-plane` container and polls `/api/v1/auth/status` until the application reports healthy status.

---

## 4. Disaster Recovery Scenarios

### Recovering onto a Fresh Host Machine
If the original server is destroyed or replaced:

1. Provision a new Ubuntu Server machine meeting system requirements.
2. Run the SkyOps installer to establish base services:
   ```bash
   curl -fsSL https://get.skyops.io/install.sh | sudo bash
   ```
3. Copy your backup archive (`*.tar.gz` and `*.sha256`) to the new server.
4. Execute the restore command:
   ```bash
   skyops restore /path/to/skyops_backup.tar.gz
   ```
5. All incidents, clusters, and users will be fully recovered.
