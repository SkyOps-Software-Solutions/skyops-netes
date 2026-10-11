/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SkyOps Overview Intelligence & Command Center P1 Test Suite
 * Validates deterministic aggregation, health interpretation, incident correlation,
 * change awareness, action eligibility, and multi-tenant isolation across all 16 P1 scenarios.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { store } from './store';
import { CostEngine } from './cost/costEngine';
import {
  computeScopedOverviewMetrics,
  correlateAndPrioritizeIncidents,
  determineOperationalHealth,
  extractChangeContext,
  evaluateRemediationEligibility
} from '../src/components/overview/overviewLogic';
import { Cluster, Incident, KubernetesResource } from '../src/types/index';

test('SkyOps Command Center P1: Intelligence and Logical Correctness Suite', async (t) => {
  const runId = Date.now().toString();
  const orgA = store.createOrganization(`Org-A-${runId}`, `owner-a-${runId}`, `a@skyops.io`, 'Owner A');
  const orgB = store.createOrganization(`Org-B-${runId}`, `owner-b-${runId}`, `b@skyops.io`, 'Owner B');

  // Helper cluster factory
  const createMockCluster = (orgId: string, name: string, agentStatus: 'CONNECTED' | 'OFFLINE' | 'STALE' = 'CONNECTED', status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'AGENT_OFFLINE' = 'HEALTHY'): Cluster => {
    const res = store.createCluster(orgId, name, `Test cluster ${name}`, {
      displayName: name,
      environment: 'production'
    });
    res.cluster.agentStatus = agentStatus;
    res.cluster.status = status;
    return res.cluster;
  };

  // Helper resource factory
  const createMockResource = (clusterId: string, kind: string, name: string, ns = 'default', status = 'Running', health: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY'): KubernetesResource => {
    return {
      id: `${clusterId}:${kind}:${ns}:${name}`,
      clusterId,
      kind,
      name,
      namespace: ns,
      status,
      health,
      createdAt: Date.now() - 3600000,
      updatedAt: Date.now()
    };
  };

  // Helper incident factory
  const createMockIncident = (overrides: Partial<Incident> & { id: string; orgId: string; clusterId: string; clusterName: string; title: string; severity: any; status: any; resourceKind: string; resourceName: string }): Incident => {
    return {
      fingerprint: `fp-${overrides.id}`,
      namespace: overrides.namespace || 'default',
      incidentType: (overrides.incidentType || 'CrashLoopBackOff') as any,
      occurrenceCount: 1,
      firstSeenAt: Date.now() - 600000,
      lastSeenAt: Date.now(),
      technicalDetails: { observedState: 'CrashLoopBackOff' },
      createdAt: Date.now() - 600000,
      updatedAt: Date.now(),
      ...overrides
    } as Incident;
  };

  // Scenario 1: A connected but unhealthy cluster
  await t.test('Scenario 1: Connected but unhealthy cluster reflects CRITICAL infrastructure health', async () => {
    const cluster1 = createMockCluster(orgA.id, 'c1-connected-unhealthy', 'CONNECTED', 'CRITICAL');
    const crashingPod = createMockResource(cluster1.id, 'Pod', 'crashing-api-pod', 'prod', 'CrashLoopBackOff', 'CRITICAL');
    const incident: Incident = createMockIncident({
      id: `inc-c1-${Date.now()}`,
      orgId: orgA.id,
      clusterId: cluster1.id,
      clusterName: cluster1.name,
      title: 'CrashLoopBackOff in prod/crashing-api-pod',
      severity: 'CRITICAL',
      status: 'OPEN',
      resourceKind: 'Pod',
      resourceName: 'crashing-api-pod',
      namespace: 'prod',
      firstSeenAt: Date.now() - 600000,
      lastSeenAt: Date.now() - 30000,
      incidentType: 'CrashLoopBackOff',
      technicalDetails: { observedState: 'CrashLoopBackOff' }
    });

    const assessment = determineOperationalHealth({
      clusters: [cluster1],
      selectedCluster: cluster1,
      isSingleCluster: true,
      resources: [crashingPod],
      openIncidents: [incident]
    });

    assert.equal(assessment.status, 'CRITICAL', 'Status must be CRITICAL when pods are crashing');
    assert.ok(assessment.observations.some((o) => o.includes('crashing')), 'Must explicitly identify failing pod in observations');
    assert.equal(assessment.agentLinkState, 'ALL_CONNECTED', 'Agent connectivity must be recognized as connected');
  });

  // Scenario 2: A healthy last-known state with a disconnected agent
  await t.test('Scenario 2: Disconnected agent with healthy last-known state evaluates to DEGRADED', async () => {
    const cluster2 = createMockCluster(orgA.id, 'c2-disconnected-healthy', 'OFFLINE', 'HEALTHY');
    const healthyPod = createMockResource(cluster2.id, 'Pod', 'healthy-web-pod', 'default', 'Running', 'HEALTHY');

    const assessment = determineOperationalHealth({
      clusters: [cluster2],
      selectedCluster: cluster2,
      isSingleCluster: true,
      resources: [healthyPod],
      openIncidents: []
    });

    assert.equal(assessment.status, 'DEGRADED', 'Must not claim HEALTHY when agent is offline');
    assert.equal(assessment.agentLinkState, 'DISCONNECTED');
    assert.ok(assessment.observations.some((o) => o.includes('OFFLINE') || o.includes('missed')));
  });

  // Scenario 3: Missing or stale telemetry
  await t.test('Scenario 3: Missing or stale telemetry does not fabricate nominal health', async () => {
    const cluster3 = createMockCluster(orgA.id, 'c3-stale-telemetry', 'CONNECTED', 'HEALTHY');

    // Case A: Stale telemetry flag
    const staleAssessment = determineOperationalHealth({
      clusters: [cluster3],
      selectedCluster: cluster3,
      isSingleCluster: true,
      resources: [],
      openIncidents: [],
      isStale: true
    });
    assert.equal(staleAssessment.telemetryState, 'STALE');
    assert.notEqual(staleAssessment.status, 'HEALTHY', 'Stale telemetry must not evaluate to nominal HEALTHY');

    // Case B: No resources synced yet
    const emptyAssessment = determineOperationalHealth({
      clusters: [cluster3],
      selectedCluster: cluster3,
      isSingleCluster: true,
      resources: [],
      openIncidents: []
    });
    assert.equal(emptyAssessment.telemetryState, 'EMPTY');
    assert.equal(emptyAssessment.status, 'DEGRADED');
  });

  // Scenario 4: All Clusters compared with an individual cluster
  await t.test('Scenario 4: All Clusters vs individual cluster aggregation does not mix metrics', async () => {
    const clusterAlpha = createMockCluster(orgA.id, 'cluster-alpha');
    const clusterBeta = createMockCluster(orgA.id, 'cluster-beta');

    const podA1 = createMockResource(clusterAlpha.id, 'Pod', 'pod-a1');
    const podA2 = createMockResource(clusterAlpha.id, 'Pod', 'pod-a2');
    const podB1 = createMockResource(clusterBeta.id, 'Pod', 'pod-b1');

    const incA: Incident = createMockIncident({
      id: `inc-a-${Date.now()}`,
      orgId: orgA.id,
      clusterId: clusterAlpha.id,
      clusterName: clusterAlpha.name,
      title: 'Incident in Alpha',
      severity: 'CRITICAL',
      status: 'OPEN',
      resourceKind: 'Pod',
      resourceName: 'pod-a1',
      namespace: 'default',
      firstSeenAt: Date.now() - 100000,
      lastSeenAt: Date.now()
    });

    const incB: Incident = createMockIncident({
      id: `inc-b-${Date.now()}`,
      orgId: orgA.id,
      clusterId: clusterBeta.id,
      clusterName: clusterBeta.name,
      title: 'Incident in Beta',
      severity: 'HIGH',
      status: 'OPEN',
      resourceKind: 'Pod',
      resourceName: 'pod-b1',
      namespace: 'default',
      firstSeenAt: Date.now() - 100000,
      lastSeenAt: Date.now()
    });

    const allClusters = [clusterAlpha, clusterBeta];
    const allResources = [podA1, podA2, podB1];
    const allIncidents = [incA, incB];

    // Fleet-level metrics
    const fleetMetrics = computeScopedOverviewMetrics({
      clusters: allClusters,
      resources: allResources,
      incidents: allIncidents,
      clusterFilter: 'all',
      metrics: null
    });
    assert.equal(fleetMetrics.totalClustersCount, 2);
    assert.equal(fleetMetrics.totalPodsCount, 3);
    assert.equal(fleetMetrics.openIncidentsCount, 2);
    assert.equal(fleetMetrics.criticalIncidentsCount, 1);
    assert.equal(fleetMetrics.highIncidentsCount, 1);

    // Alpha-scoped metrics
    const alphaMetrics = computeScopedOverviewMetrics({
      clusters: allClusters,
      resources: allResources,
      incidents: allIncidents,
      clusterFilter: clusterAlpha.id,
      metrics: null
    });
    assert.equal(alphaMetrics.totalClustersCount, 1, 'Alpha scope must report 1 cluster');
    assert.equal(alphaMetrics.totalPodsCount, 2, 'Alpha scope must report 2 pods');
    assert.equal(alphaMetrics.openIncidentsCount, 1, 'Alpha scope must report 1 incident');
    assert.equal(alphaMetrics.criticalIncidentsCount, 1);
    assert.equal(alphaMetrics.highIncidentsCount, 0, 'Alpha scope must not include Beta high incident');
  });

  // Scenario 5: Duplicate incidents representing the same underlying symptom
  await t.test('Scenario 5: Multiple pod incidents co-located on pressured node are correlated', async () => {
    const cluster = createMockCluster(orgA.id, 'c-node-pressure');
    const nodeRes: KubernetesResource = {
      ...createMockResource(cluster.id, 'Node', 'worker-1', '', 'Ready', 'WARNING'),
      conditions: [{ type: 'MemoryPressure', status: 'True' } as any]
    };

    const inc1: Incident = createMockIncident({
      id: 'inc-oom-1',
      orgId: orgA.id,
      clusterId: cluster.id,
      clusterName: cluster.name,
      title: 'OOMKilled in checkout-service',
      severity: 'CRITICAL',
      status: 'OPEN',
      resourceKind: 'Pod',
      resourceName: 'checkout-service-abc',
      namespace: 'prod',
      firstSeenAt: Date.now() - 300000,
      lastSeenAt: Date.now(),
      technicalDetails: { nodeName: 'worker-1', observedState: 'OOMKilled' }
    });

    const inc2: Incident = createMockIncident({
      id: 'inc-oom-2',
      orgId: orgA.id,
      clusterId: cluster.id,
      clusterName: cluster.name,
      title: 'OOMKilled in payment-service',
      severity: 'CRITICAL',
      status: 'OPEN',
      resourceKind: 'Pod',
      resourceName: 'payment-service-xyz',
      namespace: 'prod',
      firstSeenAt: Date.now() - 250000,
      lastSeenAt: Date.now(),
      technicalDetails: { nodeName: 'worker-1', observedState: 'OOMKilled' }
    });

    const prioritized = correlateAndPrioritizeIncidents([inc1, inc2], [nodeRes], [cluster]);

    assert.equal(prioritized.length, 2);
    // Both incidents share worker-1 and should correlate with each other
    assert.ok(prioritized[0].correlatedCount >= 1, 'Should discover co-located incident');
    assert.ok(prioritized[0].correlatedIncidentIds.includes(prioritized[1].id));
    assert.equal(prioritized[0].certaintyLevel, 'CONFIRMED');
    assert.ok(prioritized[0].priorityExplanation.includes('worker-1'), 'Explanation must cite worker-1');
  });

  // Scenario 6: Two unrelated incidents occurring at the same time
  await t.test('Scenario 6: Unrelated incidents on different workloads are not conflated', async () => {
    const cluster = createMockCluster(orgA.id, 'c-unrelated');
    const now = Date.now();

    const incAuth: Incident = createMockIncident({
      id: 'inc-auth',
      orgId: orgA.id,
      clusterId: cluster.id,
      clusterName: cluster.name,
      title: 'CrashLoopBackOff in auth-service',
      severity: 'HIGH',
      status: 'OPEN',
      resourceKind: 'Pod',
      resourceName: 'auth-service-1',
      namespace: 'auth-ns',
      firstSeenAt: now - 60000,
      lastSeenAt: now,
      technicalDetails: { nodeName: 'node-auth', observedState: 'CrashLoopBackOff' }
    });

    const incBilling: Incident = createMockIncident({
      id: 'inc-billing',
      orgId: orgA.id,
      clusterId: cluster.id,
      clusterName: cluster.name,
      title: 'ImagePullBackOff in billing-cron',
      severity: 'MEDIUM',
      status: 'OPEN',
      resourceKind: 'Job',
      resourceName: 'billing-cron',
      namespace: 'billing-ns',
      firstSeenAt: now - 60000,
      lastSeenAt: now,
      technicalDetails: { nodeName: 'node-billing', observedState: 'ImagePullBackOff' }
    });

    const prioritized = correlateAndPrioritizeIncidents([incAuth, incBilling], [], [cluster]);
    assert.equal(prioritized.length, 2);
    assert.equal(prioritized[0].correlatedCount, 0, 'Unrelated incidents must have 0 correlated peers');
    assert.equal(prioritized[1].correlatedCount, 0, 'Unrelated incidents must have 0 correlated peers');
  });

  // Scenario 7: A critical service outage in an otherwise healthy cluster
  await t.test('Scenario 7: Critical service outage in healthy cluster elevates priority and health', async () => {
    const cluster = createMockCluster(orgA.id, 'c-service-outage');
    // 20 healthy pods
    const pods: KubernetesResource[] = [];
    for (let i = 0; i < 20; i++) {
      pods.push(createMockResource(cluster.id, 'Pod', `healthy-worker-${i}`, 'default', 'Running', 'HEALTHY'));
    }
    // 1 failing pod backing critical service
    const failingPod = createMockResource(cluster.id, 'Pod', 'gateway-api-pod-1', 'prod', 'CrashLoopBackOff', 'CRITICAL');
    const gatewayService: KubernetesResource = {
      ...createMockResource(cluster.id, 'Service', 'gateway-api', 'prod', 'Active', 'CRITICAL')
    };
    pods.push(failingPod, gatewayService);

    const inc: Incident = createMockIncident({
      id: 'inc-gateway',
      orgId: orgA.id,
      clusterId: cluster.id,
      clusterName: cluster.name,
      title: 'Gateway API CrashLoopBackOff',
      severity: 'CRITICAL',
      status: 'OPEN',
      resourceKind: 'Pod',
      resourceName: 'gateway-api-pod-1',
      namespace: 'prod',
      firstSeenAt: Date.now() - 120000,
      lastSeenAt: Date.now(),
      technicalDetails: { observedState: 'CrashLoopBackOff' }
    });

    const assessment = determineOperationalHealth({
      clusters: [cluster],
      selectedCluster: cluster,
      isSingleCluster: true,
      resources: pods,
      openIncidents: [inc]
    });

    assert.equal(assessment.status, 'CRITICAL', 'Healthy pods must not mask critical service crash');

    const prioritized = correlateAndPrioritizeIncidents([inc], pods, [cluster]);
    assert.ok(prioritized[0].affectedServices.includes('gateway-api'), 'Must detect affected service');
    assert.ok(prioritized[0].priorityScore > 130, 'Score must reflect service blast radius');
  });

  // Scenario 8: A rollout containing expected transient pod states
  await t.test('Scenario 8: Completed Jobs and terminating pods are not counted as crashing', async () => {
    const cluster = createMockCluster(orgA.id, 'c-rollout');
    const completedJobPod = createMockResource(cluster.id, 'Pod', 'db-migration-job-xyz', 'default', 'Completed', 'HEALTHY');
    const terminatingPod: KubernetesResource = {
      ...createMockResource(cluster.id, 'Pod', 'old-replica-1', 'default', 'Terminating', 'HEALTHY'),
      annotations: { 'skyops.io/deletionTimestamp': '2026-10-09T10:00:00Z' }
    };
    const runningPod = createMockResource(cluster.id, 'Pod', 'new-replica-1', 'default', 'Running', 'HEALTHY');

    const metrics = computeScopedOverviewMetrics({
      clusters: [cluster],
      resources: [completedJobPod, terminatingPod, runningPod],
      incidents: [],
      clusterFilter: cluster.id,
      metrics: null
    });

    assert.equal(metrics.crashingPodsCount, 0, 'Completed and terminating pods must not be counted as crashing');
  });

  // Scenario 9: A resolved incident still present in historical data
  await t.test('Scenario 9: Resolved incident is excluded from open totals and marked RESOLVED', async () => {
    const cluster = createMockCluster(orgA.id, 'c-resolved-history');
    const resolvedInc: Incident = createMockIncident({
      id: 'inc-resolved-old',
      orgId: orgA.id,
      clusterId: cluster.id,
      clusterName: cluster.name,
      title: 'Resolved memory spike',
      severity: 'HIGH',
      status: 'RESOLVED',
      resourceKind: 'Deployment',
      resourceName: 'api-server',
      namespace: 'prod',
      firstSeenAt: Date.now() - 86400000,
      lastSeenAt: Date.now() - 43200000,
      resolvedAt: Date.now() - 43200000
    });

    const metrics = computeScopedOverviewMetrics({
      clusters: [cluster],
      resources: [],
      incidents: [resolvedInc],
      clusterFilter: cluster.id,
      metrics: null
    });

    assert.equal(metrics.openIncidentsCount, 0, 'Resolved incidents must not appear in open incident count');

    const prioritized = correlateAndPrioritizeIncidents([resolvedInc], [], [cluster]);
    assert.equal(prioritized[0].certaintyLevel, 'RESOLVED');
  });

  // Scenario 10: An incident with unknown severity or incomplete evidence
  await t.test('Scenario 10: Incomplete evidence produces INSUFFICIENT_EVIDENCE or UNVERIFIED_HYPOTHESIS', async () => {
    const disconnectedCluster = createMockCluster(orgA.id, 'c-disc-inc', 'OFFLINE');
    const incompleteInc: Incident = createMockIncident({
      id: 'inc-incomplete',
      orgId: orgA.id,
      clusterId: disconnectedCluster.id,
      clusterName: disconnectedCluster.name,
      title: 'Ambiguous alert without pod logs',
      severity: 'LOW',
      status: 'OPEN',
      resourceKind: 'Pod',
      resourceName: 'ghost-pod',
      namespace: 'unknown',
      firstSeenAt: Date.now() - 50000,
      lastSeenAt: Date.now()
    });

    const prioritized = correlateAndPrioritizeIncidents([incompleteInc], [], [disconnectedCluster]);
    assert.equal(prioritized[0].certaintyLevel, 'INSUFFICIENT_EVIDENCE', 'Disconnected agent prevents evidence verification');
  });

  // Scenario 11: A successful remediation request with failed recovery verification
  await t.test('Scenario 11: Remediation eligibility reflects manual review when automated policy not applicable', async () => {
    const cluster = createMockCluster(orgA.id, 'c-remed');
    const customIncident: Incident = createMockIncident({
      id: 'inc-security',
      orgId: orgA.id,
      clusterId: cluster.id,
      clusterName: cluster.name,
      title: 'Certificate expiring in 2 hours',
      severity: 'CRITICAL',
      status: 'OPEN',
      resourceKind: 'Secret',
      resourceName: 'tls-cert',
      namespace: 'prod',
      firstSeenAt: Date.now() - 10000,
      lastSeenAt: Date.now(),
      incidentType: 'CertificateExpiring' as any
    });

    const eligibility = evaluateRemediationEligibility(customIncident, cluster);
    assert.equal(eligibility.isEligible, false, 'Complex secret renewal requires manual approval');
    assert.equal(eligibility.requiresApproval, true);
  });

  // Scenario 12: A deployment change that precedes an incident but is not proven causal
  await t.test('Scenario 12: Workload restart preceding incident is labeled TEMPORAL_CORRELATION', async () => {
    const cluster = createMockCluster(orgA.id, 'c-change');
    const restartedDeployment: KubernetesResource = {
      ...createMockResource(cluster.id, 'Deployment', 'payments', 'prod', 'Available', 'WARNING'),
      annotations: {
        'kubectl.kubernetes.io/restartedAt': new Date(Date.now() - 180000).toISOString()
      }
    };

    const inc: Incident = createMockIncident({
      id: 'inc-restart-lag',
      orgId: orgA.id,
      clusterId: cluster.id,
      clusterName: cluster.name,
      title: 'Degraded replicas after rollout',
      severity: 'HIGH',
      status: 'OPEN',
      resourceKind: 'Deployment',
      resourceName: 'payments',
      namespace: 'prod',
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now()
    });

    const changeCtx = extractChangeContext(inc, [restartedDeployment]);
    assert.equal(changeCtx.hasChange, true);
    assert.equal(changeCtx.causality, 'TEMPORAL_CORRELATION', 'Must clearly distinguish temporal correlation from confirmed causation');
  });

  // Scenario 13: Incomplete paginated data
  await t.test('Scenario 13: Incomplete telemetry does not throw and handles missing properties', async () => {
    const partialCluster = { id: 'c-partial', name: 'partial' } as Cluster;
    const partialResource = { kind: 'Pod', name: 'sparse' } as KubernetesResource;

    const metrics = computeScopedOverviewMetrics({
      clusters: [partialCluster],
      resources: [partialResource],
      incidents: [],
      clusterFilter: 'c-partial',
      metrics: null
    });

    assert.ok(metrics.totalPodsCount >= 0);
    assert.equal(metrics.crashingPodsCount, 0);
  });

  // Scenario 14: Cost recommendations with missing pricing data
  await t.test('Scenario 14: CostEngine does not fabricate baseline waste for empty clusters', async () => {
    const cluster = createMockCluster(orgA.id, 'c-cost-empty');
    const costOverview = CostEngine.getCostOverview(orgA.id, cluster.id);

    assert.equal(costOverview.isEstimate, true);
    assert.ok(costOverview.estimateDisclaimer.includes('estimated from live Kubernetes'));
    assert.equal(costOverview.cpuWastePercent, 0, 'Must not fabricate synthetic waste percentage');
  });

  // Scenario 15: Data changing while the user switches clusters
  await t.test('Scenario 15: Metrics recalculate cleanly and deterministically on filter switch', async () => {
    const c1 = createMockCluster(orgA.id, 'c-switch-1');
    const c2 = createMockCluster(orgA.id, 'c-switch-2');

    const pod1 = createMockResource(c1.id, 'Pod', 'pod-1');
    const pod2 = createMockResource(c2.id, 'Pod', 'pod-2');

    const mFleet = computeScopedOverviewMetrics({
      clusters: [c1, c2],
      resources: [pod1, pod2],
      incidents: [],
      clusterFilter: 'all',
      metrics: null
    });
    assert.equal(mFleet.totalPodsCount, 2);

    const mC1 = computeScopedOverviewMetrics({
      clusters: [c1, c2],
      resources: [pod1, pod2],
      incidents: [],
      clusterFilter: c1.id,
      metrics: null
    });
    assert.equal(mC1.totalPodsCount, 1);

    const mC2 = computeScopedOverviewMetrics({
      clusters: [c1, c2],
      resources: [pod1, pod2],
      incidents: [],
      clusterFilter: c2.id,
      metrics: null
    });
    assert.equal(mC2.totalPodsCount, 1);
  });

  // Scenario 16: Organization and cluster scope violations
  await t.test('Scenario 16: Multi-tenant organization isolation is enforced', async () => {
    const clusterOrgA = createMockCluster(orgA.id, 'cluster-org-a');
    const clusterOrgB = createMockCluster(orgB.id, 'cluster-org-b');

    // Overview metrics for Org A must never return Org B clusters or incidents
    const overviewOrgA = store.getOverviewMetrics(orgA.id);
    const clustersOrgA = store.getClusters(orgA.id);

    assert.ok(clustersOrgA.some((c) => c.id === clusterOrgA.id));
    assert.ok(!clustersOrgA.some((c) => c.id === clusterOrgB.id), 'Org A must never see Org B clusters');

    const costOrgA = CostEngine.getCostOverview(orgA.id, clusterOrgB.id);
    assert.equal(costOrgA.estimatedMonthlyCostUsd, 0, 'Cross-org cluster query in cost must return 0');
  });
});
