import { Incident, IncidentSeverity, SkyOpsAIAnalysis } from '../../src/types/index';

export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  listUnsubscribe?: string;
  headers?: Record<string, string>;
}

export interface EmailDeliveryResult {
  success: boolean;
  messageId?: string;
  provider: string;
  error?: string;
  duplicate?: boolean;
  timestamp: number;
  diagnostics?: {
    antiSpamHeadersApplied: boolean;
    listUnsubscribeHeader: boolean;
    senderDomain: string;
  };
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  senderEmail?: string;
  senderName?: string;
  replyTo?: string;
}

export interface DeliverabilityDiagnostic {
  smtpConfigured: boolean;
  smtpHost?: string;
  authType: 'GMAIL_APP_PASSWORD' | 'ENTERPRISE_RELAY' | 'CUSTOM_SMTP' | 'STREAM_DEV';
  senderEmail: string;
  senderDomain: string;
  replyToEmail: string;
  antiSpamHeaders: {
    listUnsubscribe: boolean;
    autoSubmitted: boolean;
    precedence: boolean;
    feedbackId: boolean;
    rfcMessageId: boolean;
  };
  spfDmarcAlignment: 'OPTIMAL' | 'PASS' | 'WARNING_NEEDS_APP_PASSWORD';
  recommendations: string[];
  canSpamCompliant: boolean;
}

export interface IEmailProvider {
  readonly name: string;
  sendEmail(message: EmailMessage): Promise<EmailDeliveryResult>;
}

export interface IncidentEmailData {
  incident: Incident;
  clusterName: string;
  orgName: string;
  appUrl: string;
  recipientEmail: string;
  aiAnalysis?: SkyOpsAIAnalysis;
  remediationState?: {
    status?: string;
    actionType?: string;
    summary?: string;
  };
}

export type EmailDeliveryStatus = 'SENT' | 'FAILED' | 'DUPLICATE_SUPPRESSED';

export interface EmailNotificationRecord {
  id: string;
  incidentId: string;
  orgId: string;
  recipient: string;
  subject: string;
  status: EmailDeliveryStatus;
  provider: string;
  messageId?: string;
  error?: string;
  timestamp: number;
  idempotencyKey: string;
}

export interface UserNotificationSettings {
  incidentEmailEnabled: boolean;
  email: string;
  updatedAt?: number;
}
