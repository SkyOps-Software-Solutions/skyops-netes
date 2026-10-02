/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SkyOps Enterprise Types: Multi-Cluster, Cost Intelligence, Security Posture, RBAC & Governance
 */

import { AIRiskLevel, CanonicalRemediationActionType } from './index';

// ==========================================
// 1. MULTI-CLUSTER MANAGEMENT & HEALTH
// ==========================================

export type ClusterEnvironment = 'production' | 'staging' | 'development' | string;
export type CloudProvider = 'aws' | 'gcp' | 'azure' | 'kind' | 'bare-metal' | 'on-prem' | string;

export interface ClusterHierarchyGroup {
  environment: ClusterEnvironment;
  environmentLabel: string;
  clusterCount: number;
  healthyCount: number;
  clusters: ClusterHealthSummary[];
}

export interface ClusterHealthSummary {
  id: string;
  orgId: string;
  name: string;
  displayName: string;
  environment: ClusterEnvironment;
  provider: CloudProvider;
  region: string;
  k8sVersion: string;
  agentVersion: string;
  connectionStatus: 'connected' | 'offline' | 'disconnected' | 'degraded' | 'stale';
  healthStatus: 'Healthy' | 'Warning' | 'Critical' | 'Agent Offline';
  lastHeartbeat?: number;
  lastHeartbeatFormatted?: string;
  lastTelemetryReceived?: number;
  lastTelemetryFormatted?: string;
  nodeCount: number;
  nodes?: number;
  workloadCount: number;
  workloads?: number;
  podCount: number;
  activeIncidents: number;
  criticalIncidents: number;
  cpuUtilizationPercent: number;
  memoryUtilizationPercent: number;
  agentHealth: 'Connected' | 'Disconnected' | 'Stale' | 'Reconnecting';
  lastTelemetryAgo?: string;
  clusterStatus?: string;
  isSimulated?: boolean;
}

// ==========================================
// 2. MULTI-CLUSTER INCIDENT FILTERING
// ==========================================

export interface MultiClusterIncidentFilters {
  orgId?: string;
  clusterId?: string;
  environment?: string;
  namespace?: string;
  workload?: string;
  service?: string;
  severity?: string;
  status?: string;
  incidentType?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface IncidentMultiClusterSummary {
  total: number;
  byEnvironment: {
    production: number;
    staging: number;
    development: number;
    [env: string]: number;
  };
  byCluster: Record<string, { name: string; count: number; critical: number }>;
  bySeverity: {
    CRITICAL: number;
    HIGH: number;
    MEDIUM: number;
    LOW: number;
    INFO: number;
  };
}

// ==========================================
// 3. KUBERNETES COST INTELLIGENCE
// ==========================================

export interface CostOverview {
  estimatedMonthlyCostUsd: number;
  potentialMonthlySavingsUsd: number;
  cpuWastePercent: number;
  memoryWastePercent: number;
  idleWorkloadsCount: number;
  calculatedAt: number;
  currency: string;
  pricingBasis: {
    cpuCoreHourUsd: number; // default $0.040/core-hr
    memoryGibHourUsd: number; // default $0.005/GiB-hr
    source: 'PROVIDER_INTEGRATED' | 'ESTIMATED_BASELINE';
  };
  isEstimate: boolean;
  estimateDisclaimer: string;
}

export interface CostAllocationItem {
  id: string;
  name: string;
  type: 'cluster' | 'namespace' | 'workload' | 'service' | 'environment' | 'team';
  monthlyCostUsd: number;
  previousMonthCostUsd?: number;
  trendPercentage?: number;
  potentialSavingsUsd: number;
  cpuRequestedCores: number;
  cpuUsedCores: number;
  memoryRequestedGib: number;
  memoryUsedGib: number;
  wastePercent: number;
  workloadCount?: number;
  clusterName?: string;
  namespace?: string;
}

export interface CostAllocationBreakdown {
  byCluster: CostAllocationItem[];
  byNamespace: CostAllocationItem[];
  byWorkload: CostAllocationItem[];
  byService: CostAllocationItem[];
  byEnvironment: CostAllocationItem[];
  byTeam: CostAllocationItem[];
}

export interface ResourceRightsizingRecommendation {
  id: string;
  orgId: string;
  clusterId: string;
  clusterName: string;
  namespace: string;
  workloadName: string;
  workloadKind: 'Deployment' | 'StatefulSet' | 'DaemonSet';
  containerName: string;
  currentCpuRequested: string; // e.g. "8 cores" (8000m)
  averageCpuUsed: string; // e.g. "2.1 cores" (2100m)
  currentMemoryRequested: string; // e.g. "16Gi"
  averageMemoryUsed: string; // e.g. "5.2Gi"
  recommendedCpu: string; // e.g. "4 cores"
  recommendedMemory: string; // e.g. "8Gi"
  estimatedMonthlySavingsUsd: number;
  confidencePercent: number; // e.g. 91%
  risk: AIRiskLevel; // LOW, MEDIUM, HIGH
  reason: string;
  rollbackAvailable: boolean;
  status: 'PENDING_REVIEW' | 'APPLIED' | 'DISMISSED';
  appliedAt?: number;
  remediationActionId?: string;
}

export type CostWasteCategory =
  | 'IDLE_WORKLOAD'
  | 'OVERPROVISIONED_CPU'
  | 'OVERPROVISIONED_MEMORY'
  | 'EXCESSIVE_REPLICAS'
  | 'UNUSED_NAMESPACE'
  | 'LOW_UTILIZATION_NODE'
  | 'OVERSIZED_NODE_POOL'
  | 'UNATTACHED_STORAGE'
  | 'DEV_OFF_HOURS_RUNNING';

export interface CostWasteItem {
  id: string;
  category: CostWasteCategory;
  title: string;
  description: string;
  clusterId: string;
  clusterName: string;
  namespace?: string;
  resourceKind?: string;
  resourceName?: string;
  averageUtilizationPercent?: number;
  currentReplicas?: number;
  recommendedReplicas?: number;
  potentialMonthlyWasteUsd: number;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  recommendedAction: string;
  canSafelyDownscale: boolean;
}

export interface CostSavingsTracking {
  estimatedOpportunityUsd: number;
  projectedSavingsUsd: number;
  implementedSavingsUsd: number;
  verifiedSavingsUsd: number;
  realizedSavingsUsd: number;
  pendingReviewSavingsUsd: number;
  distinctionNote?: string;
  trackingBreakdown: Array<{
    month: string;
    implemented: number;
    verified: number;
    realized: number;
  }>;
}

// ==========================================
// 4. SECURITY POSTURE & GOVERNANCE
// ==========================================

export type SecuritySeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type SecurityFindingCategory =
  | 'PRIVILEGED_CONTAINER'
  | 'ROOT_CONTAINER'
  | 'DANGEROUS_CAPABILITIES'
  | 'HOST_NETWORK'
  | 'HOST_PID'
  | 'HOST_PATH_VOLUME'
  | 'EXCESSIVE_RBAC'
  | 'EXPOSED_SERVICE'
  | 'MISSING_NETWORK_POLICY'
  | 'INSECURE_CONFIGURATION'
  | 'MISSING_RESOURCE_LIMITS'
  | 'PLAIN_TEXT_SECRET';

export interface SecurityFinding {
  id: string;
  orgId: string;
  clusterId: string;
  clusterName: string;
  namespace: string;
  resourceKind: string;
  resourceName: string;
  containerName?: string;
  category: SecurityFindingCategory;
  title: string;
  severity: SecuritySeverity;
  riskDescription: string;
  risk?: string;
  recommendedRemediation: string;
  recommendedFix?: string;
  safetyCheckPassed?: boolean;
  complianceStandards: string[]; // e.g. ["CIS Kubernetes 5.2.1", "NSA-CISA v1.2", "SOC 2 CC6.1"]
  status: 'OPEN' | 'IN_REMEDIATION' | 'RESOLVED' | 'SUPPRESSED';
  firstDetectedAt: number;
  lastDetectedAt: number;
  remediationPlan?: {
    actionType: CanonicalRemediationActionType | string;
    fieldPath: string;
    currentValue: string;
    proposedValue: string;
    safetyChecksPassed: boolean;
    requiresApproval: boolean;
    rollbackSupported: boolean;
  };
}

export interface SecurityPolicyRule {
  id: string;
  key: string;
  title: string;
  description: string;
  severity: SecuritySeverity;
  enabled: boolean;
  enforcementMode: 'AUDIT' | 'ENFORCE'; // AUDIT generates findings; ENFORCE can block deployment gate
  targetEnvironments: ClusterEnvironment[]; // e.g. ['production']
  config?: Record<string, unknown>;
}

export interface SecurityPostureOverview {
  overallScore: number; // 0 to 100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  countsBySeverity: {
    CRITICAL: number;
    HIGH: number;
    MEDIUM: number;
    LOW: number;
    TOTAL: number;
  };
  criticalCount?: number;
  highCount?: number;
  mediumCount?: number;
  lowCount?: number;
  policyViolationsCount: number;
  scannedWorkloadsCount: number;
  compliantWorkloadsCount: number;
  lastScannedAt: number;
}

// ==========================================
// 5. RBAC & PERMISSION MATRIX
// ==========================================

export type EnterpriseRole =
  | 'OWNER'
  | 'ADMIN'
  | 'SRE'
  | 'DEVELOPER'
  | 'VIEWER'
  | 'AUDITOR'
  | 'OPERATOR' // legacy alias for SRE
  | 'ENGINEER'; // legacy alias for DEVELOPER

export type EnterprisePermission =
  | 'incident.view'
  | 'telemetry.view'
  | 'incident.heal'
  | 'remediation.approve'
  | 'policy.autoheal.manage'
  | 'policy.security.manage'
  | 'cost.view'
  | 'cost.optimize'
  | 'cluster.manage'
  | 'team.manage'
  | 'audit.view'
  | 'org.manage';

export interface RoleCapabilitySummary {
  role: EnterpriseRole;
  displayName: string;
  description: string;
  can: string[];
  cannot: string[];
  permissions: EnterprisePermission[];
}

// ==========================================
// 6. ENTERPRISE AUDIT & DATA RETENTION
// ==========================================

export type EnterpriseAuditAction =
  | 'auth.login'
  | 'auth.logout'
  | 'cluster.create'
  | 'cluster.delete'
  | 'cluster.token_rotate'
  | 'cluster.disconnect'
  | 'policy.autoheal_changed'
  | 'policy.security_changed'
  | 'remediation.proposed'
  | 'remediation.approve'
  | 'remediation.execute'
  | 'remediation.rollback'
  | 'cost.optimization_applied'
  | 'security.finding_remediated'
  | 'member.invite'
  | 'member.role_change'
  | 'member.remove'
  | 'org.settings_updated'
  | 'retention.settings_updated';

export interface EnterpriseAuditRecord {
  id: string;
  timestamp: number;
  timestampFormatted?: string;
  orgId: string;
  actor: {
    id: string;
    name: string;
    email: string;
    role?: EnterpriseRole;
    type: 'HUMAN' | 'AGENT' | 'SYSTEM' | 'AI';
  };
  action: EnterpriseAuditAction | string;
  target: {
    type: 'CLUSTER' | 'INCIDENT' | 'REMEDIATION' | 'POLICY' | 'USER' | 'COST' | 'SECURITY' | 'ORGANIZATION';
    id: string;
    name?: string;
    clusterId?: string;
    namespace?: string;
  };
  result: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
  metadata?: Record<string, unknown>;
  hash?: string;
  prevHash?: string;
}

export interface EnterpriseRetentionSettings {
  incidentRetentionDays: number; // default 90 days
  auditLogsRetentionDays: number; // default 365 days (1 year)
  telemetryRetentionDays: number; // default 30 days
  updatedAt: number;
  updatedBy?: { id: string; name: string };
  neverDeleteProduction: boolean;
}
