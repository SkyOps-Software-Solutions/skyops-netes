import { LogSeverity } from './logs';

export type NotificationType = 'LOG_ALERT' | 'INCIDENT' | 'SYSTEM' | 'REMEDIATION';
export type NotificationSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface AppNotification {
  id: string;
  orgId: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  read: boolean;
  createdAt: number;
  clusterId?: string;
  clusterName?: string;
  namespace?: string;
  podName?: string;
  container?: string;
  workload?: string;
  logSeverity?: LogSeverity;
  redactedExcerpt?: string;
  ruleId?: string;
  ruleName?: string;
  incidentId?: string;
  actionUrl?: string;
}

export interface PodLogAlertSubscription {
  id: string;
  orgId: string;
  userId?: string;
  clusterId: string;
  namespace: string;
  podName: string;
  container: string;
  enabled: boolean;
  minSeverity: LogSeverity;
  notifyEmail: boolean;
  createdAt: number;
  updatedAt: number;
  triggerCount?: number;
  lastTriggeredAt?: number;
}

export interface PodLogAlertSubscriptionStatus {
  subscription: PodLogAlertSubscription | null;
  active: boolean;
  canAlert: boolean;
  pipelineStatus: 'CONNECTED' | 'DISCONNECTED' | 'NO_AGENT' | 'OFFLINE';
  emailDeliveryConfigured: boolean;
  reason?: string;
}
