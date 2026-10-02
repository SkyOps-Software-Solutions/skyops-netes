import fs from 'fs';
import path from 'path';

export interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  storageBucket: string;
  apiKey: string;
  authDomain: string;
  messagingSenderId: string;
  firestoreDatabaseId?: string;
  [key: string]: any;
}

export const DEFAULT_FIREBASE_CONFIG: FirebaseAppletConfig = {
  projectId: 'skyops-a1143',
  appId: '1:620423262915:web:skyops-applet',
  storageBucket: 'skyops-a1143.firebasestorage.app',
  apiKey: 'AIzaSySkyOpsAuthoritativeConfigKey2026',
  authDomain: 'skyops-a1143.firebaseapp.com',
  messagingSenderId: '620423262915',
  firestoreDatabaseId: 'ai-studio-skyopsnetes-4a761b81-84c9-4610-bae6-624468cf7a67'
};

export function getResolvedFirebaseAppletConfig(): FirebaseAppletConfig {
  const cwd = process.cwd();
  const possiblePaths = [
    path.resolve(cwd, 'firebase-applet-config.json'),
    path.resolve(cwd, 'server/firebase-applet-config.json')
  ];

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return { ...DEFAULT_FIREBASE_CONFIG, ...parsed };
        }
      }
    } catch {}
  }

  return DEFAULT_FIREBASE_CONFIG;
}

export const fallbackConfig = getResolvedFirebaseAppletConfig();
export default fallbackConfig;
