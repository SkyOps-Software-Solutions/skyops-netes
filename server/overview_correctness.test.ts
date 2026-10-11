import test from 'node:test';
import assert from 'node:assert/strict';
import { DataStore } from './store';

test('Overview Correctness — Zero clusters empty state', () => {
  const ds = new DataStore();
  const org = ds.createOrganization('Acme Corp', 'user-1');

  const metrics = ds.getOverviewMetrics(org.id);
  assert.equal(metrics.totalClusters, 0);
  assert.equal(metrics.connectedAgents, 0);
  assert.equal(metrics.offlineAgents, 0);
  assert.equal(metrics.pendingClusters, 0);
  assert.equal(metrics.openIncidents, 0);
  assert.equal(metrics.telemetryFreshness?.state, 'NO_CLUSTERS');
  assert.equal(metrics.telemetryFreshness?.isFresh, false);

  assert.ok(metrics.investigateNext && metrics.investigateNext.length > 0);
  assert.equal(metrics.investigateNext[0].actionType, 'add_cluster');
});

test('Overview Correctness — Pending cluster without agent telemetry', () => {
  const ds = new DataStore();
  const org = ds.createOrganization('Acme Corp', 'user-1');
  const { cluster } = ds.createCluster(org.id, 'Staging Cluster', 'Pending install');

  assert.equal(cluster.agentStatus, 'PENDING');
  assert.equal(cluster.lastHeartbeat, undefined);

  const metrics = ds.getOverviewMetrics(org.id);
  assert.equal(metrics.totalClusters, 1);
  assert.equal(metrics.pendingClusters, 1);
  assert.equal(metrics.connectedAgents, 0);
  assert.equal(metrics.totalNodes, 0);
  assert.equal(metrics.totalPods, 0);
  assert.equal(metrics.telemetryFreshness?.state, 'PENDING');

  const nextSteps = metrics.investigateNext || [];
  const installStep = nextSteps.find((s) => s.targetId === cluster.id);
  assert.ok(installStep, 'Should produce install recommendation for pending cluster');
  assert.equal(installStep?.actionType, 'navigate_cluster');
});

test('Overview Correctness — Live connected cluster with nominal health', () => {
  const ds = new DataStore();
  const org = ds.createOrganization('Acme Corp', 'user-1');
  const { cluster } = ds.createCluster(org.id, 'Production Cluster');

  // Simulate active agent heartbeat
  ds.recordAgentHeartbeat(cluster.id, 'v2.4.0', 'v1.29.2', 5, 42);

  const updatedCluster = ds.getCluster(cluster.id);
  assert.equal(updatedCluster?.agentStatus, 'CONNECTED');
  assert.equal(updatedCluster?.status, 'HEALTHY');

  const metrics = ds.getOverviewMetrics(org.id);
  assert.equal(metrics.totalClusters, 1);
  assert.equal(metrics.healthyClusters, 1);
  assert.equal(metrics.connectedAgents, 1);
  assert.equal(metrics.offlineAgents, 0);
  assert.equal(metrics.totalNodes, 5);
  assert.equal(metrics.totalPods, 42);
  assert.equal(metrics.telemetryFreshness?.state, 'LIVE');
  assert.equal(metrics.telemetryFreshness?.isFresh, true);
  assert.equal(metrics.attentionResourceIssue?.hasSignificantIssue, false);
});

test('Overview Correctness — Failing pods and node pressure detection', () => {
  const ds = new DataStore();
  const org = ds.createOrganization('Acme Corp', 'user-1');
  const { cluster } = ds.createCluster(org.id, 'Prod US-East');

  ds.recordAgentHeartbeat(cluster.id, 'v2.4.0', 'v1.29.2', 3, 15);

  // Inject a crashing pod and a pressure node
  ds.syncClusterResources(cluster.id, [
    {
      id: 'pod-checkout-crash',
      clusterId: cluster.id,
      name: 'checkout-api-7b8f9c-d4',
      namespace: 'production',
      kind: 'Pod',
      status: 'CrashLoopBackOff',
      health: 'CRITICAL',
      containers: [{ name: 'checkout', restartCount: 12, ready: false, image: 'checkout:v1.2', state: 'waiting' }],
      createdAt: Date.now() - 3600000,
      updatedAt: Date.now()
    },
    {
      id: 'node-worker-pressure',
      clusterId: cluster.id,
      name: 'ip-10-0-12-44.ec2.internal',
      namespace: 'cluster-wide',
      kind: 'Node',
      status: 'Ready',
      health: 'WARNING',
      conditions: [
        { type: 'Ready', status: 'True' },
        { type: 'MemoryPressure', status: 'True' }
      ],
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now()
    }
  ]);

  const metrics = ds.getOverviewMetrics(org.id);
  assert.equal(metrics.crashingPods, 1);
  assert.equal(metrics.pressureNodes, 1);
  assert.equal(metrics.attentionResourceIssue?.hasSignificantIssue, true);
  assert.ok(metrics.failingResources && metrics.failingResources.length >= 2);

  const crashingPodItem = metrics.failingResources.find((r) => r.name === 'checkout-api-7b8f9c-d4');
  assert.ok(crashingPodItem);
  assert.equal(crashingPodItem?.status, 'CrashLoopBackOff');
  assert.equal(crashingPodItem?.restartCount, 12);
});

test('Overview Correctness — Critical Incident prioritization in Investigate Next', () => {
  const ds = new DataStore();
  const org = ds.createOrganization('Acme Corp', 'user-1');
  const { cluster } = ds.createCluster(org.id, 'Prod US-East');
  ds.recordAgentHeartbeat(cluster.id, 'v2.4.0', 'v1.29.2', 4, 20);

  // Create real critical incident
  const incident = ds.createIncident(org.id, cluster.id, {
    title: 'Severe CrashLoopBackOff in payment-gateway',
    severity: 'CRITICAL',
    resourceKind: 'Deployment',
    resourceName: 'payment-gateway',
    namespace: 'payments'
  });

  const metrics = ds.getOverviewMetrics(org.id);
  assert.equal(metrics.openIncidents, 1);
  assert.equal(metrics.criticalIncidents, 1);

  const topNext = metrics.investigateNext?.[0];
  assert.ok(topNext);
  assert.equal(topNext?.priority, 'CRITICAL');
  assert.equal(topNext?.actionType, 'navigate_incident');
  assert.equal(topNext?.targetId, incident.id);
});

test('Overview Correctness — Offline agent diagnostics and command hint', () => {
  const ds = new DataStore();
  const org = ds.createOrganization('Acme Corp', 'user-1');
  const { cluster } = ds.createCluster(org.id, 'Prod EU-West');

  // Set stale heartbeat (> 5 minutes ago)
  const staleTime = Date.now() - 360000;
  cluster.lastHeartbeat = staleTime;
  cluster.lastHeartbeatAt = staleTime;
  cluster.agentStatus = 'OFFLINE';
  cluster.status = 'AGENT_OFFLINE';

  const metrics = ds.getOverviewMetrics(org.id);
  assert.equal(metrics.offlineAgents, 1);
  assert.equal(metrics.offlineClusters, 1);
  assert.equal(metrics.telemetryFreshness?.state, 'OFFLINE');

  const offlineAction = metrics.investigateNext?.find((a) => a.targetId === cluster.id);
  assert.ok(offlineAction);
  assert.equal(offlineAction?.priority, 'HIGH');
  assert.ok(offlineAction?.commandHint?.includes('kubectl logs -n skyops'));
});

test('Overview Correctness — Tenant Isolation', () => {
  const ds = new DataStore();
  const orgA = ds.createOrganization('Org A', 'user-a');
  const orgB = ds.createOrganization('Org B', 'user-b');

  const { cluster: clusterA } = ds.createCluster(orgA.id, 'Cluster A');
  ds.recordAgentHeartbeat(clusterA.id, 'v2.4.0', 'v1.29.2', 10, 100);

  ds.createIncident(orgA.id, clusterA.id, {
    title: 'Incident in Org A',
    severity: 'CRITICAL',
    resourceKind: 'Pod',
    resourceName: 'pod-a',
    namespace: 'default'
  });

  const metricsA = ds.getOverviewMetrics(orgA.id);
  const metricsB = ds.getOverviewMetrics(orgB.id);

  assert.equal(metricsA.totalClusters, 1);
  assert.equal(metricsA.openIncidents, 1);
  assert.equal(metricsA.totalNodes, 10);

  // Org B must be strictly isolated
  assert.equal(metricsB.totalClusters, 0);
  assert.equal(metricsB.openIncidents, 0);
  assert.equal(metricsB.totalNodes, 0);
  assert.equal(metricsB.telemetryFreshness?.state, 'NO_CLUSTERS');
});
