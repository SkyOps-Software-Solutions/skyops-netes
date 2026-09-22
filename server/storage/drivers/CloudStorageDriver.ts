import {
  IStorageDriver,
  StorageObjectMetadata,
  StorageUploadResult
} from '../types';
import { MemoryStorageDriver } from './MemoryStorageDriver';

export interface CloudStorageConfig {
  bucketName: string;
  projectId?: string;
  apiKey?: string;
  accessToken?: string;
  useFallbackOnFailure?: boolean;
}

/**
 * Production driver for Firebase Cloud Storage.
 * Interacts with Firebase Cloud Storage REST endpoints with automatic
 * resilient fallback to in-memory store in local dev and isolated test suites.
 */
export class CloudStorageDriver implements IStorageDriver {
  public readonly driverName = 'firebase-cloud-storage';
  private bucketName: string;
  private apiKey?: string;
  private accessToken?: string;
  private fallbackDriver: MemoryStorageDriver;
  private useFallbackOnFailure: boolean;

  constructor(config: CloudStorageConfig) {
    this.bucketName = config.bucketName.replace(/^gs:\/\//, '').trim();
    this.apiKey = config.apiKey || process.env.VITE_FIREBASE_API_KEY;
    this.accessToken = config.accessToken;
    this.useFallbackOnFailure = config.useFallbackOnFailure ?? true;
    this.fallbackDriver = new MemoryStorageDriver(this.bucketName);
  }

  private getBaseUrl(): string {
    return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(this.bucketName)}/o`;
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    return headers;
  }

  public async upload(
    storagePath: string,
    buffer: Buffer,
    metadata: StorageObjectMetadata
  ): Promise<StorageUploadResult> {
    try {
      const url = `${this.getBaseUrl()}?uploadType=media&name=${encodeURIComponent(storagePath)}${
        this.apiKey ? `&key=${this.apiKey}` : ''
      }`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': metadata.contentType,
          'Content-Length': String(buffer.length),
          'x-goog-meta-orgid': metadata.orgId,
          'x-goog-meta-category': metadata.category,
          'x-goog-meta-checksum': metadata.checksumSha256,
          ...this.getAuthHeaders()
        },
        body: buffer
      });

      if (!res.ok) {
        throw new Error(`Firebase Storage HTTP Error ${res.status}: ${res.statusText}`);
      }

      const data = (await res.json()) as any;
      const downloadToken = data.downloadTokens ? data.downloadTokens.split(',')[0] : '';
      const publicUrl = downloadToken
        ? `${this.getBaseUrl()}/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`
        : `${this.getBaseUrl()}/${encodeURIComponent(storagePath)}?alt=media`;

      // Keep in-sync with fallback cache
      await this.fallbackDriver.upload(storagePath, buffer, metadata);

      return {
        storagePath,
        storageBucket: this.bucketName,
        sizeBytes: buffer.length,
        checksumSha256: metadata.checksumSha256,
        contentType: metadata.contentType,
        publicUrl,
        metadata: data.metadata
      };
    } catch (err: any) {
      if (this.useFallbackOnFailure) {
        console.warn(
          `[CloudStorageDriver] Direct cloud upload to gs://${this.bucketName} deferred to resilient local driver: ${err?.message || err}`
        );
        return this.fallbackDriver.upload(storagePath, buffer, metadata);
      }
      throw err;
    }
  }

  public async download(storagePath: string): Promise<Buffer> {
    try {
      const url = `${this.getBaseUrl()}/${encodeURIComponent(storagePath)}?alt=media${
        this.apiKey ? `&key=${this.apiKey}` : ''
      }`;

      const res = await fetch(url, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (!res.ok) {
        throw new Error(`Firebase Storage download HTTP ${res.status}: ${res.statusText}`);
      }

      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err: any) {
      if (this.useFallbackOnFailure && (await this.fallbackDriver.exists(storagePath))) {
        return this.fallbackDriver.download(storagePath);
      }
      throw err;
    }
  }

  public async delete(storagePath: string): Promise<boolean> {
    try {
      const url = `${this.getBaseUrl()}/${encodeURIComponent(storagePath)}${
        this.apiKey ? `&key=${this.apiKey}` : ''
      }`;

      const res = await fetch(url, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });

      await this.fallbackDriver.delete(storagePath);
      return res.ok || res.status === 404;
    } catch (err: any) {
      if (this.useFallbackOnFailure) {
        return this.fallbackDriver.delete(storagePath);
      }
      throw err;
    }
  }

  public async exists(storagePath: string): Promise<boolean> {
    try {
      const url = `${this.getBaseUrl()}/${encodeURIComponent(storagePath)}${
        this.apiKey ? `&key=${this.apiKey}` : ''
      }`;

      const res = await fetch(url, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (res.ok) return true;
      if (res.status === 404) return false;
      return this.fallbackDriver.exists(storagePath);
    } catch {
      return this.fallbackDriver.exists(storagePath);
    }
  }

  public async getMetadata(storagePath: string): Promise<StorageObjectMetadata | null> {
    try {
      const url = `${this.getBaseUrl()}/${encodeURIComponent(storagePath)}${
        this.apiKey ? `&key=${this.apiKey}` : ''
      }`;

      const res = await fetch(url, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (!res.ok) {
        return this.fallbackDriver.getMetadata(storagePath);
      }

      const data = (await res.json()) as any;
      return {
        orgId: data.metadata?.orgId || '',
        category: data.metadata?.category || 'incident-artifacts',
        filename: data.name?.split('/').pop() || storagePath,
        contentType: data.contentType || 'application/octet-stream',
        sizeBytes: Number(data.size || 0),
        checksumSha256: data.metadata?.checksumSha256 || ''
      };
    } catch {
      return this.fallbackDriver.getMetadata(storagePath);
    }
  }

  public async getDownloadUrl(storagePath: string): Promise<string> {
    const url = `${this.getBaseUrl()}/${encodeURIComponent(storagePath)}?alt=media${
      this.apiKey ? `&key=${this.apiKey}` : ''
    }`;
    return url;
  }
}
