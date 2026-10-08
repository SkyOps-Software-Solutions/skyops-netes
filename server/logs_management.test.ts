import assert from 'node:assert/strict';
import test from 'node:test';
import { logManager } from './logs/logManager';
import { store } from './store';

test('Logs Management & Kubernetes Operations Engine', async (t) => {
  // Seed test org & cluster
  const org = store.createOrganization('Operations Test Tenant', 'usr-sre-1');
  const orgId = org.id;
  const cluster = store.createCluster(orgId, {
    name: 'Production US-East',
    region: 'us-east-1'
  } as any);
  const clusterId = cluster.id;

  await t.test('1. Operational Overview Statistics', async () => {
    const stats = await logManager.getOverviewStats(orgId, clusterId);
    assert.ok(stats, 'Stats should be returned');
    assert.ok(typeof stats.totalVolumeMb === 'number', 'Total volume in MB should be numeric');
    assert.ok(typeof stats.errorCount === 'number', 'Error count should be numeric');
    assert.ok(typeof stats.warningCount === 'number', 'Warning count should be numeric');
    assert.ok(typeof stats.errorChangePercent === 'number', 'Error change percent should be numeric');
    assert.ok(typeof stats.activeAlertsCount === 'number', 'Active alerts count should be numeric');
    assert.ok(stats.retentionDays >= 3, 'Retention days should be at least 3');
  });

  await t.test('2. Workload-First Investigation Summaries', async () => {
    const res = await logManager.getWorkloadSummaries(orgId, clusterId);
    assert.ok(Array.isArray(res), 'Workloads should be an array');
    assert.ok(res.length > 0, 'Should have workload summaries');

    const paymentOrCheckout = res.find((w) => w.workload.includes('payment') || w.workload.includes('checkout'));
    assert.ok(paymentOrCheckout, 'Should have payment or checkout workload summary');
    assert.ok(paymentOrCheckout.podCount > 0, 'Pod count should be positive');
    assert.ok(Array.isArray(paymentOrCheckout.pods), 'Pods list should be present');
    assert.ok(paymentOrCheckout.pods.length > 0, 'Should have breakdown of individual pods');
    
    // Each pod should track errors, restarts, and status
    const firstPod = paymentOrCheckout.pods[0];
    assert.ok(firstPod.name, 'Pod name should be present');
    assert.ok(typeof firstPod.errors === 'number', 'Pod errors should be tracked');
    assert.ok(typeof firstPod.restarts === 'number', 'Pod restarts should be tracked');
    assert.ok(firstPod.status, 'Pod status should be tracked');
  });

  await t.test('3. Log Search with Filters and Structured Queries', async () => {
    const results = await logManager.searchLogs(orgId, {
      clusterId,
      limit: 100
    });
    assert.ok(results.records.length > 0, 'Should return records');
    assert.ok(results.totalMatches >= results.records.length, 'Total matches should reflect count');

    // Test severity filter
    const errorLogs = await logManager.searchLogs(orgId, {
      clusterId,
      severity: 'ERROR',
      limit: 50
    });
    for (const r of errorLogs.records) {
      assert.equal(r.severity, 'ERROR', 'Every returned record must have severity ERROR');
    }

    // Test text search
    const textSearch = await logManager.searchLogs(orgId, {
      clusterId,
      search: 'connection',
      limit: 50
    });
    for (const r of textSearch.records) {
      const match = r.message.toLowerCase().includes('connection') || r.raw.toLowerCase().includes('connection');
      assert.ok(match, 'Message must contain searched keyword');
    }
  });

  await t.test('4. CrashLoopBackOff & Previous Container Logs', async () => {
    const prevLogs = await logManager.searchLogs(orgId, {
      clusterId,
      previous: true,
      limit: 50
    });
    assert.ok(Array.isArray(prevLogs.records), 'Should return previous logs array');
    for (const r of prevLogs.records) {
      assert.equal(r.isPrevious, true, 'isPrevious flag should be true');
    }
  });

  await t.test('5. Operational Error Spike Detection & What Changed Correlation', async () => {
    const spikes = await logManager.detectErrorSpikes(orgId, clusterId);
    assert.ok(Array.isArray(spikes), 'Spikes should be an array');
    assert.ok(spikes.length > 0, 'Should detect error spike on affected workloads');

    const spike = spikes[0];
    assert.ok(spike.multiplier > 1, 'Error spike multiplier should be greater than 1');
    assert.ok(spike.currentRatePerHour > spike.normalRatePerHour, 'Current error rate should exceed normal rate');
    assert.ok(spike.topErrorPattern, 'Top error pattern should be identified');
    assert.ok(spike.spikeStartedAt > 0, 'Spike start timestamp should be specified');

    // Section 11: What Changed Correlation with known deployment
    if (spike.relatedDeployment) {
      assert.ok(spike.relatedDeployment.workload, 'Correlated deployment must identify workload');
      assert.ok(spike.relatedDeployment.revision, 'Correlated deployment must identify revision');
      assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(spike.relatedDeployment.confidence), 'Confidence must be HIGH, MEDIUM, or LOW');
    }
  });

  await t.test('6. Deployment Comparison Engine', async () => {
    const comparison = await logManager.compareDeployments(orgId, 'checkout-api', 'production');
    assert.ok(comparison, 'Comparison result should be returned');
    assert.equal(comparison.workload, 'checkout-api');
    assert.ok(comparison.currentRevision, 'Current revision should be present');
    assert.ok(comparison.previousRevision, 'Previous revision should be present');
    assert.ok(typeof comparison.regressionDetected === 'boolean', 'Regression detection boolean should be present');
    assert.ok(comparison.verdict, 'Verdict should provide operational context');
  });

  await t.test('7. Log Alert Rules Lifecycle', async () => {
    const actor = { id: 'usr-sre-1', name: 'Lead SRE' };

    // Create alert rule
    const rule = logManager.createAlertRule(
      orgId,
      {
        clusterId,
        name: 'Payment Gateway Refused',
        pattern: 'connection refused',
        thresholdOccurrences: 20,
        windowMinutes: 5,
        createIncident: true,
        incidentSeverity: 'HIGH',
        notifyEmail: true,
        notifyWebhook: false,
        enabled: true
      },
      actor
    );

    assert.ok(rule.id, 'Alert rule should have an id');
    assert.equal(rule.name, 'Payment Gateway Refused');
    assert.equal(rule.pattern, 'connection refused');

    // List rules
    const rules = logManager.getAlertRules(orgId);
    assert.ok(rules.some((r) => r.id === rule.id), 'Created rule should be in list');

    // Update rule
    const updated = logManager.updateAlertRule(orgId, rule.id, { enabled: false }, actor);
    assert.equal(updated.enabled, false, 'Rule should now be disabled');

    // Delete rule
    const deleted = logManager.deleteAlertRule(orgId, rule.id, actor);
    assert.equal(deleted, true, 'Rule deletion should succeed');
  });

  await t.test('8. Log Collection Policies & Retention Bounds', async () => {
    const actor = { id: 'usr-sre-1', name: 'Lead SRE' };

    // Create collection rule with 30-day retention
    const rule = logManager.createCollectionRule(
      orgId,
      {
        clusterId,
        clusterName: 'Production US-East',
        name: 'Production Workload Collection',
        namespaces: ['production', 'payments'],
        workloadPatterns: ['checkout-*', 'payment-*'],
        containers: ['All'],
        minSeverity: 'INFO',
        retentionDays: 30,
        enabled: true
      },
      actor
    );

    assert.ok(rule.id, 'Collection rule should have an id');
    assert.equal(rule.retentionDays, 30, 'Retention days should be 30');
    assert.deepEqual(rule.namespaces, ['production', 'payments']);

    // List rules
    const rules = logManager.getCollectionRules(orgId);
    assert.ok(rules.some((r) => r.id === rule.id), 'Created policy should be in list');

    // Delete rule
    const deleted = logManager.deleteCollectionRule(orgId, rule.id, actor);
    assert.equal(deleted, true, 'Collection policy deletion should succeed');
  });

  await t.test('9. Connect Log Evidence to Incident with Deduplication', async () => {
    const actor = { id: 'usr-sre-1', name: 'Lead SRE' };

    const incident = await logManager.createIncidentFromLogs(
      orgId,
      clusterId,
      {
        workload: 'checkout-api',
        namespace: 'production',
        errorPattern: 'Redis connection refused at redis-master:6379',
        occurrences: 1284,
        timeWindow: '5m',
        sampleLines: ['Redis connection refused at redis-master.production.svc.cluster.local:6379']
      },
      actor
    );

    assert.ok(incident, 'Incident should be created');
    assert.ok(incident.id, 'Incident should have an ID');
    assert.ok(incident.title.includes('checkout-api'), 'Incident title should mention workload');

    // Verify deduplication: attempting to create again returns existing incident
    const secondCall = await logManager.createIncidentFromLogs(
      orgId,
      clusterId,
      {
        workload: 'checkout-api',
        namespace: 'production',
        errorPattern: 'Redis connection refused at redis-master:6379',
        occurrences: 1284,
        timeWindow: '5m',
        sampleLines: []
      },
      actor
    );

    assert.equal(secondCall.id, incident.id, 'Deduplication must return existing active incident');
  });

  await t.test('10. Export Logs in TXT, JSON, and CSV', async () => {
    const actor = { id: 'usr-sre-1', name: 'Lead SRE' };

    const txtExport = await logManager.exportLogs(orgId, 'txt', { clusterId }, actor);
    assert.equal(txtExport.mimeType, 'text/plain');
    assert.ok(txtExport.filename.endsWith('.txt'));
    assert.ok(txtExport.data.length > 0);

    const jsonExport = await logManager.exportLogs(orgId, 'json', { clusterId }, actor);
    assert.equal(jsonExport.mimeType, 'application/json');
    assert.ok(jsonExport.filename.endsWith('.json'));
    const parsed = JSON.parse(jsonExport.data);
    assert.ok(Array.isArray(parsed));

    const csvExport = await logManager.exportLogs(orgId, 'csv', { clusterId }, actor);
    assert.equal(csvExport.mimeType, 'text/csv');
    assert.ok(csvExport.filename.endsWith('.csv'));
    assert.ok(csvExport.data.includes('timestamp,severity,cluster,namespace,workload,podName'));
  });
});
