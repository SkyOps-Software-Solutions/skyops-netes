# SkyOps — Kubernetes Incident Management & FinOps Platform

SkyOps is an enterprise-grade Kubernetes incident management, observability, and FinOps intelligence platform. It provides site reliability engineers and platform teams with unified incident detection, automated root-cause analysis, workload remediation, and financial cost governance across multiple remote Kubernetes clusters.

SkyOps is available both as a commercial SaaS and as a **Self-Hosted Platform** that you can operate entirely on your own Ubuntu Server infrastructure without vendor lock-in or external dependencies.

---

## Key Features

- **Multi-Cluster Kubernetes Observability**: Monitor multiple EKS, GKE, AKS, and on-premises clusters from a central control plane.
- **Incident Detection & Auto-Healing**: Real-time detection of `CrashLoopBackOff`, `OOMKilled`, `NodeNotReady`, and deployment failures with human-in-the-loop remediation workflows.
- **Cost Intelligence & FinOps**: Disambiguate actual cloud billing exports from estimated resource allocations. Optimize cluster capacity with confidence.
- **Configurable AI with Privacy Controls**: Support for offline deterministic heuristic rules (default), Google Gemini, OpenAI, or self-hosted local models (Ollama/vLLM) with automated secret token scrubbing.
- **Self-Hosted PostgreSQL Persistence**: Customer-owned database storage with transactional schema migrations.
- **Local Authentication & RBAC**: Local identity provider with `scrypt` hashing, session rate limiting, and role-based permissions (`OWNER`, `ADMIN`, `OPERATOR`, `VIEWER`).
- **Offline Cryptographic Licensing**: Ed25519 asymmetric signature verification without phone-home requirements or remote kill-switches.

---

## Architecture Overview

```
       +-------------------------------------------------------------+
       |               Customer Ubuntu Host Server                   |
       |                                                             |
       |  +-----------------------+     +-------------------------+  |
       |  | SkyOps Control Plane  |<--->|  PostgreSQL 16 Database |  |
       |  | (Express + React SPA) |     |  (Persistent Volumes)   |  |
       |  +-----------^-----------+     +-------------------------+  |
       +--------------|----------------------------------------------+
                      | HTTPS (Port 3000 / 443)
       +--------------+--------------+
       |                             |
+------v------------------+   +------v------------------+
| Kubernetes Cluster A    |   | Kubernetes Cluster B    |
| (EKS / GKE / On-Prem)   |   | (AKS / K3s / Hybrid)    |
|                         |   |                         |
| +---------------------+ |   | +---------------------+ |
| |  SkyOps Go Agent    | |   | |  SkyOps Go Agent    | |
| |  (Deploy via Helm)  | |   | |  (Deploy via Helm)  | |
| +---------------------+ |   | +---------------------+ |
+-------------------------+   +-------------------------+
```

---

## Quick Start (Self-Hosted)

### 1. Install SkyOps Control Plane on Ubuntu Server
```bash
curl -fsSL https://get.skyops.io/install.sh | sudo bash
```

### 2. Complete Administrator Onboarding
Open your browser to `http://YOUR_SERVER_IP:3000` and create the initial administrator account.

### 3. Register a Cluster and Install the Agent via Helm
```bash
helm repo add skyops https://charts.skyops.io
helm repo update
helm install skyops-agent skyops/skyops-agent \
  --namespace skyops \
  --create-namespace \
  --set serverUrl="https://YOUR_SKYOPS_DOMAIN:3000" \
  --set clusterId="YOUR_CLUSTER_ID" \
  --set agentToken="YOUR_AGENT_TOKEN"
```

---

## Documentation Index

- [Customer Deployment Guide](CUSTOMER_DEPLOYMENT_GUIDE.md): Complete installation-to-onboarding walkthrough.
- [Quick Start Guide](QUICK_START.md): 5-minute setup guide.
- [System Requirements](SYSTEM_REQUIREMENTS.md): CPU, memory, storage, and networking specs.
- [Cluster Onboarding Guide](CLUSTER_ONBOARDING.md): Connecting remote Kubernetes clusters.
- [Authentication Guide](AUTHENTICATION_GUIDE.md): Local auth, session lifetimes, and RBAC tiers.
- [Licensing Guide](LICENSING_GUIDE.md): Community vs Commercial editions, offline key verification.
- [AI Configuration Guide](AI_CONFIGURATION.md): Pluggable AI models, privacy gating, and credential scrubbing.
- [Upgrade Guide](UPGRADE_GUIDE.md): Safe updates and schema migration procedures.
- [Backup & Disaster Recovery](BACKUP_RESTORE.md): Database dumps, manifests, and restoration.
- [Troubleshooting Guide](TROUBLESHOOTING.md): Common diagnostics, log inspection, and FAQs.
- [Security Audit & Threat Model](SECURITY_AUDIT.md): Security controls, cryptography, and vulnerability matrix.
- [Final Release Audit](FINAL_RELEASE_AUDIT.md): Comprehensive test validation report.
- [Release Readiness](RELEASE_READINESS.md): 21-point acceptance checklist.
- [Release Notes](RELEASE_NOTES.md): What's new in v1.5.1-rc1.

---

## License

SkyOps is distributed under a commercial self-hosted license with a generous Community Edition included by default. See [LICENSING_GUIDE.md](LICENSING_GUIDE.md) for full terms.
