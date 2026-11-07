# SkyOps Ubuntu Server Installation Guide

This guide walks through deploying the SkyOps self-hosted incident management platform onto a clean machine running Ubuntu Server.

---

## 1. System Requirements

### Hardware Requirements
- **Architecture**: 64-bit x86_64 (amd64).
- **CPU**: 2 vCPUs minimum (4 vCPUs recommended for multi-cluster environments).
- **RAM**: 4 GB RAM minimum (2 GB absolute minimum; 8 GB recommended for 5+ clusters).
- **Storage**: 20 GB free disk space on root or `/opt`. Fast NVMe or SSD storage recommended.

### Certified Operating Systems
- Ubuntu Server 24.04 LTS (Noble Numbat)
- Ubuntu Server 22.04 LTS (Jammy Jellyfish)
- Ubuntu Server 20.04 LTS (Focal Fossa)

### Network Requirements
- Inbound TCP port `3000` (or `80`/`443` if using a reverse proxy) open to customer engineers and remote Kubernetes clusters.
- Outbound access to Docker Hub and official Ubuntu package mirrors.

---

## 2. One-Command Automated Installation

Run the official installer using `curl` and `sudo`:

```bash
curl -fsSL https://get.skyops.io/install.sh | sudo bash
```

*(Note: In local development or air-gapped scenarios, run `sudo bash install.sh` directly from the repository root).*

### What the installer executes automatically:
1. **Verifies preflight checks**: Root privileges, 64-bit architecture, Ubuntu OS release, CPU, RAM, and disk space.
2. **Installs Docker Engine & Compose**: Automatically registers the official Docker repository and installs certified packages if missing.
3. **Creates `/opt/skyops`**: Creates directory structure for configuration, data, backups, and binaries.
4. **Generates cryptographic secrets**: Uses `openssl` to create secure keys for `SKYOPS_JWT_SECRET` and `POSTGRES_PASSWORD`.
5. **Configures `.env`**: Sets permissions to `chmod 600` for strict root-only read/write access.
6. **Launches Docker containers**: Starts PostgreSQL 16 and the SkyOps Control Plane.
7. **Runs database schema migrations**: Automatically builds initial tables, indexes, and constraints.
8. **Installs `/usr/local/bin/skyops`**: Installs the command-line management utility.
9. **Verifies platform readiness**: Polls the healthcheck endpoint until the dashboard is fully ready.

---

## 3. Post-Installation: Initial Setup Wizard

Once the installer finishes:

1. Open your browser and navigate to:
   ```
   http://<SERVER_IP>:3000/setup
   ```
2. Enter your initial administrator credentials:
   - Full Name
   - Administrator Email
   - Strong Password (minimum 8 characters)
   - Initial Workspace / Organization Name
3. Submit the form. The system will create the initial account, sign you in via a secure JWT session cookie, and redirect you to the main incident management dashboard.

---

## 4. Connecting Your First Kubernetes Cluster

1. In the SkyOps dashboard, navigate to **Clusters** -> **Connect Cluster**.
2. Enter a friendly name for your cluster (e.g., `production-us-east`).
3. Copy the generated Helm installation command:
   ```bash
   helm repo add skyops https://charts.skyops.io
   helm upgrade --install skyops-agent skyops/skyops-agent \
     --namespace skyops-agent \
     --create-namespace \
     --set clusterId="cls-xxxxxxxx" \
     --set agentToken="agt-xxxxxxxx" \
     --set serverUrl="http://<SERVER_IP>:3000"
   ```
4. Run this command on your Kubernetes management workstation with `kubectl` context pointing to your target cluster.
5. Within 15 seconds, the agent will establish a connection, send its first heartbeat, and begin streaming real-time pod metrics, event anomalies, and log telemetry into your self-hosted SkyOps control plane.

---

## 5. System Management

Manage your installation at any time using the `skyops` CLI:

```bash
# View service health and status
skyops status

# View live container logs
skyops logs

# Create a full backup
skyops backup

# Restart services
skyops restart
```
