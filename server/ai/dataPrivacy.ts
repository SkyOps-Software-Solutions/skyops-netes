// ==============================================================================
// SkyOps AI Data Privacy & Sensitive Information Scrubbing
// ==============================================================================
// Protects customer operational telemetry by redacting credentials, secrets,
// private keys, and environment variables before context construction.
// ==============================================================================

import { IncidentContext } from './types';

export interface DataPrivacySettings {
  dataSharingConsent: boolean;
  stripSensitiveLogs: boolean;
  redactEnvironmentVars: boolean;
  maskResourceNames: boolean;
}

export const DEFAULT_PRIVACY_SETTINGS: DataPrivacySettings = {
  dataSharingConsent: false,
  stripSensitiveLogs: true,
  redactEnvironmentVars: true,
  maskResourceNames: false
};

// Patterns matching sensitive tokens, credentials, and cryptographic keys
const SENSITIVE_PATTERNS = [
  // Bearer tokens and JWTs
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g,

  // Private cryptographic keys
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi,

  // AWS Access Keys and Secrets
  /(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,
  /(aws_secret_access_key|aws_access_key_id)\s*[:=]\s*["']?[A-Za-z0-9/+=]{20,}["']?/gi,

  // Database Connection Strings with Passwords
  /(postgres|postgresql|mysql|mongodb|redis):\/\/[^:\s]+:[^@\s]+@[^\s]+/gi,

  // Standard password/secret key-value assignments
  /(password|passwd|pass|secret|token|api_?key|auth_?token|credential|private_?key)\s*[:=]\s*["']?[^\s"';,]{4,}["']?/gi,

  // Kubernetes ServiceAccount Secrets
  /eyJh[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g
];

/**
 * Redacts known sensitive patterns from raw text strings.
 */
export function redactSensitiveData(text: string): string {
  if (!text || typeof text !== 'string') return text;
  let sanitized = text;

  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => {
      if (match.toLowerCase().startsWith('bearer ')) {
        return 'Bearer [REDACTED_TOKEN]';
      }
      if (match.includes('://')) {
        return match.replace(/:[^@\s]+@/, ':***@');
      }
      return '[REDACTED_SECRET]';
    });
  }

  return sanitized;
}

/**
 * Recursively sanitizes object values to ensure no raw secrets escape.
 */
export function sanitizeObjectValues(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'string') return redactSensitiveData(obj);
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObjectValues(item));
  }

  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('password') ||
      lowerKey.includes('passwd') ||
      lowerKey.includes('pass') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('token') ||
      lowerKey.includes('apikey') ||
      lowerKey.includes('privatekey')
    ) {
      result[key] = '[REDACTED_VALUE]';
    } else {
      result[key] = sanitizeObjectValues(val);
    }
  }

  return result;
}

/**
 * Sanitizes an IncidentContext according to the organization's privacy configuration.
 */
export function sanitizeIncidentContext(
  context: IncidentContext,
  settings: DataPrivacySettings = DEFAULT_PRIVACY_SETTINGS
): IncidentContext {
  const sanitized = { ...context };

  // 1. Sanitize event messages
  if (Array.isArray(sanitized.recentEvents)) {
    sanitized.recentEvents = sanitized.recentEvents.map((evt) => ({
      ...evt,
      message: redactSensitiveData(evt.message)
    }));
  }

  // 2. Sanitize container states
  if (Array.isArray(sanitized.containers)) {
    sanitized.containers = sanitized.containers.map((c) => ({
      ...c,
      waitingMessage: c.waitingMessage ? redactSensitiveData(c.waitingMessage) : undefined
    }));
  }

  // 3. Redact summaries
  if (sanitized.specSummary && settings.redactEnvironmentVars) {
    sanitized.specSummary = sanitizeObjectValues(sanitized.specSummary);
  }
  if (sanitized.statusSummary) {
    sanitized.statusSummary = sanitizeObjectValues(sanitized.statusSummary);
  }

  // 4. Sanitize notes
  if (Array.isArray(sanitized.additionalNotes)) {
    sanitized.additionalNotes = sanitized.additionalNotes.map((n) => redactSensitiveData(n));
  }

  // 5. Optional resource masking
  if (settings.maskResourceNames) {
    sanitized.clusterName = `cluster-${sanitized.clusterId.slice(-4)}`;
    sanitized.namespace = `ns-${sanitized.namespace.length}`;
  }

  return sanitized;
}
