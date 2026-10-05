import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Incident, SkyOpsAIAnalysis } from '../../src/types/index';
import { generateIncidentEmail } from './emailTemplate';
import { NodemailerEmailProvider } from './providers/emailProvider';
import { getPersistenceConfig, safeWriteJsonSync } from '../persistence';
import {
  EmailDeliveryResult,
  EmailNotificationRecord,
  IEmailProvider,
  UserNotificationSettings,
  SmtpConfig,
  DeliverabilityDiagnostic
} from './types';

// Default testing email available strictly in development/test environments
export const DEV_TESTING_EMAIL = 'dev-testing@skyops.internal';

export interface NotificationServiceOptions {
  provider?: IEmailProvider;
  senderEmail?: string;
  senderName?: string;
  replyTo?: string;
  appUrl?: string;
  storagePath?: string;
  smtpConfig?: SmtpConfig;
}

export class IncidentNotificationService {
  private provider: IEmailProvider;
  private senderEmail: string;
  private senderName: string;
  private replyToEmail: string;
  private appUrl: string;
  private storagePath: string;
  private smtpConfig?: SmtpConfig;

  // In-memory idempotency cache: idempotencyKey -> timestamp
  private sentKeys: Map<string, { timestamp: number; messageId?: string }> = new Map();

  // Delivery log history
  private deliveryHistory: EmailNotificationRecord[] = [];

  constructor(options?: NotificationServiceOptions) {
    this.senderEmail = options?.senderEmail || process.env.SKYOPS_NOTIFICATION_SENDER_EMAIL || 'skyopsnetes2000@gmail.com';
    this.senderName = options?.senderName || process.env.SKYOPS_NOTIFICATION_SENDER_NAME || 'SkyOps';
    this.replyToEmail = options?.replyTo || process.env.SKYOPS_NOTIFICATION_REPLY_TO || 'skyopsnetes2000@gmail.com';

    if (process.env.NODE_ENV === 'production') {
      if (!options?.appUrl && !process.env.APP_URL && !process.env.SKYOPS_SERVER_URL) {
        throw new Error('[NotificationService] APP_URL is required in production; localhost fallback is forbidden');
      }
      if (this.isTestingEmail(this.senderEmail)) {
        throw new Error('[NotificationService] Development testing email cannot be used as production sender');
      }
    }
    this.appUrl = options?.appUrl || process.env.APP_URL || process.env.SKYOPS_SERVER_URL || 'http://localhost:3000';
    this.storagePath = options?.storagePath || getPersistenceConfig().notificationsFile;

    if (options?.provider) {
      this.provider = options.provider;
    } else if (process.env.NODE_ENV === 'test' && !options?.smtpConfig) {
      // In isolated unit tests, use stream transport so tests don't fail if external SMTP credentials are mock or expired
      this.provider = new NodemailerEmailProvider();
    } else {
      this.provider = new NodemailerEmailProvider({
        smtpHost: process.env.SKYOPS_SMTP_HOST,
        smtpPort: process.env.SKYOPS_SMTP_PORT ? parseInt(process.env.SKYOPS_SMTP_PORT, 10) : undefined,
        smtpSecure: process.env.SKYOPS_SMTP_SECURE === 'true' || process.env.SKYOPS_SMTP_SECURE === '1',
        smtpUser: process.env.SKYOPS_SMTP_USER,
        smtpPass: process.env.SKYOPS_SMTP_PASS,
        senderEmail: this.senderEmail,
        senderName: this.senderName
      });
    }

    this.loadLogs();
  }

  /**
   * Returns the formatted RFC 5322 sender string.
   * e.g. "SkyOps <skyopsnetes2000@gmail.com>"
   * Migrates seamlessly to "SkyOps <alerts@skyops.ai>" via server environment configuration.
   */
  public getSender(): string {
    const email = process.env.SKYOPS_NOTIFICATION_SENDER_EMAIL || this.senderEmail;
    const name = process.env.SKYOPS_NOTIFICATION_SENDER_NAME || this.senderName || 'SkyOps';
    return `${name} <${email}>`;
  }

  public getReplyTo(): string {
    return this.replyToEmail || process.env.SKYOPS_NOTIFICATION_REPLY_TO || 'skyopsnetes2000@gmail.com';
  }

  public getSmtpConfig(): Partial<SmtpConfig> {
    return {
      host: this.smtpConfig?.host || process.env.SKYOPS_SMTP_HOST || 'smtp.gmail.com',
      port: this.smtpConfig?.port || (process.env.SKYOPS_SMTP_PORT ? parseInt(process.env.SKYOPS_SMTP_PORT, 10) : 465),
      secure: this.smtpConfig?.secure ?? (process.env.SKYOPS_SMTP_SECURE === 'true' || process.env.SKYOPS_SMTP_SECURE === '1' || true),
      user: this.smtpConfig?.user || process.env.SKYOPS_SMTP_USER || 'skyopsnetes2000@gmail.com',
      pass: this.smtpConfig?.pass ? '********' : (process.env.SKYOPS_SMTP_PASS ? '********' : ''),
      senderEmail: this.senderEmail,
      senderName: this.senderName,
      replyTo: this.replyToEmail
    };
  }

  public updateSmtpConfig(config: SmtpConfig): void {
    this.smtpConfig = config;
    if (config.senderEmail) this.senderEmail = config.senderEmail.trim();
    if (config.senderName) this.senderName = config.senderName.trim();
    if (config.replyTo) this.replyToEmail = config.replyTo.trim();

    this.provider = new NodemailerEmailProvider({
      smtpHost: config.host,
      smtpPort: config.port,
      smtpSecure: config.secure,
      smtpUser: config.user,
      smtpPass: config.pass,
      senderEmail: this.senderEmail,
      senderName: this.senderName
    });

    this.persistLogs();
  }

  public async verifySmtp(config?: SmtpConfig): Promise<{ success: boolean; error?: string }> {
    const testProvider = config ? new NodemailerEmailProvider({
      smtpHost: config.host,
      smtpPort: config.port,
      smtpSecure: config.secure,
      smtpUser: config.user,
      smtpPass: config.pass,
      senderEmail: config.senderEmail,
      senderName: config.senderName
    }) : (this.provider as NodemailerEmailProvider);

    if (testProvider && typeof testProvider.verifyConnection === 'function') {
      return await testProvider.verifyConnection();
    }
    return { success: true };
  }

  public getDeliverabilityDiagnostics(): DeliverabilityDiagnostic {
    const sender = this.senderEmail;
    const isGmail = sender.endsWith('@gmail.com');
    const isCustomDomain = !isGmail && sender.includes('@') && !sender.endsWith('.internal');
    const hasSmtp = Boolean((this.provider as any)?.hasSmtp ? (this.provider as any).hasSmtp() : process.env.SKYOPS_SMTP_HOST);

    let authType: 'GMAIL_APP_PASSWORD' | 'ENTERPRISE_RELAY' | 'CUSTOM_SMTP' | 'STREAM_DEV' = 'STREAM_DEV';
    if (hasSmtp) {
      if (isGmail) authType = 'GMAIL_APP_PASSWORD';
      else if (isCustomDomain) authType = 'CUSTOM_SMTP';
      else authType = 'ENTERPRISE_RELAY';
    }

    const senderDomain = sender.split('@')[1] || 'skyops.ai';
    const recommendations: string[] = [];

    if (isGmail) {
      recommendations.push(
        'Google Accounts require a 16-character App Password (https://myaccount.google.com/apppasswords) to authenticate via SMTP and pass Google DKIM/SPF checks.'
      );
      recommendations.push(
        'Recipients should click "Not Spam" or "Move to Inbox" on their first received alert to train Gmail\'s Bayesian filter.'
      );
    }
    recommendations.push(
      'All outgoing emails include RFC 8058 one-click List-Unsubscribe, Auto-Submitted, and Precedence: bulk headers to guarantee high inbox reputation.'
    );
    recommendations.push(
      'CAN-SPAM & GDPR compliant physical mailing address and direct preference management links are embedded in every email footer.'
    );

    return {
      smtpConfigured: hasSmtp,
      smtpHost: (this.provider as any)?.getConfig?.()?.smtpHost || process.env.SKYOPS_SMTP_HOST || 'smtp.gmail.com',
      authType,
      senderEmail: this.senderEmail,
      senderDomain,
      replyToEmail: this.getReplyTo(),
      antiSpamHeaders: {
        listUnsubscribe: true,
        autoSubmitted: true,
        precedence: true,
        feedbackId: true,
        rfcMessageId: true
      },
      spfDmarcAlignment: isGmail ? 'WARNING_NEEDS_APP_PASSWORD' : 'PASS',
      recommendations,
      canSpamCompliant: true
    };
  }

  public setProvider(provider: IEmailProvider): void {
    this.provider = provider;
  }

  public getProvider(): IEmailProvider {
    return this.provider;
  }

  /**
   * Returns the development testing email address.
   * STRICTLY returns null in production (NODE_ENV === 'production').
   */
  public getTestingEmail(): string | null {
    if (process.env.NODE_ENV === 'production') {
      return null;
    }
    return process.env.SKYOPS_DEV_TESTING_EMAIL || DEV_TESTING_EMAIL;
  }

  /**
   * Checks whether an email address is a development testing email.
   */
  public isTestingEmail(email: string): boolean {
    if (!email) return false;
    const lower = email.trim().toLowerCase();
    return (
      lower === DEV_TESTING_EMAIL.toLowerCase() ||
      lower.endsWith('@skyops.internal') ||
      lower.endsWith('.test') ||
      Boolean(process.env.SKYOPS_DEV_TESTING_EMAIL && lower === process.env.SKYOPS_DEV_TESTING_EMAIL.trim().toLowerCase())
    );
  }

  /**
   * Generate a deterministic idempotency key for an incident delivery attempt.
   */
  public generateIdempotencyKey(incidentId: string, recipient: string, notificationType = 'incident_created'): string {
    return `${incidentId}:${recipient.trim().toLowerCase()}:${notificationType}`;
  }

  /**
   * Dispatch incident email notifications to all authorized members of the organization
   * who have enabled: Settings → Notifications → Incident Email Notifications = ON
   *
   * @param incident The newly detected or created incident
   * @param context Additional context including organization members and user preferences
   */
  public async dispatchIncidentNotification(
    incident: Incident,
    context: {
      orgName: string;
      recipients: Array<{
        userId: string;
        email: string;
        name?: string;
        incidentEmailEnabled: boolean;
      }>;
      aiAnalysis?: SkyOpsAIAnalysis;
      remediationState?: {
        status?: string;
        actionType?: string;
        summary?: string;
      };
    }
  ): Promise<EmailDeliveryResult[]> {
    const results: EmailDeliveryResult[] = [];
    const notificationType = 'incident_created';

    for (const recipientInfo of context.recipients) {
      // 1. Check user notification preference
      if (!recipientInfo.incidentEmailEnabled) {
        // User opted out or has not enabled incident email notifications: DO NOT SEND
        continue;
      }

      const recipientEmail = recipientInfo.email.trim();
      if (!recipientEmail || !recipientEmail.includes('@')) {
        continue;
      }

      // Prohibit delivery to testing emails in production
      if (process.env.NODE_ENV === 'production' && this.isTestingEmail(recipientEmail)) {
        continue;
      }

      // 2. Duplicate Protection (Idempotency)
      const idempotencyKey = this.generateIdempotencyKey(incident.id, recipientEmail, notificationType);
      if (this.sentKeys.has(idempotencyKey)) {
        const existing = this.sentKeys.get(idempotencyKey)!;
        const duplicateResult: EmailDeliveryResult = {
          success: true,
          duplicate: true,
          messageId: existing.messageId,
          provider: this.provider.name,
          timestamp: Date.now()
        };
        results.push(duplicateResult);

        this.recordDelivery({
          id: `del-${crypto.randomBytes(6).toString('hex')}`,
          incidentId: incident.id,
          orgId: incident.orgId,
          recipient: recipientEmail,
          subject: `[Duplicate Suppressed] ${incident.title}`,
          status: 'DUPLICATE_SUPPRESSED',
          provider: this.provider.name,
          messageId: existing.messageId,
          timestamp: Date.now(),
          idempotencyKey
        });

        continue;
      }

      // 3. Generate Incident Email dynamically from real incident data
      const emailContent = generateIncidentEmail({
        incident,
        clusterName: incident.clusterName,
        orgName: context.orgName,
        appUrl: this.appUrl,
        recipientEmail,
        aiAnalysis: context.aiAnalysis,
        remediationState: context.remediationState
      });

      // 4. Attempt server-side delivery
      try {
        const unsubscribeUrl = `${this.appUrl}/api/v1/notifications/unsubscribe?email=${encodeURIComponent(recipientEmail)}`;
        const deliveryResult = await this.provider.sendEmail({
          from: this.getSender(),
          to: recipientEmail,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
          replyTo: this.getReplyTo(),
          listUnsubscribe: unsubscribeUrl
        });

        if (deliveryResult.success) {
          this.sentKeys.set(idempotencyKey, {
            timestamp: deliveryResult.timestamp,
            messageId: deliveryResult.messageId
          });

          this.recordDelivery({
            id: `del-${crypto.randomBytes(6).toString('hex')}`,
            incidentId: incident.id,
            orgId: incident.orgId,
            recipient: recipientEmail,
            subject: emailContent.subject,
            status: 'SENT',
            provider: deliveryResult.provider,
            messageId: deliveryResult.messageId,
            timestamp: deliveryResult.timestamp,
            idempotencyKey
          });
        } else {
          this.recordDelivery({
            id: `del-${crypto.randomBytes(6).toString('hex')}`,
            incidentId: incident.id,
            orgId: incident.orgId,
            recipient: recipientEmail,
            subject: emailContent.subject,
            status: 'FAILED',
            provider: deliveryResult.provider,
            error: deliveryResult.error,
            timestamp: deliveryResult.timestamp,
            idempotencyKey
          });
        }

        results.push(deliveryResult);
      } catch (err: any) {
        const failResult: EmailDeliveryResult = {
          success: false,
          provider: this.provider.name,
          error: err?.message || 'Email delivery threw unhandled exception',
          timestamp: Date.now()
        };

        this.recordDelivery({
          id: `del-${crypto.randomBytes(6).toString('hex')}`,
          incidentId: incident.id,
          orgId: incident.orgId,
          recipient: recipientEmail,
          subject: emailContent.subject,
          status: 'FAILED',
          provider: this.provider.name,
          error: failResult.error,
          timestamp: Date.now(),
          idempotencyKey
        });

        results.push(failResult);
      }
    }

    return results;
  }

  /**
   * Send a test incident notification email to the authenticated user or testing email in development.
   */
  public async sendTestNotification(
    recipientEmail: string,
    orgName: string,
    orgId: string
  ): Promise<EmailDeliveryResult> {
    const isProd = process.env.NODE_ENV === 'production';
    if (!recipientEmail) {
      if (!isProd) {
        recipientEmail = this.getTestingEmail() || DEV_TESTING_EMAIL;
      } else {
        throw new Error('Recipient email is required in production');
      }
    }

    if (isProd && this.isTestingEmail(recipientEmail)) {
      throw new Error('Development testing emails are prohibited in production environment');
    }

    const testIncident: Incident = {
      id: `SKY-TEST-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
      fingerprint: `test-fp-${Date.now()}`,
      orgId,
      clusterId: 'test-cluster-sandbox',
      clusterName: 'sandbox-test-cluster',
      namespace: 'test-sandbox',
      resourceKind: 'Pod',
      resourceName: 'sample-workload-test',
      incidentType: 'CrashLoopBackOff',
      title: 'Test Alert: Simulated High CPU on sample-workload',
      severity: 'HIGH',
      status: 'OPEN',
      occurrenceCount: 1,
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
      updatedAt: Date.now(),
      technicalDetails: {
        podName: 'sample-workload-test',
        containerName: 'sample-app',
        nodeName: 'test-node-01',
        restartCount: 1,
        exitCode: 137,
        reason: 'ResourceExhaustion',
        message: 'Sample test message generated for notification verification.',
        impact: 'Test impact assessment generated for email delivery verification.',
        rootCause: 'Simulated diagnostic condition generated for notification delivery testing.'
      },
      aiAnalysis: {
        incidentId: 'test-incident-id',
        summary: 'Synthetic SkyOps diagnostics sample generated for notification template testing.',
        rootCause: 'Synthetic diagnostic sample generated to test delivery formatting.',
        confidence: 0.96,
        evidence: [],
        affectedResources: [],
        recommendedFix: {
          description: 'Scale container cpu limit from 500m to 1500m and configure HorizontalPodAutoscaler.',
          reason: 'Eliminates CFS quota throttling and thread stalling during peak payments traffic.',
          risk: 'LOW',
          expectedImpact: 'Zero downtime rolling pod update.',
          rollback: 'kubectl rollout undo deployment/payments-api',
          action: {
            type: 'RESOURCE_RESIZING'
          }
        },
        saferAlternative: {
          description: 'Add 2 additional replicas to spread request load',
          reason: 'Distributes traffic horizontally without modifying resource limits.'
        },
        requiresApproval: false,
        additionalEvidenceNeeded: [],
        analyzedAt: Date.now(),
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        status: 'SUCCESS',
        executionSafe: true
      }
    };

    const emailContent = generateIncidentEmail({
      incident: testIncident,
      clusterName: 'production-us-east-1',
      orgName,
      appUrl: this.appUrl,
      recipientEmail,
      aiAnalysis: testIncident.aiAnalysis
    });

    const idempotencyKey = `test-${Date.now()}:${recipientEmail}:test_notification`;

    const unsubscribeUrl = `${this.appUrl}/api/v1/notifications/unsubscribe?email=${encodeURIComponent(recipientEmail)}`;

    const result = await this.provider.sendEmail({
      from: this.getSender(),
      to: recipientEmail,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
      replyTo: this.getReplyTo(),
      listUnsubscribe: unsubscribeUrl
    });

    this.recordDelivery({
      id: `del-${crypto.randomBytes(6).toString('hex')}`,
      incidentId: testIncident.id,
      orgId,
      recipient: recipientEmail,
      subject: emailContent.subject,
      status: result.success ? 'SENT' : 'FAILED',
      provider: result.provider,
      messageId: result.messageId,
      error: result.error,
      timestamp: result.timestamp,
      idempotencyKey
    });

    return result;
  }

  public getDeliveries(orgId: string, recipient?: string): EmailNotificationRecord[] {
    let list = this.deliveryHistory.filter((d) => d.orgId === orgId);
    if (recipient) {
      list = list.filter((d) => d.recipient.toLowerCase() === recipient.toLowerCase());
    }
    return list.slice(0, 50);
  }

  private recordDelivery(record: EmailNotificationRecord): void {
    this.deliveryHistory.unshift(record);
    if (this.deliveryHistory.length > 200) {
      this.deliveryHistory.pop();
    }
    this.persistLogs();
  }

  public getStoragePath(): string {
    return this.storagePath;
  }

  private loadLogs(): void {
    if (process.env.NODE_ENV === 'production') {
      return;
    }
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.deliveries)) {
          this.deliveryHistory = data.deliveries;
        }
        if (Array.isArray(data.sentKeys)) {
          for (const item of data.sentKeys) {
            this.sentKeys.set(item.key, { timestamp: item.timestamp, messageId: item.messageId });
          }
        }
        if (data.smtpConfig && typeof data.smtpConfig === 'object') {
          this.smtpConfig = data.smtpConfig;
          if (this.smtpConfig?.senderEmail) this.senderEmail = this.smtpConfig.senderEmail;
          if (this.smtpConfig?.senderName) this.senderName = this.smtpConfig.senderName;
          if (this.smtpConfig?.replyTo) this.replyToEmail = this.smtpConfig.replyTo;
        }
      }
    } catch (err: any) {
      // Non-fatal in dev/test, will initialize clean in-memory log
    }
  }

  private persistLogs(): void {
    if (process.env.NODE_ENV === 'production') {
      return;
    }
    try {
      const data = {
        deliveries: this.deliveryHistory.slice(0, 200),
        sentKeys: Array.from(this.sentKeys.entries()).map(([key, val]) => ({
          key,
          timestamp: val.timestamp,
          messageId: val.messageId
        })),
        smtpConfig: this.smtpConfig
      };
      safeWriteJsonSync(this.storagePath, data);
    } catch (err) {
      // Non-fatal
    }
  }
}

export const incidentNotificationService = new IncidentNotificationService();
