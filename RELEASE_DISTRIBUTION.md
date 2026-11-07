# SkyOps Release & Distribution Technical Plan

This document outlines the packaging, signing, and distribution infrastructure required to support the commercial one-command installer:
```bash
curl -fsSL https://get.skyops.io/install.sh | sudo bash
```

---

## 1. Hosting Requirements for get.skyops.io

To provide reliable public distribution for customer installations, the following infrastructure must be configured:

1. **DNS & CDN**:
   - `get.skyops.io` pointed to a global CDN (e.g., Cloudflare, Fastly, or AWS CloudFront) backed by an object storage bucket (e.g., Cloudflare R2, Google Cloud Storage, or AWS S3).
   - Strict SSL/TLS (HTTPS) enforced with HSTS.
   - Cache control: `Cache-Control: public, max-age=300` for `install.sh` to balance quick rollout with edge caching.

2. **Container Registry**:
   - Public multi-arch Docker image repository: `ghcr.io/skyops-software-solutions/skyops-control-plane` (or `docker.io/skyops/control-plane`).
   - Pinned semantic tags (`v1.0.0`) alongside floating minor tags (`v1`).
   - Image signing using Sigstore/Cosign.

3. **Helm Chart Repository**:
   - `https://charts.skyops.io` hosting index and packaged tarballs for `skyops-agent`.

---

## 2. Release Asset Pipeline

When a new release tag (e.g., `v1.0.0`) is published in GitHub Actions:

```
[ Git Tag: v1.0.0 ]
       │
       ├─► 1. Run full test suite (Node tests, Go agent tests, migrations)
       ├─► 2. Build multi-arch Docker image (linux/amd64) and push to GHCR
       ├─► 3. Package self-hosted release tarball:
       │      skyops-self-hosted-v1.0.0.tar.gz containing:
       │      - docker-compose.yml
       │      - .env.production.template
       │      - bin/skyops
       │      - scripts/backup.sh
       │      - scripts/restore.sh
       │      - server/persistence/migrations/
       │      - dist/
       ├─► 4. Sign release tarball and compute SHA-256
       ├─► 5. Package Helm chart and update charts.skyops.io index
       └─► 6. Upload release assets to GitHub Releases and CDN bucket
```

---

## 3. Honest Status of https://get.skyops.io

- **Current State**: The installer script `install.sh`, Dockerfile, compose configuration, CLI utility, backup/restore scripts, and automated test suite are **100% complete, verified, and operational within this repository**.
- **Public Domain**: `https://get.skyops.io` is the designated production endpoint. Until the CDN bucket and DNS record for `get.skyops.io` are bound to your production distribution infrastructure, users can run the installer immediately using:
  ```bash
  sudo bash install.sh
  ```
  or serve it from their private intranet / internal web server.
