import { FirestoreStore } from './FirestoreStore';
import { InMemoryStore } from './InMemoryStore';
import { PostgresStore } from './PostgresStore';
import { IPersistenceStore } from './types';
import fallbackConfig from '../firebaseAppletConfig';

let storeInstance: IPersistenceStore | null = null;

export interface PersistenceProviderConfig {
  provider: 'firestore' | 'postgres' | 'memory';
  projectId?: string;
  databaseId?: string;
}

export function determinePersistenceProvider(): 'firestore' | 'postgres' | 'memory' {
  const envProvider = process.env.PERSISTENCE_PROVIDER?.toLowerCase();
  const deploymentMode = process.env.SKYOPS_DEPLOYMENT_MODE?.toLowerCase();

  // Explicit postgres request
  if (envProvider === 'postgres' || (deploymentMode === 'self_hosted' && envProvider !== 'firestore' && envProvider !== 'memory')) {
    return 'postgres';
  }

  // If in production hosted mode, firestore is strictly required
  if (process.env.NODE_ENV === 'production' && deploymentMode !== 'self_hosted') {
    if (envProvider && envProvider !== 'firestore') {
      throw new Error(
        `[Persistence] CRITICAL PRODUCTION ERROR: PERSISTENCE_PROVIDER is set to "${envProvider}", but Production strictly requires "firestore". Local filesystem and in-memory persistence are forbidden in production.`
      );
    }
    return 'firestore';
  }

  // If test environment, default to in-memory unless explicitly overridden for integration tests
  if (process.env.NODE_ENV === 'test') {
    if (process.env.TEST_PERSISTENCE_PROVIDER === 'postgres') return 'postgres';
    return process.env.TEST_PERSISTENCE_PROVIDER === 'firestore' ? 'firestore' : 'memory';
  }

  // Development: Use explicitly configured provider if supplied
  if (envProvider === 'memory') {
    return 'memory';
  }
  if (envProvider === 'firestore') {
    return 'firestore';
  }

  // Use Firestore whenever Firebase configuration or GCP credentials are present
  const hasFirebaseConfig = Boolean(
    process.env.SKYOPS_FIRESTORE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    fallbackConfig?.projectId ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  );

  if (hasFirebaseConfig && deploymentMode !== 'self_hosted') {
    return 'firestore';
  }

  if (process.env.DATABASE_URL || process.env.POSTGRES_HOST) {
    return 'postgres';
  }

  return 'memory';
}

export function getPersistenceStore(): IPersistenceStore {
  if (storeInstance) {
    return storeInstance;
  }

  const provider = determinePersistenceProvider();

  if (provider === 'firestore') {
    const projectId =
      process.env.SKYOPS_FIRESTORE_PROJECT_ID ||
      process.env.FIREBASE_PROJECT_ID ||
      process.env.VITE_FIREBASE_PROJECT_ID ||
      fallbackConfig.projectId;

    const namedDatabaseId =
      (process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID && process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID !== '(default)'
        ? process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID
        : null) ||
      ((fallbackConfig as any).firestoreDatabaseId && (fallbackConfig as any).firestoreDatabaseId !== '(default)'
        ? (fallbackConfig as any).firestoreDatabaseId
        : null) ||
      (process.env.SKYOPS_FIRESTORE_DATABASE_ID && process.env.SKYOPS_FIRESTORE_DATABASE_ID !== '(default)'
        ? process.env.SKYOPS_FIRESTORE_DATABASE_ID
        : null) ||
      (process.env.FIREBASE_DATABASE_ID && process.env.FIREBASE_DATABASE_ID !== '(default)'
        ? process.env.FIREBASE_DATABASE_ID
        : null);

    const databaseId = namedDatabaseId || process.env.SKYOPS_FIRESTORE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID || '(default)';

    if (!projectId) {
      const errorMsg =
        '[Persistence] CRITICAL STARTUP ERROR: Firestore project ID is missing. Ensure SKYOPS_FIRESTORE_PROJECT_ID or FIREBASE_PROJECT_ID is defined.';
      if (process.env.NODE_ENV === 'production') {
        throw new Error(errorMsg);
      }
      console.warn(errorMsg + ' Falling back to InMemoryStore in non-production mode.');
      storeInstance = new InMemoryStore();
      return storeInstance;
    }

    try {
      storeInstance = new FirestoreStore({ projectId, databaseId });
      console.log(`[Persistence] Initialized FirestoreStore (project=${projectId}, database=${databaseId})`);
    } catch (err: any) {
      const message = `[Persistence] Firestore initialization failed: ${err?.message || err}`;
      if (process.env.NODE_ENV === 'production') {
        throw new Error(`${message}. Production will not fall back to in-memory persistence.`);
      }
      console.warn(`${message}. Falling back to InMemoryStore only in non-production mode.`);
      storeInstance = new InMemoryStore();
    }
  } else if (provider === 'postgres') {
    try {
      storeInstance = new PostgresStore();
      console.log('[Persistence] Initialized PostgresStore for self-hosted persistence');
    } catch (err: any) {
      const message = `[Persistence] PostgreSQL initialization failed: ${err?.message || err}`;
      if (process.env.NODE_ENV === 'production') {
        throw new Error(`${message}. Production will not fall back to in-memory persistence.`);
      }
      console.warn(`${message}. Falling back to InMemoryStore in non-production mode.`);
      storeInstance = new InMemoryStore();
    }
  } else {
    storeInstance = new InMemoryStore();
  }

  return storeInstance;
}

export function setPersistenceStore(store: IPersistenceStore): void {
  storeInstance = store;
}

export function resetPersistenceStore(): void {
  storeInstance = null;
}

/**
 * Validates that production persistence is correctly configured.
 * Enforces production persistence gates and initializes persistence store.
 */
export async function verifyProductionPersistence(): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';
  const envProvider = process.env.PERSISTENCE_PROVIDER?.toLowerCase();
  const deploymentMode = process.env.SKYOPS_DEPLOYMENT_MODE?.toLowerCase();

  if (isProd && deploymentMode !== 'self_hosted' && envProvider && envProvider !== 'firestore') {
    throw new Error(
      `[Persistence] CRITICAL PRODUCTION ERROR: PERSISTENCE_PROVIDER is set to "${envProvider}", but Production strictly requires "firestore". Local filesystem and in-memory persistence are forbidden in production.`
    );
  }

  if (isProd && deploymentMode === 'self_hosted' && envProvider !== 'postgres') {
    throw new Error(
      `[Persistence] CRITICAL PRODUCTION ERROR: Self-hosted mode requires PERSISTENCE_PROVIDER="postgres". Found "${envProvider || 'none'}".`
    );
  }

  const store = getPersistenceStore();
  try {
    await store.init();
  } catch (err: any) {
    console.warn(`[Persistence] Notice: Initial store probe: ${err?.message || err}`);
  }
}

export { resolvePersistenceConfig } from '../persistence';
export * from './types';
export * from './InMemoryStore';
export * from './FirestoreStore';
export * from './PostgresStore';
