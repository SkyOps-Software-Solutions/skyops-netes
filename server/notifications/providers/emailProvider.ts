import nodemailer from 'nodemailer';
import type { Transporter, SendMailOptions } from 'nodemailer';
import crypto from 'crypto';
import { EmailDeliveryResult, EmailMessage, IEmailProvider } from '../types';

export interface EmailProviderConfig {
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  senderEmail?: string;
  senderName?: string;
  simulateFailure?: boolean;
}

/**
 * Standard Nodemailer-backed Email Provider.
 * Sends via enterprise SMTP relay when credentials exist,
 * or securely compiles real MIME messages via Nodemailer stream transport when running in container/test environments.
 */
export class NodemailerEmailProvider implements IEmailProvider {
  public readonly name = 'nodemailer';
  private transporter: Transporter;
  private config?: EmailProviderConfig;
  private simulateFailure = false;
  private isSmtpConfigured = false;

  constructor(config?: EmailProviderConfig) {
    this.config = config;
    this.simulateFailure = !!config?.simulateFailure;

    if (config?.smtpHost && config.smtpUser && config.smtpPass) {
      this.isSmtpConfigured = true;
      // Enterprise SMTP Configuration (e.g. Gmail App Password, SendGrid, Amazon SES, or Postmark)
      this.transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort || (config.smtpSecure ? 465 : 587),
        secure: config.smtpSecure ?? (config.smtpPort === 465),
        auth: {
          user: config.smtpUser,
          pass: config.smtpPass
        },
        tls: {
          rejectUnauthorized: process.env.NODE_ENV === 'production'
        }
      });
    } else {
      this.isSmtpConfigured = false;
      // Stream transport for container development, preview, and testing environments:
      // Validates and compiles real RFC 5322 MIME messages without requiring external SMTP credentials.
      this.transporter = nodemailer.createTransport({
        streamTransport: true,
        buffer: true
      });
    }
  }

  public hasSmtp(): boolean {
    return this.isSmtpConfigured;
  }

  public getConfig(): EmailProviderConfig | undefined {
    return this.config;
  }

  public async verifyConnection(): Promise<{ success: boolean; error?: string }> {
    if (!this.isSmtpConfigured) {
      return { success: true };
    }
    try {
      await this.transporter.verify();
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('534') || msg.includes('Application-specific password required') || msg.includes('InvalidSecondFactor')) {
        return {
          success: false,
          error: 'Google SMTP rejected password: A 16-character Google App Password is required. Generate one at https://myaccount.google.com/apppasswords'
        };
      }
      return { success: false, error: msg };
    }
  }

  public setSimulateFailure(fail: boolean): void {
    this.simulateFailure = fail;
  }

  public async sendEmail(message: EmailMessage): Promise<EmailDeliveryResult> {
    const timestamp = Date.now();

    if (this.simulateFailure) {
      return {
        success: false,
        provider: this.name,
        error: 'Simulated upstream SMTP connection timeout: ECONNREFUSED',
        timestamp
      };
    }

    try {
      // Extract sender domain for RFC 5322 Message-ID alignment
      const senderMatch = message.from.match(/@([a-zA-Z0-9.-]+)/);
      const senderDomain = senderMatch ? senderMatch[1] : 'skyops.ai';
      const cleanMessageId = `<skyops-${Date.now()}-${crypto.randomBytes(4).toString('hex')}@${senderDomain}>`;

      // Build anti-spam deliverability headers conforming to Gmail & Yahoo 2024+ sender requirements
      const deliverabilityHeaders: Record<string, string> = {
        'Auto-Submitted': 'auto-generated',
        'Precedence': 'bulk',
        'X-Auto-Response-Suppress': 'All',
        'Feedback-ID': `incident-alerts:${senderDomain}:skyops-platform`,
        'X-Report-Abuse': 'Please report any deliverability issue to skyopsnetes2000@gmail.com',
        'MIME-Version': '1.0',
        ...(message.headers || {})
      };

      if (message.listUnsubscribe) {
        deliverabilityHeaders['List-Unsubscribe'] = `<${message.listUnsubscribe}>`;
        deliverabilityHeaders['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
      }

      const mailOptions: SendMailOptions = {
        from: message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        replyTo: message.replyTo || (this.config?.senderEmail || 'skyopsnetes2000@gmail.com'),
        messageId: cleanMessageId,
        date: new Date(),
        headers: deliverabilityHeaders
      };

      const info = await this.transporter.sendMail(mailOptions);

      const messageId = info.messageId || cleanMessageId;

      return {
        success: true,
        messageId,
        provider: this.name,
        timestamp,
        diagnostics: {
          antiSpamHeadersApplied: true,
          listUnsubscribeHeader: Boolean(message.listUnsubscribe),
          senderDomain
        }
      };
    } catch (err: any) {
      let errorMsg = err?.message || 'Unknown email delivery error';
      if (errorMsg.includes('534') || errorMsg.includes('Application-specific password required') || errorMsg.includes('InvalidSecondFactor')) {
        errorMsg = 'Google SMTP authentication failed: 16-character Google App Password is required (https://myaccount.google.com/apppasswords).';
      }
      return {
        success: false,
        provider: this.name,
        error: errorMsg,
        timestamp
      };
    }
  }
}
