import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TelemetryStore } from './telemetry_store';
import { DataStore } from './store';
import { MetricHistoryPoint } from '../src/types/index';

describe('Phase 2 Smart Telemetry, Tiered Retention & Historical Intelligence', () => {
  describe('Tiered Storage and Aggregations', () => {
    it('records raw observations and generates rollups without data loss', () => {
      const store = new TelemetryStore();
      const clusterId = 'test-cluster-1';
      const baseTime = Date.now() - 30 * 60 * 1000; // 30 minutes ago

      // Ingest 20 observations spaced 15 seconds apart
      for (let i = 0; i < 20; i++) {
        const timestamp = baseTime + i * 15 * 1000;
        store.recordObservation(clusterId, {
          timestamp,
          cpuCapacityMillicores: 4000,
          cpuAllocatableMillicores: 3800,
          cpuRequestMillicores: 2000,
          cpuLimitMillicores: 3000,
          cpuRequestedPercent: 53,
          cpuLimitPercent: 79,
          cpuUsageMillicores: 800 + i * 20,
          cpuUsagePercent: 20 + Math.round((i * 20) / 40),
          memoryCapacityBytes: 16 * 1024 * 1024 * 1024,
          memoryAllocatableBytes: 15 * 1024 * 1024 * 1024,
          memoryRequestBytes: 8 * 1024 * 1024 * 1024,
          memoryLimitBytes: 12 * 1024 * 1024 * 1024,
          memoryRequestedPercent: 53,
          memoryLimitPercent: 80,
          memoryUsageBytes: 4 * 1024 * 1024 * 1024 + i * 50 * 1024 * 1024,
          memoryUsagePercent: 25 + i,
          isUsageAvailable: true,
          source: 'metrics.k8s.io'
        });
      }

      const raw = store.getRawPoints(clusterId, '1h');
      assert.equal(raw.length, 20);
      assert.equal(raw[0].isUsageAvailable, true);
      assert.equal(raw[0].source, 'metrics.k8s.io');

      // Verify rollups were generated for the 5-minute buckets
      const rollups5m = store.get5mRollups(clusterId, '1h');
      assert.ok(rollups5m.length > 0, 'Should have at least 1 five-minute rollup bucket');
      assert.ok(rollups5m[0].sampleCount! >= 1);
      assert.ok(rollups5m[0].cpuUsageAvgMillicores! > 0);
    });

    it('enforces zero-fabrication policy when metrics.k8s.io is unavailable', () => {
      const store = new TelemetryStore();
      const clusterId = 'cluster-no-metrics';
      const timestamp = Date.now();

      store.recordObservation(clusterId, {
        timestamp,
        cpuCapacityMillicores: 8000,
        cpuAllocatableMillicores: 7600,
        cpuRequestMillicores: 4000,
        cpuLimitMillicores: 6000,
        cpuRequestedPercent: 53,
        cpuLimitPercent: 79,
        // Live usage omitted because Metrics Server is not installed
        cpuUsageMillicores: undefined,
        cpuUsagePercent: undefined,
        memoryCapacityBytes: 32 * 1024 * 1024 * 1024,
        memoryAllocatableBytes: 30 * 1024 * 1024 * 1024,
        memoryRequestBytes: 16 * 1024 * 1024 * 1024,
        memoryLimitBytes: 24 * 1024 * 1024 * 1024,
        memoryRequestedPercent: 53,
        memoryLimitPercent: 80,
        memoryUsageBytes: undefined,
        memoryUsagePercent: undefined,
        isUsageAvailable: false,
        source: 'spec-derived'
      });

      const history = store.getTelemetryHistory(clusterId, { range: '1h' });
      assert.equal(history.isUsageAvailable, false);
      assert.equal(history.metricsSource, 'SPEC_STATUS_ONLY');
      assert.equal(history.runtimeStatus, 'UNAVAILABLE');
      assert.ok(history.summary.unavailableReason?.includes('Metrics Server'));

      // Verify points contain spec values but no fabricated usage
      assert.equal(history.points.length, 1);
      assert.equal(history.points[0].cpuRequestedPercent, 53);
      assert.equal(history.points[0].cpuUsagePercent, undefined);
      assert.equal(history.points[0].memoryUsagePercent, undefined);
    });
  });

  describe('Specification Deduplication and Change Tracking', () => {
    it('deduplicates identical resource specifications across sweeps', () => {
      const store = new TelemetryStore();
      const clusterId = 'cluster-spec-test';
      const now = Date.now();

      // Record 10 identical spec points
      for (let i = 0; i < 10; i++) {
        store.recordSpecChange(clusterId, {
          timestamp: now + i * 15000,
          nodeCount: 3,
          podCount: 25,
          cpuCapacityMillicores: 12000,
          cpuRequestMillicores: 6000,
          cpuLimitMillicores: 9000,
          memoryCapacityBytes: 48 * 1024 * 1024 * 1024,
          memoryRequestBytes: 24 * 1024 * 1024 * 1024,
          memoryLimitBytes: 36 * 1024 * 1024 * 1024
        });
      }

      const history = store.getTelemetryHistory(clusterId, { range: '1h' });
      // Only 1 spec entry should exist because specs did not change
      assert.equal(history.specHistory.length, 1);

      // Now introduce a real spec change (e.g. node scaled up)
      store.recordSpecChange(clusterId, {
        timestamp: now + 150000,
        nodeCount: 4, // Scaled from 3 to 4
        podCount: 30,
        cpuCapacityMillicores: 16000,
        cpuRequestMillicores: 7000,
        cpuLimitMillicores: 10000,
        memoryCapacityBytes: 64 * 1024 * 1024 * 1024,
        memoryRequestBytes: 28 * 1024 * 1024 * 1024,
        memoryLimitBytes: 40 * 1024 * 1024 * 1024
      });

      const updatedHistory = store.getTelemetryHistory(clusterId, { range: '1h' });
      assert.equal(updatedHistory.specHistory.length, 2);
      assert.equal(updatedHistory.specHistory[1].nodeCount, 4);
    });
  });

  describe('Incident-Aware Retention Pinning', () => {
    it('pins telemetry observations falling within active incident windows', () => {
      const store = new TelemetryStore();
      const clusterId = 'incident-pin-cluster';
      const incidentStart = Date.now() - 600 * 1000;
      const incidentEnd = Date.now() - 300 * 1000;

      const activeIncidentWindows = [
        { id: 'INC-999', startedAt: incidentStart, resolvedAt: incidentEnd }
      ];

      // Point comfortably before incident (outside 15-minute buffer: 25 minutes prior)
      store.recordObservation(
        clusterId,
        {
          timestamp: incidentStart - 25 * 60 * 1000,
          cpuCapacityMillicores: 4000,
          cpuRequestMillicores: 2000,
          cpuLimitMillicores: 3000,
          isUsageAvailable: true,
          source: 'metrics.k8s.io'
        },
        activeIncidentWindows
      );

      // Point during incident
      store.recordObservation(
        clusterId,
        {
          timestamp: incidentStart + 30000,
          cpuCapacityMillicores: 4000,
          cpuRequestMillicores: 2000,
          cpuLimitMillicores: 3000,
          isUsageAvailable: true,
          source: 'metrics.k8s.io'
        },
        activeIncidentWindows
      );

      const points = store.getRawPoints(clusterId, '1h');
      assert.equal(points.length, 2);
      assert.equal(points[0].pinned, false);
      assert.equal(points[1].pinned, true);
      assert.equal(points[1].incidentId, 'INC-999');
    });
  });

  describe('Baseline Calculation & Anomaly Detection', () => {
    it('computes statistical baseline metrics across observations', () => {
      const store = new TelemetryStore();
      const clusterId = 'baseline-cluster';
      const now = Date.now();

      for (let i = 0; i < 30; i++) {
        const cpuPct = 20 + (i % 10);
        const memPct = 30 + (i % 5);
        store.recordObservation(clusterId, {
          timestamp: now - (30 - i) * 60000,
          cpuCapacityMillicores: 4000,
          cpuRequestMillicores: 2000,
          cpuLimitMillicores: 3000,
          cpuUsageMillicores: Math.round((cpuPct / 100) * 4000),
          cpuUsagePercent: cpuPct,
          memoryCapacityBytes: 16 * 1024 * 1024 * 1024,
          memoryRequestBytes: 8 * 1024 * 1024 * 1024,
          memoryLimitBytes: 12 * 1024 * 1024 * 1024,
          memoryUsageBytes: Math.round((memPct / 100) * 16 * 1024 * 1024 * 1024),
          memoryUsagePercent: memPct,
          isUsageAvailable: true,
          source: 'metrics.k8s.io'
        });
      }

      const baseline = store.calculateBaseline(clusterId, '1h', now);
      assert.ok(baseline !== null);
      assert.ok(baseline!.sampleSize > 0);
      assert.ok(baseline!.cpu.avgPercent !== undefined && baseline!.cpu.avgPercent >= 20);
      assert.ok(baseline!.cpu.p95Percent !== undefined);
    });

    it('detects overcommitment anomalies when requests exceed allocatable capacity', () => {
      const store = new TelemetryStore();
      const clusterId = 'anomaly-cluster';
      const now = Date.now();

      store.recordObservation(clusterId, {
        timestamp: now,
        cpuCapacityMillicores: 4000,
        cpuAllocatableMillicores: 3800,
        cpuRequestMillicores: 4500, // 118% requested!
        cpuRequestedPercent: 118,
        cpuLimitMillicores: 6000,
        cpuLimitPercent: 158,
        memoryCapacityBytes: 16 * 1024 * 1024 * 1024,
        memoryAllocatableBytes: 15 * 1024 * 1024 * 1024,
        memoryRequestBytes: 17 * 1024 * 1024 * 1024, // Overcommitted
        memoryRequestedPercent: 113,
        memoryLimitBytes: 20 * 1024 * 1024 * 1024,
        memoryLimitPercent: 133,
        isUsageAvailable: false,
        source: 'spec-derived'
      });

      const anomalies = store.detectAnomalies(clusterId, now);
      assert.ok(anomalies.length >= 1);
      const overcommit = anomalies.find((a) => a.type === 'SPEC_OVERCOMMITMENT');
      assert.ok(overcommit !== undefined);
      assert.equal(overcommit!.severity, 'WARNING');
    });
  });

  describe('Telemetry Snapshot Persistence & DataStore Integration', () => {
    it('persists and reloads telemetry data across export and import snapshots', () => {
      const store1 = new TelemetryStore();
      const clusterId = 'persist-cluster';
      const now = Date.now();

      store1.recordObservation(clusterId, {
        timestamp: now,
        cpuCapacityMillicores: 4000,
        cpuRequestMillicores: 2000,
        cpuLimitMillicores: 3000,
        cpuUsagePercent: 35,
        isUsageAvailable: true,
        source: 'metrics.k8s.io'
      });

      store1.recordSpecChange(clusterId, {
        timestamp: now,
        nodeCount: 2,
        podCount: 10,
        cpuCapacityMillicores: 4000,
        cpuRequestMillicores: 2000,
        cpuLimitMillicores: 3000,
        memoryCapacityBytes: 8000,
        memoryRequestBytes: 4000,
        memoryLimitBytes: 6000
      });

      const snapshot = store1.exportSnapshot();
      assert.ok(snapshot[clusterId]);
      assert.equal(snapshot[clusterId].rawPoints.length, 1);
      assert.equal(snapshot[clusterId].specHistory.length, 1);

      const store2 = new TelemetryStore();
      store2.importSnapshot(snapshot);

      const points = store2.getRawPoints(clusterId, '1h');
      assert.equal(points.length, 1);
      assert.equal(points[0].cpuUsagePercent, 35);

      const specs = store2.getTelemetryHistory(clusterId).specHistory;
      assert.equal(specs.length, 1);
      assert.equal(specs[0].nodeCount, 2);
    });

    it('DataStore seamlessly provides getTelemetryHistory and getTelemetryBaseline', () => {
      const ds = new DataStore();
      const org = ds.createOrganization('Telemetry Org');
      const { cluster } = ds.createCluster(org.id, 'prod-cluster');

      // Record telemetry via store
      ds.recordMetricHistoryPoint(cluster.id, {
        timestamp: Date.now(),
        cpuCapacityMillicores: 4000,
        cpuAllocatableMillicores: 3800,
        cpuRequestMillicores: 2000,
        cpuLimitMillicores: 3000,
        cpuRequestedPercent: 53,
        cpuLimitPercent: 79,
        cpuUsagePercent: 25,
        memoryCapacityBytes: 16 * 1024 * 1024 * 1024,
        memoryAllocatableBytes: 15 * 1024 * 1024 * 1024,
        memoryRequestBytes: 8 * 1024 * 1024 * 1024,
        memoryLimitBytes: 12 * 1024 * 1024 * 1024,
        memoryRequestedPercent: 53,
        memoryLimitPercent: 80,
        memoryUsagePercent: 30,
        isUsageAvailable: true,
        source: 'metrics.k8s.io'
      });

      const telemetryRes = ds.getTelemetryHistory(cluster.id, org.id, { range: '1h' });
      assert.ok(telemetryRes !== null);
      assert.equal(telemetryRes!.clusterId, cluster.id);
      assert.equal(telemetryRes!.isUsageAvailable, true);
      assert.equal(telemetryRes!.runtimeStatus, 'LIVE');
      assert.equal(telemetryRes!.points.length, 1);
      assert.equal(telemetryRes!.rawObservations.length, 1);

      const baseline = ds.getTelemetryBaseline(cluster.id, org.id, '1h');
      assert.ok(baseline !== null);
      assert.equal(baseline!.clusterId, cluster.id);
      assert.ok(baseline!.sampleSize >= 1);
    });
  });
});
