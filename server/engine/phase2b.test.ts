import assert from 'node:assert';
import test, { describe } from 'node:test';
import { AnomalyDetector } from './anomaly';
import { BaselineEngine } from './baseline';
import { ChangeTracker } from './changes';
import { EvidenceEngine } from './evidence';
import { SkyOpsIntelligenceEngine } from './intelligence';
import { TemporalEngine } from './temporal';
import {
  Incident,
  KubernetesResource,
  MetricHistoryPoint
} from '../../src/types/index';

describe('Phase 2B: Deterministic Baselines, Anomalies, Changes, Temporal & Evidence', () => {
  describe('BaselineEngine', () => {
    test('returns UNAVAILABLE with explicit reason when observations < 6', () => {
      const samples = [
        { value: 100, timestamp: 1000 },
        { value: 120, timestamp: 2000 },
        { value: 110, timestamp: 3000 }
      ];

      const baseline = BaselineEngine.calculateNumericBaseline({
        scope: 'cluster',
        resourceKind: 'Cluster',
        resourceName: 'prod-cluster',
        clusterId: 'c1',
        metric: 'cpu_usage',
        unit: 'millicores',
        samples
      });

      assert.strictEqual(baseline.status, 'UNAVAILABLE');
      assert.strictEqual(baseline.quality, 'INSUFFICIENT');
      assert.strictEqual(baseline.unavailableReason, 'Insufficient historical observations.');
      assert.strictEqual(baseline.sampleCount, 3);
    });

    test('calculates accurate rolling statistics and preserves min/max spikes for valid observations (>= 6)', () => {
      const samples = [
        { value: 100, min: 90, max: 110, timestamp: 1000 },
        { value: 105, min: 95, max: 120, timestamp: 2000 },
        { value: 110, min: 100, max: 125, timestamp: 3000 },
        { value: 115, min: 105, max: 130, timestamp: 4000 },
        { value: 120, min: 110, max: 135, timestamp: 5000 },
        { value: 125, min: 115, max: 140, timestamp: 6000 },
        { value: 130, min: 80, max: 250, timestamp: 7000 } // Spike in max
      ];

      const baseline = BaselineEngine.calculateNumericBaseline({
        scope: 'cluster',
        resourceKind: 'Cluster',
        resourceName: 'prod-cluster',
        clusterId: 'c1',
        metric: 'cpu_usage',
        unit: 'millicores',
        samples
      });

      assert.strictEqual(baseline.status, 'AVAILABLE');
      assert.strictEqual(baseline.sampleCount, 7);
      assert.strictEqual(baseline.min, 80); // Preserved minimum spike
      assert.strictEqual(baseline.max, 250); // Preserved maximum spike
      assert.ok(baseline.mean > 110 && baseline.mean < 120);
      assert.strictEqual(baseline.median, 115);
      assert.ok(baseline.p95 >= 125);
    });

    test('evaluates quality tiers (LOW, MEDIUM, HIGH) appropriately based on sample count and span', () => {
      const baseSamples = Array.from({ length: 25 }, (_, i) => ({
        value: 200 + (i % 10),
        timestamp: 1000000 + i * 60000
      }));

      const baselineMed = BaselineEngine.calculateNumericBaseline({
        scope: 'cluster',
        resourceKind: 'Cluster',
        resourceName: 'prod-cluster',
        clusterId: 'c1',
        metric: 'cpu_usage',
        unit: 'millicores',
        samples: baseSamples
      });

      assert.strictEqual(baselineMed.quality, 'MEDIUM');

      const highSamples = Array.from({ length: 65 }, (_, i) => ({
        value: 200 + (i % 10),
        timestamp: 1000000 + i * 60000
      }));

      const baselineHigh = BaselineEngine.calculateNumericBaseline({
        scope: 'cluster',
        resourceKind: 'Cluster',
        resourceName: 'prod-cluster',
        clusterId: 'c1',
        metric: 'cpu_usage',
        unit: 'millicores',
        samples: highSamples
      });

      assert.strictEqual(baselineHigh.quality, 'HIGH');
    });

    test('compares observed values against baseline to detect surges with sigma deviations', () => {
      const baseline = BaselineEngine.calculateNumericBaseline({
        scope: 'cluster',
        resourceKind: 'Cluster',
        resourceName: 'prod-cluster',
        clusterId: 'c1',
        metric: 'cpu_usage',
        unit: 'millicores',
        samples: [
          { value: 100 },
          { value: 102 },
          { value: 98 },
          { value: 101 },
          { value: 99 },
          { value: 100 }
        ]
      });

      const normalCheck = BaselineEngine.compareWithBaseline(105, baseline);
      assert.strictEqual(normalCheck.hasAnomaly, false);

      const surgeCheck = BaselineEngine.compareWithBaseline(500, baseline);
      assert.strictEqual(surgeCheck.hasAnomaly, true);
      assert.ok(surgeCheck.deviationRatio >= 4.5);
      assert.ok(surgeCheck.sigmaDeviation >= 3);
    });
  });

  describe('AnomalyDetector', () => {
    test('detects CPU and Memory spikes when cluster metrics exceed baseline bounds', () => {
      const baseline = BaselineEngine.calculateNumericBaseline({
        scope: 'cluster',
        resourceKind: 'Cluster',
        resourceName: 'prod-cluster',
        clusterId: 'c1',
        metric: 'cpu_usage',
        unit: 'millicores',
        samples: [
          { value: 200 },
          { value: 210 },
          { value: 190 },
          { value: 205 },
          { value: 195 },
          { value: 200 }
        ]
      });

      const history: MetricHistoryPoint[] = [
        {
          timestamp: 1000,
          cpuUsageMillicores: 200,
          cpuUsagePercent: 20,
          cpuRequestMillicores: 1000,
          cpuCapacityMillicores: 4000,
          memoryUsageBytes: 500 * 1024 * 1024,
          memoryRequestBytes: 1024 * 1024 * 1024,
          memoryCapacityBytes: 8192 * 1024 * 1024,
          isUsageAvailable: true
        },
        {
          timestamp: 2000,
          cpuUsageMillicores: 1200, // Spike: 6x baseline!
          cpuUsagePercent: 85,
          cpuRequestMillicores: 1000,
          cpuCapacityMillicores: 4000,
          memoryUsageBytes: 550 * 1024 * 1024,
          memoryRequestBytes: 1024 * 1024 * 1024,
          memoryCapacityBytes: 8192 * 1024 * 1024,
          isUsageAvailable: true
        }
      ];

      const anomalies = AnomalyDetector.detectClusterAnomalies({
        orgId: 'org1',
        clusterId: 'c1',
        history,
        baselines: [baseline]
      });

      const cpuAnomaly = anomalies.find((a) => a.anomalyType === 'CPU_SPIKE');
      assert.ok(cpuAnomaly, 'Should detect CPU_SPIKE');
      assert.strictEqual(cpuAnomaly?.resourceKind, 'Cluster');
      assert.strictEqual(cpuAnomaly?.observedValue, 1200);
      assert.strictEqual(cpuAnomaly?.status, 'ACTIVE');
    });

    test('detects Pod restart spikes and container exit code errors deterministically', () => {
      const podResource: KubernetesResource = {
        id: 'pod-1',
        clusterId: 'c1',
        kind: 'Pod',
        name: 'checkout-api-74f85b-9x2pq',
        namespace: 'production',
        status: 'CrashLoopBackOff',
        health: 'CRITICAL',
        createdAt: 1000,
        updatedAt: 5000,
        containers: [
          {
            name: 'checkout-app',
            image: 'checkout-app:v2.1',
            ready: false,
            state: 'Waiting',
            restartCount: 5,
            exitCode: 137, // OOMKilled
            terminationReason: 'OOMKilled'
          }
        ]
      };

      const anomalies = AnomalyDetector.detectResourceAnomalies({
        orgId: 'org1',
        clusterId: 'c1',
        resource: podResource
      });

      const restartAnom = anomalies.find((a) => a.anomalyType === 'RESTART_SPIKE');
      assert.ok(restartAnom, 'Should detect RESTART_SPIKE');
      assert.strictEqual(restartAnom?.observedValue, 5);

      const errAnom = anomalies.find((a) => a.anomalyType === 'ERROR_RATE_ANOMALY');
      assert.ok(errAnom, 'Should detect ERROR_RATE_ANOMALY for OOM');
      assert.strictEqual(errAnom?.observedValue, 137);
      assert.strictEqual(errAnom?.severity, 'CRITICAL');
    });

    test('detects Node pressure conditions and unready states', () => {
      const nodeResource: KubernetesResource = {
        id: 'node-1',
        clusterId: 'c1',
        kind: 'Node',
        name: 'gke-prod-pool-1',
        namespace: 'default',
        status: 'NotReady',
        health: 'CRITICAL',
        createdAt: 1000,
        updatedAt: 5000,
        conditions: [
          { type: 'MemoryPressure', status: 'True', reason: 'KubeletHasMemoryPressure', message: 'Node is low on memory' },
          { type: 'Ready', status: 'False', reason: 'KubeletNotReady', message: 'Kubelet stopped posting status' }
        ]
      };

      const anomalies = AnomalyDetector.detectResourceAnomalies({
        orgId: 'org1',
        clusterId: 'c1',
        resource: nodeResource
      });

      const nodeAnom = anomalies.find((a) => a.anomalyType === 'NODE_PRESSURE');
      assert.ok(nodeAnom, 'Should detect NODE_PRESSURE');
      assert.strictEqual(nodeAnom?.severity, 'CRITICAL');
      assert.ok(nodeAnom?.observedDisplay.includes('MemoryPressure'));
    });
  });

  describe('ChangeTracker', () => {
    test('detects image updates and replica scaling between successive observations', () => {
      const prevRes: KubernetesResource = {
        id: 'dep-1',
        clusterId: 'c1',
        kind: 'Deployment',
        name: 'payment-svc',
        namespace: 'default',
        status: 'Available',
        health: 'HEALTHY',
        createdAt: 1000,
        updatedAt: 2000,
        specSummary: {
          image: 'payment-svc:v1.0.0',
          replicas: 3
        }
      };

      const currRes: KubernetesResource = {
        id: 'dep-1',
        clusterId: 'c1',
        kind: 'Deployment',
        name: 'payment-svc',
        namespace: 'default',
        status: 'Progressing',
        health: 'WARNING',
        createdAt: 1000,
        updatedAt: 3000,
        specSummary: {
          image: 'payment-svc:v2.0.0', // Updated image
          replicas: 5 // Scaled replicas
        }
      };

      const changes = ChangeTracker.detectResourceChanges(prevRes, currRes, 3000);
      assert.strictEqual(changes.length, 2);

      const imgChange = changes.find((c) => c.changeType === 'IMAGE_UPDATE');
      assert.ok(imgChange);
      assert.strictEqual(imgChange?.oldValue, 'payment-svc:v1.0.0');
      assert.strictEqual(imgChange?.newValue, 'payment-svc:v2.0.0');

      const repChange = changes.find((c) => c.changeType === 'REPLICA_COUNT');
      assert.ok(repChange);
      assert.strictEqual(repChange?.oldValue, 3);
      assert.strictEqual(repChange?.newValue, 5);
    });

    test('correlates antecedent change on controller with pod failure and computes temporal proximity', () => {
      const targetPod = { kind: 'Pod', name: 'payment-svc-78f99-4jkln', namespace: 'default' };
      const incidentTs = 5000000;
      const rolloutTs = incidentTs - 180000; // 3 minutes prior

      const changes = [
        {
          id: 'chg-1',
          orgId: 'org1',
          clusterId: 'c1',
          resourceKind: 'Deployment',
          resourceName: 'payment-svc',
          namespace: 'default',
          changeType: 'IMAGE_UPDATE' as const,
          attribute: 'spec.image',
          oldValue: 'payment:v1.0',
          newValue: 'payment:v2.0',
          description: 'Image updated to payment:v2.0',
          timestamp: rolloutTs
        }
      ];

      const relationships = [
        {
          source: { kind: 'Pod', name: 'payment-svc-78f99-4jkln', namespace: 'default' },
          target: { kind: 'Deployment', name: 'payment-svc', namespace: 'default' },
          relation: 'OWNED_BY' as const,
          isImpacted: true,
          details: 'Pod owned by Deployment'
        }
      ];

      const correlations = ChangeTracker.correlateChangesWithIncident({
        targetResource: targetPod,
        incidentTimestamp: incidentTs,
        relationships,
        allChanges: changes
      });

      assert.strictEqual(correlations.length, 1);
      const corr = correlations[0];
      assert.strictEqual(corr.relationship, 'CONTROLLER');
      assert.strictEqual(corr.correlationStrength, 'STRONG');
      assert.strictEqual(corr.temporalProximityDisplay, '3m before incident');
      assert.ok(corr.explanation.includes('payment:v2.0'));
    });
  });

  describe('TemporalEngine & Unified Evidence', () => {
    test('partitions timeline into BEFORE, DURING, and AFTER phases', () => {
      const incident: Incident = {
        id: 'inc-101',
        orgId: 'org1',
        clusterId: 'c1',
        clusterName: 'production',
        title: 'CrashLoopBackOff on payment-svc',
        severity: 'CRITICAL',
        status: 'RESOLVED',
        incidentType: 'CrashLoopBackOff',
        fingerprint: 'fp-101',
        resourceKind: 'Pod',
        resourceName: 'payment-svc-pod',
        namespace: 'default',
        firstSeenAt: 200000,
        lastSeenAt: 300000,
        resolvedAt: 400000,
        updatedAt: 400000,
        occurrenceCount: 1,
        technicalDetails: {} as any
      };

      const changes = [
        {
          change: {
            id: 'chg-0',
            orgId: 'org1',
            clusterId: 'c1',
            resourceKind: 'Deployment',
            resourceName: 'payment-svc',
            changeType: 'IMAGE_UPDATE' as const,
            attribute: 'spec.image',
            oldValue: 'v1',
            newValue: 'v2',
            description: 'Updated image',
            timestamp: 150000 // BEFORE incident
          },
          targetResource: { kind: 'Pod', name: 'payment-svc-pod' },
          relationship: 'CONTROLLER' as const,
          temporalProximityMs: 50000,
          temporalProximityDisplay: '50s before incident',
          correlationStrength: 'STRONG' as const,
          confidence: 0.9,
          explanation: 'Controller updated'
        }
      ];

      const anomalies = [
        {
          id: 'anom-1',
          orgId: 'org1',
          clusterId: 'c1',
          resourceId: 'payment-svc-pod',
          resourceKind: 'Pod',
          resourceName: 'payment-svc-pod',
          metric: 'restarts',
          anomalyType: 'RESTART_SPIKE' as const,
          observedValue: 4,
          observedDisplay: '4 restarts',
          deviation: 4,
          deviationDisplay: '4 restarts',
          detectionWindow: 'recent',
          firstObservedAt: 250000, // DURING incident
          lastObservedAt: 250000,
          severity: 'CRITICAL' as const,
          confidence: 1.0,
          evidenceReferences: [],
          status: 'ACTIVE' as const
        }
      ];

      const partitioned = TemporalEngine.partitionTimeline({
        incident,
        changes,
        anomalies
      });

      assert.ok(partitioned.before.length >= 1, 'Should have BEFORE phase events');
      assert.strictEqual(partitioned.before[0].phase, 'BEFORE');
      assert.strictEqual(partitioned.before[0].changeRef, 'chg-0');

      assert.ok(partitioned.during.length >= 2, 'Should have DURING phase events (incident trigger + anomaly)');
      assert.strictEqual(partitioned.during.some((e) => e.anomalyRef === 'anom-1'), true);

      assert.ok(partitioned.after.length >= 1, 'Should have AFTER phase resolution event');
      assert.strictEqual(partitioned.after[0].phase, 'AFTER');
    });

    test('builds UnifiedEvidence with supporting/contextual relevance and explicit unknown factor declarations', () => {
      const incident: Incident = {
        id: 'inc-102',
        orgId: 'org1',
        clusterId: 'c1',
        clusterName: 'production',
        title: 'OOMKilled on worker',
        severity: 'CRITICAL',
        status: 'OPEN',
        incidentType: 'OOMKilled',
        fingerprint: 'fp-102',
        resourceKind: 'Pod',
        resourceName: 'worker-1',
        namespace: 'default',
        firstSeenAt: 100000,
        lastSeenAt: 100000,
        updatedAt: 100000,
        occurrenceCount: 1,
        technicalDetails: {} as any
      };

      const pod: KubernetesResource = {
        id: 'worker-1',
        clusterId: 'c1',
        kind: 'Pod',
        name: 'worker-1',
        namespace: 'default',
        status: 'OOMKilled',
        health: 'CRITICAL',
        createdAt: 50000,
        updatedAt: 100000,
        containers: [
          {
            name: 'worker-process',
            image: 'worker:latest',
            ready: false,
            state: 'Waiting',
            restartCount: 2,
            exitCode: 137,
            terminationReason: 'OOMKilled'
          }
        ]
      };

      const evidence = EvidenceEngine.buildUnifiedEvidence({
        incident,
        targetResource: pod,
        relationships: [],
        signals: [],
        anomalies: [],
        changes: [],
        baselines: [
          {
            baselineId: 'b1',
            scope: 'cluster',
            resourceKind: 'Cluster',
            resourceName: 'c1',
            clusterId: 'c1',
            metric: 'cpu_usage',
            timeWindow: '1h',
            sampleCount: 2,
            centralValue: 0,
            mean: 0,
            median: 0,
            min: 0,
            max: 0,
            stdDev: 0,
            p95: 0,
            calculationMethod: 'rolling_statistics',
            quality: 'INSUFFICIENT',
            calculatedAt: 100000,
            status: 'UNAVAILABLE',
            unavailableReason: 'Insufficient historical observations.',
            unit: 'millicores'
          }
        ],
        metrics: {
          isUsageAvailable: false,
          unavailableReason: 'Metrics server absent'
        }
      });

      // Supporting evidence for exit code 137
      const oomEvidence = evidence.evidenceList.find((e) => e.details?.exitCode === 137);
      assert.ok(oomEvidence, 'Should have exit code 137 evidence');
      assert.strictEqual(oomEvidence?.relevance, 'SUPPORTING');

      // Explicit unknown factors
      assert.ok(evidence.unknownFactors.length >= 2, 'Should declare explicit unknown factors');
      assert.ok(evidence.unknownFactors.some((u) => u.includes('metrics.k8s.io is absent')));
      assert.ok(evidence.unknownFactors.some((u) => u.includes('fewer than 6 observations') || u.includes('Statistical deviation cannot be calculated')));
    });

    test('SkyOpsIntelligenceEngine integrates all Phase 2B engines and returns enriched analysis', () => {
      const incident: Incident = {
        id: 'inc-103',
        orgId: 'org1',
        clusterId: 'c1',
        clusterName: 'production',
        title: 'CrashLoopBackOff on auth-service',
        severity: 'CRITICAL',
        status: 'OPEN',
        incidentType: 'CrashLoopBackOff',
        fingerprint: 'fp-103',
        resourceKind: 'Pod',
        resourceName: 'auth-service-pod',
        namespace: 'default',
        firstSeenAt: 100000,
        lastSeenAt: 100000,
        updatedAt: 100000,
        occurrenceCount: 1,
        technicalDetails: {} as any
      };

      const pod: KubernetesResource = {
        id: 'auth-service-pod',
        clusterId: 'c1',
        kind: 'Pod',
        name: 'auth-service-pod',
        namespace: 'default',
        status: 'CrashLoopBackOff',
        health: 'CRITICAL',
        createdAt: 50000,
        updatedAt: 100000,
        containers: [
          {
            name: 'auth-container',
            image: 'auth:v2.5',
            ready: false,
            state: 'Waiting',
            restartCount: 6,
            exitCode: 1,
            waitingReason: 'CrashLoopBackOff'
          }
        ]
      };

      const analysis = SkyOpsIntelligenceEngine.analyzeIncident(
        incident,
        pod,
        [pod]
      );

      assert.ok(analysis.anomalies, 'Should include anomalies');
      assert.ok(analysis.anomalies.length >= 1, 'Should detect restart spike anomaly');
      assert.ok(analysis.temporalPhases, 'Should include temporalPhases');
      assert.ok(analysis.unifiedEvidence, 'Should include unifiedEvidence');
      assert.ok(analysis.unifiedEvidence.length >= 1, 'Should compile unified evidence');
      assert.ok(analysis.unknownFactors, 'Should track unknown factors');
    });
  });
});
