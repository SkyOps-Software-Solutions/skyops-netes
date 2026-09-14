import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { redactSensitiveLogData, parseLogLines } from './logs';
import { store } from './store';
import { K8sEvent, KubernetesResource } from '../src/types/index';

describe('Observability Foundation: Logs, Events, and Deduplication', () => {
  describe('Enterprise Log Redaction', () => {
    it('redacts Bearer tokens, passwords, and API keys securely', () => {
      const rawLog = 'Connecting with Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-ID and password=SuperSecretPassword123!';
      const redacted = redactSensitiveLogData(rawLog);

      assert.ok(!redacted.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'));
      assert.ok(!redacted.includes('SuperSecretPassword123!'));
      assert.ok(redacted.includes('Bearer [REDACTED_BEARER_TOKEN]'));
      assert.ok(redacted.includes('password=[REDACTED]'));
    });

    it('redacts AWS Access Key IDs and SkyOps agent tokens', () => {
      const logWithKeys = 'Failed push using AKIAIOSFODNN7EXAMPLE and token: skyops_agent_secret_token_123';
      const redacted = redactSensitiveLogData(logWithKeys);

      assert.ok(!redacted.includes('AKIAIOSFODNN7EXAMPLE'));
      assert.ok(redacted.includes('[REDACTED_AWS_KEY]'));
      assert.ok(!redacted.includes('skyops_agent_secret_token_123'));
      assert.ok(redacted.includes('[REDACTED_AGENT_TOKEN]'));
    });
  });

  describe('Pod Log Line Parsing', () => {
    it('extracts RFC3339 timestamps and formats cleanly', () => {
      const line = '2026-09-13T12:34:56.789123456Z [INFO] Application started on port 8080';
      const parsed = parseLogLines(line);

      assert.equal(parsed.length, 1);
      assert.equal(parsed[0].timestamp, '2026-09-13T12:34:56.789123456Z');
      assert.equal(parsed[0].message, '[INFO] Application started on port 8080');
      assert.ok(parsed[0].raw.includes('Application started'));
    });

    it('gracefully handles lines without timestamps', () => {
      const line = 'Stack trace: at main.go:42';
      const parsed = parseLogLines(line);

      assert.equal(parsed.length, 1);
      assert.equal(parsed[0].timestamp, undefined);
      assert.equal(parsed[0].message, 'Stack trace: at main.go:42');
    });

    it('supports search query filtering', () => {
      const lines = '2026-09-13T12:00:00Z First normal line\n2026-09-13T12:00:01Z ERROR: Connection timeout\n2026-09-13T12:00:02Z Normal recovery';
      const parsed = parseLogLines(lines, 'ERROR');

      assert.equal(parsed.length, 1);
      assert.ok(parsed[0].message.includes('Connection timeout'));
    });
  });

  describe('Event Ingestion and Deduplication', () => {
    it('deduplicates identical events across resources and aggregates count', () => {
      const org = store.createOrganization('Event Org', 'user-test-obs');
      const { cluster } = store.createCluster(org.id, 'event-cluster');

      const event1: K8sEvent = {
        id: 'evt-1',
        timestamp: 1700000000000,
        type: 'Warning',
        reason: 'FailedScheduling',
        objectKind: 'Pod',
        objectName: 'nginx-test',
        namespace: 'default',
        message: '0/3 nodes are available: insufficient cpu',
        count: 1,
        firstObserved: 1700000000000,
        lastObserved: 1700000000000
      };

      const event2: K8sEvent = {
        id: 'evt-2',
        timestamp: 1700000060000,
        type: 'Warning',
        reason: 'FailedScheduling',
        objectKind: 'Pod',
        objectName: 'nginx-test',
        namespace: 'default',
        message: '0/3 nodes are available: insufficient cpu',
        count: 2,
        firstObserved: 1700000000000,
        lastObserved: 1700000060000
      };

      const podResource: KubernetesResource = {
        id: `${cluster.id}-pod-nginx-test`,
        clusterId: cluster.id,
        kind: 'Pod',
        name: 'nginx-test',
        namespace: 'default',
        status: 'Pending',
        health: 'WARNING',
        createdAt: Date.now() - 60000,
        updatedAt: Date.now(),
        events: [event1, event2]
      };

      store.syncClusterResources(cluster.id, [podResource]);
      const events = store.getClusterEvents(cluster.id, org.id);

      // Deduplicated into a single event with count 3
      assert.equal(events.length, 1);
      assert.equal(events[0].count, 3);
      assert.equal(events[0].lastObserved, 1700000060000);
      assert.equal(events[0].firstObserved, 1700000000000);
    });
  });

  describe('Historical Metric Trend & Non-Fabrication', () => {
    it('returns empty history points for cluster without telemetry rather than fabricating numbers', () => {
      const org = store.createOrganization('Empty Metrics Org', 'user-test-obs');
      const { cluster } = store.createCluster(org.id, 'empty-cluster');

      const history = store.getClusterMetricHistory(cluster.id, org.id);
      assert.ok(Array.isArray(history));
    });

    it('returns cluster observability metrics with clear unavailableReason when live metrics are absent', () => {
      const org = store.createOrganization('No Live Metrics Org', 'user-test-obs');
      const { cluster } = store.createCluster(org.id, 'no-live-metrics-cluster');

      const podWithoutUsage: KubernetesResource = {
        id: `${cluster.id}-pod-simple-app`,
        clusterId: cluster.id,
        kind: 'Pod',
        name: 'simple-app',
        namespace: 'default',
        status: 'Running',
        health: 'HEALTHY',
        createdAt: Date.now() - 60000,
        updatedAt: Date.now(),
        containers: [
          {
            name: 'app',
            image: 'app:v1',
            restartCount: 0,
            ready: true,
            state: 'running',
            cpuRequest: '100m',
            memoryRequest: '128Mi'
          }
        ]
      };

      store.syncClusterResources(cluster.id, [podWithoutUsage]);
      const metrics = store.getClusterObservabilityMetrics(cluster.id, org.id);

      assert.ok(metrics);
      assert.equal(metrics.isUsageAvailable, false);
      assert.ok(metrics.unavailableReason?.includes('Metrics Server'));
      assert.equal(metrics.cpu.totalUsage, undefined);
      assert.equal(metrics.memory.totalUsage, undefined);
    });

    it('persists historical metric points across saveSnapshot and loadSnapshot without loss', () => {
      const org = store.createOrganization('Persistent History Org', 'user-test-obs');
      const { cluster } = store.createCluster(org.id, 'history-cluster');

      // Record a point
      store.recordMetricHistoryPoint(cluster.id, {
        timestamp: Date.now(),
        cpuUsageMillicores: 1500,
        cpuRequestMillicores: 2000,
        cpuCapacityMillicores: 4000,
        memoryUsageBytes: 1024 * 1024 * 512,
        memoryRequestBytes: 1024 * 1024 * 1024,
        memoryCapacityBytes: 1024 * 1024 * 2048,
        isUsageAvailable: true,
        source: 'METRICS_SERVER'
      });

      const historyBefore = store.getClusterMetricHistory(cluster.id, org.id);
      assert.equal(historyBefore.length, 1);
      assert.equal(historyBefore[0].cpuUsageMillicores, 1500);

      // Force synchronous flush to disk
      (store as any).saveSnapshotSync();

      // Create fresh DataStore instance simulating server restart
      const newStore = new (store.constructor as any)();
      const historyAfter = newStore.getClusterMetricHistory(cluster.id, org.id);

      assert.ok(Array.isArray(historyAfter));
      assert.equal(historyAfter.length, 1);
      assert.equal(historyAfter[0].cpuUsageMillicores, 1500);
      assert.equal(historyAfter[0].isUsageAvailable, true);
      assert.equal(historyAfter[0].memoryUsageBytes, 1024 * 1024 * 512);
    });
  });
});
