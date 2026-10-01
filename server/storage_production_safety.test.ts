import assert from 'node:assert/strict';
import test from 'node:test';
import { StorageService } from './storage/storageService';
import { CloudStorageDriver } from './storage/drivers/CloudStorageDriver';

test('production storage configuration does not silently use memory fallback', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const service = new StorageService({ bucketName: 'example.appspot.com' });
    const driver = (service as any).driver as CloudStorageDriver;
    assert.equal((driver as any).useFallbackOnFailure, false);
  } finally {
    process.env.NODE_ENV = previous;
  }
});
