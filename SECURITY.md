# SkyOps security model

## Trust boundaries

Firebase Authentication establishes **identity only**. Every control-plane request is authenticated by the API and then resolves organization membership and the role from server-owned persistence. Client supplied organization IDs, roles, user IDs, cluster IDs and incident IDs are never authorization evidence.

The browser has no direct Firestore or Cloud Storage access in production. `firestore.rules` and `storage.rules` are deny-by-default; the API is the policy enforcement point for tenant-scoped data and artifacts. Local development should use the Firebase emulator and API endpoints, not relaxed production rules.

## RBAC and remediation

Roles are OWNER, ADMIN, OPERATOR, ENGINEER and VIEWER. Permissions are resolved in `server/auth.ts`; VIEWER is read-only for remediation and cannot execute Kubernetes actions. Remediation is API-mediated, checked against organization/resource ownership and policy, requires the existing approval flow, and is audit logged. AI can propose only; it cannot execute actions.

## Operations and credentials

Agent credentials are server-issued, hashed/rotatable, and bound to one cluster and organization. Backend service identities—not browser credentials—must access Firestore and Storage. Configure production with a least-privilege workload/service identity, explicit `FIREBASE_PROJECT_ID`/trusted-project configuration, an explicit Storage bucket, HTTPS `APP_URL`, explicit CORS origins, persistent storage, and secret-manager supplied credentials. Production deliberately does not inherit frontend (`VITE_*`) Firebase fallbacks. Never place server secrets in `VITE_*` variables.

## Known limitations

The Cloud Storage REST driver must be supplied a backend service access token (or replaced by an Admin SDK-backed driver) in production; it now fails closed rather than using ephemeral memory if the cloud operation fails. Do not enable a client Storage rule bypass. The in-process job queue remains suitable only for development/single-instance operation and should be replaced by Cloud Tasks or Pub/Sub for multi-instance Cloud Run deployments.
