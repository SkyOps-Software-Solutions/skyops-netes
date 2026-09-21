import test from 'node:test';
import assert from 'node:assert/strict';
import { store, DataStore } from './store';
import { InMemoryStore } from './persistence/InMemoryStore';
import { KubernetesResource } from '../src/types/index';

test('SkyOps Cluster Persistence & Snapshot Lifecycle Suite (Items 1-10)', async (t) => {
  const testOwnerId = 'user-persistence-lead';
  store.upsertUser({ id: testOwnerId, email: 'lead@skyops.io', name: 'Persistence Lead' });
  const testOrg = store.createOrganization('Durable Systems Org', testOwnerId);
  const orgId = testOrg.id;

  const mockPod = (clusterId: string, name: string, updatedAt = Date.now()): KubernetesResource => ({
    id: `${clusterId}-pod-${name}`,
    clusterId,
    kind: 'Pod',
    name,
    namespace: 'production',
    status: 'Running',
    health: 'HEALTHY',
    createdAt: Date.now() - 60000,
    updatedAt,
    specSummary: {},
    statusSummary: {},
    containers: [{ name: 'main', image: 'nginx:alpine', ready: true, state: 'running', restartCount: 0 }]
  });

  const mockDeployment = (clusterId: string, name: string, updatedAt = Date.now()): KubernetesResource => ({
    id: `${clusterId}-deploy-${name}`,
    clusterId,
    kind: 'Deployment',
    name,
    namespace: 'production',
    status: 'Running',
    health: 'HEALTHY',
    createdAt: Date.now() - 120000,
    updatedAt,
    specSummary: { replicas: 3 },
    statusSummary: { readyReplicas: 3, availableReplicas: 3 }
  });

  // 1. Fresh agent registration creates cluster
  await t.test('1. Fresh agent registration creates cluster', async () => {
    const { cluster, rawToken } = store.createCluster(orgId, 'cluster-fresh-reg');
    assert.ok(cluster.id.startsWith('cls-'));
    assert.equal(cluster.status, 'pending');
    assert.equal(cluster.agentStatus, 'PENDING');

    // Register agent
    const reg = store.registerAgent(cluster.id, 'v1.6.0', 'v1.31.0');
    assert.equal(reg.status, 'REGISTERED');
    assert.equal(reg.clusterId, cluster.id);

    const afterReg = store.getCluster(cluster.id, orgId);
    assert.ok(afterReg);
    assert.equal(afterReg?.agentStatus, 'CONNECTED');
    assert.equal(afterReg?.agentVersion, 'v1.6.0');
    assert.equal(afterReg?.k8sVersion, 'v1.31.0');
    assert.equal(afterReg?.connectionState, 'connected');
  });

  // 2. Normal telemetry updates snapshot
  await t.test('2. Normal telemetry updates snapshot and persists', async () => {
    const { cluster } = store.createCluster(orgId, 'cluster-telemetry-snapshot');
    store.registerAgent(cluster.id, 'v1.6.0', 'v1.31.0');

    const pod1 = mockPod(cluster.id, 'api-gateway-1');
    const deploy1 = mockDeployment(cluster.id, 'api-gateway');

    // Ingest telemetry
    const syncRes = store.syncClusterResources(cluster.id, [pod1, deploy1], {
      telemetryTimestamp: Date.now(),
      sequenceNumber: 1
    });

    assert.equal(syncRes.activeResourcesCount, 2);
    assert.equal(syncRes.clusterId, cluster.id);

    // Verify resources returned by query
    const resQuery = store.queryResources(orgId, { clusterId: cluster.id });
    assert.equal(resQuery.resources.length, 2);
    const names = resQuery.resources.map((r) => r.name);
    assert.ok(names.includes('api-gateway-1'));
    assert.ok(names.includes('api-gateway'));

    // Verify cluster lastTelemetrySnapshot and counts
    const updatedCluster = store.getCluster(cluster.id, orgId);
    assert.ok(updatedCluster?.lastTelemetrySnapshot);
    assert.ok(updatedCluster!.lastTelemetrySnapshot! > 0);
    assert.equal(updatedCluster?.podCount, 1);
  });

  // 3. Disconnect leaves snapshot intact
  await t.test('3. Disconnect leaves snapshot intact and does not delete cluster data', async () => {
    const { cluster } = store.createCluster(orgId, 'cluster-disconnect-intact');
    store.registerAgent(cluster.id, 'v1.6.0', 'v1.31.0');

    const pod = mockPod(cluster.id, 'worker-pod-1');
    store.syncClusterResources(cluster.id, [pod]);

    // Ensure resource is present before disconnect
    const beforeDisconnect = store.queryResources(orgId, { clusterId: cluster.id });
    assert.equal(beforeDisconnect.resources.length, 1);

    // Disconnect cluster (agent stops or disconnect action is recorded)
    const disconnected = store.disconnectCluster(cluster.id, orgId, 'Operator scheduled maintenance');
    assert.ok(disconnected);

    const clusterAfter = store.getCluster(cluster.id, orgId);
    assert.ok(clusterAfter);
    assert.equal(clusterAfter?.connectionState, 'offline');
    assert.equal(clusterAfter?.agentStatus, 'OFFLINE');

    // CRITICAL REQUIREMENT: Disconnect MUST NOT delete cluster resources!
    const afterDisconnect = store.queryResources(orgId, { clusterId: cluster.id });
    assert.equal(afterDisconnect.resources.length, 1, 'Resources must remain completely intact after disconnect');
    assert.equal(afterDisconnect.resources[0].name, 'worker-pod-1');
  });

  // 4. Stale/offline transitions preserve resources
  await t.test('4. Stale/offline transitions preserve resources', async () => {
    const { cluster } = store.createCluster(orgId, 'cluster-heartbeat-stale');
    store.registerAgent(cluster.id, 'v1.6.0', 'v1.31.0');

    const pod = mockPod(cluster.id, 'order-service-pod');
    store.syncClusterResources(cluster.id, [pod]);

    // Simulate agent losing connectivity: last heartbeat 100 seconds ago (stale threshold)
    const internalCluster = store.getClusterByIdInternal(cluster.id)!;
    internalCluster.lastHeartbeat = Date.now() - 100_000;
    internalCluster.lastHeartbeatAt = internalCluster.lastHeartbeat;

    // Trigger state evaluation via reconcileClusterConnectionState
    store.reconcileClusterConnectionState(internalCluster, Date.now());

    const staleCluster = store.getCluster(cluster.id, orgId);
    assert.ok(staleCluster);
    assert.equal(staleCluster?.agentStatus, 'STALE');

    // Resources must be completely preserved in stale/offline state
    const staleResources = store.queryResources(orgId, { clusterId: cluster.id });
    assert.equal(staleResources.resources.length, 1);
    assert.equal(staleResources.resources[0].name, 'order-service-pod');

    // Now age heartbeat past offline threshold (e.g. 5 minutes ago)
    internalCluster.lastHeartbeat = Date.now() - 350_000;
    internalCluster.lastHeartbeatAt = internalCluster.lastHeartbeat;
    store.reconcileClusterConnectionState(internalCluster, Date.now());

    const offlineCluster = store.getCluster(cluster.id, orgId);
    assert.equal(offlineCluster?.agentStatus, 'OFFLINE');
    assert.equal(offlineCluster?.connectionState, 'offline');

    // Resources must STILL be completely preserved in offline state
    const offlineResources = store.queryResources(orgId, { clusterId: cluster.id });
    assert.equal(offlineResources.resources.length, 1);
    assert.equal(offlineResources.resources[0].name, 'order-service-pod');
  });

  // 5. Manual delete removes cluster and resources
  await t.test('5. Manual delete explicitly removes cluster and resources', async () => {
    const { cluster } = store.createCluster(orgId, 'cluster-to-be-deleted');
    store.registerAgent(cluster.id, 'v1.6.0', 'v1.31.0');
    store.syncClusterResources(cluster.id, [mockPod(cluster.id, 'doomed-pod')]);

    assert.equal(store.queryResources(orgId, { clusterId: cluster.id }).resources.length, 1);

    // Explicit user action: deleteCluster
    const deleted = store.deleteCluster(cluster.id, orgId);
    assert.equal(deleted, true);

    // Cluster should now be gone
    const clusterAfter = store.getCluster(cluster.id, orgId);
    assert.equal(clusterAfter, null);

    // Resources for this cluster should now be removed
    const resourcesAfter = store.queryResources(orgId, { clusterId: cluster.id });
    assert.equal(resourcesAfter.resources.length, 0);
  });

  // 6. Reconnect resumes updates
  await t.test('6. Reconnect resumes updates and updates snapshot', async () => {
    const { cluster } = store.createCluster(orgId, 'cluster-reconnect-test');
    store.registerAgent(cluster.id, 'v1.6.0', 'v1.31.0');
    store.syncClusterResources(cluster.id, [mockPod(cluster.id, 'pod-v1')]);

    // Go offline
    store.disconnectCluster(cluster.id, orgId, 'Network interruption');
    assert.equal(store.getCluster(cluster.id, orgId)?.agentStatus, 'OFFLINE');

    // Agent reconnects and sends new telemetry with pod-v2
    const now = Date.now();
    const updatedPod = mockPod(cluster.id, 'pod-v2', now);
    store.syncClusterResources(cluster.id, [updatedPod], {
      telemetryTimestamp: now,
      sequenceNumber: 10,
      snapshotComplete: true
    });

    const reconnected = store.getCluster(cluster.id, orgId);
    assert.equal(reconnected?.agentStatus, 'CONNECTED');
    assert.equal(reconnected?.connectionState, 'connected');

    const res = store.queryResources(orgId, { clusterId: cluster.id });
    assert.equal(res.resources.length, 1);
    assert.equal(res.resources[0].name, 'pod-v2');
  });

  // 7. Empty scrape preserves valid snapshot
  await t.test('7. Empty scrape preserves valid snapshot and does not wipe resources', async () => {
    const { cluster } = store.createCluster(orgId, 'cluster-empty-scrape');
    store.registerAgent(cluster.id, 'v1.6.0', 'v1.31.0');

    const pod = mockPod(cluster.id, 'critical-database-pod');
    store.syncClusterResources(cluster.id, [pod], { sequenceNumber: 1 });

    assert.equal(store.queryResources(orgId, { clusterId: cluster.id }).resources.length, 1);

    // Send empty payload (e.g. temporary agent scrape failure / transient empty array)
    const result = store.syncClusterResources(cluster.id, [], { sequenceNumber: 2 });
    assert.equal(result.activeResourcesCount, 1, 'Empty scrape must retain existing valid resources');

    const afterEmptyScrape = store.queryResources(orgId, { clusterId: cluster.id });
    assert.equal(afterEmptyScrape.resources.length, 1, 'Snapshot must remain intact after empty scrape');
    assert.equal(afterEmptyScrape.resources[0].name, 'critical-database-pod');
  });

  // 8. Multi-cluster isolation prevents crosstalk
  await t.test('8. Multi-cluster isolation prevents crosstalk between clusters', async () => {
    const { cluster: clusterA } = store.createCluster(orgId, 'tenant-cluster-a');
    const { cluster: clusterB } = store.createCluster(orgId, 'tenant-cluster-b');

    store.registerAgent(clusterA.id, 'v1.6.0', 'v1.31.0');
    store.registerAgent(clusterB.id, 'v1.6.0', 'v1.31.0');

    store.syncClusterResources(clusterA.id, [mockPod(clusterA.id, 'pod-a')]);
    store.syncClusterResources(clusterB.id, [mockPod(clusterB.id, 'pod-b-1'), mockPod(clusterB.id, 'pod-b-2')]);

    // Verify isolation
    const resA = store.queryResources(orgId, { clusterId: clusterA.id });
    const resB = store.queryResources(orgId, { clusterId: clusterB.id });

    assert.equal(resA.resources.length, 1);
    assert.equal(resA.resources[0].name, 'pod-a');

    assert.equal(resB.resources.length, 2);
    assert.deepEqual(resB.resources.map((r) => r.name).sort(), ['pod-b-1', 'pod-b-2']);

    // Disconnecting Cluster A must NOT impact Cluster B
    store.disconnectCluster(clusterA.id, orgId, 'Maintenance on A');
    assert.equal(store.getCluster(clusterA.id, orgId)?.agentStatus, 'OFFLINE');
    assert.equal(store.getCluster(clusterB.id, orgId)?.agentStatus, 'CONNECTED');

    // Deleting Cluster A must NOT remove Cluster B resources
    store.deleteCluster(clusterA.id, orgId);
    assert.equal(store.getCluster(clusterA.id, orgId), null);
    assert.equal(store.queryResources(orgId, { clusterId: clusterB.id }).resources.length, 2);
  });

  // 9. Stale sequence/timestamp rejected
  await t.test('9. Stale sequence/timestamp is rejected and does not overwrite newer snapshot', async () => {
    const { cluster } = store.createCluster(orgId, 'cluster-timestamp-order');
    store.registerAgent(cluster.id, 'v1.6.0', 'v1.31.0');

    const newerTime = Date.now();
    const olderTime = newerTime - 100_000;

    // Send newer telemetry first
    store.syncClusterResources(cluster.id, [mockPod(cluster.id, 'new-version-pod', newerTime)], {
      telemetryTimestamp: newerTime,
      sequenceNumber: 20
    });

    const initial = store.queryResources(orgId, { clusterId: cluster.id });
    assert.equal(initial.resources[0].name, 'new-version-pod');

    // Send stale/out-of-order telemetry with older timestamp and lower sequence number
    store.syncClusterResources(cluster.id, [mockPod(cluster.id, 'old-version-pod', olderTime)], {
      telemetryTimestamp: olderTime,
      sequenceNumber: 15
    });

    // The newer snapshot must be preserved!
    const afterStale = store.queryResources(orgId, { clusterId: cluster.id });
    assert.equal(afterStale.resources.length, 1);
    assert.equal(afterStale.resources[0].name, 'new-version-pod', 'Stale telemetry must not overwrite newer snapshot');
  });

  // 10. UI last known state indicator matches backend state
  await t.test('10. UI last known state indicator matches backend state', async () => {
    const { cluster } = store.createCluster(orgId, 'cluster-last-known-indicator');
    store.registerAgent(cluster.id, 'v1.6.0', 'v1.31.0');

    const timestamp = Date.now();
    store.syncClusterResources(cluster.id, [mockPod(cluster.id, 'analytics-pod')], {
      telemetryTimestamp: timestamp
    });

    // Connected cluster: live telemetry
    const connectedCluster = store.getCluster(cluster.id, orgId);
    assert.equal(connectedCluster?.agentStatus, 'CONNECTED');
    assert.equal(connectedCluster?.isLastKnownState, false);

    // Transition to OFFLINE (agent disconnect)
    store.disconnectCluster(cluster.id, orgId, 'Agent stopped');

    const offlineCluster = store.getCluster(cluster.id, orgId);
    assert.ok(offlineCluster);
    assert.equal(offlineCluster?.agentStatus, 'OFFLINE');
    // Last known state flag is set to true
    assert.equal(offlineCluster?.isLastKnownState, true);
    assert.ok(offlineCluster?.lastTelemetrySnapshot);
    assert.equal(offlineCluster?.lastTelemetrySnapshot, timestamp);

    // Resources still queryable as last known state
    const resources = store.queryResources(orgId, { clusterId: cluster.id });
    assert.equal(resources.resources.length, 1);
    assert.equal(resources.resources[0].name, 'analytics-pod');
  });
});
