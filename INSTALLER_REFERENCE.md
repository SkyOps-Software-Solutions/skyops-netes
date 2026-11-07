# SkyOps Installer Technical Reference

This document details the internal operation, error handling, environment variables, and exit codes of `install.sh`.

---

## 1. Execution Flow

```
[Start]
   │
   ├─► 1. check_root: Ensure EUID == 0
   ├─► 2. check_architecture: Verify x86_64
   ├─► 3. check_os: Verify Ubuntu 20.04/22.04/24.04 from /etc/os-release
   ├─► 4. check_system_resources: Validate RAM (>=2GB, recommend >=4GB) and Disk (>=10GB)
   ├─► 5. check_ports: Ensure target port (default 3000) is free
   ├─► 6. check_internet: Verify outbound connectivity
   ├─► 7. ensure_docker: Detect or install Docker CE + Compose plugin via apt
   ├─► 8. setup_directories: Create /opt/skyops subdirectories with strict permissions
   ├─► 9. copy_or_fetch_distribution_files: Place compose, Dockerfile, scripts, and bin/skyops
   ├─► 10. generate_secrets_and_env: Generate openssl secrets and write chmod 600 .env
   ├─► 11. start_skyops: Invoke docker compose up -d and poll /api/v1/auth/status
   └─► 12. print_summary: Output connection URLs, setup instructions, and CLI guide
[End]
```

---

## 2. Environment Variables & Overrides

The installer accepts optional environment variables to customize deployment behavior:

| Variable | Default | Purpose |
| :--- | :---: | :--- |
| `SKYOPS_VERSION` | `v1.0.0` | Target release version to download or tag. |
| `SKYOPS_PORT` | `3000` | Host port on which SkyOps will listen. |
| `FORCE_INSTALL` | `false` | Bypasses non-critical preflight warnings (e.g., non-Ubuntu distros, low RAM warning). |
| `SKYOPS_APP_URL` | Detected IP | Overrides the public web dashboard URL written to `/opt/skyops/.env`. |
| `SKYOPS_SERVER_URL` | Detected IP | Overrides the agent ingestion URL written to `/opt/skyops/.env`. |

### Example Custom Installation Command
```bash
# Install SkyOps on custom port 8080 with a public domain
export SKYOPS_PORT=8080
export SKYOPS_APP_URL="https://skyops.internal.corp"
export SKYOPS_SERVER_URL="https://skyops.internal.corp"
curl -fsSL https://get.skyops.io/install.sh | sudo -E bash
```

---

## 3. Preflight Failure Conditions & Exit Codes

| Code | Condition | Resolution |
| :---: | :--- | :--- |
| `1` | Non-root execution | Run using `sudo bash install.sh`. |
| `1` | Unsupported architecture | Deploy on an x86_64 / amd64 virtual machine or server. |
| `1` | Unsupported OS | Deploy on Ubuntu 20.04/22.04/24.04 or set `FORCE_INSTALL=true`. |
| `1` | Insufficient RAM (< 1800 MB) | Upgrade host VM size to at least 2 GB RAM (4 GB recommended). |
| `1` | Insufficient disk space (< 5 GB) | Free disk space on `/opt` or expand root filesystem. |
| `1` | Port conflict | Free port 3000 or specify `export SKYOPS_PORT=<new_port>`. |
| `1` | Service startup timeout (60s) | Check container logs with `docker compose -f /opt/skyops/docker-compose.yml logs`. |

---

## 4. Secret Generation

If `/opt/skyops/.env` does not exist:
- **`SKYOPS_JWT_SECRET`**: Generated using `openssl rand -hex 32` (256-bit cryptographically secure entropy).
- **`POSTGRES_PASSWORD`**: Generated using `openssl rand -hex 24` (192-bit secure entropy).
- **Permissions**: `/opt/skyops/.env` is immediately created with mode `0600` (`-rw-------`), readable and writable only by the root user.

If `/opt/skyops/.env` already exists from a previous run or manual configuration:
- The installer **strictly preserves existing secrets** and never overwrites user-defined credentials.
