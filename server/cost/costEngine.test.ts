/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SkyOps Kubernetes Cost Intelligence Test Suite
 * Validates real calculations against ground truth telemetry, non-fabrication of data,
 * idle workload detection, resource rightsizing, and savings tracking lifecycle.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../store';
import { CostEngine } from './costEngine';
import { KubernetesResource } from '../../src/types/index';

test('Cost Intelligence: Killercoda Ground Truth & Non-Fabrication Suite', async (t) => {
  const runId = Date.now().toString();
  const testOrg = store.createOrganization(
    `Cost Ground Truth Org ${runId}`,
    `user-${runId}`,
    `user-${runId}@skyops.io`,
    'Cost Auditor'
  );

  await t.test('1. Empty cluster returns 0 and empty lists without fabricating synthetic data', async () => {
    const emptyCluster = store.createCluster(testOrg.id, 'Empty-Cluster', 'Cluster without telemetry', {
      displayName: 'Empty-Cluster',
      environment: 'development'
    });

    const overview = CostEngine.getCostOverview(testOrg.id);
    assert.equal(overview.estimatedMonthlyCostUsd, 0, 'Must not fabricate baseline cost');
    assert.equal(overview.potentialMonthlySavingsUsd, 0, 'Must not fabricate baseline savings');
    assert.equal(overview.cpuWastePercent, 0, 'Must not fabricate 42% or any synthetic CPU waste');
    assert.equal(overview.memoryWastePercent, 0, 'Must not fabricate 51% or any synthetic memory waste');
    assert.equal(overview.idleWorkloadsCount, 0, 'Must not fabricate 7 idle workloads');

    const allocation = CostEngine.getCostAllocation(testOrg.id);
    assert.equal(allocation.byNamespace.length, 0, 'Must not fabricate synthetic namespaces');
    assert.equal(allocation.byWorkload.length, 0, 'Must not fabricate checkout-api or payment-api');

    const recs = CostEngine.getRightsizingRecommendations(testOrg.id);
    assert.equal(recs.length, 0, 'Must not inject demo recommendations');

    const waste = CostEngine.getCostWasteItems(testOrg.id);
    assert.equal(waste.length, 0, 'Must not inject demo waste items');

    const savings = CostEngine.getCostSavingsTracking(testOrg.id);
    assert.equal(savings.estimatedOpportunityUsd, 0, 'Must not return hardcoded $8,420');
    assert.equal(savings.implementedSavingsUsd, 0, 'Must not return hardcoded $3,180');
    assert.equal(savings.verifiedSavingsUsd, 0, 'Must not return hardcoded $2,840');
    assert.equal(savings.realizedSavingsUsd, 0, 'Must not return hardcoded $2,640');
  });

  await t.test('2. Killercoda Ground Truth Telemetry: overprovisioned vs cpu-test workloads', async () => {
    // Create Killercoda cluster matching prompt ground truth
    const kcCluster = store.createCluster(testOrg.id, 'Killercoda-K8s', 'Connected Killercoda cluster', {
      displayName: 'Killercoda-K8s',
      environment: 'production'
    });

    // Real Killercoda resources:
    // Namespace: cost-test
    // Deployment: overprovisioned (2 replicas, CPU req 200m, CPU lim 500m, Mem req 256Mi, Mem lim 512Mi, CPU usage 0m, Mem usage 2Mi)
    // Deployment: cpu-test (1 replica, busybox CPU stress, CPU usage 969m)
    // Nodes: node01 (CPU usage 998m, 99%), controlplane (CPU usage 63m, 6%)
    const resources: KubernetesResource[] = [
      // Nodes
      {
        id: `${kcCluster.cluster.id}:Node:controlplane`,
        clusterId: kcCluster.cluster.id,
        kind: 'Node',
        name: 'controlplane',
        namespace: '',
        status: 'Ready',
        health: 'HEALTHY',
        createdAt: Date.now() - 3600000,
        updatedAt: Date.now(),
        statusSummary: {
          capacity: { cpu: '2', memory: '4Gi', pods: '110' },
          allocatable: { cpu: '1000m', memory: '2160Mi', pods: '110' },
          usage: { cpu: '63m', memory: '1405Mi' }
        },
        conditions: [{ type: 'Ready', status: 'True' }]
      },
      {
        id: `${kcCluster.cluster.id}:Node:node01`,
        clusterId: kcCluster.cluster.id,
        kind: 'Node',
        name: 'node01',
        namespace: '',
        status: 'Ready',
        health: 'HEALTHY',
        createdAt: Date.now() - 3600000,
        updatedAt: Date.now(),
        statusSummary: {
          capacity: { cpu: '2', memory: '4Gi', pods: '110' },
          allocatable: { cpu: '1000m', memory: '1800Mi', pods: '110' },
          usage: { cpu: '998m', memory: '945Mi' }
        },
        conditions: [{ type: 'Ready', status: 'True' }]
      },
      // Deployment: overprovisioned
      {
        id: `${kcCluster.cluster.id}:Deployment:cost-test:overprovisioned`,
        clusterId: kcCluster.cluster.id,
        kind: 'Deployment',
        name: 'overprovisioned',
        namespace: 'cost-test',
        status: '2/2',
        health: 'HEALTHY',
        createdAt: Date.now() - 3600000,
        updatedAt: Date.now(),
        specReplicas: 2,
        readyReplicas: 2,
        containers: [
          {
            name: 'app',
            cpuRequest: '200m',
            cpuLimit: '500m',
            cpuUsage: '0m',
            memoryRequest: '256Mi',
            memoryLimit: '512Mi',
            memoryUsage: '2Mi'
          }
        ]
      },
      // Pod 1 for overprovisioned
      {
        id: `${kcCluster.cluster.id}:Pod:cost-test:overprovisioned-pod-1`,
        clusterId: kcCluster.cluster.id,
        kind: 'Pod',
        name: 'overprovisioned-7d4bc67f4-x1',
        namespace: 'cost-test',
        nodeName: 'node01',
        status: 'Running',
        health: 'HEALTHY',
        createdAt: Date.now() - 3600000,
        updatedAt: Date.now(),
        ownerReferences: [{ kind: 'Deployment', name: 'overprovisioned', controller: true }],
        containers: [
          {
            name: 'app',
            cpuRequest: '200m',
            cpuLimit: '500m',
            cpuUsage: '0m',
            memoryRequest: '256Mi',
            memoryLimit: '512Mi',
            memoryUsage: '2Mi'
          }
        ]
      },
      // Pod 2 for overprovisioned
      {
        id: `${kcCluster.cluster.id}:Pod:cost-test:overprovisioned-pod-2`,
        clusterId: kcCluster.cluster.id,
        kind: 'Pod',
        name: 'overprovisioned-7d4bc67f4-x2',
        namespace: 'cost-test',
        nodeName: 'node01',
        status: 'Running',
        health: 'HEALTHY',
        createdAt: Date.now() - 3600000,
        updatedAt: Date.now(),
        ownerReferences: [{ kind: 'Deployment', name: 'overprovisioned', controller: true }],
        containers: [
          {
            name: 'app',
            cpuRequest: '200m',
            cpuLimit: '500m',
            cpuUsage: '0m',
            memoryRequest: '256Mi',
            memoryLimit: '512Mi',
            memoryUsage: '2Mi'
          }
        ]
      },
      // Deployment: cpu-test (busybox CPU stress)
      {
        id: `${kcCluster.cluster.id}:Deployment:cost-test:cpu-test`,
        clusterId: kcCluster.cluster.id,
        kind: 'Deployment',
        name: 'cpu-test',
        namespace: 'cost-test',
        status: '1/1',
        health: 'HEALTHY',
        createdAt: Date.now() - 3600000,
        updatedAt: Date.now(),
        specReplicas: 1,
        readyReplicas: 1,
        containers: [
          {
            name: 'stress',
            cpuRequest: '1000m',
            cpuLimit: '1000m',
            cpuUsage: '969m',
            memoryRequest: '64Mi',
            memoryLimit: '128Mi',
            memoryUsage: '12Mi'
          }
        ]
      },
      // Pod for cpu-test
      {
        id: `${kcCluster.cluster.id}:Pod:cost-test:cpu-test-pod-1`,
        clusterId: kcCluster.cluster.id,
        kind: 'Pod',
        name: 'cpu-test-559d88-p1',
        namespace: 'cost-test',
        nodeName: 'node01',
        status: 'Running',
        health: 'HEALTHY',
        createdAt: Date.now() - 3600000,
        updatedAt: Date.now(),
        ownerReferences: [{ kind: 'Deployment', name: 'cpu-test', controller: true }],
        containers: [
          {
            name: 'stress',
            cpuRequest: '1000m',
            cpuLimit: '1000m',
            cpuUsage: '969m',
            memoryRequest: '64Mi',
            memoryLimit: '128Mi',
            memoryUsage: '12Mi'
          }
        ]
      }
    ];

    store.syncClusterResources(kcCluster.cluster.id, resources);

    // 1. Cost Overview checks
    const overview = CostEngine.getCostOverview(testOrg.id);
    assert.ok(overview.estimatedMonthlyCostUsd > 0, 'Monthly cost must be calculated from live requests');
    assert.ok(overview.potentialMonthlySavingsUsd > 0, 'Potential savings must reflect overprovisioned workload');
    assert.ok(overview.cpuWastePercent > 0 && overview.cpuWastePercent <= 100);
    assert.ok(overview.memoryWastePercent > 0 && overview.memoryWastePercent <= 100);

    // Idle workloads count: EXACTLY 1 (overprovisioned), NOT cpu-test!
    assert.equal(overview.idleWorkloadsCount, 1, 'Only overprovisioned is idle (<5% util); cpu-test (969m) is not idle');

    // 2. Cost Allocation checks
    const allocation = CostEngine.getCostAllocation(testOrg.id);
    assert.ok(allocation.byNamespace.some((n) => n.name === 'cost-test'), 'Must contain real cost-test namespace');
    assert.ok(allocation.byWorkload.some((w) => w.name === 'overprovisioned'), 'Must contain overprovisioned workload');
    assert.ok(allocation.byWorkload.some((w) => w.name === 'cpu-test'), 'Must contain cpu-test workload');

    const overprovAlloc = allocation.byWorkload.find((w) => w.name === 'overprovisioned')!;
    assert.ok(overprovAlloc.wastePercent >= 90, 'overprovisioned waste must exceed 90%');

    const cpuTestAlloc = allocation.byWorkload.find((w) => w.name === 'cpu-test')!;
    assert.ok(cpuTestAlloc.wastePercent < 50, 'cpu-test waste must be low due to 969m CPU stress');

    // 3. Rightsizing Recommendations
    const recs = CostEngine.getRightsizingRecommendations(testOrg.id);
    assert.ok(recs.length > 0, 'Must generate recommendation for overprovisioned workload');

    const overprovRec = recs.find((r) => r.workloadName === 'overprovisioned');
    assert.ok(overprovRec, 'Recommendation must exist for overprovisioned');
    assert.equal(overprovRec.namespace, 'cost-test');
    assert.equal(overprovRec.currentCpuRequested, '400m');
    assert.equal(overprovRec.averageCpuUsed, '0m');
    assert.equal(overprovRec.currentMemoryRequested, '512Mi');
    assert.equal(overprovRec.averageMemoryUsed, '4Mi');
    assert.equal(overprovRec.recommendedCpu, '100m');
    assert.equal(overprovRec.recommendedMemory, '128Mi');
    assert.ok(overprovRec.estimatedMonthlySavingsUsd > 0);
    assert.equal(overprovRec.risk, 'LOW');
    assert.equal(overprovRec.rollbackAvailable, true);
    assert.equal(overprovRec.status, 'PENDING_REVIEW');

    // Must NOT generate recommendation for cpu-test because it is actively using 969m
    const cpuTestRec = recs.find((r) => r.workloadName === 'cpu-test');
    assert.equal(cpuTestRec, undefined, 'cpu-test must not be rightsized as it is not overprovisioned');

    // 4. Cost Waste Items
    const waste = CostEngine.getCostWasteItems(testOrg.id);
    const idleItem = waste.find((w) => w.category === 'IDLE_WORKLOAD' && w.resourceName === 'overprovisioned');
    assert.ok(idleItem, 'Must flag overprovisioned as IDLE_WORKLOAD');
    assert.equal(idleItem.currentReplicas, 2);
    assert.equal(idleItem.recommendedReplicas, 1);
    assert.ok(idleItem.potentialMonthlyWasteUsd > 0);

    // 5. Applying Rightsizing
    const applied = store.applyRightsizingRecommendation(overprovRec, 'user-auditor', 'Cost Auditor');
    assert.equal(applied.status, 'APPLIED');
    assert.ok(applied.appliedAt);

    // Verify recommendations reflect APPLIED status
    const updatedRecs = CostEngine.getRightsizingRecommendations(testOrg.id);
    const updatedOverprovRec = updatedRecs.find((r) => r.id === overprovRec.id);
    assert.ok(updatedOverprovRec);
    assert.equal(updatedOverprovRec.status, 'APPLIED');

    // Verify savings tracking reflects applied recommendation
    const savings = CostEngine.getCostSavingsTracking(testOrg.id);
    assert.ok(savings.implementedSavingsUsd > 0, 'Implemented savings must reflect applied recommendation');
    assert.ok(savings.verifiedSavingsUsd > 0, 'Verified savings must reflect healthy applied workload');
    assert.ok(savings.realizedSavingsUsd > 0, 'Realized savings must reflect verified savings');
    assert.ok(savings.trackingBreakdown.length > 0, 'Tracking breakdown must have active month');
  });
});
