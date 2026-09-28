import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
process.env.NODE_ENV = 'test';
import { DataStore } from '../store';
import { InMemoryStore } from './InMemoryStore';

test('Agent and Cluster Persistence Across Process Restarts Suite', async (t) => {
  // Shared underlying persistent store representing Firestore
  const persistentStore = new InMemoryStore();
  await persistentStore.init();

  const orgId = 'org-reliability-corp';
  const ownerId = 'usr-platform-lead';

  // 1. Initial server instance simulates Server Revision 1
  const serverRev1 = new DataStore(persistentStore);
  serverRev1.upsertUser({ id: ownerId, email: 'lead@reliability.io', name: 'Platform Lead' });
  serverRev1.createOrganization('Reliability Corp', ownerId);

  // User onboarded cluster and installed agent
  const { cluster: createdCluster, rawToken, installKey } = serverRev1.createCluster(
    orgId,
    'production-k8s-us-central',
    'Main production cluster'
  );

  const clusterId = createdCluster.id;
  assert.ok(rawToken.startsWith('sky_agent_'));

  // Agent registers and sends heartbeat on Rev 1
  const reg1 = serverRev1.registerAgent(clusterId, '1.5.0', '1.31.2');
  assert.equal(reg1.status, 'REGISTERED');
  serverRev1.recordAgentHeartbeat(clusterId, '1.5.0', '1.31.2', 12, 140);

  // Authenticate token on Rev 1
  const authRev1 = serverRev1.authenticateAgentToken(rawToken);
  assert.equal(authRev1?.clusterId, clusterId);
  assert.equal(authRev1?.orgId, orgId);

  const clusterRev1 = serverRev1.getCluster(clusterId, orgId);
  assert.equal(clusterRev1?.agentStatus, 'CONNECTED');
  assert.equal(clusterRev1?.connectionState, 'connected');

  // Explicitly wait to ensure persistCluster / saveClusterToken have finished
  await new Promise((r) => setTimeout(r, 100));

  await t.test('Server Revision 2 (New Container / Publish) restores cluster and agent token', async () => {
    // 2. Simulate Server Revision 2 booting up with fresh memory
    const serverRev2 = new DataStore(persistentStore);

    // Before initPersistence, serverRev2 memory is clean
    // Now simulate startup hydration:
    await serverRev2.initPersistence();

    // Verify cluster was loaded
    const restoredCluster = serverRev2.getCluster(clusterId, orgId);
    assert.ok(restoredCluster, 'Cluster must be restored from persistence on new server instance');
    assert.equal(restoredCluster.name, 'production-k8s-us-central');
    assert.equal(restoredCluster.orgId, orgId);

    // Verify Agent Token authentication succeeds IMMEDIATELY (no re-pairing or reinstalling required)
    const syncAuth = serverRev2.authenticateAgentToken(rawToken);
    assert.ok(syncAuth, 'Agent token must authenticate synchronously from restored cache');
    assert.equal(syncAuth.clusterId, clusterId);
    assert.equal(syncAuth.orgId, orgId);

    // Verify async authentication path also works
    const asyncAuth = await serverRev2.authenticateAgentTokenAsync(rawToken);
    assert.ok(asyncAuth, 'Agent token must authenticate asynchronously');
    assert.equal(asyncAuth?.clusterId, clusterId);

    // Agent sends a new heartbeat to Revision 2
    const heartbeatAccepted = serverRev2.recordAgentHeartbeat(clusterId, '1.5.0', '1.31.2', 12, 145);
    assert.equal(heartbeatAccepted, true, 'Heartbeat must be accepted on new server revision');

    const updatedCluster = serverRev2.getCluster(clusterId, orgId);
    assert.equal(updatedCluster?.agentStatus, 'CONNECTED');
    assert.equal(updatedCluster?.connectionState, 'connected');
  });

  await t.test('Forged or invalid agent tokens are strictly rejected on new server revision', async () => {
    const serverRev2 = new DataStore(persistentStore);
    await serverRev2.initPersistence();

    const forgedToken = 'sky_agent_forged_random_hex_1234567890abcdef';
    assert.equal(serverRev2.authenticateAgentToken(forgedToken), null);
    assert.equal(await serverRev2.authenticateAgentTokenAsync(forgedToken), null);
  });
});
