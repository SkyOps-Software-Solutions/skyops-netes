# SkyOps — Kubernetes Cluster Onboarding Guide

This guide explains how to connect remote Kubernetes clusters to your self-hosted SkyOps control plane using the official SkyOps Go Agent and Helm chart.

---

## Architecture of Agent-to-Server Communication

The SkyOps Agent runs as a lightweight, single-pod Deployment inside the `skyops` namespace of your target Kubernetes cluster. 

Key architectural characteristics:
1. **Outbound Only**: The agent initiates all communication over HTTPS. You never need to expose Kubernetes API servers or open ingress firewall ports into your clusters.
2. **Resilience & Local Spooling**: If the SkyOps control plane server undergoes maintenance or network latency spikes, the agent buffers metrics and incidents in an in-memory/disk spool without dropping events.
3. **Least Privilege RBAC**: The agent operates with strict least-privilege service account roles, supporting read-only (`observer`), workload remediation (`operator`), or full administrative (`admin`) tiers.

---

## Step-by-Step Onboarding Workflow

### 1. Register the Cluster in the SkyOps Dashboard
1. Log in to your SkyOps Dashboard.
2. In the navigation sidebar, select **Clusters**.
3. Click **+ Register Cluster**.
4. Provide:
   - **Cluster Name**: E.g. `production-aws-us-east-1`
   - **Environment**: `Production`, `Staging`, or `Development`
   - **Provider**: `AWS EKS`, `GCP GKE`, `Azure AKS`, or `On-Premises / Other`
5. Click **Register Cluster**.
6. Note the generated **Cluster ID** (`cls-...`) and **Agent Token** (`sk-agt-...`).

---

### 2. Install the SkyOps Agent via Helm

On your computer or management bastion with `kubectl` configured for the target cluster:

```bash
# 1. Add the official SkyOps Helm repository
helm repo add skyops https://charts.skyops.io
helm repo update

# 2. Deploy the agent
helm install skyops-agent skyops/skyops-agent \
  --namespace skyops \
  --create-namespace \
  --set serverUrl="https://YOUR_SKYOPS_DOMAIN:3000" \
  --set clusterId="YOUR_CLUSTER_ID" \
  --set agentToken="YOUR_AGENT_TOKEN" \
  --set rbac.tier="operator"
```

---

## Selecting the Right RBAC Tier

You can tailor the Kubernetes permissions assigned to the SkyOps agent depending on your security requirements:

| RBAC Tier | Parameter | Permissions Granted | Intended Use Case |
|---|---|---|---|
| **Observer** | `--set rbac.tier="observer"` | Read-only access to Pods, Deployments, Nodes, Events, Namespaces, PVCs, and metrics. Zero mutation capabilities. | Strict compliance environments where remediation is purely informational. |
| **Operator** *(Default)* | `--set rbac.tier="operator"` | Observer permissions + ability to restart failed pods, trigger deployment rollouts, and scale workloads after human approval. | Standard production environments using SkyOps auto-healing. |
| **Admin** | `--set rbac.tier="admin"` | Operator permissions + ability to cordon, uncordon, and safely drain worker nodes. | Platform engineering teams managing node lifecycle. |

---

## Advanced Helm Configuration Options

You can customize the agent deployment via Helm values (`--set` or `-f custom-values.yaml`):

```yaml
# custom-values.yaml example
image:
  repository: ghcr.io/skyops-software-solutions/skyops-agent
  tag: "v1.5.1"
  pullPolicy: IfNotPresent

resources:
  requests:
    cpu: 50m
    memory: 64Mi
  limits:
    cpu: 250m
    memory: 256Mi

nodeSelector:
  kubernetes.io/os: linux

tolerations:
  - key: "CriticalAddonsOnly"
    operator: "Exists"
```

Apply custom values:
```bash
helm upgrade --install skyops-agent skyops/skyops-agent \
  --namespace skyops \
  -f custom-values.yaml \
  --set serverUrl="https://skyops.yourdomain.com" \
  --set clusterId="YOUR_CLUSTER_ID" \
  --set agentToken="YOUR_AGENT_TOKEN"
```

---

## Verifying Deployment & Troubleshooting

Check agent pod status:
```bash
kubectl get pods -n skyops
```

Inspect live agent logs:
```bash
kubectl logs -n skyops -l app.kubernetes.io/name=skyops-agent -f
```

Expected healthy output:
```
[INFO] SkyOps Agent v1.5.1 initialized for clusterId: cls-prod-01
[INFO] Connecting to control plane at https://skyops.yourdomain.com:3000...
[INFO] Heartbeat acknowledged by server (status: HEALTHY)
[INFO] Telemetry streaming active: 48 pods, 12 deployments, 6 nodes
```

If the agent logs indicate `401 Unauthorized`, verify that the `agentToken` configured in Helm matches the token in the SkyOps Dashboard.
