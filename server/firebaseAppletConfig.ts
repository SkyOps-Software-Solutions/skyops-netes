import fs from 'fs';
import path from 'path';
import { fallbackFirebaseConfig, FirebaseAppletConfig } from '../src/config/firebaseFallbackConfig';

export function getLoadedFirebaseAppletConfig(): FirebaseAppletConfig {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(content);
      return { ...fallbackFirebaseConfig, ...parsed };
    }
  } catch {
    // Graceful fallback if file is being written or deleted
  }
  return fallbackFirebaseConfig;
}

export const fallbackConfig = getLoadedFirebaseAppletConfig();
export default fallbackConfig;
