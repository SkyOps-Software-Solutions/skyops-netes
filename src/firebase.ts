import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously as firebaseSignInAnonymously,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  User as FirebaseUser
} from 'firebase/auth';
import { getFirestore, initializeFirestore, setLogLevel, Firestore } from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  listAll,
  getMetadata,
  FirebaseStorage
} from 'firebase/storage';
import fallbackConfig from '../firebase-applet-config.json';

const env = (typeof import.meta !== 'undefined' && (import.meta as any)?.env) || {};

const rawBucket = env.VITE_FIREBASE_STORAGE_BUCKET || fallbackConfig.storageBucket || 'skyops-a1143.firebasestorage.app';
const cleanStorageBucket = String(rawBucket).replace(/^gs:\/\//, '').trim();

const DEFAULT_API_KEY = 'AIzaSyCti1ZOIOIFNVj-TPgHTF2mlbrzBEC-vHc';

// Resolve Firebase configuration: environment variables take precedence, falling back to applet config
export const resolvedFirebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || fallbackConfig.apiKey || DEFAULT_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || fallbackConfig.authDomain || 'skyops-a1143.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || fallbackConfig.projectId || 'skyops-a1143',
  storageBucket: cleanStorageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || fallbackConfig.messagingSenderId || '586158496088',
  appId: env.VITE_FIREBASE_APP_ID || fallbackConfig.appId || '1:586158496088:web:28cdaaaa605c5b084ead2d',
  firestoreDatabaseId:
    env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || (fallbackConfig as any).firestoreDatabaseId || 'ai-studio-skyopsnetes-4a761b81-84c9-4610-bae6-624468cf7a67'
};

// Initialize Firebase App instance safely (singleton pattern)
export const app = !getApps().length ? initializeApp(resolvedFirebaseConfig) : getApp();

// Initialize Firebase Authentication safely
let authInstance: any;
try {
  authInstance = getAuth(app);
} catch (err) {
  console.warn('[SkyOps Firebase] Auth initialization warning:', err);
  authInstance = getAuth();
}
export const auth = authInstance;

// Suppress internal Firestore gRPC idle stream warnings
try {
  setLogLevel('silent');
} catch {}

// Initialize Cloud Firestore with configured databaseId or default
const databaseId = resolvedFirebaseConfig.firestoreDatabaseId;
let firestoreInstance: Firestore;
try {
  firestoreInstance =
    databaseId && databaseId !== '(default)'
      ? initializeFirestore(app, { experimentalForceLongPolling: true }, databaseId)
      : initializeFirestore(app, { experimentalForceLongPolling: true });
} catch {
  firestoreInstance =
    databaseId && databaseId !== '(default)'
      ? getFirestore(app, databaseId)
      : getFirestore(app);
}
export const db: Firestore = firestoreInstance;

// Initialize Firebase Cloud Storage with canonical bucket
export const storage: FirebaseStorage = getStorage(app, `gs://${cleanStorageBucket}`);

// Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  firebaseSignInAnonymously,
  firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  listAll,
  getMetadata
};
export type { FirebaseUser, FirebaseStorage };
