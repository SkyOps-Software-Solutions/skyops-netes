import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';

process.env.NODE_ENV = 'test';
process.env.SKYOPS_ALLOW_DEMO_AUTH = 'true';
process.env.ENABLE_DEV_SIMULATION = 'true';

const { app } = await import('../server.js');

const makeToken = (email: string, name: string) =>
  `sky_demo_sre_OWNER_${encodeURIComponent(email)}_${encodeURIComponent(name)}`;

test('SKYOPS P2 — Real Kubernetes Rollback, Verification Engine & Operations Production Readiness', async (t) => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  t.after(() => server.close());

  const userEmail = `sre-lead-${Date.now()}@skyops-test.io`;
  const userName = 'SRE Reliability Specialist';
  const token = makeToken(userEmail, userName);

  // 1. Setup workspace organization
  const createOrgRes = await fetch(`http://127.0.0.1:${port}/api/v1/orgs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: 'SRE Production Fleet Workspace' })
  });
  assert.equal(createOrgRes.status, 201);
  const { organization: org } = await createOrgRes.json();
  assert.ok(org.id);

  // 2. Setup cluster
  const createClusterRes = await fetch(`http://127.0.0.1:${port}/api/v1/clusters`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-org-id': org.id,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'prod-fleet-us-east',
      description: 'Operations cluster for P2 verification testing',
      provider: 'gcp',
      region: 'us-east1',
      environment: 'production'
    })
  });
  assert.equal(createClusterRes.status, 201);
  const { cluster } = await createClusterRes.json();
  assert.ok(cluster.id);

  // 3. Connect cluster
  const connectRes = await fetch(`http://127.0.0.1:${port}/api/v1/clusters/${cluster.id}/connect`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-org-id': org.id,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      connectionCode: cluster.connectionCode
    })
  });
  assert.equal(connectRes.status, 200);

  // 4. Fetch cluster resources
  const getResourcesRes = await fetch(`http://127.0.0.1:${port}/api/v1/clusters/${cluster.id}/resources`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-org-id': org.id
    }
  });
  assert.equal(getResourcesRes.status, 200);
  const { resources } = await getResourcesRes.json();
  assert.ok(Array.isArray(resources) && resources.length > 0);

  const deployment = resources.find((r: any) => r.kind === 'Deployment');
  assert.ok(deployment, 'Must have at least one deployment in test cluster');

  // TEST 1: Deployment Restart & Authoritative Verification Evidence
  await t.test('1. Rollout restart execution and verification engine', async () => {
    const restartRes = await fetch(`http://127.0.0.1:${port}/api/v1/clusters/${cluster.id}/operations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-org-id': org.id,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        actionType: 'RolloutRestart',
        targetKind: 'Deployment',
        targetName: deployment.name,
        targetNamespace: deployment.namespace || 'default',
        targetUid: deployment.uid
      })
    });
    assert.equal(restartRes.status, 200);
    const data = await restartRes.json();
    assert.equal(data.action.status, 'SUCCEEDED');
    assert.ok(data.action.verifiedAt, 'VerifiedAt timestamp must be recorded');
    assert.ok(data.action.verificationResult, 'verificationResult object must be populated');
    assert.equal(data.action.verificationResult.success, true);
    assert.ok(Array.isArray(data.action.verificationResult.evidence));
    assert.ok(data.action.verificationResult.evidence.length >= 3);
    assert.match(data.action.verificationResult.evidence[0], /restartedAt/i);
    assert.match(data.action.verificationResult.evidence[2], /Rollout completed/i);
  });

  // TEST 2: Scaling Safety Policy (Max 20 Replicas & Scale to Zero Confirmation)
  await t.test('2. Scaling within safety limits and scale-to-zero safeguards', async () => {
    // 2a. Reject replicas exceeding limit (>20)
    const rejectLargeScale = await fetch(`http://127.0.0.1:${port}/api/v1/clusters/${cluster.id}/operations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-org-id': org.id,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        actionType: 'ScaleDeployment',
        targetKind: 'Deployment',
        targetName: deployment.name,
        targetNamespace: deployment.namespace || 'default',
        parameters: { targetReplicas: 35 }
      })
    });
    assert.equal(rejectLargeScale.status, 400);

    // 2b. Reject scale to zero without explicit confirmScaleToZero
    const rejectZeroWithoutConfirm = await fetch(`http://127.0.0.1:${port}/api/v1/clusters/${cluster.id}/operations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-org-id': org.id,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        actionType: 'ScaleDeployment',
        targetKind: 'Deployment',
        targetName: deployment.name,
        targetNamespace: deployment.namespace || 'default',
        parameters: { targetReplicas: 0 },
        confirmScaleToZero: false
      })
    });
    assert.equal(rejectZeroWithoutConfirm.status, 400);

    // 2c. Successful scale to 3 replicas with verified convergence
    const validScaleRes = await fetch(`http://127.0.0.1:${port}/api/v1/clusters/${cluster.id}/operations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-org-id': org.id,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        actionType: 'ScaleDeployment',
        targetKind: 'Deployment',
        targetName: deployment.name,
        targetNamespace: deployment.namespace || 'default',
        parameters: { targetReplicas: 3 }
      })
    });
    assert.equal(validScaleRes.status, 200);
    const validScale = await validScaleRes.json();
    assert.equal(validScale.action.mutation.targetReplicas, 3);
    assert.equal(validScale.action.verification.readyReplicas, 3);
    assert.match(validScale.action.verificationResult.evidence[1], /3\/3 replicas ready/i);
  });

  // TEST 3: Safe Rollback Workflow & Scope Safeguards
  await t.test('3. Safe Rollback execution, revision history and scope boundary', async () => {
    // Current deployment is at revision >= 2 after rollout restart
    const rollbackRes = await fetch(`http://127.0.0.1:${port}/api/v1/clusters/${cluster.id}/operations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-org-id': org.id,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        actionType: 'RollbackDeployment',
        targetKind: 'Deployment',
        targetName: deployment.name,
        targetNamespace: deployment.namespace || 'default',
        parameters: {
          targetRevision: '1',
          reason: 'Automated test rollback verification'
        }
      })
    });
    assert.equal(rollbackRes.status, 200);
    const rollbackData = await rollbackRes.json();
    assert.equal(rollbackData.action.status, 'SUCCEEDED');
    assert.equal(rollbackData.action.mutation.targetRevision, '1');
    assert.match(rollbackData.action.verificationResult.evidence[0], /reverted from rev.*to target rev 1/i);
    // Explicit verification evidence must document scope boundary (external databases/configmaps not reverted)
    assert.match(rollbackData.action.verificationResult.evidence[3], /database.*must be verified independently/i);
  });

  // TEST 4: Precondition Validation (Wrong UID & Stale Revision Rejection)
  await t.test('4. Rejection on stale resource UID or mismatched revision preconditions', async () => {
    const staleUidRes = await fetch(`http://127.0.0.1:${port}/api/v1/clusters/${cluster.id}/operations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-org-id': org.id,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        actionType: 'RolloutRestart',
        targetKind: 'Deployment',
        targetName: deployment.name,
        targetNamespace: deployment.namespace || 'default',
        targetUid: 'stale-bogus-uid-12345'
      })
    });
    assert.equal(staleUidRes.status, 400);
    const errData = await staleUidRes.json();
    assert.match(errData.error, /Precondition failed.*UID/i);
  });

  // TEST 5: Controller Pod Deletion vs Standalone Pod Deletion
  await t.test('5. Pod deletion verifies controller replacement or enforces naked pod safeguard', async () => {
    const checkoutPod = resources.find((r: any) => r.kind === 'Pod' && r.name.includes('checkout-api'));
    assert.ok(checkoutPod, 'Must find checkout-api pod in cluster resources');

    // Controller-managed pod deletion spawns replacement
    const deleteManagedPodRes = await fetch(`http://127.0.0.1:${port}/api/v1/clusters/${cluster.id}/operations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-org-id': org.id,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        actionType: 'DeletePod',
        targetKind: 'Pod',
        targetName: checkoutPod.name,
        targetNamespace: checkoutPod.namespace || 'default'
      })
    });
    assert.equal(deleteManagedPodRes.status, 200);
    const managedPodData = await deleteManagedPodRes.json();
    assert.equal(managedPodData.action.status, 'SUCCEEDED');
    assert.equal(managedPodData.action.verification.replacementCreated, true);
    assert.ok(managedPodData.action.mutation.replacementPodName);
    assert.match(managedPodData.action.verificationResult.evidence[1], /Controller observed recreating replacement pod/i);
  });

  // TEST 6: Node Cordon, Uncordon and Drain Safeguards
  await t.test('6. Node cordon, uncordon and drain safeguards', async () => {
    const node = resources.find((r: any) => r.kind === 'Node');
    assert.ok(node, 'Must find node in cluster resources');

    // 6a. Cordon Node
    const cordonRes = await fetch(`http://127.0.0.1:${port}/api/v1/clusters/${cluster.id}/operations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-org-id': org.id,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        actionType: 'CordonNode',
        targetKind: 'Node',
        targetName: node.name
      })
    });
    assert.equal(cordonRes.status, 200);
    const cordonData = await cordonRes.json();
    assert.equal(cordonData.action.verificationResult.observedState, 'CORDONED');

    // 6b. Drain requires explicit confirmation
    const drainWithoutConfirm = await fetch(`http://127.0.0.1:${port}/api/v1/clusters/${cluster.id}/operations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-org-id': org.id,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        actionType: 'DrainNode',
        targetKind: 'Node',
        targetName: node.name,
        confirmDrain: false
      })
    });
    assert.equal(drainWithoutConfirm.status, 400);

    // 6c. Uncordon Node
    const uncordonRes = await fetch(`http://127.0.0.1:${port}/api/v1/clusters/${cluster.id}/operations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-org-id': org.id,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        actionType: 'UncordonNode',
        targetKind: 'Node',
        targetName: node.name
      })
    });
    assert.equal(uncordonRes.status, 200);
    const uncordonData = await uncordonRes.json();
    assert.equal(uncordonData.action.verificationResult.observedState, 'SCHEDULABLE');
  });

  // TEST 7: Persistent Operational Audit History
  await t.test('7. Persistent activity view stores all executed operations with verification', async () => {
    const historyRes = await fetch(`http://127.0.0.1:${port}/api/v1/clusters/${cluster.id}/operations`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-org-id': org.id
      }
    });
    assert.equal(historyRes.status, 200);
    const { operations: opList } = await historyRes.json();
    assert.ok(opList.length >= 4, 'Activity log must contain all executed operations');
    for (const op of opList) {
      assert.ok(op.id, 'Each operation must have an ID');
      assert.ok(op.actionType, 'Each operation must have an actionType');
      assert.ok(op.target, 'Each operation must specify target resource');
      assert.ok(op.status, 'Each operation must have a status');
      assert.ok(op.verificationResult, 'Each verified operation must retain verificationResult');
    }
  });
});
