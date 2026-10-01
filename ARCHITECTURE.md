# SkyOps architecture

SkyOps is an API-mediated Kubernetes control plane. The React application uses Firebase Auth for sign-in and calls `/api/v1`; it does not read or mutate control-plane documents directly. Express verifies Firebase ID tokens, resolves tenant membership from server persistence, applies RBAC, validates resources belong to the resolved organization, and writes server-side audit events.

Firestore holds control-plane data such as organizations, memberships, clusters, incidents, remediation state, agent tokens, webhooks, billing records and audit events. High-frequency telemetry is processed through the telemetry/store abstraction rather than granting clients Firestore access. Cloud Storage artifacts live under `tenants/{orgId}/{category}` and are accessed through authenticated artifact APIs.

Kubernetes agents authenticate with a cluster-bound bearer token and submit telemetry/heartbeats to agent endpoints. Human actions follow UI → authenticated API → tenant/RBAC/resource validation → policy/approval → agent execution → verification/audit. AI analysis is advisory and validated before it can enter this flow.

For production, run the API with persistent server-owned storage and a workload identity. Replace the development in-process job worker with a durable Cloud Tasks or Pub/Sub adapter before horizontally scaling workers.
