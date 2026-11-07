import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { IStorageDriver, StorageObjectMetadata, StorageUploadResult, StorageSecurityError } from '../types';

export interface LocalStorageDriverOptions {
  baseDir?: string;
  serverUrl?: string;
}

export class LocalStorageDriver implements IStorageDriver {
  public readonly driverName = 'local_filesystem';
  private baseDir: string;
  private serverUrl: string;

  constructor(options?: LocalStorageDriverOptions) {
    this.baseDir = path.resolve(
      options?.baseDir ||
        process.env.SKYOPS_STORAGE_DIR ||
        process.env.SKYOPS_DATA_DIR ||
        path.join(process.cwd(), 'data', 'artifacts')
    );
    this.serverUrl = options?.serverUrl || process.env.SKYOPS_SERVER_URL || '';

    if (!fs.existsSync(this.baseDir)) {
      try {
        fs.mkdirSync(this.baseDir, { recursive: true });
      } catch (err) {
        console.warn(`[LocalStorageDriver] Notice creating base storage dir (${this.baseDir}):`, err);
      }
    }
  }

  public getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * Safe path resolution with strict path traversal prevention.
   */
  private resolveSafePath(storagePath: string): string {
    const normalized = path.normalize(storagePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const absolute = path.resolve(this.baseDir, normalized);

    if (!absolute.startsWith(this.baseDir)) {
      throw new StorageSecurityError('Storage path traversal detected and blocked');
    }
    return absolute;
  }

  public async upload(
    storagePath: string,
    buffer: Buffer,
    metadata: StorageObjectMetadata
  ): Promise<StorageUploadResult> {
    const fullPath = this.resolveSafePath(storagePath);
    const parentDir = path.dirname(fullPath);

    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Write file content
    fs.writeFileSync(fullPath, buffer);

    // Write metadata sidecar
    const metaPath = `${fullPath}.meta.json`;
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

    const checksumSha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    return {
      storagePath,
      storageBucket: 'local-filesystem',
      sizeBytes: buffer.length,
      checksumSha256,
      contentType: metadata.contentType,
      publicUrl: this.serverUrl ? `${this.serverUrl}/api/v1/storage/raw/${encodeURIComponent(storagePath)}` : undefined,
      metadata: metadata.customMetadata
    };
  }

  public async download(storagePath: string): Promise<Buffer> {
    const fullPath = this.resolveSafePath(storagePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found at storage path: ${storagePath}`);
    }
    return fs.readFileSync(fullPath);
  }

  public async delete(storagePath: string): Promise<boolean> {
    const fullPath = this.resolveSafePath(storagePath);
    const metaPath = `${fullPath}.meta.json`;

    let deleted = false;
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      deleted = true;
    }
    if (fs.existsSync(metaPath)) {
      fs.unlinkSync(metaPath);
    }
    return deleted;
  }

  public async exists(storagePath: string): Promise<boolean> {
    const fullPath = this.resolveSafePath(storagePath);
    return fs.existsSync(fullPath);
  }

  public async getMetadata(storagePath: string): Promise<StorageObjectMetadata | null> {
    const fullPath = this.resolveSafePath(storagePath);
    const metaPath = `${fullPath}.meta.json`;

    if (!fs.existsSync(fullPath)) {
      return null;
    }

    if (fs.existsSync(metaPath)) {
      try {
        const raw = fs.readFileSync(metaPath, 'utf-8');
        return JSON.parse(raw);
      } catch {
        // Fall back to stat
      }
    }

    const stat = fs.statSync(fullPath);
    const buffer = fs.readFileSync(fullPath);
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    return {
      orgId: 'unknown',
      category: 'general' as any,
      filename: path.basename(storagePath),
      contentType: 'application/octet-stream',
      sizeBytes: stat.size,
      checksumSha256: checksum
    };
  }

  public async getDownloadUrl(storagePath: string): Promise<string> {
    return `/api/v1/storage/raw/${encodeURIComponent(storagePath)}`;
  }
}
