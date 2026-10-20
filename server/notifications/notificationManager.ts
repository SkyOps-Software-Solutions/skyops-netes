import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  DeliveryChannelStatus,
  NotificationFilter,
  NotificationsResponse,
  NotificationSeverity,
  NotificationType,
  SkyOpsNotification
} from '../../src/types/logs';
import { getPersistenceConfig, safeReadJsonSync, safeWriteJsonSync } from '../persistence';
import { redactSensitiveLogData } from '../logs';
import { incidentNotificationService } from './notificationService';

export class NotificationManager {
  private notifications: Map<string, SkyOpsNotification[]> = new Map(); // orgId -> notifications
  private deduplicationCache: Map<string, number> = new Map(); // deduplicationKey -> timestamp
  private storagePath: string;

  constructor() {
    this.storagePath = path.join(
      getPersistenceConfig().dataDir,
      'skyops_central_notifications.json'
    );
    this.loadFromDisk();
  }

  public getStoragePath(): string {
    return this.storagePath;
  }

  /**
   * Adds a notification with server-side validation, redaction, and deduplication.
   */
  public addNotification(
    data: Omit<SkyOpsNotification, 'id' | 'timestamp' | 'read'> & {
      timestamp?: number;
      read?: boolean;
    }
  ): SkyOpsNotification | null {
    const orgId = data.orgId;
    if (!orgId) return null;

    const now = data.timestamp || Date.now();
    const dedupeKey = data.deduplicationKey || `${orgId}:${data.type}:${data.clusterId || '*'}:${data.podName || '*'}:${data.title}`;

    // Deduplication check: if an identical deduplicationKey arrived within 60 seconds (or 15 mins for same alert rule), suppress duplicate
    const lastSeen = this.deduplicationCache.get(dedupeKey);
    if (lastSeen && now - lastSeen < 60000) {
      return null;
    }
    this.deduplicationCache.set(dedupeKey, now);

    // Redact sensitive message excerpts
    const cleanExcerpt = data.messageExcerpt ? redactSensitiveLogData(data.messageExcerpt).slice(0, 500) : undefined;
    const cleanDescription = redactSensitiveLogData(data.description).slice(0, 500);

    const notification: SkyOpsNotification = {
      id: `notif-${crypto.randomBytes(8).toString('hex')}`,
      orgId,
      userId: data.userId,
      readBy: data.readBy || [],
      read: data.read ?? false,
      dismissed: false,
      type: data.type,
      severity: data.severity,
      title: data.title.trim().slice(0, 200),
      description: cleanDescription,
      messageExcerpt: cleanExcerpt,
      clusterId: data.clusterId,
      clusterName: data.clusterName,
      namespace: data.namespace,
      workload: data.workload,
      podName: data.podName,
      container: data.container,
      incidentId: data.incidentId,
      ruleId: data.ruleId,
      ruleName: data.ruleName,
      timestamp: now,
      deduplicationKey: dedupeKey,
      deliveryChannel: data.deliveryChannel || 'IN_APP',
      deliveryStatus: data.deliveryStatus || 'IN_APP_ONLY',
      deliveryError: data.deliveryError
    };

    let orgList = this.notifications.get(orgId) || [];
    // Prepend (newest first)
    orgList.unshift(notification);

    // Enforce reasonable retention: max 1000 notifications per organization
    if (orgList.length > 1000) {
      orgList = orgList.slice(0, 1000);
    }
    this.notifications.set(orgId, orgList);

    this.persistToDisk();
    return notification;
  }

  /**
   * Retrieves notifications for an organization with full filtering, search, and pagination.
   */
  public getNotifications(orgId: string, userId: string, filter: NotificationFilter = {}): NotificationsResponse {
    const list = this.notifications.get(orgId) || [];

    const filtered = list.filter((n) => {
      // Exclude dismissed notifications
      if (n.dismissed) return false;

      // User-specific read check
      const isReadByUser = n.read || (n.readBy && n.readBy.includes(userId));

      if (filter.unreadOnly && isReadByUser) return false;

      // Category filter
      if (filter.category) {
        if (filter.category === 'UNREAD') {
          if (isReadByUser) return false;
        } else if (filter.category === 'LOG_ALERTS') {
          if (n.type !== 'LOG_ERROR' && n.type !== 'LOG_FATAL' && n.type !== 'LOG_WARN' && n.type !== 'ALERT_TRIGGERED') {
            return false;
          }
        } else if (filter.category === 'INCIDENTS') {
          if (n.type !== 'INCIDENT_CREATED' && n.type !== 'INCIDENT_RESOLVED' && n.type !== 'INCIDENT_SEVERITY_CHANGED') {
            return false;
          }
        } else if (filter.category === 'FAILURES') {
          if (n.type !== 'DELIVERY_FAILURE' && n.deliveryStatus !== 'FAILED') {
            return false;
          }
        }
      }

      // Type filter
      if (filter.type && filter.type !== 'ALL' && n.type !== filter.type) {
        return false;
      }

      // Severity filter
      if (filter.severity && filter.severity !== 'ALL') {
        if (filter.severity === 'HIGH_CRITICAL') {
          if (n.severity !== 'CRITICAL' && n.severity !== 'HIGH') return false;
        } else if (n.severity !== filter.severity) {
          return false;
        }
      }

      // Cluster filter
      if (filter.clusterId && filter.clusterId !== 'all' && n.clusterId !== filter.clusterId) {
        return false;
      }

      // Time range filter
      if (filter.startTime && n.timestamp < filter.startTime) return false;
      if (filter.endTime && n.timestamp > filter.endTime) return false;

      // Search term filter
      if (filter.search && filter.search.trim()) {
        const query = filter.search.trim().toLowerCase();
        const matchesTitle = n.title.toLowerCase().includes(query);
        const matchesDesc = n.description.toLowerCase().includes(query);
        const matchesPod = n.podName ? n.podName.toLowerCase().includes(query) : false;
        const matchesWorkload = n.workload ? n.workload.toLowerCase().includes(query) : false;
        const matchesContainer = n.container ? n.container.toLowerCase().includes(query) : false;
        const matchesExcerpt = n.messageExcerpt ? n.messageExcerpt.toLowerCase().includes(query) : false;

        if (!matchesTitle && !matchesDesc && !matchesPod && !matchesWorkload && !matchesContainer && !matchesExcerpt) {
          return false;
        }
      }

      return true;
    });

    // Sort newest first
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    // Calculate unread count across all active notifications in org
    const unreadCount = list.filter((n) => !n.dismissed && !n.read && (!n.readBy || !n.readBy.includes(userId))).length;

    const limit = Math.min(100, Math.max(1, filter.limit || 20));
    const offset = Math.max(0, filter.offset || 0);
    const paginated = filtered.slice(offset, offset + limit);

    // Enrich read property specific to the requesting user
    const userMapped = paginated.map((n) => ({
      ...n,
      read: Boolean(n.read || (n.readBy && n.readBy.includes(userId)))
    }));

    return {
      notifications: userMapped,
      total: filtered.length,
      unreadCount,
      limit,
      offset,
      hasMore: offset + limit < filtered.length
    };
  }

  /**
   * Get unread notification count for an organization & user.
   */
  public getUnreadCount(orgId: string, userId: string): number {
    const list = this.notifications.get(orgId) || [];
    return list.filter((n) => !n.dismissed && !n.read && (!n.readBy || !n.readBy.includes(userId))).length;
  }

  /**
   * Mark a single notification as read by user.
   */
  public markAsRead(orgId: string, userId: string, notificationId: string): boolean {
    const list = this.notifications.get(orgId);
    if (!list) return false;

    const notif = list.find((n) => n.id === notificationId);
    if (!notif) return false;

    notif.read = true;
    if (!notif.readBy) notif.readBy = [];
    if (!notif.readBy.includes(userId)) {
      notif.readBy.push(userId);
    }

    this.persistToDisk();
    return true;
  }

  /**
   * Mark all notifications in organization as read for user.
   */
  public markAllAsRead(orgId: string, userId: string): number {
    const list = this.notifications.get(orgId);
    if (!list) return 0;

    let updatedCount = 0;
    for (const notif of list) {
      if (!notif.read || (notif.readBy && !notif.readBy.includes(userId))) {
        notif.read = true;
        if (!notif.readBy) notif.readBy = [];
        if (!notif.readBy.includes(userId)) notif.readBy.push(userId);
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      this.persistToDisk();
    }
    return updatedCount;
  }

  /**
   * Dismiss/delete a notification.
   */
  public dismissNotification(orgId: string, notificationId: string): boolean {
    const list = this.notifications.get(orgId);
    if (!list) return false;

    const idx = list.findIndex((n) => n.id === notificationId);
    if (idx === -1) return false;

    list.splice(idx, 1);
    this.persistToDisk();
    return true;
  }

  /**
   * Dismiss all notifications for an organization.
   */
  public clearAll(orgId: string): number {
    const list = this.notifications.get(orgId);
    if (!list || !list.length) return 0;

    const count = list.length;
    this.notifications.set(orgId, []);
    this.persistToDisk();
    return count;
  }

  /**
   * Dispatches email for a notification if user/org preference allows and SMTP is configured.
   */
  public async dispatchEmailIfApplicable(
    orgId: string,
    notification: SkyOpsNotification,
    recipients: Array<{ email: string; incidentEmailEnabled: boolean }>
  ): Promise<{ delivered: boolean; error?: string }> {
    const validRecipients = recipients.filter((r) => r.incidentEmailEnabled && r.email && r.email.includes('@'));
    if (validRecipients.length === 0) {
      notification.deliveryStatus = 'IN_APP_ONLY';
      return { delivered: false };
    }

    const deliverability = incidentNotificationService.getDeliverabilityDiagnostics();
    if (!deliverability.smtpConfigured) {
      notification.deliveryStatus = 'EMAIL_UNCONFIGURED';
      return { delivered: false, error: 'SMTP relay is not configured' };
    }

    let successAny = false;
    let lastError: string | undefined;

    for (const r of validRecipients) {
      try {
        const idempotencyKey = `log-alert:${notification.id}:${r.email.toLowerCase()}`;
        const emailResult = await incidentNotificationService.getProvider().sendEmail({
          from: incidentNotificationService.getSender(),
          to: r.email,
          subject: `[SkyOps Alert] ${notification.title}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #09090b; color: #f4f4f5; padding: 24px; border-radius: 8px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
                <span style="background: #e11d48; color: #fff; font-size: 11px; font-weight: bold; padding: 2px 8px; rounded: 4px;">${notification.severity}</span>
                <span style="color: #38bdf8; font-weight: bold; font-size: 14px;">SkyOps Observability Alert</span>
              </div>
              <h2 style="color: #ffffff; font-size: 18px; margin: 0 0 12px 0;">${notification.title}</h2>
              <p style="color: #a1a1aa; font-size: 13px; line-height: 1.5; margin: 0 0 16px 0;">${notification.description}</p>
              ${
                notification.messageExcerpt
                  ? `<div style="background: #18181b; border: 1px solid #27272a; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 12px; color: #f43f5e; overflow-x: auto; margin-bottom: 16px;">${notification.messageExcerpt}</div>`
                  : ''
              }
              <div style="background: #18181b; padding: 12px; border-radius: 6px; font-size: 12px; color: #71717a; margin-bottom: 16px;">
                <div>Cluster: <strong>${notification.clusterName || notification.clusterId || 'N/A'}</strong></div>
                <div>Namespace: <strong>${notification.namespace || 'default'}</strong></div>
                ${notification.podName ? `<div>Pod: <strong>${notification.podName}</strong></div>` : ''}
                ${notification.container ? `<div>Container: <strong>${notification.container}</strong></div>` : ''}
                <div>Timestamp: <strong>${new Date(notification.timestamp).toISOString()}</strong></div>
              </div>
              <div style="font-size: 11px; color: #52525b; border-top: 1px solid #27272a; padding-top: 12px;">
                Sent by SkyOps Incident Management Platform. To update email preferences, visit Settings &gt; Notifications.
              </div>
            </div>
          `,
          text: `[SkyOps Alert: ${notification.severity}] ${notification.title}\n\n${notification.description}\n\nCluster: ${notification.clusterName || notification.clusterId}\nNamespace: ${notification.namespace}\nPod: ${notification.podName || 'N/A'}\nContainer: ${notification.container || 'N/A'}\nTimestamp: ${new Date(notification.timestamp).toISOString()}\n\n${notification.messageExcerpt ? `Excerpt:\n${notification.messageExcerpt}` : ''}`,
          replyTo: incidentNotificationService.getReplyTo()
        });

        if (emailResult.success) {
          successAny = true;
        } else {
          lastError = emailResult.error;
        }
      } catch (err: any) {
        lastError = err?.message || 'Email delivery failed';
      }
    }

    if (successAny) {
      notification.deliveryStatus = 'SENT';
      notification.deliveryChannel = 'EMAIL';
      this.persistToDisk();
      return { delivered: true };
    } else {
      notification.deliveryStatus = 'FAILED';
      notification.deliveryError = lastError;
      this.persistToDisk();

      // Record a DELIVERY_FAILURE notification so failures are prominently visible in the Notification Center
      this.addNotification({
        orgId,
        type: 'DELIVERY_FAILURE',
        severity: 'MEDIUM',
        title: `Email Delivery Failed for Alert`,
        description: `Failed to deliver email notification for "${notification.title}": ${lastError || 'Unknown provider error'}`,
        clusterId: notification.clusterId,
        clusterName: notification.clusterName,
        namespace: notification.namespace,
        podName: notification.podName,
        container: notification.container,
        deliveryChannel: 'EMAIL',
        deliveryStatus: 'FAILED',
        deliveryError: lastError,
        deduplicationKey: `failure:${notification.id}`
      });

      return { delivered: false, error: lastError };
    }
  }

  private loadFromDisk(): void {
    try {
      const data = safeReadJsonSync<{
        notifications?: Record<string, SkyOpsNotification[]>;
        deduplication?: Array<{ key: string; timestamp: number }>;
      }>(this.storagePath, {});

      if (data && data.notifications && typeof data.notifications === 'object') {
        for (const [orgId, notifs] of Object.entries(data.notifications)) {
          if (Array.isArray(notifs)) {
            this.notifications.set(orgId, notifs);
          }
        }
      }

      if (data && Array.isArray(data.deduplication)) {
        for (const item of data.deduplication) {
          this.deduplicationCache.set(item.key, item.timestamp);
        }
      }
    } catch (err) {
      // Non-fatal, starts clean
    }
  }

  private persistToDisk(): void {
    try {
      const notifsObj: Record<string, SkyOpsNotification[]> = {};
      for (const [orgId, notifs] of this.notifications.entries()) {
        notifsObj[orgId] = notifs.slice(0, 500);
      }

      const dedupeList = Array.from(this.deduplicationCache.entries())
        .slice(-200)
        .map(([key, timestamp]) => ({ key, timestamp }));

      safeWriteJsonSync(this.storagePath, {
        notifications: notifsObj,
        deduplication: dedupeList,
        savedAt: Date.now()
      });
    } catch (err) {
      // Non-fatal
    }
  }
}

export const notificationManager = new NotificationManager();
