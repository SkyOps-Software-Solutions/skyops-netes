# SkyOps — Commercial Licensing & Entitlement Guide

This document describes the SkyOps commercial licensing model, cryptographic verification architecture, Community vs Enterprise editions, and air-gapped activation procedures.

---

## 1. Licensing Philosophy: Privacy & Independence

SkyOps commercial licensing is built on two core principles:

1. **Zero Phone-Home / Air-Gapped Operation**: Your self-hosted SkyOps installation **never** connects to an external SkyOps vendor server to validate licenses. All verification occurs locally on your host using asymmetric digital signatures.
2. **No Remote Kill-Switches**: License expiration **never** deletes customer data, disables core monitoring, or shuts down the platform. Core incident detection, log viewing, and telemetry ingestion remain 100% operational.

---

## 2. Edition Comparison Matrix

| Feature / Limit | Community Edition (Default) | Team Edition | Enterprise Edition |
|---|:---:|:---:|:---:|
| **Cost** | Free Forever | Commercial Subscription | Commercial Subscription |
| **Monitored Clusters** | Up to 3 | Up to 10 | Unlimited / Custom |
| **Monitored Worker Nodes** | Up to 30 | Up to 150 | Unlimited / Custom |
| **Incident Management** | Full | Full | Full |
| **Log & Metrics Ingestion** | Full | Full | Full |
| **Cost Intelligence (FinOps)** | Standard | Standard | Advanced Custom Rates |
| **AI Root Cause Analysis** | Offline Deterministic | Offline + Multi-Provider | Offline + Multi-Provider |
| **Autonomous Remediation** | Manual Approval | Manual Approval | Policy-Based Rules |
| **Granular RBAC** | Standard Tiers | Standard Tiers | Granular Custom Roles |
| **Commercial SLA Support** | Community | Standard Business Hours | 24/7 Dedicated SRE |

---

## 3. Cryptographic Verification Architecture

Licenses are issued as signed JSON documents utilizing **Ed25519** digital signatures (RFC 8032):

```json
{
  "version": "1.0",
  "licenseId": "LIC-ENT-2026-0042",
  "organizationId": "org-acme-corp",
  "customerName": "Acme Aerospace Corp",
  "edition": "ENTERPRISE",
  "issuedAt": "2026-11-01T00:00:00Z",
  "expiresAt": "2027-11-01T00:00:00Z",
  "isPerpetual": false,
  "maxClusters": 25,
  "maxNodes": 500,
  "features": [
    "enterprise_rbac",
    "advanced_cost_intelligence",
    "autonomous_remediation"
  ],
  "signature": "d34db33f...base64_encoded_ed25519_signature..."
}
```

### How Verification Works:
1. When you import a license, the SkyOps server extracts all fields except `signature`.
2. All keys are sorted recursively via canonical JSON serialization (`canonicalizeJson`).
3. The server verifies the signature against the vendor public key (`server/licensing/vendorKey.ts`).
4. If verified, the license is saved to disk (`/var/lib/skyops/data/license.json`) and the PostgreSQL `commercial_licenses` table.

---

## 4. How to Import or Update a License

### Via Dashboard:
1. Navigate to **Settings** in the left sidebar.
2. Select the **Commercial License** tab.
3. Click **Import License**.
4. Paste the entire JSON string from your SkyOps welcome pack or license email.
5. Click **Verify & Activate**.
6. The updated cluster quotas and features take effect immediately without requiring a container restart.

### Via Environment Variable (Headless / GitOps):
For automated CI/CD or Terraform deployments, set the `SKYOPS_LICENSE_DATA` environment variable in your `.env` file containing the JSON string.

---

## 5. What Happens When a License Expires?

SkyOps employs fail-safe expiration semantics:
- **30 Days Prior**: The dashboard displays a subtle warning banner reminding administrators that the renewal date is approaching.
- **Post-Expiration**:
  - Existing incidents, logs, metrics, clusters, and users remain fully intact and accessible.
  - Core incident detection and telemetry streaming continue to run normally.
  - Adding *new* clusters beyond the Community limit (3 clusters) is restricted until renewed.
  - Commercial add-ons (e.g. autonomous auto-healing rules) pause and require manual approval.
  - **No data is ever deleted or held hostage.**
