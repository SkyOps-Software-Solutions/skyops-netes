import { describe, it, expect, beforeEach } from 'vitest';
import {
  StorageService,
  MemoryStorageDriver,
  StorageValidationError,
  StorageSecurityError,
  sanitizeFilename,
  validateOrgId,
  validateCategory,
  validateFileSize,
  validateMimeType,
  computeChecksumSha256,
  buildStoragePath,
  parseTenantFromPath
} from './storage';
import { resolveStorageBucket } from './config';
import { getPersistenceStore } from './persistence/index';
import { auditService } from './audit';

describe('SkyOps Firebase Cloud Storage Foundation', () => {
  let storageService: StorageService;
  let memoryDriver: MemoryStorageDriver;
  const orgA = 'org-acme-corp';
  const orgB = 'org-globex-inc';
  const actor = {
    id: 'usr-sre-alice',
    email: 'alice@acme.com',
    name: 'Alice Admin',
    actorType: 'HUMAN' as const
  };

  beforeEach(() => {
    memoryDriver = new MemoryStorageDriver('skyops-a1143.firebasestorage.app');
    storageService = new StorageService({
      driver: memoryDriver,
      bucketName: 'skyops-a1143.firebasestorage.app'
    });
  });

  describe('Configuration & Bucket Resolution', () => {
    it('resolves canonical bucket name and strips gs:// protocol scheme', () => {
      const bucket = resolveStorageBucket();
      expect(bucket).toBeDefined();
      expect(bucket).not.toContain('gs://');
      expect(bucket).toBe('skyops-a1143.firebasestorage.app');
    });

    it('initializes StorageService with canonical bucket', () => {
      expect(storageService.getBucketName()).toBe('skyops-a1143.firebasestorage.app');
      expect(storageService.getDriverName()).toBe('memory');
    });
  });

  describe('Security Validation & Path Isolation', () => {
    it('constructs strict tenant-scoped paths', () => {
      const path = buildStoragePath(orgA, 'incident-artifacts', 'dump.json');
      expect(path).toBe('tenants/org-acme-corp/incident-artifacts/dump.json');
    });

    it('parses and validates tenant org from canonical storage path', () => {
      const parsed = parseTenantFromPath('tenants/org-acme-corp/remediation-manifests/v1/patch.yaml');
      expect(parsed.orgId).toBe(orgA);
      expect(parsed.category).toBe('remediation-manifests');
      expect(parsed.subpath).toBe('v1/patch.yaml');
    });

    it('rejects path traversal attacks in filenames', () => {
      expect(() => sanitizeFilename('../../etc/passwd')).toThrow(StorageSecurityError);
      expect(() => sanitizeFilename('..\\windows\\system32')).toThrow(StorageSecurityError);
      expect(() => sanitizeFilename('%2e%2e%2fsecret.key')).toThrow(StorageSecurityError);
      expect(() => sanitizeFilename('payload\0.png')).toThrow(StorageSecurityError);
    });

    it('rejects forbidden dangerous executable file extensions', () => {
      expect(() => sanitizeFilename('exploit.exe')).toThrow(StorageSecurityError);
      expect(() => sanitizeFilename('malware.sh')).toThrow(StorageSecurityError);
      expect(() => sanitizeFilename('script.bat')).toThrow(StorageSecurityError);
      expect(() => sanitizeFilename('installer.msi')).toThrow(StorageSecurityError);
    });

    it('rejects invalid or traversal organization IDs', () => {
      expect(() => validateOrgId('../evil-tenant')).toThrow(StorageSecurityError);
      expect(() => validateOrgId('org/sub/bad')).toThrow(StorageSecurityError);
      expect(() => validateOrgId('')).toThrow(StorageSecurityError);
    });

    it('enforces category allowlist', () => {
      expect(validateCategory('audit-exports')).toBe('audit-exports');
      expect(validateCategory('remediation-manifests')).toBe('remediation-manifests');
      expect(() => validateCategory('unauthorized-folder' as any)).toThrow(StorageValidationError);
    });

    it('enforces MIME type allowlist', () => {
      expect(validateMimeType('application/json')).toBe('application/json');
      expect(validateMimeType('text/plain; charset=utf-8')).toBe('text/plain');
      expect(validateMimeType('application/x-yaml')).toBe('application/x-yaml');
      expect(() => validateMimeType('application/x-msdownload')).toThrow(StorageValidationError);
    });

    it('enforces maximum size limits per category', () => {
      const smallBuffer = Buffer.alloc(1024, 'x'); // 1KB
      expect(() => validateFileSize(smallBuffer, 'remediation-manifests')).not.toThrow();

      const emptyBuffer = Buffer.alloc(0);
      expect(() => validateFileSize(emptyBuffer, 'remediation-manifests')).toThrow(StorageValidationError);

      const oversizedManifest = Buffer.alloc(6 * 1024 * 1024, 'a'); // 6MB > 5MB limit
      expect(() => validateFileSize(oversizedManifest, 'remediation-manifests')).toThrow(StorageValidationError);
    });
  });

  describe('Tenant-Isolated Upload, Checksum & Download Flow', () => {
    it('uploads an artifact, generates SHA-256, and stores in tenant boundary', async () => {
      const content = JSON.stringify({ cluster: 'prod-us-east-1', status: 'CRASH_LOOP' });
      const buffer = Buffer.from(content, 'utf-8');
      const expectedChecksum = computeChecksumSha256(buffer);

      const artifact = await storageService.uploadArtifact({
        orgId: orgA,
        category: 'incident-artifacts',
        filename: 'diagnostics.json',
        buffer,
        mimeType: 'application/json',
        actor,
        tags: ['incident', 'prod-crash']
      });

      expect(artifact.id).toMatch(/^art_/);
      expect(artifact.orgId).toBe(orgA);
      expect(artifact.category).toBe('incident-artifacts');
      expect(artifact.storagePath).toContain(`tenants/${orgA}/incident-artifacts/`);
      expect(artifact.storageBucket).toBe('skyops-a1143.firebasestorage.app');
      expect(artifact.checksumSha256).toBe(expectedChecksum);
      expect(artifact.sizeBytes).toBe(buffer.length);
      expect(artifact.lifecycleStatus).toBe('ACTIVE');

      // Verify persisted metadata in persistence store
      const retrieved = await storageService.getArtifact(orgA, artifact.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(artifact.id);

      // Verify download and cryptographic integrity check
      const downloadResult = await storageService.downloadArtifact(orgA, artifact.id, actor);
      expect(downloadResult.buffer.toString('utf-8')).toBe(content);
      expect(downloadResult.artifact.id).toBe(artifact.id);
    });

    it('enforces strict cross-tenant isolation: Tenant B cannot access Tenant A artifacts', async () => {
      const content = Buffer.from('Cluster snapshot data', 'utf-8');
      const artifactA = await storageService.uploadArtifact({
        orgId: orgA,
        category: 'cluster-snapshots',
        filename: 'cluster-nodes.txt',
        buffer: content,
        mimeType: 'text/plain',
        actor
      });

      // Tenant B queries Tenant A artifact ID -> Expect 404 or Security Error
      const crossTenantGet = await storageService.getArtifact(orgB, artifactA.id);
      expect(crossTenantGet).toBeNull();

      // Tenant B download attempt -> Fails
      await expect(storageService.downloadArtifact(orgB, artifactA.id)).rejects.toThrow();

      // Tenant B delete attempt -> Fails
      const deleteResult = await storageService.deleteArtifact(orgB, artifactA.id);
      expect(deleteResult).toBe(false);
    });

    it('enforces audit exports immutability: cannot be deleted', async () => {
      const auditPayload = Buffer.from('Immutable Audit Log Entries', 'utf-8');
      const artifact = await storageService.uploadArtifact({
        orgId: orgA,
        category: 'audit-exports',
        filename: 'compliance_report.txt',
        buffer: auditPayload,
        mimeType: 'text/plain',
        actor
      });

      // Attempting to delete an audit-export must throw StorageSecurityError
      await expect(storageService.deleteArtifact(orgA, artifact.id)).rejects.toThrow(StorageSecurityError);
    });

    it('allows soft and hard deletion for mutable categories', async () => {
      const buffer = Buffer.from('temporary manifest', 'utf-8');
      const artifact = await storageService.uploadArtifact({
        orgId: orgA,
        category: 'remediation-manifests',
        filename: 'hotfix.yaml',
        buffer,
        mimeType: 'application/x-yaml',
        actor
      });

      // Soft delete
      const softDeleted = await storageService.deleteArtifact(orgA, artifact.id, actor, false);
      expect(softDeleted).toBe(true);

      const statusAfterSoft = await storageService.getArtifact(orgA, artifact.id);
      expect(statusAfterSoft?.lifecycleStatus).toBe('DELETED');

      // Attempting download of deleted artifact throws validation error
      await expect(storageService.downloadArtifact(orgA, artifact.id)).rejects.toThrow(StorageValidationError);

      // Hard delete
      const hardDeleted = await storageService.deleteArtifact(orgA, artifact.id, actor, true);
      expect(hardDeleted).toBe(true);
      const afterHard = await storageService.getArtifact(orgA, artifact.id);
      expect(afterHard).toBeNull();
    });

    it('calculates storage usage summary broken down by category', async () => {
      const orgUsageId = `org-usage-${Date.now()}`;
      await storageService.uploadArtifact({
        orgId: orgUsageId,
        category: 'remediation-manifests',
        filename: 'patch1.yaml',
        buffer: Buffer.alloc(1000, 'a'),
        mimeType: 'text/yaml',
        actor
      });

      await storageService.uploadArtifact({
        orgId: orgUsageId,
        category: 'ai-diagnostics',
        filename: 'ai-log.json',
        buffer: Buffer.alloc(2500, 'b'),
        mimeType: 'application/json',
        actor
      });

      const summary = await storageService.getStorageUsageSummary(orgUsageId);
      expect(summary.orgId).toBe(orgUsageId);
      expect(summary.totalArtifactsCount).toBe(2);
      expect(summary.totalSizeBytes).toBe(3500);
      expect(summary.categoryBreakdown['remediation-manifests'].sizeBytes).toBe(1000);
      expect(summary.categoryBreakdown['remediation-manifests'].count).toBe(1);
      expect(summary.categoryBreakdown['ai-diagnostics'].sizeBytes).toBe(2500);
      expect(summary.categoryBreakdown['ai-diagnostics'].count).toBe(1);
    });

    it('records immutable audit events for storage operations', async () => {
      const orgAuditTest = `org-aud-${Date.now()}`;
      const buffer = Buffer.from('test audit payload', 'utf-8');

      const artifact = await storageService.uploadArtifact({
        orgId: orgAuditTest,
        category: 'incident-artifacts',
        filename: 'artifact-audit.txt',
        buffer,
        mimeType: 'text/plain',
        actor
      });

      // Download it
      await storageService.downloadArtifact(orgAuditTest, artifact.id, actor);

      // Check audit entries recorded
      const auditEvents = auditService.query({ orgId: orgAuditTest });
      expect(auditEvents.total).toBeGreaterThanOrEqual(2);

      const uploadEvent = auditEvents.items.find((e) => e.action === 'STORAGE_UPLOAD');
      expect(uploadEvent).toBeDefined();
      expect(uploadEvent?.resourceId).toBe(artifact.id);
      expect(uploadEvent?.actorId).toBe(actor.id);

      const downloadEvent = auditEvents.items.find((e) => e.action === 'STORAGE_DOWNLOAD');
      expect(downloadEvent).toBeDefined();
      expect(downloadEvent?.resourceId).toBe(artifact.id);
    });

    it('exports audit ledger directly to immutable storage artifact', async () => {
      const orgAuditExport = `org-export-${Date.now()}`;

      // Create dummy audit event
      auditService.record({
        orgId: orgAuditExport,
        actorId: actor.id,
        actorName: actor.name,
        actorType: 'HUMAN',
        action: 'TEST_ACTION',
        resourceType: 'CLUSTER',
        resourceId: 'cluster-1',
        result: 'SUCCESS'
      });

      const exportArtifact = await storageService.exportAuditToStorage(orgAuditExport, actor, 'json');
      expect(exportArtifact.category).toBe('audit-exports');
      expect(exportArtifact.mimeType).toBe('application/json');
      expect(exportArtifact.sizeBytes).toBeGreaterThan(0);

      const download = await storageService.downloadArtifact(orgAuditExport, exportArtifact.id, actor);
      const exportedJson = JSON.parse(download.buffer.toString('utf-8'));
      expect(Array.isArray(exportedJson)).toBe(true);
      expect(exportedJson.length).toBeGreaterThan(0);
    });
  });
});
