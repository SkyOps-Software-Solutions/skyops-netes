import { FirestoreStore } from './FirestoreStore';
import { InMemoryStore } from './InMemoryStore';
import { IPersistenceStore } from './types';
import fallbackConfig from '../../firebase-applet-config.json';

let storeInstance: IPersistenceStore | null = null;

export interface PersistenceProviderConfig {
  provider: 'firestore' | 'memory';
  projectId?: string;
  databaseId?: string;
}

export function determinePersistenceProvider(): 'firestore' | 'memory' {
  const envProvider = process.env.PERSISTENCE_PROVIDER?.toLowerCase();

  // If in production, firestore is strictly required
  if (process.env.NODE_ENV === 'production') {
    if (envProvider && envProvider !== 'firestore') {
      throw new Error(
        `[Persistence] CRITICAL PRODUCTION ERROR: PERSISTENCE_PROVIDER is set to "${envProvider}", but production mode strictly requires "firestore". Local filesystem and in-memory persistence are forbidden in production.`
      );
    }
    return 'firestore';
  }

  // If test environment, default to in-memory unless explicitly overridden
  if (process.env.NODE_ENV === 'test') {
    return envProvider === 'firestore' ? 'firestore' : 'memory';
  }

  // Development: Use firestore if explicitly set or if credentials available, otherwise default to memory/local
  if (envProvider === 'firestore') {
    return 'firestore';
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

    const databaseId =
      process.env.SKYOPS_FIRESTORE_DATABASE_ID ||
      process.env.FIREBASE_DATABASE_ID ||
      process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
      (fallbackConfig as any).firestoreDatabaseId ||
      '(default)';

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
      if (process.env.NODE_ENV === 'production') {
        throw new Error(`[Persistence] Failed to initialize production FirestoreStore: ${err?.message || err}`);
      }
      console.warn(`[Persistence] Could not initialize Firestore: ${err?.message}. Falling back to InMemoryStore in non-production.`);
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
 * Validates that production persistence is correctly configured and reachable.
 * Throws immediately if invalid or unreachable in production.
 */
export async function verifyProductionPersistence(): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';
  const provider = determinePersistenceProvider();

  if (isProd && provider !== 'firestore') {
    throw new Error(
      '[Persistence] Fail-Closed: Production mode must use Cloud Firestore as authoritative datastore. Refusing to boot.'
    );
  }

  const store = getPersistenceStore();
  await store.init();
}

export * from './types';
export * from './InMemoryStore';
export * from './FirestoreStore';
