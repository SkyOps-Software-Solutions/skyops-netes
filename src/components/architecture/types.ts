import { KubernetesResource, Incident, Cluster } from '../../types/index';

export type ArchitectureDomainId =
  | 'compute'
  | 'workloads'
  | 'networking'
  | 'storage'
  | 'configuration'
  | 'scheduling'
  | 'scaling'
  | 'security';

export interface DomainCategoryBreakdown {
  kind: string;
  count: number;
  resources: KubernetesResource[];
}

export interface ArchitectureDomainSummary {
  id: ArchitectureDomainId;
  title: string;
  shortTitle: string;
  description: string;
  resourceCount: number;
  healthCounts: {
    healthy: number;
    warning: number;
    critical: number;
    unknown: number;
  };
  detectedHighlights: string[];
  categories: DomainCategoryBreakdown[];
  activeFeatures: string[];
  undetectedFeatures: string[];
  allResources: KubernetesResource[];
}

export interface SchedulingTelemetrySummary {
  nodesWithTaints: number;
  podsWithNodeSelector: number;
  podsWithAffinity: number;
  podsWithTolerations: number;
  podsWithTopologySpread: number;
  taints: Array<{ nodeName: string; key: string; value?: string; effect: string }>;
  nodeSelectors: Array<{ podName: string; namespace: string; selectors: Record<string, string> }>;
  affinities: Array<{ podName: string; namespace: string; kind: 'nodeAffinity' | 'podAffinity' | 'podAntiAffinity' }>;
  tolerations: Array<{ podName: string; namespace: string; key?: string; effect?: string }>;
  topologySpreadConstraints: Array<{ podName: string; namespace: string; topologyKey: string; maxSkew?: number }>;
}

export interface ScalingTelemetrySummary {
  hpas: KubernetesResource[];
  vpas: KubernetesResource[];
  clusterAutoscalerDetected: boolean;
  clusterAutoscalerEvidence?: string;
  totalDesiredReplicas: number;
  totalReadyReplicas: number;
  totalAvailableReplicas: number;
  workloadReplicas: Array<{
    name: string;
    kind: string;
    namespace: string;
    desired: number;
    ready: number;
    available: number;
    status: string;
  }>;
}

export interface SecurityTelemetrySummary {
  roles: KubernetesResource[];
  roleBindings: KubernetesResource[];
  clusterRoles: KubernetesResource[];
  clusterRoleBindings: KubernetesResource[];
  serviceAccounts: KubernetesResource[];
  networkPolicies: KubernetesResource[];
  podSecurityHighlights: {
    runAsNonRootCount: number;
    privilegedCount: number;
    readOnlyRootFilesystemCount: number;
    allowPrivilegeEscalationFalseCount: number;
    totalInspected: number;
  };
}

export interface ArchitectureTelemetryState {
  domains: Record<ArchitectureDomainId, ArchitectureDomainSummary>;
  totalResourceCount: number;
  freshness: 'LIVE' | 'STALE' | 'UNAVAILABLE';
  lastTelemetryTimestamp: number | null;
  ageSeconds: number | null;
  schedulingSummary: SchedulingTelemetrySummary;
  scalingSummary: ScalingTelemetrySummary;
  securitySummary: SecurityTelemetrySummary;
  activeIncidents: Incident[];
  incidentsByResourceKey: Map<string, Incident[]>;
}

export type ArchitectureViewMode = 'overview' | 'domain';
