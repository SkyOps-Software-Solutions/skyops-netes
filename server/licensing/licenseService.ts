import fs from 'node:fs';
import path from 'node:path';
import {
  CommercialFeature,
  FeatureEntitlementCheck,
  LicenseEdition,
  LicensePayload,
  LicenseVerificationResult,
  SignedLicense
} from './types';
import { verifyLicenseSignature } from './crypto';
import { store } from '../store';
import { auditService } from '../audit';

// Fallback license storage file on host
const DEFAULT_LICENSE_FILE = process.env.LOCAL_STORAGE_PATH
  ? path.join(process.env.LOCAL_STORAGE_PATH, 'license.json')
  : path.join(process.cwd(), 'data', 'license.json');

export class LicenseService {
  private activeLicense: SignedLicense | null = null;
  private verificationCache: LicenseVerificationResult | null = null;
  private verificationCacheTimestamp = 0;
  private readonly CACHE_TTL_MS = 60 * 1000; // 1 minute cache

  constructor() {
    this.loadPersistedLicense();
  }

  /**
   * Loads any previously installed license from filesystem or environment.
   */
  public loadPersistedLicense(): void {
    try {
      if (process.env.SKYOPS_LICENSE_DATA) {
        const parsed = JSON.parse(process.env.SKYOPS_LICENSE_DATA);
        if (this.validateLicenseFormat(parsed)) {
          this.activeLicense = parsed;
          this.invalidateCache();
          return;
        }
      }

      if (fs.existsSync(DEFAULT_LICENSE_FILE)) {
        const raw = fs.readFileSync(DEFAULT_LICENSE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (this.validateLicenseFormat(parsed)) {
          this.activeLicense = parsed;
          this.invalidateCache();
        }
      }
    } catch (err: any) {
      console.warn('[LicenseService] Notice: Could not load initial license file:', err?.message || err);
    }
  }

  /**
   * Validates structure and field types of raw license payload.
   */
  public validateLicenseFormat(obj: any): obj is SignedLicense {
    if (!obj || typeof obj !== 'object') return false;
    if (typeof obj.version !== 'string' || obj.version !== '1.0') return false;
    if (typeof obj.licenseId !== 'string' || !obj.licenseId.trim()) return false;
    if (typeof obj.customerName !== 'string' || !obj.customerName.trim()) return false;
    if (!['COMMUNITY', 'PRO', 'ENTERPRISE'].includes(obj.edition)) return false;
    if (typeof obj.issuedAt !== 'string') return false;
    if (typeof obj.isPerpetual !== 'boolean') return false;
    if (typeof obj.maxClusters !== 'number') return false;
    if (typeof obj.maxNodes !== 'number') return false;
    if (!Array.isArray(obj.features)) return false;
    if (typeof obj.signature !== 'string' || !obj.signature.trim()) return false;
    return true;
  }

  /**
   * Evaluates the active license locally with Ed25519 cryptographic signature check.
   * Completely offline — never dials any external vendor server.
   */
  public getVerificationResult(customLicense?: SignedLicense): LicenseVerificationResult {
    const license = customLicense || this.activeLicense;

    // Cache lookup for active license
    if (!customLicense && this.verificationCache && Date.now() - this.verificationCacheTimestamp < this.CACHE_TTL_MS) {
      return this.verificationCache;
    }

    // Default: Unlicensed Community Edition
    if (!license) {
      const communityResult: LicenseVerificationResult = {
        valid: true,
        status: 'COMMUNITY_DEFAULT',
        edition: 'COMMUNITY',
        customerName: 'SkyOps Community User',
        isPerpetual: true,
        isExpired: false,
        isExpiringSoon: false,
        maxClusters: 3,
        maxNodes: 30,
        features: []
      };
      if (!customLicense) {
        this.verificationCache = communityResult;
        this.verificationCacheTimestamp = Date.now();
      }
      return communityResult;
    }

    // 1. Verify Structure
    if (!this.validateLicenseFormat(license)) {
      return {
        valid: false,
        status: 'MALFORMED',
        edition: 'COMMUNITY',
        customerName: (license as any)?.customerName || 'Unknown',
        isPerpetual: false,
        isExpired: true,
        isExpiringSoon: false,
        maxClusters: 3,
        maxNodes: 30,
        features: [],
        error: 'The provided license file is malformed or missing mandatory signature fields.'
      };
    }

    // 2. Cryptographic Ed25519 Signature Verification
    const isSignatureValid = verifyLicenseSignature(license);
    if (!isSignatureValid) {
      return {
        valid: false,
        status: 'INVALID_SIGNATURE',
        edition: 'COMMUNITY',
        customerName: license.customerName,
        isPerpetual: false,
        isExpired: true,
        isExpiringSoon: false,
        maxClusters: 3,
        maxNodes: 30,
        features: [],
        error: 'Digital signature verification failed. The license may have been modified, forged, or signed with an unrecognized key.'
      };
    }

    // 3. Expiration Check
    const now = Date.now();
    let isExpired = false;
    let daysRemaining = undefined;
    let isExpiringSoon = false;

    if (!license.isPerpetual && license.expiresAt) {
      const expiresTime = Date.parse(license.expiresAt);
      if (isNaN(expiresTime)) {
        return {
          valid: false,
          status: 'MALFORMED',
          edition: 'COMMUNITY',
          customerName: license.customerName,
          isPerpetual: false,
          isExpired: true,
          isExpiringSoon: false,
          maxClusters: 3,
          maxNodes: 30,
          features: [],
          error: 'Invalid expiresAt date format in license.'
        };
      }

      if (now > expiresTime) {
        isExpired = true;
        daysRemaining = 0;
      } else {
        daysRemaining = Math.max(0, Math.ceil((expiresTime - now) / (1000 * 60 * 60 * 24)));
        isExpiringSoon = daysRemaining <= 30;
      }
    }

    const result: LicenseVerificationResult = {
      valid: true,
      status: isExpired ? 'EXPIRED' : 'ACTIVE',
      edition: license.edition,
      license,
      customerName: license.customerName,
      organizationId: license.organizationId,
      issuedAt: license.issuedAt,
      expiresAt: license.expiresAt,
      isPerpetual: license.isPerpetual,
      daysRemaining,
      isExpired,
      isExpiringSoon,
      maxClusters: license.maxClusters,
      maxNodes: license.maxNodes,
      features: isExpired ? [] : license.features, // Expired licenses lose commercial features but KEEP core access
      error: isExpired ? 'Your commercial license has expired. SkyOps is operating with Community entitlements. Existing data and core monitoring remain fully preserved.' : undefined
    };

    if (!customLicense) {
      this.verificationCache = result;
      this.verificationCacheTimestamp = Date.now();
    }

    return result;
  }

  /**
   * Imports and activates a new signed license.
   * Performs signature verification before saving.
   */
  public async importLicense(
    rawLicenseInput: string | Record<string, unknown> | SignedLicense,
    userId?: string,
    orgId?: string
  ): Promise<LicenseVerificationResult> {
    let parsed: any;
    try {
      parsed = typeof rawLicenseInput === 'string' ? JSON.parse(rawLicenseInput.trim()) : rawLicenseInput;
    } catch (err: any) {
      throw new Error(`Failed to parse license JSON: ${err.message}`);
    }

    const verification = this.getVerificationResult(parsed);
    if (!verification.valid || verification.status === 'INVALID_SIGNATURE' || verification.status === 'MALFORMED') {
      throw new Error(verification.error || 'Invalid license signature or structure.');
    }

    // Persist to memory and disk
    this.activeLicense = parsed;
    this.invalidateCache();

    try {
      const dir = path.dirname(DEFAULT_LICENSE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(DEFAULT_LICENSE_FILE, JSON.stringify(parsed, null, 2), { mode: 0o600 });
    } catch (err: any) {
      console.warn('[LicenseService] Notice: Could not persist license to disk:', err?.message || err);
    }

    // Save to PostgreSQL if available
    try {
      const persistence = store.getPersistence();
      if ((persistence as any).getPool) {
        const pool = (persistence as any).getPool();
        await pool.query(
          `INSERT INTO commercial_licenses 
             (id, organization_id, customer_name, edition, issued_at, expires_at, is_perpetual, max_clusters, max_nodes, features, raw_license, signature, status, imported_by_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (id) DO UPDATE SET
             edition = EXCLUDED.edition,
             expires_at = EXCLUDED.expires_at,
             max_clusters = EXCLUDED.max_clusters,
             max_nodes = EXCLUDED.max_nodes,
             features = EXCLUDED.features,
             raw_license = EXCLUDED.raw_license,
             signature = EXCLUDED.signature,
             status = EXCLUDED.status,
             imported_at = NOW()`,
          [
            parsed.licenseId,
            orgId || parsed.organizationId || null,
            parsed.customerName,
            parsed.edition,
            parsed.issuedAt,
            parsed.expiresAt,
            parsed.isPerpetual,
            parsed.maxClusters,
            parsed.maxNodes,
            JSON.stringify(parsed.features || []),
            JSON.stringify(parsed),
            parsed.signature,
            verification.status,
            userId || null
          ]
        );
      }
    } catch (err: any) {
      console.warn('[LicenseService] Notice: Could not record license in PostgreSQL:', err?.message || err);
    }

    if (userId && orgId) {
      auditService.record({
        orgId,
        actorId: userId,
        actorName: 'Administrator',
        actorType: 'USER',
        action: 'LICENSE_IMPORTED',
        resourceType: 'LICENSE',
        resourceId: parsed.licenseId,
        result: 'SUCCESS',
        details: { customerName: parsed.customerName, edition: parsed.edition }
      });
    }

    return this.getVerificationResult();
  }

  /**
   * Removes current commercial license and reverts to Community Edition.
   */
  public async removeLicense(userId?: string, orgId?: string): Promise<LicenseVerificationResult> {
    const oldId = this.activeLicense?.licenseId;
    this.activeLicense = null;
    this.invalidateCache();

    try {
      if (fs.existsSync(DEFAULT_LICENSE_FILE)) {
        fs.unlinkSync(DEFAULT_LICENSE_FILE);
      }
    } catch (err: any) {
      console.warn('[LicenseService] Notice: Could not delete license file:', err?.message || err);
    }

    if (userId && orgId && oldId) {
      auditService.record({
        orgId,
        actorId: userId,
        actorName: 'Administrator',
        actorType: 'USER',
        action: 'LICENSE_REMOVED',
        resourceType: 'LICENSE',
        resourceId: oldId,
        result: 'SUCCESS',
        details: { note: 'Commercial license removed. Reverted to Community Edition.' }
      });
    }

    return this.getVerificationResult();
  }

  /**
   * Validates if a new cluster can be registered under current license limits.
   */
  public checkClusterEntitlement(currentClusters: number): FeatureEntitlementCheck {
    const res = this.getVerificationResult();
    const limit = res.maxClusters;

    if (limit === -1) {
      return { allowed: true, edition: res.edition, currentCount: currentClusters, limitCount: limit };
    }

    if (currentClusters >= limit) {
      return {
        allowed: false,
        edition: res.edition,
        currentCount: currentClusters,
        limitCount: limit,
        reason: `Cluster limit reached for ${res.edition} edition (${currentClusters}/${limit} clusters). Please upgrade your commercial license to add more clusters.`
      };
    }

    return { allowed: true, edition: res.edition, currentCount: currentClusters, limitCount: limit };
  }

  /**
   * Validates if a monitored node count can be accommodated under current license limits.
   */
  public checkNodeEntitlement(currentNodes: number, incomingNodes: number): FeatureEntitlementCheck {
    const res = this.getVerificationResult();
    const limit = res.maxNodes;
    const projected = currentNodes + incomingNodes;

    if (limit === -1) {
      return { allowed: true, edition: res.edition, currentCount: currentNodes, limitCount: limit };
    }

    if (projected > limit) {
      return {
        allowed: false,
        edition: res.edition,
        currentCount: currentNodes,
        limitCount: limit,
        reason: `Node limit reached for ${res.edition} edition (${projected}/${limit} nodes). Core monitoring will continue for existing nodes, but please upgrade your commercial license to monitor additional nodes.`
      };
    }

    return { allowed: true, edition: res.edition, currentCount: currentNodes, limitCount: limit };
  }

  /**
   * Checks if an advanced commercial feature is enabled and entitled.
   */
  public isFeatureEntitled(feature: CommercialFeature): boolean {
    const res = this.getVerificationResult();
    if (res.isExpired) {
      return false; // Expired licenses lose commercial features, but keep core monitoring
    }
    return res.features.includes(feature);
  }

  public invalidateCache(): void {
    this.verificationCache = null;
    this.verificationCacheTimestamp = 0;
  }
}

export const licenseService = new LicenseService();
