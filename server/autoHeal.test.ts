import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DataStore } from './store';
import { Incident, KubernetesResource } from '../src/types/index';

describe('SkyOps Autonomous Auto-Healing Suite', () => {
  it('auto-heals a single failing pod incident and restores healthy telemetry state', () => {
    const store = new DataStore();
    const org = store.createOrganization('AutoHeal Org', 'usr-owner-1');
    const { cluster } = store.createCluster(org.id, 'prod-cluster');

    // Seed failing pod
    const failingPod: KubernetesResource = {
      id: 'pod-crash-1',
      clusterId: cluster.id,
      health: 'CRITICAL',
      uid: 'pod-crash-1',
      name: 'auth-service-789',
      namespace: 'production',
      kind: 'Pod',
      status: 'CrashLoopBackOff',
      containers: [
        {
          name: 'auth-container',
          image: 'registry.corp.internal/auth:v1.2.0',
          ready: false,
          state: 'waiting',
          waitingReason: 'CrashLoopBackOff',
          restartCount: 14
        }
      ],
      createdAt: Date.now() - 60000,
      updatedAt: Date.now() - 10000
    };
    (store as any).resources.set(cluster.id, [failingPod]);

    // Create active incident
    const incident: Incident = {
      id: 'INC-AUTO-01',
      fingerprint: 'fp-crash-1',
      orgId: org.id,
      clusterId: cluster.id,
      clusterName: cluster.name,
      incidentType: 'CrashLoopBackOff',
      severity: 'CRITICAL',
      status: 'OPEN',
      title: 'Pod auth-service-789 CrashLoopBackOff',
      summary: 'Pod is crashing continuously',
      resourceKind: 'Pod',
      resourceName: failingPod.name,
      namespace: failingPod.namespace,
      occurrenceCount: 1,
      firstSeenAt: Date.now() - 30000,
      lastSeenAt: Date.now() - 30000,
      technicalDetails: { reason: 'CrashLoopBackOff' },
      createdAt: Date.now() - 30000,
      updatedAt: Date.now() - 30000
    };
    (store as any).incidents.set(incident.id, incident);

    // Execute Auto-Heal
    const result = store.executeAutoHeal(incident.id, org.id, {
      id: 'usr-admin',
      name: 'Admin Lead',
      email: 'admin@skyops.internal'
    });

    assert.equal(result.success, true);
    assert.equal(result.incident.status, 'RESOLVED');
    assert.equal(result.incident.remediationStatus, 'VERIFIED');
    assert.equal(result.remediation.status, 'VERIFIED_RESOLVED');
    assert.equal(result.action?.status, 'SUCCEEDED');

    // Telemetry must be verified healthy
    const resources = store.getClusterResources(cluster.id, org.id);
    const healedPod = resources.find((r) => r.name === failingPod.name);
    assert.ok(healedPod);
    assert.equal(healedPod?.status, 'Running');
    assert.equal(healedPod?.containers?.[0].ready, true);
    assert.equal(healedPod?.containers?.[0].state, 'running');
    assert.equal(healedPod?.containers?.[0].waitingReason, undefined);
  });

  it('batch auto-heals all active incidents in a cluster', () => {
    const store = new DataStore();
    const org = store.createOrganization('Batch Org', 'usr-owner-2');
    const { cluster } = store.createCluster(org.id, 'staging-cluster');

    // Seed failing deployment and failing pod
    const failingDep: KubernetesResource = {
      id: 'dep-degraded-1',
      clusterId: cluster.id,
      health: 'WARNING',
      uid: 'dep-degraded-1',
      name: 'billing-api',
      namespace: 'staging',
      kind: 'Deployment',
      status: 'Degraded',
      specSummary: { replicas: 3 },
      statusSummary: { readyReplicas: 0, availableReplicas: 0 },
      createdAt: Date.now() - 50000,
      updatedAt: Date.now() - 5000
    };
    const failingPod: KubernetesResource = {
      id: 'pod-img-1',
      clusterId: cluster.id,
      health: 'CRITICAL',
      uid: 'pod-img-1',
      name: 'worker-job',
      namespace: 'staging',
      kind: 'Pod',
      status: 'ImagePullBackOff',
      containers: [
        {
          name: 'worker',
          image: 'invalid/tag:missing',
          ready: false,
          state: 'waiting',
          waitingReason: 'ImagePullBackOff',
          restartCount: 2
        }
      ],
      createdAt: Date.now() - 40000,
      updatedAt: Date.now() - 5000
    };
    (store as any).resources.set(cluster.id, [failingDep, failingPod]);

    const inc1: Incident = {
      id: 'INC-BAT-01',
      fingerprint: 'fp-dep-1',
      orgId: org.id,
      clusterId: cluster.id,
      clusterName: cluster.name,
      incidentType: 'DeploymentDegraded',
      severity: 'HIGH',
      status: 'OPEN',
      title: 'Deployment Degraded',
      summary: 'Replicas unavailable',
      resourceKind: 'Deployment',
      resourceName: failingDep.name,
      namespace: failingDep.namespace,
      occurrenceCount: 1,
      firstSeenAt: Date.now() - 20000,
      lastSeenAt: Date.now() - 20000,
      technicalDetails: { reason: 'DeploymentDegraded' },
      createdAt: Date.now() - 20000,
      updatedAt: Date.now() - 20000
    };
    const inc2: Incident = {
      id: 'INC-BAT-02',
      fingerprint: 'fp-pod-1',
      orgId: org.id,
      clusterId: cluster.id,
      clusterName: cluster.name,
      incidentType: 'ImagePullBackOff',
      severity: 'HIGH',
      status: 'IN_PROGRESS',
      title: 'ImagePullBackOff',
      summary: 'Failed to pull image',
      resourceKind: 'Pod',
      resourceName: failingPod.name,
      namespace: failingPod.namespace,
      occurrenceCount: 1,
      firstSeenAt: Date.now() - 15000,
      lastSeenAt: Date.now() - 15000,
      technicalDetails: { reason: 'ImagePullBackOff' },
      createdAt: Date.now() - 15000,
      updatedAt: Date.now() - 15000
    };
    (store as any).incidents.set(inc1.id, inc1);
    (store as any).incidents.set(inc2.id, inc2);

    const batchRes = store.autoHealCluster(cluster.id, org.id, {
      id: 'usr-sre',
      name: 'SRE Lead'
    });

    assert.equal(batchRes.success, true);
    assert.equal(batchRes.total, 2);
    assert.equal(batchRes.healed, 2);
    assert.equal(batchRes.failed, 0);

    assert.equal(store.getIncident(inc1.id, org.id)?.status, 'RESOLVED');
    assert.equal(store.getIncident(inc2.id, org.id)?.status, 'RESOLVED');

    // Both resources should be healthy
    const resources = store.getClusterResources(cluster.id, org.id);
    const healedDep = resources.find((r) => r.name === failingDep.name);
    assert.equal(healedDep?.status, 'Available');
    assert.equal(healedDep?.statusSummary?.readyReplicas, 3);
  });
});
