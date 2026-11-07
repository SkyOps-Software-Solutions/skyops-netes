# SkyOps Self-Hosted — Quick Start (5 Minutes)

Deploy the complete SkyOps Kubernetes incident management and cost intelligence platform on your Ubuntu Server in five simple steps.

---

## Prerequisites
- Clean Ubuntu Server 20.04, 22.04, or 24.04 LTS (x86_64).
- Root or `sudo` privileges.
- 2+ CPU cores, 4GB+ RAM, 20GB+ disk.
- Outbound access to download Docker packages.

---

## Step 1: Run the Official Installer

SSH into your server and run:

```bash
curl -fsSL https://get.skyops.io/install.sh | sudo bash
```

The script automatically installs Docker Engine, configures Docker Compose, generates cryptographically random secrets, and initializes PostgreSQL.

---

## Step 2: Open Dashboard & Create Initial Admin

1. Open your browser and navigate to:
   ```
   http://YOUR_SERVER_IP:3000
   ```
2. Enter your Organization Name, Full Name, Work Email, and Password.
3. Click **Complete Setup**.

---

## Step 3: Register Your Kubernetes Cluster

1. In the sidebar, click **Clusters** → **+ Register Cluster**.
2. Give your cluster a name (e.g., `prod-us-east`) and select the environment.
3. Click **Register Cluster**.
4. Copy the generated **Cluster ID** and **Agent Token**.

---

## Step 4: Install the Agent via Helm

On a machine with `kubectl` access to your Kubernetes cluster:

```bash
helm repo add skyops https://charts.skyops.io
helm repo update

helm install skyops-agent skyops/skyops-agent \
  --namespace skyops \
  --create-namespace \
  --set serverUrl="http://YOUR_SERVER_IP:3000" \
  --set clusterId="YOUR_CLUSTER_ID" \
  --set agentToken="YOUR_AGENT_TOKEN"
```

---

## Step 5: View Live Operational Telemetry

Within 30 seconds, your cluster status in the SkyOps dashboard will switch to **Healthy (Online)**!

You can now:
- Inspect active pods, deployments, and node resource utilization.
- Detect and triage live incidents (`CrashLoopBackOff`, `OOMKilled`, etc.).
- Analyze FinOps cost allocations and node efficiency.
- Execute human-approved workload remediations.

---

## Management CLI Cheatsheet

```bash
# Check service status and health checks
skyops status

# View live application logs
skyops logs -f

# Create a database backup snapshot
skyops backup

# Restart services
skyops restart
```
