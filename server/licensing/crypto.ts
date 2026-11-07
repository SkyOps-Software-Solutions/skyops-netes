import crypto from 'node:crypto';
import { LicensePayload, SignedLicense } from './types';
import { getVendorPublicKey } from './vendorKey';

/**
 * Deterministically sorts object keys recursively to produce canonical JSON.
 * This guarantees cryptographic signature verification across different runtimes
 * and formatting variances.
 */
export function canonicalizeJson(value: any): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item)).join(',')}]`;
  }

  const sortedKeys = Object.keys(value).sort();
  const entries = sortedKeys.map((key) => {
    return `${JSON.stringify(key)}:${canonicalizeJson(value[key])}`;
  });

  return `{${entries.join(',')}}`;
}

/**
 * Extracts payload fields (excluding signature) and converts to canonical UTF-8 Buffer.
 */
export function extractCanonicalPayloadBuffer(license: Partial<SignedLicense>): Buffer {
  const { signature, ...payloadFields } = license;
  const canonicalString = canonicalizeJson(payloadFields);
  return Buffer.from(canonicalString, 'utf-8');
}

/**
 * Verifies an Ed25519 digital signature against the canonical license payload.
 */
export function verifyLicenseSignature(license: SignedLicense, customPublicKeyPem?: string): boolean {
  if (!license || !license.signature || typeof license.signature !== 'string') {
    return false;
  }

  try {
    const publicKeyPem = customPublicKeyPem || getVendorPublicKey();
    const payloadBuffer = extractCanonicalPayloadBuffer(license);
    const signatureBuffer = Buffer.from(license.signature, 'base64');

    const publicKey = crypto.createPublicKey({
      key: publicKeyPem,
      format: 'pem'
    });

    return crypto.verify(null, payloadBuffer, publicKey, signatureBuffer);
  } catch (err: any) {
    console.error('[SkyOps License Crypto] Verification error:', err?.message || err);
    return false;
  }
}

/**
 * Signs a license payload using a private Ed25519 key (Used by vendor issuance tool).
 */
export function signLicensePayload(payload: LicensePayload, privateKeyPem: string): string {
  const payloadBuffer = extractCanonicalPayloadBuffer(payload);

  const privateKey = crypto.createPrivateKey({
    key: privateKeyPem,
    format: 'pem'
  });

  const signatureBuffer = crypto.sign(null, payloadBuffer, privateKey);
  return signatureBuffer.toString('base64');
}

/**
 * Utility to generate a new Ed25519 keypair for vendor issuance.
 */
export function generateEd25519KeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  };
}
