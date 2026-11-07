# SkyOps Self-Hosted — Diagnostics & Troubleshooting Guide

This guide provides actionable solutions for diagnosing and resolving common operational issues on your self-hosted SkyOps control plane and monitored Kubernetes clusters.

---

## 1. Quick Diagnostic Commands

Run these commands from the Ubuntu host running SkyOps:

```bash
# Check status of containers and health probes
skyops status

# View live control plane logs
skyops logs -f

# View PostgreSQL database logs
sudo docker compose -f /opt/skyops/docker-compose.yml logs -f postgres

# Test database connectivity
sudo docker compose -f /opt/skyops/docker-compose.yml exec postgres pg_isready -U skyops
```

---

## 2. Common Issues & Solutions

### Issue 1: Dashboard is Unreachable / Port 3000 Timeout

**Symptoms**: Browser reports `Connection refused` or times out when connecting to `http://YOUR_SERVER_IP:3000`.

**Possible Causes & Fixes**:
1. **Container Not Running**:
   ```bash
   skyops status
   skyops start
   ```
2. **Ubuntu UFW Firewall Blocking Port 3000**:
   ```bash
   sudo ufw status
   sudo ufw allow 3000/tcp comment 'SkyOps Dashboard'
   ```
3. **Cloud Security Group (AWS/GCP/Azure)**:
   - Verify that your cloud provider's network security group or firewall rules permit inbound traffic on TCP port 3000 (or 443 if using a reverse proxy) from your IP or VPN.

---

### Issue 2: Monitored Cluster Shows "Offline" or "Disconnected"

**Symptoms**: In the Dashboard, a registered cluster displays a yellow/red status and telemetry has ceased updating.

**Diagnostics on Kubernetes**:
```bash
# Inspect agent pod status
kubectl get pods -n skyops -l app.kubernetes.io/name=skyops-agent

# Inspect live agent logs
kubectl logs -n skyops -l app.kubernetes.io/name=skyops-agent --tail=50
```

**Common Log Errors & Fixes**:
- `401 Unauthorized`: The `agentToken` configured in the Helm chart does not match the token in the SkyOps Dashboard. Upgrade the Helm release with the correct token:
  ```bash
  helm upgrade skyops-agent skyops/skyops-agent \
    --namespace skyops \
    --reuse-values \
    --set agentToken="CORRECT_AGENT_TOKEN"
  ```
- `x509: certificate signed by unknown authority`: Your SkyOps server is using an untrusted or self-signed TLS certificate. Ensure your server has a valid certificate (Let's Encrypt / DigiCert) or configure your corporate CA in Helm.
- `connection refused / dial tcp`: Verify outbound internet or intranet egress from your Kubernetes worker nodes to your SkyOps host URL on port 3000/443.

---

### Issue 3: Database Connection Failures / Database Locked

**Symptoms**: Server logs show `ECONNREFUSED 127.0.0.1:5432` or database errors.

**Fix**:
1. Check the PostgreSQL container state:
   ```bash
   sudo docker compose -f /opt/skyops/docker-compose.yml ps postgres
   ```
2. Inspect disk space on `/opt/skyops` and the Docker volume root:
   ```bash
   df -h /var/lib/docker
   ```
   PostgreSQL automatically enters read-only emergency mode if disk space drops below 5%. Free disk space or expand the storage volume.

---

### Issue 4: Administrator Password Forgotten

If you are locked out of the initial administrator account:
```bash
# Generate a new scrypt hash using node in the container or CLI
sudo docker compose -f /opt/skyops/docker-compose.yml exec -T postgres psql -U skyops -d skyops -c \
  "SELECT id, email, role FROM users;"
```
You can update the password hash directly or invite an additional administrator via another account with `OWNER` privileges.

---

## 3. Contacting Enterprise Support

If an issue persists:
1. Generate an operational diagnostic bundle:
   ```bash
   skyops backup
   ```
2. Capture recent server logs:
   ```bash
   skyops logs > skyops_debug.log
   ```
3. Open a support ticket via your designated enterprise customer portal or email `support@skyops.io` with the log extract (secrets are automatically excluded).
