import assert from 'node:assert/strict';
import test from 'node:test';
import { store } from './store';
import { logManager } from './logs/logManager';
import { incidentNotificationService } from './notifications/notificationService';
import { generateLogAlertEmail } from './notifications/emailTemplate';

test('Production-Ready Log Alerts & Centralized Notification Center', async (t) => {
  // Setup clean test organization and cluster
  const org = store.createOrganization('Alerting Test Org', 'usr-sre-test');
  const orgId = org.id;

  const clusterRes = store.createCluster(orgId, 'Staging Cluster US-West', 'Staging environment', {
    region: 'us-west-2'
  });
  const clusterId = clusterRes.cluster.id;

  // Sync a real Pod into the cluster
  const now = Date.now();
  store.syncClusterResources(
    clusterId,
    [
      {
        id: 'pod-payment-service-1',
        uid: 'pod-payment-service-1',
        name: 'payment-service-7f89d-abc',
        namespace: 'payments',
        kind: 'Pod',
        clusterId,
        clusterName: 'Staging Cluster US-West',
        status: 'Running',
        createdAt: now - 3600000,
        containers: [
          {
            name: 'payment-gateway',
            image: 'registry.internal/payments:v2.1',
            ready: true,
            state: 'running',
            restartCount: 0
          }
        ]
      } as any
    ],
    true
  );

  await t.test('1. Time-Range (Since) Query and Timestamp Filtering', async () => {
    // Seed pod logs cache with a mix of timestamps:
    // Line 1: 2 hours ago (7200s ago)
    // Line 2: 20 minutes ago (1200s ago)
    // Line 3: 2 minutes ago (120s ago)
    const t2h = new Date(now - 7200 * 1000).toISOString();
    const t20m = new Date(now - 1200 * 1000).toISOString();
    const t2m = new Date(now - 120 * 1000).toISOString();

    const rawLogs = [
      `${t2h} INFO Payment gateway worker initialized`,
      `${t20m} WARN High latency observed on database connection pool (poolSize=20, active=18)`,
      `${t2m} ERROR Unhandled database exception: connection pool exhausted password=SuperSecretPassword123!`
    ].join('\n');

    // Store in cache for on-demand retrieval simulation
    const cacheKey = `${clusterId}:payments:payment-service-7f89d-abc:payment-gateway:curr`;
    (store as any).podLogsCache.set(cacheKey, {
      logs: rawLogs,
      source: 'agent',
      status: 'SUCCESS',
      updatedAt: now
    });

    // A. Query All Time (sinceSeconds = undefined)
    const allLogs = await store.getPodLogs(clusterId, orgId, 'payments', 'payment-service-7f89d-abc', {
      container: 'payment-gateway',
      sinceSeconds: undefined
    });
    assert.equal(allLogs.statusCategory, 'SUCCESS');
    assert.equal(allLogs.lines.length, 3, 'All Time must return all 3 log records');

    // B. Query Last 15 minutes (900 seconds)
    const last15m = await store.getPodLogs(clusterId, orgId, 'payments', 'payment-service-7f89d-abc', {
      container: 'payment-gateway',
      sinceSeconds: 900
    });
    assert.equal(last15m.statusCategory, 'SUCCESS');
    assert.equal(last15m.lines.length, 1, 'Last 15m must only return the record from 2m ago');
    assert.ok(last15m.lines[0].message.includes('Unhandled database exception'));

    // C. Query Last 1 minute (60 seconds) -> No logs in this window
    const last1m = await store.getPodLogs(clusterId, orgId, 'payments', 'payment-service-7f89d-abc', {
      container: 'payment-gateway',
      sinceSeconds: 60
    });
    assert.equal(last1m.statusCategory, 'EMPTY_LOGS');
    assert.equal(last1m.lines.length, 0);
    assert.ok(
      last1m.unavailableReason?.includes('historical records exist outside this window'),
      'Must explain that older records exist outside window'
    );
  });

  await t.test('2. Pod Log Alert Subscription Lifecycle', async () => {
    // Subscribe to alerts for payment-service / payment-gateway
    const sub = store.setPodAlertSubscription(orgId, {
      clusterId,
      namespace: 'payments',
      podName: 'payment-service-7f89d-abc',
      container: 'payment-gateway',
      enabled: true,
      minSeverity: 'ERROR',
      notifyEmail: true,
      userId: 'usr-sre-test',
      orgId
    });

    assert.ok(sub.id.startsWith('pod-sub-'));
    assert.equal(sub.enabled, true);
    assert.equal(sub.minSeverity, 'ERROR');

    // Verify retrieval
    const retrieved = store.getPodAlertSubscription(
      orgId,
      clusterId,
      'payments',
      'payment-service-7f89d-abc',
      'payment-gateway'
    );
    assert.ok(retrieved);
    assert.equal(retrieved?.id, sub.id);
    assert.equal(retrieved?.enabled, true);

    // Disable subscription (preserving configuration)
    const disabled = store.setPodAlertSubscription(orgId, {
      clusterId,
      namespace: 'payments',
      podName: 'payment-service-7f89d-abc',
      container: 'payment-gateway',
      enabled: false,
      minSeverity: 'ERROR',
      notifyEmail: true,
      userId: 'usr-sre-test',
      orgId
    });
    assert.equal(disabled.id, sub.id, 'Must preserve subscription ID on update');
    assert.equal(disabled.enabled, false);

    // Re-enable subscription
    store.setPodAlertSubscription(orgId, {
      clusterId,
      namespace: 'payments',
      podName: 'payment-service-7f89d-abc',
      container: 'payment-gateway',
      enabled: true,
      minSeverity: 'ERROR',
      notifyEmail: true,
      userId: 'usr-sre-test',
      orgId
    });
  });

  await t.test('3. Real Log Alert Triggering & Sensitive Data Redaction', async () => {
    // Mark cluster as connected for alerting
    const cluster = store.getCluster(clusterId, orgId)!;
    cluster.agentStatus = 'CONNECTED';
    cluster.lastHeartbeat = Date.now();

    // Trigger log records with ERROR containing password credentials
    const errTimestamp = new Date().toISOString();
    logManager.ingestLogRecords(orgId, [
      {
        id: `rec-err-${Date.now()}-1`,
        clusterId,
        clusterName: 'Staging Cluster US-West',
        namespace: 'payments',
        workload: 'payment-service',
        podName: 'payment-service-7f89d-abc',
        container: 'payment-gateway',
        severity: 'ERROR',
        timestamp: errTimestamp,
        timestampMs: Date.now(),
        message: 'FATAL Crash: Failed auth to Redis password="SuperSecretRedisPassword" at redis://admin:SecretPass123@10.0.4.12:6379',
        raw: `${errTimestamp} ERROR Failed auth to Redis password="SuperSecretRedisPassword" at redis://admin:SecretPass123@10.0.4.12:6379`
      }
    ]);

    // Check Notification Center
    const notifRes = store.getNotifications(orgId);
    assert.ok(notifRes.notifications.length > 0, 'Notification must be recorded in centralized center');

    const latestNotif = notifRes.notifications[0];
    assert.equal(latestNotif.type, 'LOG_ALERT');
    assert.equal(latestNotif.severity, 'CRITICAL');
    assert.equal(latestNotif.podName, 'payment-service-7f89d-abc');
    assert.equal(latestNotif.container, 'payment-gateway');
    assert.equal(latestNotif.read, false);

    // Verify secret redaction
    assert.ok(
      !latestNotif.redactedExcerpt?.includes('SuperSecretRedisPassword'),
      'Raw password must NOT leak in notification excerpt'
    );
    assert.ok(
      !latestNotif.redactedExcerpt?.includes('SecretPass123'),
      'URL credentials must NOT leak in notification excerpt'
    );
  });

  await t.test('4. Centralized Notification Center Lifecycle', async () => {
    const initial = store.getNotifications(orgId);
    assert.ok(initial.notifications.length >= 1);
    const targetId = initial.notifications[0].id;

    // A. Mark as read
    const marked = store.markNotificationAsRead(orgId, targetId);
    assert.equal(marked, true);
    const afterMark = store.getNotifications(orgId);
    const updated = afterMark.notifications.find((n) => n.id === targetId);
    assert.equal(updated?.read, true);

    // B. Mark all as read
    store.createNotification({
      orgId,
      type: 'LOG_ALERT',
      severity: 'HIGH',
      title: 'Second Alert',
      message: 'Second error detected'
    });
    const unreadCount = store.markAllNotificationsAsRead(orgId);
    assert.ok(unreadCount >= 1);
    assert.equal(store.getNotifications(orgId).totalUnread, 0);

    // C. Clear read notifications
    const cleared = store.clearReadNotifications(orgId);
    assert.ok(cleared >= 1);
    assert.equal(store.getNotifications(orgId).notifications.length, 0);
  });

  await t.test('5. Email Notification Template & Deliverability', async () => {
    const email = generateLogAlertEmail({
      orgName: 'Acme Financial Inc',
      clusterName: 'Production East',
      clusterId: 'cluster-prod-1',
      namespace: 'payments',
      podName: 'payment-service-7f89d-abc',
      container: 'payment-gateway',
      severity: 'ERROR',
      timestamp: new Date().toISOString(),
      excerpt: 'Database connection failed password=SuperSecretPassword',
      appUrl: 'https://skyops.ai',
      recipientEmail: 'sre-lead@acme.com',
      ruleName: 'Pod Alert: payment-service-7f89d-abc/payment-gateway'
    });

    assert.ok(email.subject.includes('[SkyOps Log Alert]'));
    assert.ok(email.subject.includes('payment-service-7f89d-abc'));
    assert.ok(email.html.includes('SKYOPS'));
    assert.ok(email.html.includes('payment-gateway'));
    assert.ok(!email.html.includes('SuperSecretPassword'), 'Secret must be redacted from email');
    assert.ok(email.html.includes('One-Click Unsubscribe') || email.html.includes('Unsubscribe'));
    assert.ok(email.text.includes('View Container Logs'));
  });
});
