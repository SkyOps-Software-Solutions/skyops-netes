import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DataStore } from './store';
import { redactSensitiveLogData, parseLogLines } from './logs';
import { KubernetesResource } from '../src/types/index';

describe('Pod Logs Pipeline & Truthful Error Mapping', () => {
  it('preserves redaction of tokens, passwords, and private keys', () => {
    const raw = `
2026-09-16T11:00:00Z Connecting with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeak
2026-09-16T11:00:01Z Database uri postgres://admin:supersecret123@db.example.com:5432/prod
2026-09-16T11:00:02Z Agent token skyops_agent_9988aabbccdd
2026-09-16T11:00:03Z password="ultra-sensitive-password"
    `;

    const redacted = redactSensitiveLogData(raw);
    assert.ok(!redacted.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), 'JWT token must be redacted');
    assert.ok(!redacted.includes('supersecret123'), 'Database password must be redacted');
    assert.ok(!redacted.includes('skyops_agent_9988aabbccdd'), 'Agent token must be redacted');
    assert.ok(!redacted.includes('ultra-sensitive-password'), 'password parameter must be redacted');
    assert.ok(redacted.includes('[REDACTED'), 'Must contain [REDACTED placeholder');

    const lines = parseLogLines(raw);
    assert.strictEqual(lines.length >= 4, true);
    for (const l of lines) {
      assert.ok(!l.raw.includes('supersecret123'));
      assert.ok(!l.raw.includes('skyops_agent_9988aabbccdd'));
    }
  });

  it('end-to-end on-demand log flow from agent to store to consumer', async () => {
    const store = new DataStore();
    const org = store.createOrganization('LogOrg', 'admin@example.com');
    const { cluster } = store.createCluster(org.id, 'Production K8s');

    // Mark cluster as connected
    store.recordAgentHeartbeat(cluster.id, 'v1.2.0', 'v1.30.0', 3, 10);

    const corednsPod: KubernetesResource = {
      id: `${cluster.id}:kube-system:Pod:coredns-test`,
      clusterId: cluster.id,
      clusterName: cluster.name,
      name: 'coredns-test',
      namespace: 'kube-system',
      kind: 'Pod',
      status: 'Running',
      health: 'HEALTHY',
      createdAt: Date.now() - 3600000,
      updatedAt: Date.now() - 3600000,
      containers: [
        {
          name: 'coredns',
          image: 'registry.k8s.io/coredns/coredns:v1.11.1',
          ready: true,
          restartCount: 0,
          state: 'running'
        }
      ]
    };
    store.syncClusterResources(cluster.id, [corednsPod]);

    // Simulate concurrent agent polling and log ingestion in the background
    setTimeout(() => {
      const pending = store.claimPendingLogRequests(cluster.id);
      assert.strictEqual(pending.length, 1);
      assert.strictEqual(pending[0].namespace, 'kube-system');
      assert.strictEqual(pending[0].podName, 'coredns-test');
      assert.strictEqual(pending[0].container, 'coredns');

      // Ingest real logs
      store.storePodLogs(
        cluster.id,
        'kube-system',
        'coredns-test',
        'coredns',
        '2026-09-16T11:01:00Z [INFO] CoreDNS-1.11.1 starting up\n2026-09-16T11:01:01Z [INFO] plugin/kubernetes: CoreDNS-kubernetes ready\n',
        false,
        'SUCCESS'
      );
    }, 50);

    const logResult = await store.getPodLogs(cluster.id, org.id, 'kube-system', 'coredns-test', {
      container: 'coredns',
      tailLines: 250
    });

    assert.strictEqual(logResult.statusCategory, 'SUCCESS');
    assert.strictEqual(logResult.source, 'agent');
    assert.strictEqual(logResult.totalLines, 2);
    assert.ok(logResult.rawText.includes('CoreDNS-kubernetes ready'));
  });

  it('handles PERMISSION_DENIED truthfully without claiming "no logs produced"', async () => {
    const store = new DataStore();
    const org = store.createOrganization('PermOrg', 'admin@example.com');
    const { cluster } = store.createCluster(org.id, 'Restricted Cluster');

    store.recordAgentHeartbeat(cluster.id, 'v1.2.0', 'v1.30.0', 3, 10);

    const appPod: KubernetesResource = {
      id: `${cluster.id}:default:Pod:app-worker`,
      clusterId: cluster.id,
      clusterName: cluster.name,
      name: 'app-worker',
      namespace: 'default',
      kind: 'Pod',
      status: 'Running',
      health: 'HEALTHY',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      containers: [{ name: 'app', image: 'app:v1', ready: true, restartCount: 0, state: 'running' }]
    };
    store.syncClusterResources(cluster.id, [appPod]);

    // Agent reports 403 Forbidden
    store.storePodLogs(
      cluster.id,
      'default',
      'app-worker',
      'app',
      '',
      false,
      'PERMISSION_DENIED',
      'User cannot get resource pods/log'
    );

    const logResult = await store.getPodLogs(cluster.id, org.id, 'default', 'app-worker', { container: 'app' });
    assert.strictEqual(logResult.statusCategory, 'PERMISSION_DENIED');
    assert.strictEqual(
      logResult.unavailableReason,
      'SkyOps cannot read logs for this container because the cluster agent lacks the required Kubernetes permission.'
    );
    assert.strictEqual(logResult.lines.length, 0);
  });

  it('handles PREVIOUS_LOGS_UNAVAILABLE truthfully when previous flag is requested', async () => {
    const store = new DataStore();
    const org = store.createOrganization('PrevOrg', 'admin@example.com');
    const { cluster } = store.createCluster(org.id, 'Prev Cluster');

    store.recordAgentHeartbeat(cluster.id, 'v1.2.0', 'v1.30.0', 3, 10);

    const appPod: KubernetesResource = {
      id: `${cluster.id}:default:Pod:stable-pod`,
      clusterId: cluster.id,
      clusterName: cluster.name,
      name: 'stable-pod',
      namespace: 'default',
      kind: 'Pod',
      status: 'Running',
      health: 'HEALTHY',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      containers: [{ name: 'web', image: 'nginx:alpine', ready: true, restartCount: 0, state: 'running' }]
    };
    store.syncClusterResources(cluster.id, [appPod]);

    store.storePodLogs(
      cluster.id,
      'default',
      'stable-pod',
      'web',
      '',
      true, // previous
      'PREVIOUS_LOGS_UNAVAILABLE',
      'Previous terminated container not found'
    );

    const logResult = await store.getPodLogs(cluster.id, org.id, 'default', 'stable-pod', {
      container: 'web',
      previous: true
    });

    assert.strictEqual(logResult.statusCategory, 'PREVIOUS_LOGS_UNAVAILABLE');
    assert.strictEqual(
      logResult.unavailableReason,
      'Previous container logs are not available from Kubernetes. The container may not have restarted yet.'
    );
  });

  it('truthfully handles disconnected agent state', async () => {
    const store = new DataStore();
    const org = store.createOrganization('DiscOrg', 'admin@example.com');
    const { cluster } = store.createCluster(org.id, 'Offline Cluster');

    const pod: KubernetesResource = {
      id: `${cluster.id}:default:Pod:orphan-pod`,
      clusterId: cluster.id,
      clusterName: cluster.name,
      name: 'orphan-pod',
      namespace: 'default',
      kind: 'Pod',
      status: 'Running',
      health: 'HEALTHY',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      containers: [{ name: 'main', image: 'busybox', ready: true, restartCount: 0, state: 'running' }]
    };
    store.syncClusterResources(cluster.id, [pod]);

    // Now simulate agent disconnection
    const internalCluster = store.getClusterByIdInternal(cluster.id);
    if (internalCluster) {
      internalCluster.agentStatus = 'OFFLINE';
      internalCluster.connectionState = 'offline';
      internalCluster.lastHeartbeat = Date.now() - 300_000;
    }

    const logResult = await store.getPodLogs(cluster.id, org.id, 'default', 'orphan-pod', { container: 'main' });
    assert.strictEqual(logResult.statusCategory, 'AGENT_DISCONNECTED');
    assert.ok(logResult.unavailableReason?.includes('agent is disconnected'));
  });

  it('enforces multi-tenant isolation: cannot query logs across org boundary', async () => {
    const store = new DataStore();
    const orgA = store.createOrganization('OrgA', 'a@example.com');
    const orgB = store.createOrganization('OrgB', 'b@example.com');

    const { cluster: clusterA } = store.createCluster(orgA.id, 'Cluster A');

    await assert.rejects(
      async () => {
        await store.getPodLogs(clusterA.id, orgB.id, 'kube-system', 'coredns', {});
      },
      /access denied/i
    );
  });
});
