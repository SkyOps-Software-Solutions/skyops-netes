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
