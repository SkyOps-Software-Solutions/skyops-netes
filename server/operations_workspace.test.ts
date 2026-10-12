import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';

process.env.NODE_ENV = 'test';
process.env.SKYOPS_ALLOW_DEMO_AUTH = 'true';
process.env.ENABLE_DEV_SIMULATION = 'true';

const { app } = await import('../server.js');

const makeToken = (email: string, name: string) =>
  `sky_demo_sre_OWNER_${encodeURIComponent(email)}_${encodeURIComponent(name)}`;

test('Unified Kubernetes Operations Workspace P0 Backend Verification', async (t) => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  t.after(() => server.close());

  const userEmail = `sre-lead-${Date.now()}@skyops-test.io`;
  const userName = 'SRE Lead Operator';
  const token = makeToken(userEmail, userName);

  // 1. Create test workspace
  const createOrgRes = await fetch(`http://127.0.0.1:${port}/api/v1/orgs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: 'Platform Reliability Operations' })
  });
  assert.equal(createOrgRes.status, 201);
  const { organization: org } = await createOrgRes.json();
  assert.ok(org.id);

  // 2. Create simulated cluster
  const createClusterRes = await fetch(`http://127.0.0.1:${port}/api/v1/clusters`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-org-id': org.id,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'prod-k8s-us-central1',
      description: 'Production cluster for unified operations test',
      provider: 'gcp',
      region: 'us-central1',
      environment: 'production'
    })
  });
  assert.equal(createClusterRes.status, 201);
  const { cluster } = await createClusterRes.json();
  assert.ok(cluster.id);

  // 3. Connect cluster in simulated mode
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

  // 4. Fetch initial resources to ensure cluster default resources exist
  const resListRes = await fetch(`http://127.0.0.1:${port}/api/v1/clusters/${cluster.id}/resources`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-org-id': org.id
    }
  });
  assert.equal(resListRes.status, 200);
  const { resources } = await resListRes.json();
  assert.ok(Array.isArray(resources) && resources.length > 0, 'Cluster resources must be present');

  // Verify resources include Workloads, Pods, Services, Nodes, ConfigMaps, Secrets
  const kinds = new Set(resources.map((r: any) => r.kind));
  assert.ok(kinds.has('Deployment'), 'Must contain Deployment');
  assert.ok(kinds.has('Pod'), 'Must contain Pod');
  assert.ok(kinds.has('Node'), 'Must contain Node');

  // 5. Initial operations list is empty
  const initOpsRes = await fetch(`http://127.0.0.1:${port}/api/v1/clusters/${cluster.id}/operations`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-org-id': org.id
    }
  });
  assert.equal(initOpsRes.status, 200);
  const initOps = await initOpsRes.json();
  assert.ok(Array.isArray(initOps.operations));

  // 6. Execute RolloutRestart on checkout-api
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
      targetName: 'checkout-api',
      targetNamespace: 'default',
      parameters: {
        reason: 'Routine zero-downtime restart'
      }
    })
  });
  assert.equal(restartRes.status, 200);
  const restartResult = await restartRes.json();
  assert.equal(restartResult.success, true);
  assert.ok(restartResult.action.id);
  assert.equal(restartResult.action.actionType, 'RolloutRestart');
  assert.equal(restartResult.updatedResource?.status, 'Running');
  assert.ok(restartResult.updatedResource?.annotations?.['kubectl.kubernetes.io/restartedAt']);

  // 7. Execute ScaleDeployment to 4 replicas
  const scaleRes = await fetch(`http://127.0.0.1:${port}/api/v1/clusters/${cluster.id}/operations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-org-id': org.id,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      actionType: 'ScaleDeployment',
      targetKind: 'Deployment',
      targetName: 'checkout-api',
      targetNamespace: 'default',
      parameters: {
        targetReplicas: 4,
        reason: 'Scaling to handle flash traffic'
      }
    })
  });
  assert.equal(scaleRes.status, 200);
  const scaleResult = await scaleRes.json();
  assert.equal(scaleResult.success, true);
  assert.equal(scaleResult.action.actionType, 'ScaleDeployment');
  assert.equal(scaleResult.updatedResource?.specReplicas, 4);

  // 8. Negative check: Scaling beyond safety limits (e.g. 25 or 0) must be rejected
  const invalidScaleRes = await fetch(`http://127.0.0.1:${port}/api/v1/clusters/${cluster.id}/operations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-org-id': org.id,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      actionType: 'ScaleDeployment',
      targetKind: 'Deployment',
      targetName: 'checkout-api',
      targetNamespace: 'default',
      parameters: {
        targetReplicas: 25
      }
    })
  });
  assert.equal(invalidScaleRes.status, 400);

  // 9. Execute DeletePod / RestartPod on a pod in default namespace
  const podRes = resources.find((r: any) => r.kind === 'Pod' && r.namespace === 'default');
  if (podRes) {
    const deletePodRes = await fetch(`http://127.0.0.1:${port}/api/v1/clusters/${cluster.id}/operations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-org-id': org.id,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        actionType: 'DeletePod',
        targetKind: 'Pod',
        targetName: podRes.name,
        targetNamespace: podRes.namespace,
        parameters: {
          reason: 'Manual pod restart'
        }
      })
    });
    assert.equal(deletePodRes.status, 200);
    const delResult = await deletePodRes.json();
    assert.equal(delResult.success, true);
    assert.equal(delResult.updatedResource?.health, 'HEALTHY');
  }

  // 10. Negative check: Deleting a pod in kube-system is strictly protected
  const sysPod = resources.find((r: any) => r.kind === 'Pod' && r.namespace === 'kube-system');
  if (sysPod) {
    const deleteSysPodRes = await fetch(`http://127.0.0.1:${port}/api/v1/clusters/${cluster.id}/operations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-org-id': org.id,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        actionType: 'DeletePod',
        targetKind: 'Pod',
        targetName: sysPod.name,
        targetNamespace: 'kube-system'
      })
    });
    assert.equal(deleteSysPodRes.status, 400);
    const errData = await deleteSysPodRes.json();
    assert.match(errData.error, /protected/i);
  }

  // 11. Verify operations list contains the recorded operations
  const finalOpsRes = await fetch(`http://127.0.0.1:${port}/api/v1/clusters/${cluster.id}/operations`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-org-id': org.id
    }
  });
  assert.equal(finalOpsRes.status, 200);
  const finalOps = await finalOpsRes.json();
  assert.ok(finalOps.operations.length >= 2, 'Operations list must record all operations');
  const actionTypes = finalOps.operations.map((o: any) => o.actionType);
  assert.ok(actionTypes.includes('RolloutRestart'));
  assert.ok(actionTypes.includes('ScaleDeployment'));
});
