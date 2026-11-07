// ==============================================================================
// SkyOps Vendor Public Verification Key (Ed25519)
// ==============================================================================
// This file contains ONLY the public verification key distributed with the
// customer-facing software. The corresponding private signing key is securely
// maintained by SkyOps release engineering in an air-gapped HSM/KMS.
//
// Never place private signing keys in this repository or customer releases.
// ==============================================================================

export const DEFAULT_VENDOR_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAD61mL7kWSykFAjk1dOryJ1czrveRu3hJ/m/ZchuVYQY=
-----END PUBLIC KEY-----`;

/**
 * Returns the active Ed25519 public key used for license verification.
 * Supports air-gapped enterprise customization via SKYOPS_LICENSE_PUBLIC_KEY.
 */
export function getVendorPublicKey(): string {
  if (process.env.SKYOPS_LICENSE_PUBLIC_KEY && process.env.SKYOPS_LICENSE_PUBLIC_KEY.trim().length > 0) {
    return process.env.SKYOPS_LICENSE_PUBLIC_KEY.trim();
  }
  return DEFAULT_VENDOR_PUBLIC_KEY;
}
