import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert';
import { 
  canonicalizeJson, 
  extractCanonicalPayloadBuffer,
  generateEd25519KeyPair, 
  signLicensePayload, 
  verifyLicenseSignature 
} from './licensing/crypto';
import { LicenseService } from './licensing/licenseService';
import { SignedLicense, LicensePayload } from './licensing/types';
import { AIManager } from './ai/aiManager';
import { redactSensitiveData, sanitizeIncidentContext } from './ai/dataPrivacy';
import { NoAIProvider } from './ai/providers/noAIProvider';
import { UpdateService, compareVersions } from './updates/updateService';
import { ReleaseMetadata } from './updates/types';
import { IncidentContext } from './ai/types';

describe('Phase 4: Commercial Licensing, AI Providers & Secure Updates', () => {
  after(() => {
    setTimeout(() => process.exit(0), 100);
  });

  describe('1. Cryptographic License Verification (Ed25519)', () => {
    it('canonicalizeJson provides deterministic key sorting and extractCanonicalPayloadBuffer ignores signature', () => {
      const objA = {
        zeta: 'last',
        alpha: 1,
        gamma: ['b', 'a'],
        beta: { two: 2, one: 1 }
      };

      const objB = {
        beta: { one: 1, two: 2 },
        alpha: 1,
        gamma: ['b', 'a'],
        zeta: 'last'
      };

      const canonicalA = canonicalizeJson(objA);
      const canonicalB = canonicalizeJson(objB);

      assert.strictEqual(canonicalA, canonicalB, 'Canonical JSON strings must be identical regardless of key order');

      // Test extractCanonicalPayloadBuffer signature stripping
      const payloadBuffer = extractCanonicalPayloadBuffer({
        version: '1.0',
        licenseId: 'LIC-01',
        signature: 'should-be-omitted-from-buffer'
      });
      assert.ok(!payloadBuffer.toString('utf-8').includes('signature'), 'Signature field must be omitted from canonical buffer');
    });

    it('generates valid Ed25519 keypair and signs/verifies payloads accurately', () => {
      const { publicKeyPem, privateKeyPem } = generateEd25519KeyPair();
      assert.ok(publicKeyPem.includes('BEGIN PUBLIC KEY'), 'Must output PEM formatted public key');
      assert.ok(privateKeyPem.includes('BEGIN PRIVATE KEY'), 'Must output PEM formatted private key');

      const testPayload: LicensePayload = {
        version: '1.0',
        licenseId: 'LIC-TEST-001',
        organizationId: 'org-test-01',
        customerName: 'Acme Aerospace Corp',
        edition: 'ENTERPRISE',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        isPerpetual: false,
        maxClusters: 10,
        maxNodes: 250,
        features: ['advanced_cost_intelligence', 'autonomous_remediation']
      };

      const signature = signLicensePayload(testPayload, privateKeyPem);
      assert.ok(typeof signature === 'string' && signature.length > 20, 'Signature must be non-empty base64 string');

      const signedLicense: SignedLicense = {
        ...testPayload,
        signature
      };

      const verified = verifyLicenseSignature(signedLicense, publicKeyPem);
      assert.strictEqual(verified, true, 'Valid signature must verify with corresponding public key');
    });

    it('detects tampering and rejects altered payloads', () => {
      const { publicKeyPem, privateKeyPem } = generateEd25519KeyPair();
      const originalPayload: LicensePayload = {
        version: '1.0',
        licenseId: 'LIC-TEST-002',
        organizationId: 'org-safe',
        customerName: 'SafeOrg',
        edition: 'PRO',
        issuedAt: new Date().toISOString(),
        expiresAt: null,
        isPerpetual: true,
        maxClusters: 3,
        maxNodes: 50,
        features: ['enterprise_rbac']
      };

      const signature = signLicensePayload(originalPayload, privateKeyPem);

      // Tampered payload (e.g. customer attempted to increase cluster limit)
      const tamperedSignedLicense: SignedLicense = {
        ...originalPayload,
        maxClusters: 999,
        signature
      };

      const verified = verifyLicenseSignature(tamperedSignedLicense, publicKeyPem);
      assert.strictEqual(verified, false, 'Tampered payload must fail signature verification');
    });

    it('rejects invalid or corrupted signatures gracefully without throwing uncaught exceptions', () => {
      const { publicKeyPem } = generateEd25519KeyPair();
      const invalidLicense: any = {
        version: '1.0',
        licenseId: 'LIC-ERR',
        signature: 'not-a-valid-base64-signature'
      };

      assert.strictEqual(verifyLicenseSignature(invalidLicense, publicKeyPem), false);
      assert.strictEqual(verifyLicenseSignature(null as any, publicKeyPem), false);
    });
  });

  describe('2. License Service & Community/Commercial Entitlements', () => {
    let licenseService: LicenseService;
    let keyPair: { publicKeyPem: string; privateKeyPem: string };

    beforeEach(() => {
      keyPair = generateEd25519KeyPair();
      process.env.SKYOPS_LICENSE_PUBLIC_KEY = keyPair.publicKeyPem;
      licenseService = new LicenseService();
      licenseService.invalidateCache();
    });

    it('defaults to Community Edition with standard guardrails when no commercial license is active', () => {
      const status = licenseService.getVerificationResult();
      assert.strictEqual(status.edition, 'COMMUNITY');
      assert.strictEqual(status.valid, true);
      assert.strictEqual(status.isExpired, false);
      assert.strictEqual(status.maxClusters, 3, 'Community Edition defaults to 3 clusters');
      assert.strictEqual(status.maxNodes, 30, 'Community Edition defaults to 30 nodes');
      assert.strictEqual(status.features.length, 0, 'Community Edition has no advanced features');
    });

    it('imports and activates a valid signed Enterprise license', async () => {
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
      const payload: LicensePayload = {
        version: '1.0',
        licenseId: 'LIC-ENT-2026-001',
        organizationId: 'org-fintech-01',
        customerName: 'FinTech Global Ltd',
        edition: 'ENTERPRISE',
        issuedAt: new Date().toISOString(),
        expiresAt,
        isPerpetual: false,
        maxClusters: 25,
        maxNodes: 500,
        features: [
          'enterprise_rbac',
          'sso_oidc',
          'autonomous_remediation',
          'advanced_cost_intelligence'
        ]
      };

      const signature = signLicensePayload(payload, keyPair.privateKeyPem);
      const signedLicense: SignedLicense = {
        ...payload,
        signature
      };

      const result = await licenseService.importLicense(signedLicense);
      assert.strictEqual(result.valid, true, 'License import should be valid');
      assert.strictEqual(result.edition, 'ENTERPRISE');
      assert.strictEqual(result.customerName, 'FinTech Global Ltd');
      assert.strictEqual(result.maxClusters, 25);
      assert.strictEqual(result.maxNodes, 500);

      // Verify entitlement methods reflect active license
      assert.strictEqual(licenseService.isFeatureEntitled('sso_oidc'), true);
      assert.strictEqual(licenseService.isFeatureEntitled('autonomous_remediation'), true);
    });

    it('enforces cluster and node entitlement checks', () => {
      // Community: maxClusters = 3, maxNodes = 30
      const check1 = licenseService.checkClusterEntitlement(2);
      assert.strictEqual(check1.allowed, true);

      const check2 = licenseService.checkClusterEntitlement(3);
      assert.strictEqual(check2.allowed, false, 'Community Edition cannot exceed 3 clusters');
      assert.ok(check2.reason?.includes('Cluster limit reached'));

      const nodeCheck1 = licenseService.checkNodeEntitlement(25, 5);
      assert.strictEqual(nodeCheck1.allowed, true);

      const nodeCheck2 = licenseService.checkNodeEntitlement(25, 10);
      assert.strictEqual(nodeCheck2.allowed, false, 'Community Edition cannot exceed 30 nodes');
    });

    it('handles license expiration safely without remote kill switch or data loss', async () => {
      // Create an expired license
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const payload: LicensePayload = {
        version: '1.0',
        licenseId: 'LIC-EXP-999',
        organizationId: 'org-expired',
        customerName: 'Expired Corp',
        edition: 'PRO',
        issuedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
        expiresAt: expiredDate,
        isPerpetual: false,
        maxClusters: 5,
        maxNodes: 50,
        features: ['enterprise_rbac']
      };

      const signature = signLicensePayload(payload, keyPair.privateKeyPem);
      const signedLicense: SignedLicense = { ...payload, signature };

      const result = await licenseService.importLicense(signedLicense);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.isExpired, true);
      assert.ok(result.error?.includes('expired'));

      // Core monitoring remains functional, but commercial features are paused
      assert.strictEqual(licenseService.isFeatureEntitled('enterprise_rbac'), false);
    });

    it('removes commercial license and safely resets to Community defaults', async () => {
      const status = await licenseService.removeLicense();
      assert.strictEqual(status.edition, 'COMMUNITY');
      assert.strictEqual(status.maxClusters, 3);
      assert.strictEqual(status.valid, true);
    });
  });

  describe('3. AI Provider Abstraction & Data Privacy', () => {
    let aiManager: AIManager;

    beforeEach(() => {
      delete process.env.GEMINI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      process.env.AI_PROVIDER = 'none';
      process.env.AI_ENABLED = 'false';
      process.env.AI_DATA_SHARING_CONSENT = 'false';
      aiManager = new AIManager();
    });

    it('defaults to No-AI mode when no external credentials are configured', () => {
      const config = aiManager.getSanitizedConfig();
      assert.strictEqual(config.providerType, 'none');
      assert.strictEqual(config.enabled, false);
      assert.strictEqual(config.dataSharingConsent, false);
      assert.strictEqual(config.activeProviderName, 'Deterministic Engine');
    });

    it('NoAIProvider generates deterministic root-cause analysis without network calls', async () => {
      const noAI = new NoAIProvider();
      const sampleContext: IncidentContext = {
        incidentId: 'inc-test-01',
        fingerprint: 'fp-crashloop-01',
        incidentType: 'CrashLoopBackOff',
        severity: 'CRITICAL',
        clusterId: 'cluster-prod-01',
        clusterName: 'Production-East',
        namespace: 'payments',
        resourceKind: 'Deployment',
        resourceName: 'payment-service',
        occurrenceCount: 15,
        firstSeenAt: new Date(Date.now() - 3600000).toISOString(),
        lastSeenAt: new Date().toISOString(),
        recentEvents: [
          { type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container' }
        ],
        conditions: [],
        containers: [
          { name: 'app', image: 'payment-svc:v1.2', state: 'waiting', restartCount: 15, ready: false, waitingReason: 'CrashLoopBackOff' }
        ],
        relatedResources: [],
        specSummary: {},
        statusSummary: {}
      };

      const analysis = await noAI.analyzeIncident(sampleContext);
      assert.strictEqual(analysis.incidentId, 'inc-test-01');
      assert.strictEqual(analysis.status, 'SUCCESS');
      assert.ok(analysis.summary.includes('Deterministic'));
      assert.strictEqual(analysis.requiresApproval, true, 'Human-in-the-loop must be enforced');
      assert.strictEqual(analysis.executionSafe, true);
    });

    it('redacts credentials, tokens, passwords, and private keys from outgoing context', () => {
      const sensitiveText = `
        Error in connection string postgresql://app_user:SuperSecretPassword123!@db.internal:5432/skyops
        Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc_secret_sig
        AWS Access Key: AKIAIOSFODNN7EXAMPLE
        Private Key follows:
        -----BEGIN RSA PRIVATE KEY-----
        MIIEowIBAAKCAQEA0Y3wZ...fake-private-key...
        -----END RSA PRIVATE KEY-----
      `;

      const redacted = redactSensitiveData(sensitiveText);
      assert.ok(!redacted.includes('SuperSecretPassword123!'), 'Password must be redacted');
      assert.ok(!redacted.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), 'JWT must be redacted');
      assert.ok(!redacted.includes('AKIAIOSFODNN7EXAMPLE'), 'AWS Key must be redacted');
      assert.ok(!redacted.includes('MIIEowIBAAKCAQEA0Y3wZ'), 'Private key body must be redacted');
      assert.ok(redacted.includes('[REDACTED_SECRET]') || redacted.includes('[REDACTED_TOKEN]') || redacted.includes('***@'));
    });

    it('sanitizes incident context object correctly', () => {
      const dirtyContext: IncidentContext = {
        incidentId: 'inc-001',
        fingerprint: 'fp-001',
        incidentType: 'CrashLoopBackOff',
        severity: 'HIGH',
        clusterId: 'cls-01',
        clusterName: 'AlphaCluster',
        namespace: 'default',
        resourceKind: 'Pod',
        resourceName: 'web-pod',
        occurrenceCount: 1,
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        recentEvents: [
          { type: 'Warning', reason: 'FailedAuth', message: 'Bearer secret-token-xyz failed to authenticate' }
        ],
        conditions: [],
        containers: [
          { name: 'web', image: 'web:1.0', state: 'waiting', restartCount: 1, ready: false, waitingMessage: 'password=supersecret' }
        ],
        relatedResources: [],
        specSummary: { env: { DB_PASS: 'topsecretpass' } },
        statusSummary: {}
      };

      const sanitized = sanitizeIncidentContext(dirtyContext);
      const json = JSON.stringify(sanitized);
      assert.ok(!json.includes('secret-token-xyz'));
      assert.ok(!json.includes('topsecretpass'));
      assert.ok(!json.includes('supersecret'));
    });

    it('masks secret API keys when returning configuration to client', async () => {
      await aiManager.updateConfig({
        providerType: 'openai',
        apiKey: 'sk-1234567890abcdefghijk1234567890',
        modelName: 'gpt-4o',
        dataSharingConsent: true
      });

      const publicConfig = aiManager.getSanitizedConfig();
      assert.strictEqual(publicConfig.providerType, 'openai');
      assert.strictEqual(publicConfig.apiKeyConfigured, true);
      assert.ok(publicConfig.apiKeyMasked?.startsWith('sk-1') && publicConfig.apiKeyMasked?.includes('••••'), 'Key should be masked for display');
      assert.ok(!publicConfig.apiKeyMasked?.includes('abcdefghijk'), 'Full key must never be transmitted to client');
    });
  });

  describe('4. Secure Software Updates & Pre-Update Safety', () => {
    let updateService: UpdateService;

    beforeEach(() => {
      updateService = new UpdateService();
    });

    it('compareVersions calculates semver ordering correctly', () => {
      assert.strictEqual(compareVersions('v1.1.0', 'v1.0.0'), 1);
      assert.strictEqual(compareVersions('1.0.0', '1.0.0'), 0);
      assert.strictEqual(compareVersions('v1.0.0', 'v1.2.0'), -1);
    });

    it('detects available updates correctly from release catalog', async () => {
      const status = await updateService.getStatus();
      assert.ok(status.currentVersion);
      assert.strictEqual(status.channel, 'stable');
      assert.ok(status.latestAvailableVersion);
    });

    it('validates release metadata signatures and structure', () => {
      const release: ReleaseMetadata = {
        version: 'v1.1.0',
        releaseDate: '2026-11-15T00:00:00Z',
        channel: 'stable',
        minSupportedVersion: 'v1.0.0',
        releaseNotes: 'Performance enhancements',
        images: [
          { name: 'skyops/control-plane', tag: 'v1.1.0', digest: 'sha256:fake' }
        ],
        migrationsRequired: ['001_initial_schema.sql'],
        breakingChanges: false,
        checksums: { 'file.tar.gz': 'checksum' }
      };

      const isValid = updateService.verifyReleaseMetadata(release);
      assert.strictEqual(isValid, true);
    });

    it('requires explicit administrator confirmation before applying update', async () => {
      await assert.rejects(
        async () => {
          await updateService.applyUpdate({
            confirm: false, // Not confirmed!
            userId: 'admin-01'
          });
        },
        /Administrator confirmation is required/
      );
    });

    it('applies update and records pre-update backup', async () => {
      const result = await updateService.applyUpdate({
        confirm: true,
        userId: 'admin-01',
        orgId: 'org-test-01'
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.backupPath, 'Must create and return safety backup path');
      assert.ok(result.message.includes('Successfully upgraded'));

      const postStatus = await updateService.getStatus();
      assert.strictEqual(postStatus.currentVersion, 'v1.6.0');
    });
  });
});
