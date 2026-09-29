export interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket: string;
  messagingSenderId: string;
  measurementId?: string;
  oAuthClientId?: string;
  recaptchaSiteKey?: string;
}

export const fallbackFirebaseConfig: FirebaseAppletConfig = {
  projectId: 'skyops-a1143',
  appId: '1:586158496088:web:0b284246d3a0929a4ead2d',
  apiKey: 'AIzaSyCti1ZOIOIFNVj-TPgHTF2mlbrzBEC-vHc',
  authDomain: 'skyops-a1143.firebaseapp.com',
  firestoreDatabaseId: 'ai-studio-skyopsnetes-4a761b81-84c9-4610-bae6-624468cf7a67',
  storageBucket: 'skyops-a1143.firebasestorage.app',
  messagingSenderId: '586158496088',
  measurementId: '',
  oAuthClientId: '586158496088-irl5pnt57utcnhgr57nrbsroldp0tljs.apps.googleusercontent.com',
  recaptchaSiteKey: ''
};
