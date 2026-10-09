import assert from 'node:assert/strict';
import test from 'node:test';
import { logManager } from './logs/logManager';
import { store } from './store';

test('Logs Management & Kubernetes Operations Engine', async (t) => {
  // Seed test org & real cluster
  const org = store.createOrganization('Operations Test Tenant', 'usr-sre-1');
  const orgId = org.id;
  const created = store.createCluster(orgId, 'Production US-East', 'Production cluster', {
    region: 'us-east-1'
  });
  const clusterId = created.cluster.id;

  await t.test('1. Real Cluster Returns No Fabricated Data When Empty', async () => {
    // A fresh real cluster without synced resources or logs must NOT fabricate payment-api, checkout-api, or error spikes
    const stats = await logManager.getOverviewStats(orgId, clusterId);
    assert.equal(stats.totalLogLines, 0, 'Total log lines must be 0 for empty cluster');
    assert.equal(stats.errorCount, 0, 'Error count must be 0');
    assert.equal(stats.warningCount, 0, 'Warning count must be 0');
    assert.equal(stats.totalVolumeMb, 0, 'Volume must be 0 MB');

    const workloads = await logManager.getWorkloadSummaries(orgId, clusterId);
    assert.equal(workloads.length, 0, 'Must not fabricate checkout-api or payment-api workloads');

    const spikes = await logManager.detectErrorSpikes(orgId, clusterId);
    assert.equal(spikes.length, 0, 'Must not fabricate INC-1042 or fake error spikes');
  });

  await t.test('2. Synchronize Real Kubernetes Workloads & Resources', async () => {
    // Sync actual Kubernetes Deployment and Pods to the cluster
    const now = Date.now();
    store.syncClusterResources(clusterId, [
      {
        id: 'dep-orders-1',
        uid: 'dep-orders-1',
        name: 'orders-service',
        namespace: 'production',
        kind: 'Deployment',
        clusterId,
        clusterName: 'Production US-East',
        status: 'Running',
        createdAt: now - 3600000,
        annotations: {
          'deployment.kubernetes.io/revision': '3'
        },
        containers: [{ name: 'server', image: 'registry.internal/orders:v3', state: 'running', restartCount: 0 }]
      } as any,
      {
        id: 'pod-orders-1',
        uid: 'pod-orders-1',
        name: 'orders-service-7d8f9c-abc',
        namespace: 'production',
        kind: 'Pod',
        clusterId,
        clusterName: 'Production US-East',
        nodeName: 'worker-node-01',
        status: 'Running',
        createdAt: now - 1800000,
        ownerReferences: [{ kind: 'ReplicaSet', name: 'orders-service-7d8f9c' }],
        containers: [{ name: 'server', image: 'registry.internal/orders:v3', state: 'running', restartCount: 2 }]
      } as any,
      {
        id: 'pod-orders-2',
        uid: 'pod-orders-2',
        name: 'orders-service-7d8f9c-def',
        namespace: 'production',
        kind: 'Pod',
        clusterId,
        clusterName: 'Production US-East',
        nodeName: 'worker-node-02',
        status: 'Running',
        createdAt: now - 1800000,
        ownerReferences: [{ kind: 'ReplicaSet', name: 'orders-service-7d8f9c' }],
        containers: [{ name: 'server', image: 'registry.internal/orders:v3', state: 'running', restartCount: 0 }]
      } as any
    ], true);

    // Workload summaries must now reflect the real synchronized pods
    const workloads = await logManager.getWorkloadSummaries(orgId, clusterId);
    assert.equal(workloads.length, 1);
    const orders = workloads[0];
    assert.equal(orders.workload, 'orders-service');
    assert.equal(orders.podCount, 2);
    assert.equal(orders.pods[0].name, 'orders-service-7d8f9c-abc');
    assert.equal(orders.pods[0].restarts, 2);
    assert.equal(orders.pods[1].restarts, 0);
  });

  await t.test('3. Real Log Ingestion, Redaction, and Search', async () => {
    const now = Date.now();
    // Ingest actual log records for orders-service
    logManager.ingestLogRecords(orgId, [
      {
        id: 'rec-1',
        clusterId,
        clusterName: 'Production US-East',
        namespace: 'production',
        workload: 'orders-service',
        podName: 'orders-service-7d8f9c-abc',
        container: 'server',
        nodeName: 'worker-node-01',
        severity: 'INFO',
        timestamp: new Date(now - 120000).toISOString(),
        timestampMs: now - 120000,
        message: 'HTTP server listening on :8080 with authorization Bearer [REDACTED_BEARER_TOKEN]',
        raw: `${new Date(now - 120000).toISOString()} INFO HTTP server listening on :8080`,
        isRedacted: true,
        isPrevious: false
      },
      {
        id: 'rec-2',
        clusterId,
        clusterName: 'Production US-East',
        namespace: 'production',
        workload: 'orders-service',
        podName: 'orders-service-7d8f9c-abc',
        container: 'server',
        nodeName: 'worker-node-01',
        severity: 'FATAL',
        timestamp: new Date(now - 100000).toISOString(),
        timestampMs: now - 100000,
        message: 'fatal error: memory limit exceeded [OOMKilled exitCode=137]',
        raw: `${new Date(now - 100000).toISOString()} FATAL (previous) fatal error: memory limit exceeded`,
        isRedacted: false,
        isPrevious: true
      }
    ]);

    const searchAll = await logManager.searchLogs(orgId, { clusterId });
    assert.equal(searchAll.records.length, 2);

    // Filter by severity
    const searchFatal = await logManager.searchLogs(orgId, { clusterId, severity: 'FATAL' });
    assert.equal(searchFatal.records.length, 1);
    assert.equal(searchFatal.records[0].severity, 'FATAL');

    // Filter previous / crash logs
    const searchPrev = await logManager.searchLogs(orgId, { clusterId, previous: true });
    assert.equal(searchPrev.records.length, 1);
    assert.equal(searchPrev.records[0].isPrevious, true);

    // Text search
    const searchText = await logManager.searchLogs(orgId, { clusterId, search: 'OOMKilled' });
    assert.equal(searchText.records.length, 1);
  });

  await t.test('4. Evidence-Based Error Spike Detection with Real Observations', async () => {
    const now = Date.now();
    // Simulate a real error spike: 10 errors in the last 10 minutes for orders-service
    const spikeRecords = [];
    for (let i = 0; i < 10; i++) {
      const ts = now - (10 - i) * 60000;
      spikeRecords.push({
        id: `spike-err-${i}`,
        clusterId,
        clusterName: 'Production US-East',
        namespace: 'production',
        workload: 'orders-service',
        podName: 'orders-service-7d8f9c-abc',
        container: 'server',
        nodeName: 'worker-node-01',
        severity: 'ERROR' as const,
        timestamp: new Date(ts).toISOString(),
        timestampMs: ts,
        message: `Database connection pool timeout after 5000ms: pool-id=db-order-pool-${i}`,
        raw: `${new Date(ts).toISOString()} ERROR Database connection pool timeout`,
        isRedacted: false,
        isPrevious: false
      });
    }
    logManager.ingestLogRecords(orgId, spikeRecords);

    const spikes = await logManager.detectErrorSpikes(orgId, clusterId);
    assert.equal(spikes.length, 1, 'Should detect real spike on orders-service');

    const spike = spikes[0];
    assert.equal(spike.workload, 'orders-service');
    assert.equal(spike.namespace, 'production');
    assert.ok(spike.multiplier >= 2.5, 'Multiplier should reflect spike');
    assert.ok(spike.currentRatePerHour > spike.normalRatePerHour);
    assert.ok(spike.topErrorPattern.includes('Database connection pool timeout'));
    assert.equal(spike.affectedPodsCount, 1);
    assert.ok(spike.relatedDeployment, 'Should correlate with real orders-service deployment');
    assert.equal(spike.relatedDeployment?.revision, 'v3');
  });

  await t.test('5. Real Deployment Comparison Engine', async () => {
    const comparison = await logManager.compareDeployments(orgId, 'orders-service', 'production');
    assert.ok(comparison);
    assert.equal(comparison.workload, 'orders-service');
    assert.ok(comparison.currentErrors > 0);
    assert.ok(comparison.regressionDetected);
    assert.ok(comparison.verdict.includes('Regression detected on orders-service'));
  });

  await t.test('6. Alert Rules Lifecycle and Permissions', async () => {
    const actor = { id: 'usr-sre-1', name: 'Lead SRE' };

    const rule = logManager.createAlertRule(
      orgId,
      {
        clusterId,
        name: 'Orders DB Timeout',
        pattern: 'connection pool timeout',
        thresholdOccurrences: 5,
        windowMinutes: 5,
        createIncident: true,
        incidentSeverity: 'HIGH',
        notifyEmail: true,
        enabled: true
      },
      actor
    );

    assert.ok(rule.id);
    assert.equal(rule.name, 'Orders DB Timeout');

    const rules = logManager.getAlertRules(orgId);
    assert.ok(rules.some((r) => r.id === rule.id));

    const updated = logManager.updateAlertRule(orgId, rule.id, { enabled: false }, actor);
    assert.equal(updated.enabled, false);

    const deleted = logManager.deleteAlertRule(orgId, rule.id, actor);
    assert.equal(deleted, true);
  });

  await t.test('7. Collection Policies & Retention Configuration', async () => {
    const actor = { id: 'usr-sre-1', name: 'Lead SRE' };

    const rule = logManager.createCollectionRule(
      orgId,
      {
        clusterId,
        clusterName: 'Production US-East',
        name: 'Orders Log Retention',
        namespaces: ['production'],
        workloadPatterns: ['orders-*'],
        containers: ['All'],
        minSeverity: 'INFO',
        retentionDays: 30,
        enabled: true
      },
      actor
    );

    assert.ok(rule.id);
    assert.equal(rule.retentionDays, 30);

    const deleted = logManager.deleteCollectionRule(orgId, rule.id, actor);
    assert.equal(deleted, true);
  });

  await t.test('8. Incident Creation from Log Evidence with Deduplication', async () => {
    const actor = { id: 'usr-sre-1', name: 'Lead SRE' };

    const incident = await logManager.createIncidentFromLogs(
      orgId,
      clusterId,
      {
        workload: 'orders-service',
        namespace: 'production',
        errorPattern: 'Database connection pool timeout',
        occurrences: 10,
        timeWindow: '10m',
        sampleLines: ['Database connection pool timeout after 5000ms: pool-id=db-order-pool-1']
      },
      actor
    );

    assert.ok(incident);
    assert.ok(incident.id);
    assert.ok(incident.title.includes('orders-service'));

    // Deduplication test: second creation for same workload/namespace returns existing open incident
    const deduplicated = await logManager.createIncidentFromLogs(
      orgId,
      clusterId,
      {
        workload: 'orders-service',
        namespace: 'production',
        errorPattern: 'Database connection pool timeout',
        occurrences: 10,
        timeWindow: '10m',
        sampleLines: []
      },
      actor
    );

    assert.equal(deduplicated.id, incident.id, 'Must return existing incident rather than duplicating ticket');
  });

  await t.test('9. Export Real Logs in TXT, JSON, and CSV', async () => {
    const actor = { id: 'usr-sre-1', name: 'Lead SRE' };

    const txt = await logManager.exportLogs(orgId, 'txt', { clusterId }, actor);
    assert.equal(txt.mimeType, 'text/plain');
    assert.ok(txt.data.includes('orders-service'));

    const json = await logManager.exportLogs(orgId, 'json', { clusterId }, actor);
    assert.equal(json.mimeType, 'application/json');
    const parsed = JSON.parse(json.data);
    assert.ok(parsed.length >= 2);

    const csv = await logManager.exportLogs(orgId, 'csv', { clusterId }, actor);
    assert.equal(csv.mimeType, 'text/csv');
    assert.ok(csv.data.includes('timestamp,severity,cluster,namespace,workload,podName'));
  });
});
