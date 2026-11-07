# SkyOps Self-Hosted Platform — System Requirements

This document defines the hardware, operating system, network, and Kubernetes requirements for deploying and running the SkyOps self-hosted distribution.

---

## 1. Host Server Requirements (Control Plane)

The SkyOps control plane runs as a containerized stack (SkyOps Web & API server + PostgreSQL 16 database) managed by Docker Compose.

### Minimum Specifications (1–5 Monitored Clusters)
- **Architecture**: x86_64 / amd64.
- **CPU**: 2 physical or virtual cores (2.0 GHz+).
- **RAM**: 4 GB available system memory.
- **Storage**: 20 GB free disk space (ext4 or xfs on SSD recommended).
- **Operating System**:
  - Ubuntu Server 24.04 LTS (Noble Numbat)
  - Ubuntu Server 22.04 LTS (Jammy Jellyfish)
  - Ubuntu Server 20.04 LTS (Focal Fossa)
  *(Debian 12+ and RHEL 9+ are compatible via manual Docker Compose).*

### Recommended Specifications (10–50 Monitored Clusters)
- **CPU**: 4 to 8 physical or virtual cores.
- **RAM**: 8 to 16 GB available system memory.
- **Storage**: 50 to 100 GB NVMe SSD with automated backup volume mounts.

---

## 2. Software Prerequisites

When using `install.sh`, dependencies are installed automatically. For manual installations:
- **Docker Engine**: Version 24.0 or higher.
- **Docker Compose**: Version 2.20 or higher (`docker compose` plugin).
- **OpenSSL**: For generating cryptographic tokens.
- **curl & bash**: Standard POSIX utilities.

---

## 3. Network & Firewall Requirements

### Control Plane Server (Inbound Ports)
| Port | Protocol | Purpose | Source |
|---|---|---|---|
| **3000** | TCP | SkyOps Web Dashboard & Agent Ingestion API | Platform Engineers & Monitored Clusters |
| **80** *(Optional)* | TCP | HTTP to HTTPS redirect (if using Nginx/Certbot) | Public / Internal Network |
| **443** *(Optional)* | TCP | HTTPS Dashboard & Agent Ingestion (recommended) | Public / Internal Network |
| **5432** | TCP | Internal PostgreSQL Database | **BLOCKED FROM HOST** (Docker private network only) |

### Monitored Kubernetes Clusters (Outbound Ports)
- **Port 3000 or 443 (HTTPS)**: Outbound egress from the `skyops-agent` pod to the SkyOps Control Plane host.
- **Zero Inbound Ports Required**: The SkyOps agent initiates all connections outward to the control plane. You do **not** need to open any inbound firewall ports into your Kubernetes clusters.

---

## 4. Kubernetes Cluster Compatibility

- **Kubernetes Versions**: v1.24 through v1.31+.
- **Architectures**: Linux amd64 and arm64 worker nodes.
- **Supported Distributions**:
  - Amazon Elastic Kubernetes Service (EKS)
  - Google Kubernetes Engine (GKE)
  - Azure Kubernetes Service (AKS)
  - Red Hat OpenShift 4.x
  - Rancher / RKE2
  - K3s / MicroK8s
  - Vanilla kubeadm clusters
- **Agent Resource Footprint (Per Cluster)**:
  - Requests: 50m CPU, 64Mi RAM.
  - Limits: 250m CPU, 256Mi RAM.
  - Single replica per monitored cluster.
