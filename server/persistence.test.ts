import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  resolvePersistenceConfig,
  safeWriteJsonSync,
  safeReadJsonSync,
  getPersistenceConfig,
  resetPersistenceConfig,
  verifyProductionPersistence
} from './persistence';
import { DataStore } from './store';
import { auditService } from './audit';
import { webhookService } from './integrations/webhooks';
import { incidentNotificationService } from './notifications/notificationService';

test('SkyOps Production Persistence Architecture & Isolation Gate', async (t) => {
  await t.test('Production Persistence Requirements: rejects startup without SKYOPS_DATA_DIR', () => {
    assert.throws(
      () => {
        resolvePersistenceConfig('production', '');
      },
      (err: any) => {
        return err.message.includes('Production environment requires an explicit persistent storage directory');
      }
    );

    assert.throws(
      () => {
        resolvePersistenceConfig('production', undefined);
      },
      (err: any) => {
        return err.message.includes('Production environment requires an explicit persistent storage directory');
      }
    );
  });

  await t.test('Production Persistence: accepts valid directory and ensures writability probe', () => {
    const tempProdDir = path.join(os.tmpdir(), `skyops-prod-test-${Date.now()}`);
    
    const config = resolvePersistenceConfig('production', tempProdDir);
    assert.equal(config.env, 'production');
    assert.equal(config.dataDir, path.resolve(tempProdDir));
    assert.equal(config.isExplicitProductionDir, true);
    assert.equal(config.storeFile, path.join(tempProdDir, 'skyops_store.json'));
    assert.equal(config.auditFile, path.join(tempProdDir, 'skyops_audit.json'));
    assert.equal(config.webhooksFile, path.join(tempProdDir, 'skyops_webhooks.json'));
    assert.equal(config.notificationsFile, path.join(tempProdDir, 'skyops_notifications.json'));

    // Verify temp directory was created and probe file was cleanly cleaned up
    assert.ok(fs.existsSync(tempProdDir));
    const files = fs.readdirSync(tempProdDir);
    assert.equal(files.filter(f => f.startsWith('.probe-write-')).length, 0);

    // Cleanup
    fs.rmSync(tempProdDir, { recursive: true, force: true });
  });

  await t.test('Test Environment Isolation: guarantees test storage never touches repository data/', () => {
    const testConfig = resolvePersistenceConfig('test');
    assert.equal(testConfig.env, 'test');
    assert.ok(testConfig.dataDir.includes(os.tmpdir()));
    assert.equal(testConfig.isExplicitProductionDir, false);
    assert.ok(!testConfig.storeFile.startsWith(path.join(process.cwd(), 'data')));
  });

  await t.test('Development Environment Default: falls back cleanly to data/ directory', () => {
    const devConfig = resolvePersistenceConfig('development');
    assert.equal(devConfig.env, 'development');
    assert.equal(devConfig.dataDir, path.join(process.cwd(), 'data'));
    assert.equal(devConfig.storeFile, path.join(process.cwd(), 'data', 'skyops_store.json'));
  });

  await t.test('Atomic Persistence: safeWriteJsonSync prevents torn or partial writes', () => {
    const testFile = path.join(os.tmpdir(), `skyops-atomic-test-${Date.now()}.json`);
    const payload = { test: true, timestamp: Date.now(), items: [1, 2, 3] };

    safeWriteJsonSync(testFile, payload);
    assert.ok(fs.existsSync(testFile));

    const read = JSON.parse(fs.readFileSync(testFile, 'utf8'));
    assert.deepEqual(read, payload);

    // Ensure no orphan temporary files remain
    const dir = path.dirname(testFile);
    const orphans = fs.readdirSync(dir).filter(f => f.includes(`${path.basename(testFile)}.tmp`));
    assert.equal(orphans.length, 0);

    fs.unlinkSync(testFile);
  });

  await t.test('Safe JSON Read: handles missing files with default fallback', () => {
    const nonExistent = path.join(os.tmpdir(), `non-existent-${Date.now()}.json`);
    const defaultData = { fallback: true };

    const result = safeReadJsonSync(nonExistent, defaultData, false);
    assert.deepEqual(result, defaultData);
  });

  await t.test('Fail-Closed Semantics: safeReadJsonSync refuses to overwrite corrupted production file', () => {
    const corruptFile = path.join(os.tmpdir(), `corrupt-prod-${Date.now()}.json`);
    fs.writeFileSync(corruptFile, '{"broken_json": INVALID', 'utf8');

    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      assert.throws(
        () => {
          safeReadJsonSync(corruptFile, {}, true);
        },
        (err: any) => {
          return err.message.includes('Refusing to start clean or overwrite');
        }
      );
    } finally {
      process.env.NODE_ENV = origEnv;
      if (fs.existsSync(corruptFile)) {
        fs.unlinkSync(corruptFile);
      }
    }
  });

  await t.test('DataStore Production Fail-Closed: throws on corrupted snapshot to prevent data overwrite', () => {
    const tempProdDir = path.join(os.tmpdir(), `datastore-failclosed-test-${Date.now()}`);
    fs.mkdirSync(tempProdDir, { recursive: true });
    const corruptStorePath = path.join(tempProdDir, 'skyops_store.json');
    fs.writeFileSync(corruptStorePath, '{ broken: true, invalid json', 'utf8');

    const origEnv = process.env.NODE_ENV;
    const origDataDir = process.env.SKYOPS_DATA_DIR;

    try {
      process.env.NODE_ENV = 'production';
      process.env.SKYOPS_DATA_DIR = tempProdDir;
      resetPersistenceConfig();

      assert.throws(
        () => {
          new DataStore();
        },
        (err: any) => {
          return (
            err.message.includes('[DataStore] Fatal Startup Error') &&
            err.message.includes('Refusing to start clean or overwrite')
          );
        }
      );
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origDataDir !== undefined) {
        process.env.SKYOPS_DATA_DIR = origDataDir;
      } else {
        delete process.env.SKYOPS_DATA_DIR;
      }
      resetPersistenceConfig();
      fs.rmSync(tempProdDir, { recursive: true, force: true });
    }
  });

  await t.test('Services utilize centralized persistence paths', () => {
    const storePath = (new DataStore() as any).getStoragePath();
    assert.ok(storePath);
    assert.ok(!storePath.includes('undefined'));

    const auditPath = auditService.getDataFilePath();
    assert.ok(auditPath);

    const webhookPath = webhookService.getDataFilePath();
    assert.ok(webhookPath);

    const notificationPath = incidentNotificationService.getStoragePath();
    assert.ok(notificationPath);
  });
});
