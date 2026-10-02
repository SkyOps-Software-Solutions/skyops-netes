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

export const fallbackConfig: FirebaseAppletConfig = {
  projectId: 'skyops-a1143',
  appId: '1:620423262915:web:skyops-applet',
  storageBucket: 'skyops-a1143.firebasestorage.app',
  apiKey: 'AIzaSySkyOpsAuthoritativeConfigKey2026',
  authDomain: 'skyops-a1143.firebaseapp.com',
  messagingSenderId: '620423262915',
  firestoreDatabaseId: 'ai-studio-skyopsnetes-4a761b81-84c9-4610-bae6-624468cf7a67'
};

export default fallbackConfig;
