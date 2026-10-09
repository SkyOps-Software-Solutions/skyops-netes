export type LogSeverity = 'FATAL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

export interface LogRecord {
  id: string;
  clusterId: string;
  clusterName?: string;
  namespace: string;
  workload: string;
  podName: string;
  container: string;
  nodeName?: string;
  severity: LogSeverity;
  timestamp: string; // ISO string
  timestampMs: number;
  message: string;
  raw: string;
  isRedacted?: boolean;
  isPrevious?: boolean;
}

export interface LogOverviewStats {
  totalVolumeMb: number;
  totalLogLines: number;
  errorCount: number;
  errorChangePercent: number; // e.g. +340
  warningCount: number;
  warningChangePercent: number; // e.g. +21
  activeAlertsCount: number;
  todayIngestionGb: number;
  projectedMonthlyGb: number;
  storageUsedGb: number;
  storageLimitGb: number;
  retentionDays: number;
  storageDaysRemaining: number;
  costOptimizationRecommendation?: string;
}

export interface PodLogSummary {
  name: string;
  errors: number;
  warnings: number;
  restarts: number;
  status: string;
  nodeName?: string;
}

export interface WorkloadLogSummary {
  workload: string;
  namespace: string;
  kind: string; // Deployment, StatefulSet, DaemonSet
  podCount: number;
  logsPerMinute: number;
  errorCount: number;
  warningCount: number;
  pods: PodLogSummary[];
}

export interface ErrorSpike {
  id: string;
  clusterId: string;
  namespace: string;
  workload: string;
  normalRatePerHour: number;
  currentRatePerHour: number;
  multiplier: number; // e.g. 60x
  spikeStartedAt: number; // timestamp ms
  detectedAt: number;
  topErrorPattern: string;
  affectedPodsCount: number;
  relatedDeployment?: {
    workload: string;
    revision: string;
    deployedAt: number;
    imageTag?: string;
    description?: string;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  };
  relatedIncidentId?: string;
}

export interface DeploymentLogComparison {
  workload: string;
  namespace: string;
  currentRevision: string;
  previousRevision: string;
  currentErrors: number;
  previousErrors: number;
  newErrorPatterns: string[];
  regressionDetected: boolean;
  verdict: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  timeWindowDescription: string;
}

export interface LogAlertRule {
  id: string;
  orgId: string;
  clusterId?: string;
  name: string;
  description?: string;
  namespace?: string;
  workload?: string;
  pattern: string; // substring or regex
  minSeverity?: LogSeverity;
  thresholdOccurrences: number; // e.g. 20
  windowMinutes: number; // e.g. 5
  createIncident: boolean;
  incidentSeverity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  notifyEmail?: boolean;
  notifyWebhook?: boolean;
  webhookUrl?: string;
  enabled: boolean;
  lastTriggeredAt?: number;
  triggerCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface LogAlertTriggerEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  clusterId: string;
  workload?: string;
  namespace?: string;
  pattern: string;
  occurrences: number;
  windowMinutes: number;
  triggeredAt: number;
  incidentId?: string;
  sampleLogs: Array<{ timestamp: string; podName: string; message: string }>;
}

export interface LogCollectionRule {
  id: string;
  orgId: string;
  name: string;
  clusterId: string;
  clusterName?: string;
  namespaces: string[]; // e.g. ['production', 'payments'] or ['*']
  workloadPatterns: string[]; // e.g. ['checkout-*', 'payment-*'] or ['*']
  containers: string[]; // ['All'] or specific
  minSeverity: LogSeverity; // e.g. 'INFO'
  retentionDays: number; // 3, 7, 14, 30
  enabled: boolean;
  ingestedBytesToday?: number;
  createdAt: number;
  updatedAt: number;
}

export interface SavedLogSearch {
  id: string;
  orgId: string;
  name: string;
  query: string;
  clusterId?: string;
  namespace?: string;
  workload?: string;
  podName?: string;
  container?: string;
  severity?: string;
  timeRange?: string;
  createdAt: number;
  createdBy?: string;
}

export interface LogQueryFilter {
  clusterId?: string;
  namespace?: string;
  workload?: string;
  podName?: string;
  container?: string;
  nodeName?: string;
  severity?: LogSeverity | 'ALL' | 'ERRORS_ONLY' | 'WARNINGS_AND_ERRORS';
  search?: string;
  sinceSeconds?: number;
  startTimeMs?: number;
  endTimeMs?: number;
  previous?: boolean;
  limit?: number;
  offset?: number;
}

export interface LogSearchResult {
  records: LogRecord[];
  totalMatches: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  timeRangeMs: { start: number; end: number };
  queryDurationMs: number;
}

// ==========================================
// Incident-Aware Smart Logs & RCA Types
// ==========================================

export type RelatedLogCategory =
  | 'DIRECT'
  | 'CONNECTED_SERVICE'
  | 'DEPENDENCY'
  | 'INFRASTRUCTURE'
  | 'DEPLOYMENT_CHANGE'
  | 'K8S_EVENT'
  | 'HISTORICAL_PRECEDENT';

export interface RelatedLogItem {
  id: string;
  category: RelatedLogCategory;
  resourceKind: string;
  resourceName: string;
  namespace?: string;
  nodeName?: string;
  relevanceScore: number; // 0 to 100
  relevanceReasons: string[]; // e.g. ["checkout-api communicates with Redis", "Redis errors started 2m before failure"]
  errorCount: number;
  warningCount: number;
  totalLogsCount: number;
  sampleLogs: Array<{
    timestamp: string;
    timestampMs: number;
    severity: LogSeverity;
    message: string;
    podName: string;
    container: string;
  }>;
  topErrorPattern?: string;
  relationshipDescription: string;
  deepLinkFilter: {
    clusterId: string;
    namespace?: string;
    workload?: string;
    podName?: string;
    nodeName?: string;
    search?: string;
    severity?: string;
    startTimeMs?: number;
    endTimeMs?: number;
  };
}

export interface RelatedLogGroup {
  category: RelatedLogCategory;
  categoryLabel: string;
  itemCount: number;
  totalErrors: number;
  totalWarnings: number;
  items: RelatedLogItem[];
}

export interface EvidenceTimelineItem {
  id: string;
  timestamp: number;
  timeFormatted: string; // "14:24" or ISO time
  relativeOffset: string; // "-6m before onset", "+2m after detection"
  type: 'DEPLOYMENT' | 'LOG_WARNING' | 'LOG_ERROR' | 'LOG_FATAL' | 'K8S_EVENT' | 'RESTART' | 'INCIDENT_DETECTED';
  source: string; // e.g. "checkout:v42", "redis", "payment-service", "kubelet"
  headline: string;
  detail: string;
  resourceKind?: string;
  resourceName?: string;
  namespace?: string;
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  isKeyEvidence: boolean;
  logRecordId?: string;
}

export interface BoundedInvestigationWindow {
  incidentTime: number;
  startTime: number;
  endTime: number;
  durationMinutes: number;
  configuredPreMinutes: number;
  configuredPostMinutes: number;
  isExpandedWindow?: boolean;
}

export interface HistoricalIncidentMatch {
  id: string;
  title: string;
  occurredAt: number;
  daysAgo: number;
  affectedWorkload: string;
  errorPattern: string;
  similarityScore: number;
  provenanceReason: string;
  previousResolution?: string;
}

export interface IncidentSmartLogsReport {
  incidentId: string;
  clusterId: string;
  namespace: string;
  targetWorkload: string;
  targetResourceKind: string;
  window: BoundedInvestigationWindow;
  queryContext: {
    targetWorkload: string;
    namespace: string;
    clusterId: string;
    correlatedServices: string[];
    dependencies: string[];
    nodeName?: string;
    investigationQuery: string;
  };
  groups: RelatedLogGroup[];
  evidenceTimeline: EvidenceTimelineItem[];
  similarHistoricalIncidents: HistoricalIncidentMatch[];
  rootCauseHypothesis?: {
    title: string;
    confidence: number;
    supportingEvidence: string[];
    connectedChain: Array<{
      step: number;
      actor: string;
      observation: string;
      offsetSeconds?: number;
      transitionText?: string;
    }>;
  };
  resourceLimits: {
    maxLogEntries: number;
    maxRelatedWorkloads: number;
    maxDependencies: number;
    limitsReached: boolean;
  };
  totalCorrelatedLogs: number;
  generatedAt: number;
}

