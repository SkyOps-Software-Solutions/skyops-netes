#!/usr/bin/env node
// ==============================================================================
// SkyOps Vendor-Side License Issuance Utility
// ==============================================================================
// INTERNAL VENDOR USE ONLY — NEVER PACKAGE WITH CUSTOMER RELEASES
//
// Generates cryptographically signed, versioned commercial licenses for customers
// using an Ed25519 private signing key.
//
// Usage:
//   npx tsx scripts/license-issuer.ts --generate-keypair
//   npx tsx scripts/license-issuer.ts \
//     --key <path/to/private_key.pem> \
//     --customer "Acme Corp" \
//     --org "org-12345" \
//     --edition ENTERPRISE \
//     --clusters 25 \
//     --nodes 500 \
//     --days 365 \
//     --features advanced_cost_intelligence,advanced_ai_recommendations,enterprise_rbac \
//     --out license-acme.json
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { generateEd25519KeyPair, signLicensePayload, verifyLicenseSignature } from '../server/licensing/crypto';
import { CommercialFeature, LicenseEdition, LicensePayload, SignedLicense } from '../server/licensing/types';

function printHelp(): void {
  console.log(`
SkyOps Vendor Commercial License Issuance Tool

Usage:
  npx tsx scripts/license-issuer.ts [options]

Commands & Options:
  --generate-keypair              Generate a new Ed25519 vendor keypair
  --key <file>                    Path to private Ed25519 key (PEM format)
  --customer <name>               Customer or company name (Required)
  --org <orgId>                   Target organization identifier (Default: default)
  --edition <COMMUNITY|PRO|ENTERPRISE> License tier (Default: PRO)
  --clusters <number>             Maximum allowed clusters (-1 for unlimited, Default: 10)
  --nodes <number>                Maximum allowed nodes (-1 for unlimited, Default: 250)
  --days <number>                 License validity in days from today (Default: 365)
  --perpetual                     Mark license as perpetual (no expiration date)
  --features <comma_separated>    List of enabled commercial features
  --out <file>                    Output destination file (Default: stdout)
  --verify-public-key <file>      Optional public key to self-verify output

Example:
  npx tsx scripts/license-issuer.ts --key ./vendor_priv.pem --customer "FinTech Corp" --edition ENTERPRISE --days 365 --out fintech-license.json
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printHelp();
    return;
  }

  // Keypair Generation Mode
  if (args.includes('--generate-keypair')) {
    console.log('[SkyOps License Issuer] Generating new Ed25519 keypair...');
    const { publicKeyPem, privateKeyPem } = generateEd25519KeyPair();
    fs.writeFileSync('vendor_private_key_NON_PROD.pem', privateKeyPem, { mode: 0o600 });
    fs.writeFileSync('vendor_public_key_NON_PROD.pem', publicKeyPem, { mode: 0o644 });
    console.log('Successfully generated test keypair:');
    console.log('  Private key: vendor_private_key_NON_PROD.pem (MODE 600 - SECURE)');
    console.log('  Public key:  vendor_public_key_NON_PROD.pem');
    console.log('\nPublic Key Content:');
    console.log(publicKeyPem);
    return;
  }

  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };

  const keyPath = getArg('--key');
  const customer = getArg('--customer');
  const orgId = getArg('--org') || 'default-workspace';
  const edition = (getArg('--edition')?.toUpperCase() || 'PRO') as LicenseEdition;
  const clusters = parseInt(getArg('--clusters') || '10', 10);
  const nodes = parseInt(getArg('--nodes') || '250', 10);
  const days = parseInt(getArg('--days') || '365', 10);
  const isPerpetual = args.includes('--perpetual');
  const featuresArg = getArg('--features');
  const outFile = getArg('--out');
  const verifyPubPath = getArg('--verify-public-key');

  if (!customer) {
    console.error('Error: --customer <name> is required.');
    process.exit(1);
  }

  let privateKeyPem = '';
  if (keyPath) {
    if (!fs.existsSync(keyPath)) {
      console.error(`Error: Private key file not found: ${keyPath}`);
      process.exit(1);
    }
    privateKeyPem = fs.readFileSync(keyPath, 'utf-8');
  } else if (process.env.SKYOPS_VENDOR_PRIVATE_KEY) {
    privateKeyPem = process.env.SKYOPS_VENDOR_PRIVATE_KEY;
  } else {
    console.error('Error: Vendor private signing key is required via --key <file> or SKYOPS_VENDOR_PRIVATE_KEY.');
    process.exit(1);
  }

  const defaultFeatures: Record<LicenseEdition, CommercialFeature[]> = {
    COMMUNITY: [],
    PRO: [
      'advanced_cost_intelligence',
      'advanced_integrations',
      'custom_reporting'
    ],
    ENTERPRISE: [
      'advanced_cost_intelligence',
      'advanced_ai_recommendations',
      'advanced_integrations',
      'enterprise_rbac',
      'sso_oidc',
      'custom_reporting',
      'unlimited_retention',
      'autonomous_remediation',
      'sla_guarantees'
    ]
  };

  const features: CommercialFeature[] = featuresArg
    ? (featuresArg.split(',').map((f) => f.trim()) as CommercialFeature[])
    : defaultFeatures[edition] || [];

  const now = new Date();
  const expiresAt = isPerpetual
    ? null
    : new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  const licenseId = `lic-${edition.toLowerCase()}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;

  const payload: LicensePayload = {
    version: '1.0',
    licenseId,
    organizationId: orgId,
    customerName: customer,
    edition,
    issuedAt: now.toISOString(),
    expiresAt,
    isPerpetual,
    maxClusters: clusters,
    maxNodes: nodes,
    features
  };

  // Sign payload
  console.log(`[SkyOps License Issuer] Signing ${edition} license for "${customer}"...`);
  const signature = signLicensePayload(payload, privateKeyPem);

  const signedLicense: SignedLicense = {
    ...payload,
    signature
  };

  // Self-verification
  let pubKeyPem: string | undefined = undefined;
  if (verifyPubPath && fs.existsSync(verifyPubPath)) {
    pubKeyPem = fs.readFileSync(verifyPubPath, 'utf-8');
  }

  const valid = verifyLicenseSignature(signedLicense, pubKeyPem);
  if (!valid) {
    console.error('CRITICAL: Self-verification failed for generated license! Aborting.');
    process.exit(1);
  }

  const jsonOutput = JSON.stringify(signedLicense, null, 2);

  if (outFile) {
    fs.writeFileSync(outFile, jsonOutput, 'utf-8');
    console.log(`[SkyOps License Issuer] ✓ License successfully issued and written to ${outFile}`);
  } else {
    console.log(jsonOutput);
  }
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.endsWith('license-issuer.ts')) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
