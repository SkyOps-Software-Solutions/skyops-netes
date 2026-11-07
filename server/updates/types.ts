// ==============================================================================
// SkyOps Secure Software Updates - Type Definitions
// ==============================================================================

export interface ReleaseImage {
  name: string;
  tag: string;
  digest: string;
}

export interface ReleaseMetadata {
  version: string;
  releaseDate: string; // ISO-8601
  channel: 'stable' | 'beta';
  minSupportedVersion: string;
  releaseNotes: string;
  images: ReleaseImage[];
  migrationsRequired: string[];
  breakingChanges: boolean;
  checksums: Record<string, string>;
  signature?: string; // Ed25519 digital signature
}

export type SoftwareUpdateOperationStatus =
  | 'IDLE'
  | 'CHECKING'
  | 'BACKUP_IN_PROGRESS'
  | 'MIGRATIONS_IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'ROLLED_BACK';

export interface SystemUpdateRecord {
  id: string;
  fromVersion: string;
  toVersion: string;
  status: SoftwareUpdateOperationStatus;
  preUpdateBackupPath?: string;
  details?: string;
  createdAt: string;
  completedAt?: string;
}

export interface UpdateStatusResponse {
  currentVersion: string;
  channel: 'stable' | 'beta';
  latestAvailableVersion: string | null;
  updateAvailable: boolean;
  releaseMetadata: ReleaseMetadata | null;
  canUpgradeDirectly: boolean;
  lastCheckedAt: string;
  inProgress: boolean;
  lastUpdateRecord?: SystemUpdateRecord;
}
