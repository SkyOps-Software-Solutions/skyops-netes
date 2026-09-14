import assert from 'node:assert/strict';
import test from 'node:test';
import { DataStore } from './store';
import { parseCpuQuantity, parseMemoryQuantity } from './metrics';

test('smart telemetry preserves recent raw samples and aggregates older observations with spike bounds', () => {
  const store = new DataStore();
  const org = store.createOrganization(`Telemetry ${Date.now()}`, `telemetry-user-${Date.now()}`);
  const { cluster } = store.createCluster(org.id, 'telemetry-cluster');
  const now = Date.now();

  for (const value of [100, 900, 200]) {
    store.recordMetricHistoryPoint(cluster.id, {
      timestamp: now - 25 * 60 * 60 * 1000 + value,
      cpuUsageMillicores: value,
      cpuRequestMillicores: 1000,
      cpuCapacityMillicores: 2000,
      memoryRequestBytes: 100,
      memoryCapacityBytes: 200,
      isUsageAvailable: true,
      source: 'metrics-api'
    });
  }
  store.recordMetricHistoryPoint(cluster.id, {
    timestamp: now - 10_000,
    cpuUsageMillicores: 400,
    cpuRequestMillicores: 1000,
    cpuCapacityMillicores: 2000,
    memoryRequestBytes: 100,
    memoryCapacityBytes: 200,
    isUsageAvailable: true,
    source: 'metrics-api'
  });

  const history = store.getClusterMetricHistory(cluster.id, org.id, '7d');
  const aggregate = history.find((point) => point.resolution === '5m-aggregate');
  assert.ok(aggregate);
  assert.equal(aggregate.cpuUsageMaxMillicores, 900);
  assert.equal(aggregate.cpuUsageMinMillicores, 100);
  assert.equal(aggregate.sampleCount, 3);
  assert.equal(aggregate.source, 'metrics-api');
  assert.ok(history.some((point) => point.resolution === 'raw' && point.cpuUsageMillicores === 400));
});

test('quantity parsers reject malformed runtime metrics rather than accepting prefixes', () => {
  assert.equal(parseCpuQuantity('900m-not-a-metric'), null);
  assert.equal(parseMemoryQuantity('128Mi-garbage'), null);
  assert.equal(parseCpuQuantity('950m'), 950);
  assert.equal(parseMemoryQuantity('128Mi'), 128 * 1024 * 1024);
});
