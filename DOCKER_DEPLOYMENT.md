# SkyOps Production Docker & Docker Compose Deployment Guide

This document describes the container architecture, configuration parameters, and operational procedures for running SkyOps in self-hosted mode using Docker and Docker Compose.

---

## 1. Container Architecture

SkyOps Self-Hosted follows a decoupled, two-tier architecture running on a single host machine:

```
                                  [ Customer Network / Ingress ]
                                                │
                                    HTTP/HTTPS (:3000 / :443)
                                                ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ Docker Host (e.g., Ubuntu Server 22.04 LTS)                                 │
 │                                                                             │
 │  ┌───────────────────────────────────────────────────────────────────────┐  │
 │  │ skyops-control-plane (Node.js 22 + Express + React SPA)               │  │
 │  │                                                                       │  │
 │  │ - Non-root execution: user 'skyops' (UID/GID 10001)                   │  │
 │  │ - Signal management: Tini init system (graceful SIGTERM/SIGINT)       │  │
 │  │ - Persistence driver: PostgresStore (auto-runs migrations on startup) │  │
 │  │ - Local Storage driver: /var/lib/skyops/data                          │  │
 │  │ - Healthcheck: /api/v1/auth/status                                    │  │
 │  └──────────────────────────────┬────────────────────────────────────────┘  │
 │                                 │                                           │
 │                 skyops-network  │ Internal TCP :5432 (Unpublished)          │
 │                 (bridge)        │                                           │
 │                                 ▼                                           │
 │  ┌───────────────────────────────────────────────────────────────────────┐  │
 │  │ skyops-postgres (PostgreSQL 16 Alpine)                                │  │
 │  │                                                                       │  │
 │  │ - Data volume: skyops_pgdata -> /var/lib/postgresql/data              │  │
 │  │ - Connection pool: max 25 connections with automatic recovery         │  │
 │  │ - Port 5432: STRICTLY INTERNAL (never bound to host network)          │  │
 │  │ - Healthcheck: pg_isready probe                                       │  │
 │  └───────────────────────────────────────────────────────────────────────┘  │
 └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Image Build & Layer Optimization

The `Dockerfile` employs a multi-stage build pattern:

1. **Stage 1 (`builder`)**:
   - Base: `node:22-alpine` with standard native build tools (`python3`, `make`, `g++`).
   - Copies `package.json` and runs `npm ci` leveraging layer caching.
   - Runs `npm run build` which invokes:
     - Vite production compilation for React frontend into `dist/`.
     - Esbuild server bundling into `dist/server.cjs`.
     - Database migration bundling into `dist/migrations/`.

2. **Stage 2 (`runner`)**:
   - Base: `node:22-alpine` with `curl`, `bash`, and `/sbin/tini`.
   - Runs under unprivileged user `skyops:skyops` (UID 10001).
   - Only installs production-tier dependencies (`npm ci --omit=dev --ignore-scripts`).
   - Final image size is minimized and hardened against privilege escalation (`no-new-privileges:true`).

---

## 3. Persistent Volumes

| Volume Name | Container Path | Purpose |
| :--- | :--- | :--- |
| `skyops_pgdata` | `/var/lib/postgresql/data` | PostgreSQL tables, indexes, WAL logs, and schema migrations. |
| `skyops_appdata` | `/var/lib/skyops/data` | Exported telemetry snapshots, log archives, and uploaded artifacts. |

Data in these volumes persists across container restarts, image updates, and system reboots.

---

## 4. Environment Variables Reference

| Variable | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| `NODE_ENV` | Yes | `production` | Enables production optimizations and static asset serving. |
| `SKYOPS_DEPLOYMENT_MODE` | Yes | `self_hosted` | Switches backend from hosted Firebase to self-hosted engine. |
| `PERSISTENCE_PROVIDER` | Yes | `postgres` | Directs persistence layer to PostgreSQL store. |
| `AUTH_PROVIDER` | Yes | `local` | Enables local database authentication and JWT cookies. |
| `SKYOPS_JWT_SECRET` | Yes | *(Random)* | 64-character hex key for signing JWT session tokens. |
| `POSTGRES_HOST` | Yes | `postgres` | Internal container hostname for PostgreSQL. |
| `POSTGRES_PORT` | No | `5432` | Internal database port. |
| `POSTGRES_DB` | No | `skyops` | PostgreSQL database name. |
| `POSTGRES_USER` | No | `skyops` | PostgreSQL username. |
| `POSTGRES_PASSWORD` | Yes | *(Random)* | PostgreSQL password. |
| `POSTGRES_POOL_MAX` | No | `25` | Maximum database connection pool size. |
| `SKYOPS_PORT` | No | `3000` | Host port on which SkyOps dashboard is exposed. |
| `SKYOPS_APP_URL` | Yes | `http://<IP>:3000` | Browser URL used for application links and redirects. |
| `SKYOPS_SERVER_URL` | Yes | `http://<IP>:3000` | Endpoint URL that remote Kubernetes Go agents connect to. |
| `STORAGE_DRIVER` | No | `local` | Local disk driver for report and file storage. |
| `LOCAL_STORAGE_PATH` | No | `/var/lib/skyops/data`| Container directory for local storage driver. |

---

## 5. Standard Operations

### Starting Services
```bash
docker compose up -d
```

### Stopping Services
```bash
docker compose stop
```

### Viewing Logs
```bash
# View combined live logs
docker compose logs -f

# View application logs only
docker compose logs -f skyops

# View database logs only
docker compose logs -f postgres
```

### Health Inspection
```bash
docker compose ps
curl -i http://localhost:3000/api/v1/auth/status
```
Expected response:
```json
{
  "authProvider": "local",
  "deploymentMode": "self_hosted",
  "setupRequired": true,
  "initialized": false
}
```
