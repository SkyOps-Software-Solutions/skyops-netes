// ==============================================================================
// SkyOps Commercial Licensing - Type Definitions
// ==============================================================================

export type LicenseEdition = 'COMMUNITY' | 'PRO' | 'ENTERPRISE';

export type CommercialFeature =
  | 'advanced_cost_intelligence'
  | 'advanced_ai_recommendations'
  | 'advanced_integrations'
  | 'enterprise_rbac'
  | 'sso_oidc'
  | 'custom_reporting'
  | 'unlimited_retention'
  | 'autonomous_remediation'
  | 'sla_guarantees';

export interface LicensePayload {
  version: string;
  licenseId: string;
  organizationId: string;
  customerName: string;
  edition: LicenseEdition;
  issuedAt: string; // ISO-8601
  expiresAt: string | null; // ISO-8601 or null for perpetual
  isPerpetual: boolean;
  maxClusters: number; // -1 for unlimited
  maxNodes: number; // -1 for unlimited
  features: CommercialFeature[];
  metadata?: Record<string, unknown>;
}

export interface SignedLicense extends LicensePayload {
  signature: string; // Base64 encoded Ed25519 signature
}

export type LicenseValidationStatus =
  | 'ACTIVE'
  | 'EXPIRED'
  | 'INVALID_SIGNATURE'
  | 'MALFORMED'
  | 'NOT_YET_VALID'
  | 'COMMUNITY_DEFAULT';

export interface LicenseVerificationResult {
  valid: boolean;
  status: LicenseValidationStatus;
  edition: LicenseEdition;
  license?: SignedLicense;
  customerName: string;
  organizationId?: string;
  issuedAt?: string;
  expiresAt?: string | null;
  isPerpetual: boolean;
  daysRemaining?: number;
  isExpired: boolean;
  isExpiringSoon: boolean; // within 30 days
  maxClusters: number;
  maxNodes: number;
  features: CommercialFeature[];
  error?: string;
}

export interface FeatureEntitlementCheck {
  allowed: boolean;
  edition: LicenseEdition;
  feature?: CommercialFeature;
  currentCount?: number;
  limitCount?: number;
  reason?: string;
}
