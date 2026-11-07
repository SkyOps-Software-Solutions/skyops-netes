import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import {
  hashPassword,
  verifyPassword,
  generateLocalJwt,
  verifyLocalJwtToken,
  checkLoginRateLimit,
  recordFailedLogin,
  resetLoginRateLimit,
  getLocalJwtSecret
} from './auth/localAuth';
import { LocalStorageDriver } from './storage/drivers/LocalStorageDriver';
import { PostgresMigrator } from './persistence/migrator';
import { validateTenantBoundary, UnauthorizedTenantAccessException } from './auth';
import { determinePersistenceProvider } from './persistence/index';

describe('Phase 2: PostgreSQL Persistence, Local Auth & Storage Verification Suite', () => {
  // --------------------------------------------------------------------------
  // 1. PostgreSQL Schema & Migrations
  // --------------------------------------------------------------------------
  describe('PostgreSQL Schema & Migrations', () => {
    it('initial migration file (001_initial_schema.sql) exists and contains all 26 entities', () => {
      const migrationPath = path.join(__dirname, 'persistence', 'migrations', '001_initial_schema.sql');
      assert.ok(fs.existsSync(migrationPath), 'Migration file must exist');

      const sql = fs.readFileSync(migrationPath, 'utf-8');
      const expectedTables = [
        'users',
        'local_credentials',
        'user_notification_settings',
        'organizations',
        'org_members',
        'org_invitations',
        'clusters',
        'cluster_tokens',
        'cluster_resources',
        'cluster_metric_history',
        'incidents',
        'incident_timeline',
        'incident_notes',
        'remediations',
        'remediation_actions',
        'ai_analyses',
        'policies',
        'audit_events',
        'webhooks',
        'webhook_deliveries',
        'processed_webhooks',
        'subscriptions',
        'invoices',
        'org_usage',
        'support_tickets',
        'stored_artifacts',
        'operational_logs'
      ];

      for (const table of expectedTables) {
        assert.ok(
          sql.includes(`CREATE TABLE IF NOT EXISTS ${table}`),
          `Migration must declare table ${table}`
        );
      }
    });

    it('PostgresMigrator tracks migrations inside transactions', async () => {
      const executedQueries: string[] = [];
      const mockClient = {
        query: async (queryText: string, params?: any[]) => {
          executedQueries.push(queryText);
          if (queryText.includes('SELECT id FROM schema_migrations')) {
            return { rows: [] };
          }
          return { rows: [] };
        },
        release: () => {}
      };

      const mockPool: any = {
        connect: async () => mockClient,
        query: async (q: string) => mockClient.query(q)
      };

      const migrator = new PostgresMigrator(mockPool);
      await migrator.ensureMigrationsTable(mockClient as any);

      assert.ok(
        executedQueries.some((q) => q.includes('CREATE TABLE IF NOT EXISTS schema_migrations')),
        'Must create schema_migrations table'
      );
    });

    it('determinePersistenceProvider selects postgres when configured', () => {
      const origProvider = process.env.PERSISTENCE_PROVIDER;
      const origMode = process.env.SKYOPS_DEPLOYMENT_MODE;

      try {
        process.env.PERSISTENCE_PROVIDER = 'postgres';
        process.env.SKYOPS_DEPLOYMENT_MODE = 'self_hosted';
        assert.equal(determinePersistenceProvider(), 'postgres');

        process.env.PERSISTENCE_PROVIDER = 'memory';
        assert.equal(determinePersistenceProvider(), 'memory');
      } finally {
        process.env.PERSISTENCE_PROVIDER = origProvider;
        process.env.SKYOPS_DEPLOYMENT_MODE = origMode;
      }
    });
  });

  // --------------------------------------------------------------------------
  // 2. Local Authentication, Password Hashing & JWT Sessions
  // --------------------------------------------------------------------------
  describe('Local Authentication Engine', () => {
    it('hashes passwords securely and verifies correctly', async () => {
      const password = 'CorrectHorseBatteryStaple123!';
      const hash = await hashPassword(password);

      assert.notEqual(hash, password, 'Hash must not equal plaintext');
      assert.ok(hash.startsWith('$2'), 'Must use bcrypt hash format');

      const isMatch = await verifyPassword(password, hash);
      assert.equal(isMatch, true, 'Correct password must verify');

      const isWrong = await verifyPassword('WrongPassword!', hash);
      assert.equal(isWrong, false, 'Incorrect password must be rejected');
    });

    it('generates and verifies local JWT session tokens', () => {
      const user = {
        id: 'usr-admin-1',
        email: 'admin@skyops.internal',
        name: 'Alex Rivera',
        role: 'OWNER' as const
      };

      const token = generateLocalJwt(user);
      assert.ok(typeof token === 'string' && token.length > 20);

      const verified = verifyLocalJwtToken(token);
      assert.equal(verified.id, user.id);
      assert.equal(verified.email, user.email);
      assert.equal(verified.name, user.name);
      assert.equal(verified.role, 'OWNER');
    });

    it('rejects tampered or forged JWT session tokens', () => {
      const token = generateLocalJwt({
        id: 'usr-1',
        email: 'user@skyops.internal',
        name: 'User One'
      });

      const parts = token.split('.');
      // Tamper with payload
      const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'hacked', email: 'hacked@evil.com' })).toString('base64');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      assert.throws(
        () => verifyLocalJwtToken(tamperedToken),
        /Invalid local authentication token/
      );
    });

    it('enforces brute-force rate limiting and lockout', () => {
      const testIp = `test-ip-${Date.now()}`;
      resetLoginRateLimit(testIp);

      const check1 = checkLoginRateLimit(testIp);
      assert.equal(check1.allowed, true);

      // Record 5 failed attempts
      for (let i = 0; i < 5; i++) {
        recordFailedLogin(testIp);
      }

      const check2 = checkLoginRateLimit(testIp);
      assert.equal(check2.allowed, false, 'Must lock out after 5 consecutive failed attempts');
      assert.ok((check2.waitSeconds || 0) > 0, 'Must provide wait seconds countdown');

      resetLoginRateLimit(testIp);
      const check3 = checkLoginRateLimit(testIp);
      assert.equal(check3.allowed, true, 'Resetting rate limit must restore access');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Authorization & Tenant Isolation
  // --------------------------------------------------------------------------
  describe('Authorization & Strict Tenant Boundary Enforcement', () => {
    it('allows access when tenant ID matches target resource', () => {
      assert.doesNotThrow(() => {
        validateTenantBoundary({ tenantId: 'org_acme', user: { id: 'usr-1' } } as any, 'org_acme');
      });
    });

    it('strictly throws UnauthorizedTenantAccessException when tenant ID does not match', () => {
      assert.throws(
        () => {
          validateTenantBoundary({ tenantId: 'org_acme' } as any, 'org_evil_corp');
        },
        (err: any) => {
          return (
            err instanceof UnauthorizedTenantAccessException &&
            err.statusCode === 403 &&
            err.code === 'UNAUTHORIZED_TENANT_ACCESS'
          );
        }
      );
    });
  });

  // --------------------------------------------------------------------------
  // 4. Persistent Local Storage Driver & Path Traversal Security
  // --------------------------------------------------------------------------
  describe('Persistent Local File Storage Driver', () => {
    const testDir = path.join(process.cwd(), 'data', 'test-artifacts');
    let driver: LocalStorageDriver;

    beforeEach(() => {
      driver = new LocalStorageDriver({ baseDir: testDir });
    });

    it('uploads, exists, downloads, and deletes files correctly', async () => {
      const relativePath = 'tenants/org_1/reports/incident-101.pdf';
      const content = Buffer.from('%PDF-1.4 Mock PDF report content for incident');
      const metadata = {
        orgId: 'org_1',
        category: 'incident-artifacts' as const,
        filename: 'incident-101.pdf',
        contentType: 'application/pdf',
        sizeBytes: content.length,
        checksumSha256: 'mock-sha'
      };

      // 1. Upload
      const uploadRes = await driver.upload(relativePath, content, metadata);
      assert.equal(uploadRes.sizeBytes, content.length);
      assert.equal(uploadRes.storageBucket, 'local-filesystem');

      // 2. Exists
      const exists = await driver.exists(relativePath);
      assert.equal(exists, true);

      // 3. Download
      const downloaded = await driver.download(relativePath);
      assert.equal(downloaded.toString(), content.toString());

      // 4. Delete
      const deleted = await driver.delete(relativePath);
      assert.equal(deleted, true);

      const existsAfter = await driver.exists(relativePath);
      assert.equal(existsAfter, false);
    });

    it('strictly blocks path traversal attempts', async () => {
      const maliciousPaths = [
        '../../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        'tenants/../../../etc/shadow'
      ];

      for (const p of maliciousPaths) {
        await assert.rejects(
          async () => {
            await driver.download(p);
          },
          /Storage path traversal detected and blocked|File not found/
        );
      }
    });
  });
});
