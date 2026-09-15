import {
  IncidentSeverity,
  IncidentType,
  KubernetesResource,
  TechnicalDetails
} from '../../src/types/index';

/**
 * SkyOps 7-Tier Provenance & Intelligence Categorization
 */
export type SignalCategory =
  | 'FACT'
  | 'DERIVED_FACT'
  | 'INFERENCE'
  | 'HYPOTHESIS'
  | 'RECOMMENDATION'
  | 'EXECUTABLE_ACTION'
  | 'VERIFIED_RESULT';

export type HypothesisStatus =
  | 'CONFIRMED'
  | 'PLAUSIBLE'
  | 'REFUTED'
  | 'INSUFFICIENT_EVIDENCE';

export interface CorrelatedSignal {
  id: string;
  category: SignalCategory;
  source: 'kubelet' | 'events' | 'metrics' | 'spec' | 'status' | 'engine';
  resourceKind: string;
  resourceName: string;
  namespace?: string;
  property: string;
  value: unknown;
  description: string;
  timestamp: number;
  weight?: number; // 1 to 5 relative significance
}

export type ResourceRelationType =
  | 'OWNED_BY'
  | 'SCHEDULED_ON'
  | 'MOUNTS_PVC'
  | 'BACKED_BY_STORAGE_CLASS'
  | 'EXPOSED_BY_SERVICE'
  | 'ROUTES_TO_POD'
  | 'BACKED_BY_ENDPOINTS'
  | 'CONTROLS_POD'
  | 'PEER_ON_NODE';

export interface ResourceRelationship {
  source: {
    kind: string;
    name: string;
    namespace?: string;
    status?: string;
  };
  target: {
    kind: string;
    name: string;
    namespace?: string;
    status?: string;
  };
  relation: ResourceRelationType;
  details?: string;
  isImpacted?: boolean;
}

export interface EvidencePoint {
  id: string;
  signalId?: string;
  description: string;
  source: string;
  weight: number; // positive for supporting, negative for contradicting
  timestamp?: number;
}

export interface RootCauseHypothesis {
  id: string;
  title: string;
  category: string;
  description: string;
  score: number; // 0 to 100
  status: HypothesisStatus;
  supportingEvidence: EvidencePoint[];
  contradictingEvidence: EvidencePoint[];
  whySelectedOrRejected: string;
}

export interface CorrelatedTimelineEvent {
  id: string;
  timestamp: number;
  title: string;
  category: SignalCategory;
  description: string;
  source: string;
  resourceKind: string;
  resourceName: string;
}

export interface ExplainabilityReport {
  whySelected: string;
  rejectedAlternatives: Array<{
    id: string;
    title: string;
    reason: string;
    score: number;
  }>;
  evidenceSummary: {
    factCount: number;
    derivedFactCount: number;
    inferenceCount: number;
    supportingScore: number;
    contradictingScore: number;
  };
  missingEvidence?: string[];
}

export interface ExecutableActionProposal {
  actionType: string;
  targetResource: {
    kind: string;
    name: string;
    namespace: string;
    container?: string;
  };
  fieldPath: string;
  currentValue: string;
  proposedValue: string;
  isExecutable: boolean;
  reason: string;
}

// ==========================================
// Phase 2B: Baselines, Anomalies, Changes, Temporal & Unified Evidence Types
// ==========================================

export type BaselineScope = 'cluster' | 'node' | 'workload' | 'pod' | 'container';

export type BaselineMetric =
  | 'cpu_usage'
  | 'memory_usage'
  | 'restart_rate'
  | 'replica_availability'
  | 'node_pressure'
  | 'event_frequency'
  | 'error_frequency';

export type BaselineQuality = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';

export interface HistoricalBaseline {
  baselineId: string;
  scope: BaselineScope;
  resourceKind: string;
  resourceName: string;
  namespace?: string;
  clusterId: string;
  metric: BaselineMetric;
  timeWindow: string; // '15m' | '1h' | '6h' | '24h' | '7d'
  sampleCount: number;
  centralValue: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
  p95: number;
  calculationMethod: 'rolling_statistics' | 'spike_preserving_percentiles';
  quality: BaselineQuality;
  calculatedAt: number;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  unavailableReason?: string;
  unit: string; // e.g. 'millicores', 'bytes', 'percent', 'restarts/hr', 'events/hr'
}

export type AnomalyType =
  | 'CPU_SPIKE'
  | 'CPU_SUSTAINED_HIGH'
  | 'MEMORY_SPIKE'
  | 'MEMORY_SUSTAINED_HIGH'
  | 'MEMORY_GROWTH'
  | 'RESTART_SPIKE'
  | 'REPLICA_DEGRADATION'
  | 'NODE_PRESSURE'
  | 'EVENT_RATE_ANOMALY'
  | 'ERROR_RATE_ANOMALY';

export type AnomalyStatus = 'ACTIVE' | 'RECOVERED' | 'SUPPRESSED';

export interface DetectedAnomaly {
  id: string;
  orgId: string;
  clusterId: string;
  resourceId: string;
  resourceKind: string;
  resourceName: string;
  namespace?: string;
  metric: string;
  anomalyType: AnomalyType;
  observedValue: number;
  observedDisplay: string;
  baselineValue?: number;
  baselineDisplay?: string;
  deviation: number;
  deviationDisplay: string;
  detectionWindow: string;
  firstObservedAt: number;
  lastObservedAt: number;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  confidence: number;
  evidenceReferences: string[];
  status: AnomalyStatus;
  details?: string;
}

export type ChangeType =
  | 'IMAGE_UPDATE'
  | 'REPLICA_COUNT'
  | 'RESOURCE_LIMITS'
  | 'NODE_CONDITION'
  | 'REVISION_UPDATE'
  | 'CONFIGURATION';

export interface ResourceChangeRecord {
  id: string;
  orgId: string;
  clusterId: string;
  resourceKind: string;
  resourceName: string;
  namespace?: string;
  changeType: ChangeType;
  attribute: string;
  oldValue: unknown;
  newValue: unknown;
  description: string;
  timestamp: number;
}

export interface ChangeCorrelation {
  change: ResourceChangeRecord;
  targetResource: { kind: string; name: string; namespace?: string };
  relationship: 'SAME_RESOURCE' | 'CONTROLLER' | 'HOST_NODE' | 'DEPENDENT';
  temporalProximityMs: number;
  temporalProximityDisplay: string;
  correlationStrength: 'STRONG' | 'MODERATE' | 'WEAK';
  confidence: number;
  explanation: string;
}

export type TimelinePhase = 'BEFORE' | 'DURING' | 'AFTER';

export interface TemporalEvent extends CorrelatedTimelineEvent {
  phase: TimelinePhase;
  relevanceScore?: number;
  changeRef?: string;
  anomalyRef?: string;
}

export type UnifiedEvidenceType =
  | 'metric'
  | 'log'
  | 'event'
  | 'resource_state'
  | 'relationship'
  | 'anomaly'
  | 'historical_observation'
  | 'change'
  | 'correlation';

export interface UnifiedEvidence {
  evidenceId: string;
  type: UnifiedEvidenceType;
  source: string;
  timestamp: number;
  resourceKind: string;
  resourceName: string;
  namespace?: string;
  relevance: 'SUPPORTING' | 'CONTRADICTING' | 'CONTEXTUAL';
  confidence: number;
  title: string;
  description: string;
  rawPayload?: unknown;
  details?: Record<string, unknown>;
}

export interface IntelligenceAnalysis {
  incidentId: string;
  incidentType: IncidentType;
  fingerprint: string;
  clusterId: string;
  clusterName: string;
  analyzedAt: number;
  rootCause: string;
  rootCauseCategory: string;
  confidence: number; // 0.0 to 1.0
  confidenceLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  confidenceExplanation: string;
  primaryHypothesis: RootCauseHypothesis | null;
  evaluatedHypotheses: RootCauseHypothesis[];
  signals: CorrelatedSignal[];
  relationships: ResourceRelationship[];
  correlatedTimeline: CorrelatedTimelineEvent[];
  explainability: ExplainabilityReport;
  recommendation: string;
  executableProposal?: ExecutableActionProposal;
  isUnknownOrInconclusive: boolean;
  // Phase 2B additions
  baselines?: HistoricalBaseline[];
  anomalies?: DetectedAnomaly[];
  correlatedChanges?: ChangeCorrelation[];
  temporalPhases?: {
    before: TemporalEvent[];
    during: TemporalEvent[];
    after: TemporalEvent[];
  };
  unifiedEvidence?: UnifiedEvidence[];
  unknownFactors?: string[];
}
