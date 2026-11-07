# SkyOps Self-Hosted External Dependency Audit

## 1. Executive Summary

This document provides a line-by-line audit of all external hosted services, third-party cloud SDKs, APIs, and cloud provider dependencies in the SkyOps codebase.

To ensure enterprise stability and eliminate regression risk, SkyOps adopts a **Dual-Mode Architecture**:
1. **Cloud Hosted Mode (`PERSISTENCE_PROVIDER=firestore`, `AUTH_PROVIDER=firebase`)**: Preserves existing Firebase Authentication, Google Cloud Firestore, and Google Cloud Storage drivers for hosted environments.
2. **Self-Hosted Mode (`PERSISTENCE_PROVIDER=postgres`, `AUTH_PROVIDER=local`)**: Activates local PostgreSQL persistence, local JWT/Argon2id authentication, and local filesystem/volume artifact storage with zero external cloud dependencies.

---

## 2. Comprehensive Dependency Inventory

| External Dependency | Current Usage & Role | Severity / Classification | Affected Source Files | Self-Hosted Replacement Strategy | Migration Phase |
|---|---|---|---|---|---|
| **Google Cloud Firestore** (`@google-cloud/firestore`, `firebase/firestore`) | Primary persistence for all 26 control plane entities (clusters, tokens, incidents, remediations, policies, logs, audit trails, subscriptions). | **HARD DEPENDENCY** in cloud mode | `server/persistence/FirestoreStore.ts`<br/>`server/persistence/index.ts`<br/>`server/store.ts`<br/>`firestore.rules`<br/>`firebase-blueprint.json` | Implement `PostgresStore` satisfying the existing `IPersistenceStore` interface in `server/persistence/types.ts`. Controlled via `PERSISTENCE_PROVIDER=postgres`. | **Phase 2** |
| **Firebase Authentication** (`firebase/auth`, Google Public Certs) | User identity verification, email/password signup, Google OAuth popups, and Firebase ID token issuance/verification. | **HARD DEPENDENCY** in cloud mode | `server/auth.ts`<br/>`src/context/AuthContext.tsx`<br/>`src/firebase.ts`<br/>`src/firebaseConfig.ts`<br/>`src/api/client.ts`<br/>`scripts/patch-firebase-auth.js` | Introduce Local Identity Provider issuing standard HS256/RS256 JWTs with Argon2id password hashing. Initial admin setup via `/setup` wizard. Optional corporate OIDC/SAML/OAuth2 SSO. | **Phase 3** |
| **Google Cloud Storage / Firebase Storage** | Binary artifact storage for incident debug bundles, cluster logs, and generated PDF postmortems. | **SOFT DEPENDENCY** | `server/storage/drivers/CloudStorageDriver.ts`<br/>`server/storage/drivers/MemoryStorageDriver.ts`<br/>`server/storageRoutes.ts`<br/>`storage.rules` | Introduce `LocalStorageDriver` implementing `IStorageDriver` pointing to a Docker volume mount (e.g. `/var/lib/skyops/data/artifacts`) with optional S3/MinIO driver. | **Phase 2 & Phase 4** |
| **Google Gemini API** (`@google/genai`) | AI incident root cause analysis, architecture topology explanations, and AI-assisted cost rightsizing suggestions. | **OPTIONAL / SOFT DEPENDENCY** | `geminiProvider.ts`<br/>`server/ai/service.ts`<br/>`server/ai/architectureAI.tsserver/ai/providers/geminiProvider.ts` | Make AI features strictly optional. Support: 1) Bring-Your-Own-Key (`GEMINI_API_KEY` or `OPENAI_API_KEY`), 2) Local Ollama / vLLM HTTP endpoint, 3) Offline deterministic heuristic mode when AI is disabled. UI displays "AI Advisory Disabled (Self-Hosted Heuristic Active)". | **Phase 6** |
| **Razorpay Payment Gateway** (`razorpay`) | Cloud SaaS subscription billing, plan upgrades, and invoice generation. | **NON-ESSENTIAL / HARDCODED FOR SAAS** | `server/billing/billingService.ts`<br/>`server/billing/provider.ts`<br/>`server/billing/razorpay.test.ts` | Decouple in self-hosted mode via `BILLING_MODE=self_hosted` or `enterprise_license`. System unlocks full enterprise capabilities based on cryptographic license keys rather than transactional payment gateways. | **Phase 6** |
| **SMTP / Email Delivery** (`nodemailer`) | Incident alerting, team invitation emails, and password reset flows. | **SOFT DEPENDENCY** (Already configurable via ENV) | `server/notifications/notificationService.ts`<br/>`server/notifications/notificationManager.ts` | System already supports standard SMTP via `SKYOPS_SMTP_HOST`, `SKYOPS_SMTP_PORT`, `SKYOPS_SMTP_USER`, `SKYOPS_SMTP_PASS`. In self-hosted mode, customers provide their internal company relay or skip email in favor of Webhooks/Slack/PagerDuty. | **Phase 1 (Already Compatible)** |

---

## 3. Exhaustive File Audit: Cloud References

### 3.1 Backend Codebase
1. **`server/persistence/FirestoreStore.ts`**:
   - Direct imports: `firebase/firestore`, `firebase/app`, `firebase/auth`.
   - Manages connections, batch writes, queries, and document refs across all 26 Firestore collections.
2. **`server/persistence/index.ts`**:
   - Factory function `determinePersistenceProvider()` and `getPersistenceStore()`.
   - Currently selects between `firestore` and `memory`. Adding `postgres` here allows seamless, runtime provider switching.
3. **`server/auth.ts`**:
   - `verifyFirebaseIdToken()` downloads Google public certificates from `https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com` and verifies RS256 signatures.
   - `requireUserAuth` middleware extracts Firebase UID and claims.
4. **`server/storage/drivers/CloudStorageDriver.ts`**:
   - Direct integration with Google Cloud Storage buckets for artifact uploads and signed URLs.
5. **`server/config.ts` & `server/firebaseAppletConfig.ts`**:
   - Holds cloud project IDs (`skyops-a1143`, `ai-studio-skyopsnetes-4a761b81-84c9-4610-bae6-624468cf7a67`).

### 3.2 Frontend Codebase
1. **`src/firebase.ts` & `src/firebaseConfig.ts`**:
   - Initializes Firebase Web Client SDK (`initializeApp`, `getAuth`, `GoogleAuthProvider`).
2. **`src/context/AuthContext.tsx`**:
   - Hooks into `onAuthStateChanged`, `signInWithEmailAndPassword`, `signInWithPopup`.
3. **`src/api/client.ts`**:
   - Attaches `Authorization: Bearer <idToken>` retrieved from `auth.currentUser.getIdToken()`.

---

## 4. Dual-Mode Implementation Strategy

To protect existing deployments, zero code should be destructively deleted. Instead, the control plane will inspect `SKYOPS_DEPLOYMENT_MODE` or provider variables:

```typescript
// Example provider resolution in server/persistence/index.ts
export function determinePersistenceProvider(): 'postgres' | 'firestore' | 'memory' {
  const envProvider = process.env.PERSISTENCE_PROVIDER?.toLowerCase();
  if (envProvider === 'postgres') return 'postgres';
  if (envProvider === 'firestore') return 'firestore';
  if (envProvider === 'memory') return 'memory';
  
  // Default to postgres if self-hosted DB connection is present
  if (process.env.DATABASE_URL || process.env.SKYOPS_POSTGRES_HOST) {
    return 'postgres';
  }
  return 'firestore';
}
```

Similarly, in `server/auth.ts`:
```typescript
export async function verifyUserToken(rawToken: string): Promise<AuthenticatedUser> {
  if (process.env.AUTH_PROVIDER === 'local') {
    return verifyLocalJwtToken(rawToken);
  }
  return verifyFirebaseIdToken(rawToken, config.FIREBASE_PROJECT_ID);
}
```

This guarantees **100% backward compatibility** while enabling **complete self-hosted autonomy**.
