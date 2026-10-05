import test from 'node:test';
import assert from 'node:assert/strict';
import { DataStore } from './store';
import { InMemoryStore } from './persistence/InMemoryStore';
import { auditService } from './audit';
import { KubernetesResource, StructuredRemediation } from '../src/types/index';

test('SKYOPS — PHASE 2: WORKLOAD REMEDIATION ENGINE SUITE', async (t) => {
  const store = new DataStore(new InMemoryStore());
  const userId = 'usr-workload-lead';
  store.upsertUser({
    id: userId,
    email: 'lead@workload-corp.io',
    name: 'SRE Workload Lead'
  });
  const org = store.createOrganization('Workload Reliability Corp', userId);

  const { cluster } = store.createCluster(org.id, 'prod-k8s-us-central', 'Production cluster', {
    provider: 'gcp',
    region: 'us-central1',
    environment: 'production'
  });
  store.registerAgent(cluster.id, '1.4.0', 'v1.29.2');
  store.recordAgentHeartbeat(cluster.id, '1.4.0', 'v1.29.2', 3, 10);

  // Configure cluster policy for Phase 2: low and medium risk allowed, approval required
  store.updateRemediationPolicy(org.id, {
    clusterId: cluster.id,
    remediationMode: 'APPROVAL_REQUIRED',
    allowedActionTypes: ['RestartPod', 'RolloutRestart', 'RollbackDeployment', 'ScaleDeployment', 'ReplacePodImage'],
    maxRiskLevel: 'HIGH',
    minConfidenceThreshold: 0.8
  });

  // --------------------------------------------------------------------------
  // STEP 1: VERIFY PHASE 1 (RestartPod pipeline against connected cluster)
  // --------------------------------------------------------------------------
  await t.test('1. Phase 1 Verification: RESTART_POD canonical flow on Pod failure', () => {
    const t0 = Date.now() - 30000;
    const failingPodName = 'api-pod-crash';

    const failingPod: KubernetesResource = {
      id: `pod-${cluster.id}-${failingPodName}`,
      clusterId: cluster.id,
      name: failingPodName,
      namespace: 'default',
      kind: 'Pod',
      status: 'Waiting',
      health: 'CRITICAL',
      createdAt: t0 - 60000,
      updatedAt: t0,
      specSummary: { containers: [{ name: 'api', image: 'api:v1.0' }] },
      statusSummary: { observedState: 'Waiting' },
      containers: [
        {
          name: 'api',
          image: 'api:v1.0',
          restartCount: 8,
          ready: false,
          state: 'waiting',
          waitingReason: 'CrashLoopBackOff',
          waitingMessage: 'Process exited with code 1',
          exitCode: 1
        }
      ]
    };

    store.syncClusterResources(cluster.id, [failingPod]);

    const incidents = store.getIncidents(org.id, { clusterId: cluster.id });
    const incident = incidents.find((i) => i.resourceName === failingPodName);
    assert.ok(incident, 'Incident must be created for failing Pod');
    assert.equal(incident?.status, 'OPEN');

    // Trigger manual heal / approval for RestartPod
    const result = store.triggerManualHeal(incident.id, org.id, { id: userId, name: 'SRE Lead' }, {
      actionType: 'RestartPod',
      reason: 'Restarting crashed pod container'
    });

    assert.ok(result.action, 'RemediationAction must be generated');
    assert.equal(result.action.actionType, 'RestartPod');
    assert.equal(result.action.status, 'PENDING');
    assert.equal(result.remediation.status, 'DISPATCHED');

    // Agent claims action
    const actions = store.claimPendingRemediationActions(cluster.id);
    const claimedAction = actions.find((a) => a.id === result.action.id);
    assert.ok(claimedAction, 'Agent must receive dispatched action');

    // Agent executes mutation and reports success
    const completedAt = Date.now();
    store.recordRemediationResult(cluster.id, claimedAction.id, {
      success: true,
      message: 'Kubernetes API pod deletion mutation succeeded'
    });

    // Stale telemetry does not resolve
    store.syncClusterResources(cluster.id, [{ ...failingPod, updatedAt: completedAt - 50 }]);
    assert.equal(store.getIncident(incident.id, org.id)?.status, 'IN_PROGRESS');

    // Replacement Pod appears with fresh telemetry
    const freshReplacementPod: KubernetesResource = {
      id: `pod-${cluster.id}-api-pod-crash-replacement`,
      clusterId: cluster.id,
      name: 'api-pod-crash',
      namespace: 'default',
      kind: 'Pod',
      status: 'Running',
      health: 'HEALTHY',
      createdAt: completedAt + 500,
      updatedAt: completedAt + 1500,
      specSummary: { containers: [{ name: 'api', image: 'api:v1.0' }] },
      statusSummary: {
        observedState: 'Running',
        containerStates: [{ name: 'api', state: 'running', ready: true, image: 'api:v1.0' }]
      }
    };

    store.syncClusterResources(cluster.id, [freshReplacementPod]);

    // Verification succeeds and incident resolves
    const resolvedIncident = store.getIncident(incident.id, org.id);
    assert.equal(resolvedIncident?.status, 'RESOLVED');
    assert.equal(resolvedIncident?.resolutionSource, 'AUTOMATIC_VERIFIED');

    const rem = store.getRemediation(incident.id, org.id);
    assert.equal(rem?.status, 'VERIFIED_RESOLVED');

    // Audit record exists
    const audits = auditService.query({ orgId: org.id });
    const auditRecord = audits.items.find((e) => e.details?.incidentId === incident.id && e.result === 'SUCCESS');
    assert.ok(auditRecord, 'Audit record must exist for verified resolution');
  });

  // --------------------------------------------------------------------------
  // STEP 2: WORKLOAD ACTION: ROLLOUT_RESTART_WORKLOAD
  // --------------------------------------------------------------------------
  await t.test('2. Workload Action: ROLLOUT_RESTART_WORKLOAD executes, verifies, and resolves', () => {
    const t0 = Date.now() - 40000;
    const depName = 'orders-service';

    const degradedDeployment: KubernetesResource = {
      id: `dep-${cluster.id}-${depName}`,
      clusterId: cluster.id,
      name: depName,
      namespace: 'production',
      kind: 'Deployment',
      status: 'Degraded',
      health: 'CRITICAL',
      createdAt: t0 - 120000,
      updatedAt: t0,
      specReplicas: 3,
      readyReplicas: 1,
      availableReplicas: 1,
      generation: 4,
      specSummary: { replicas: 3 },
      statusSummary: { replicas: 3, readyReplicas: 1, availableReplicas: 1, updatedReplicas: 1 },
      annotations: { 'deployment.kubernetes.io/revision': '4' }
    };

    store.syncClusterResources(cluster.id, [degradedDeployment]);

    const incidents = store.getIncidents(org.id, { clusterId: cluster.id });
    const incident = incidents.find((i) => i.resourceName === depName);
    assert.ok(incident, 'Incident must exist for degraded deployment');

    // Verify available actions includes RolloutRestart
    const available = store.getAvailableRemediationActions(incident.id, org.id);
    const rolloutAction = available.find((a) => a.type === 'RolloutRestart');
    assert.ok(rolloutAction, 'RolloutRestart must be an available action for deployment');
    assert.equal(rolloutAction?.allowed, true);
    assert.equal(rolloutAction?.risk, 'LOW');

    // Execute RolloutRestart
    const result = store.triggerManualHeal(incident.id, org.id, { id: userId, name: 'SRE Lead' }, {
      actionType: 'RolloutRestart',
      reason: 'Rolling restart to clear memory leak across replica pods'
    });

    assert.equal(result.action.actionType, 'RolloutRestart');
    assert.equal(result.action.target.kind, 'Deployment');
    assert.equal(result.action.target.name, depName);
    assert.equal(result.action.status, 'PENDING');
    assert.equal(result.remediation.status, 'DISPATCHED');

    // Agent claims action
    const actions = store.claimPendingRemediationActions(cluster.id);
    const claimed = actions.find((a) => a.id === result.action.id);
    assert.ok(claimed, 'Agent receives RolloutRestart action');

    const completedAt = Date.now();
    store.recordRemediationResult(cluster.id, claimed.id, {
      success: true,
      message: 'Patched deployment spec.template.metadata.annotations.kubectl.kubernetes.io/restartedAt'
    });

    // Stale telemetry cannot resolve
    store.syncClusterResources(cluster.id, [{ ...degradedDeployment, updatedAt: completedAt - 10 }]);
    assert.equal(store.getIncident(incident.id, org.id)?.status, 'IN_PROGRESS');

    // Fresh telemetry arrives with rollout complete: 3/3 ready & available, 0 unavailable, observedGeneration current
    const healthyDeployment: KubernetesResource = {
      ...degradedDeployment,
      status: 'Running',
      health: 'HEALTHY',
      updatedAt: completedAt + 2000,
      specReplicas: 3,
      readyReplicas: 3,
      availableReplicas: 3,
      generation: 5,
      specSummary: { replicas: 3 },
      statusSummary: {
        replicas: 3,
        readyReplicas: 3,
        availableReplicas: 3,
        updatedReplicas: 3,
        unavailableReplicas: 0,
        observedGeneration: 5
      },
      annotations: {
        'deployment.kubernetes.io/revision': '5',
        'kubectl.kubernetes.io/restartedAt': new Date(completedAt).toISOString()
      }
    };

    store.syncClusterResources(cluster.id, [healthyDeployment]);

    // Incident resolves
    const resolvedIncident = store.getIncident(incident.id, org.id);
    assert.equal(resolvedIncident?.status, 'RESOLVED');
    assert.equal(resolvedIncident?.resolutionSource, 'AUTOMATIC_VERIFIED');

    const rem = store.getRemediation(incident.id, org.id);
    assert.equal(rem?.status, 'VERIFIED_RESOLVED');
  });

  // --------------------------------------------------------------------------
  // STEP 3: WORKLOAD ACTION: ROLLBACK_DEPLOYMENT
  // --------------------------------------------------------------------------
  await t.test('3. Workload Action: ROLLBACK_DEPLOYMENT safety preconditions, execution, and verification', () => {
    const t0 = Date.now() - 30000;
    const depName = 'checkout-api';

    // A. Negative check: Initial revision 1 cannot be rolled back
    const initialRevDeployment: KubernetesResource = {
      id: `dep-${cluster.id}-init-rev`,
      clusterId: cluster.id,
      name: 'initial-app',
      namespace: 'production',
      kind: 'Deployment',
      status: 'Degraded',
      health: 'CRITICAL',
      createdAt: t0 - 60000,
      updatedAt: t0,
      specReplicas: 2,
      readyReplicas: 0,
      availableReplicas: 0,
      annotations: { 'deployment.kubernetes.io/revision': '1' }
    };
    store.syncClusterResources(cluster.id, [initialRevDeployment]);
    const initIncidents = store.getIncidents(org.id, { clusterId: cluster.id });
    const initIncident = initIncidents.find((i) => i.resourceName === 'initial-app')!;
    assert.ok(initIncident);

    const initAvailable = store.getAvailableRemediationActions(initIncident.id, org.id);
    const initRollback = initAvailable.find((a) => a.type === 'RollbackDeployment');
    assert.ok(initRollback);
    assert.equal(initRollback.allowed, false, 'Rollback must be disallowed when revision is 1');
    assert.match(initRollback.reason, /NO_ROLLBACK_AVAILABLE/);

    assert.throws(() => {
      store.triggerManualHeal(initIncident.id, org.id, { id: userId, name: 'SRE Lead' }, {
        actionType: 'RollbackDeployment'
      });
    }, /NO_ROLLBACK_AVAILABLE/);

    // B. Positive check: Revision 3 degraded, rolls back to revision 2
    const rev3Deployment: KubernetesResource = {
      id: `dep-${cluster.id}-${depName}`,
      clusterId: cluster.id,
      name: depName,
      namespace: 'production',
      kind: 'Deployment',
      status: 'Degraded',
      health: 'CRITICAL',
      createdAt: t0 - 180000,
      updatedAt: t0,
      specReplicas: 2,
      readyReplicas: 0,
      availableReplicas: 0,
      generation: 3,
      annotations: { 'deployment.kubernetes.io/revision': '3' }
    };

    store.syncClusterResources(cluster.id, [rev3Deployment]);
    const incidents = store.getIncidents(org.id, { clusterId: cluster.id });
    const incident = incidents.find((i) => i.resourceName === depName)!;
    assert.ok(incident);

    const available = store.getAvailableRemediationActions(incident.id, org.id);
    const rollbackAction = available.find((a) => a.type === 'RollbackDeployment');
    assert.ok(rollbackAction);
    assert.equal(rollbackAction.allowed, true);
    assert.equal(rollbackAction.risk, 'MEDIUM');
    assert.equal(rollbackAction.parameters?.targetRevision, '2');

    // Trigger Rollback
    const result = store.triggerManualHeal(incident.id, org.id, { id: userId, name: 'SRE Lead' }, {
      actionType: 'RollbackDeployment',
      targetRevision: '2'
    });

    assert.equal(result.action.actionType, 'RollbackDeployment');
    assert.equal(result.action.target.name, depName);
    assert.equal(result.action.proposedValue, '2');

    // Agent executes
    const actions = store.claimPendingRemediationActions(cluster.id);
    const claimed = actions.find((a) => a.id === result.action.id)!;
    assert.ok(claimed);

    const completedAt = Date.now();
    store.recordRemediationResult(cluster.id, claimed.id, {
      success: true,
      message: 'Patched deployment to restore previous replica template revision 2'
    });

    // Fresh telemetry confirms revision 2 is active, 2/2 ready & healthy
    const rolledBackHealthy: KubernetesResource = {
      ...rev3Deployment,
      status: 'Running',
      health: 'HEALTHY',
      updatedAt: completedAt + 2500,
      specReplicas: 2,
      readyReplicas: 2,
      availableReplicas: 2,
      generation: 4,
      specSummary: { replicas: 2 },
      statusSummary: {
        replicas: 2,
        readyReplicas: 2,
        availableReplicas: 2,
        updatedReplicas: 2,
        unavailableReplicas: 0,
        observedGeneration: 4
      },
      annotations: { 'deployment.kubernetes.io/revision': '4' } // K8s bumps revision on rollback
    };

    store.syncClusterResources(cluster.id, [rolledBackHealthy]);

    const resolved = store.getIncident(incident.id, org.id);
    assert.equal(resolved?.status, 'RESOLVED');
    assert.equal(resolved?.resolutionSource, 'AUTOMATIC_VERIFIED');
  });

  // --------------------------------------------------------------------------
  // STEP 4: WORKLOAD ACTION: SCALE_DEPLOYMENT
  // --------------------------------------------------------------------------
  await t.test('4. Workload Action: SCALE_DEPLOYMENT safety limits, capacity check, and verification', () => {
    const t0 = Date.now() - 25000;
    const depName = 'payment-gateway';

    const underprovisionedDeployment: KubernetesResource = {
      id: `dep-${cluster.id}-${depName}`,
      clusterId: cluster.id,
      name: depName,
      namespace: 'production',
      kind: 'Deployment',
      status: 'Degraded',
      health: 'CRITICAL',
      createdAt: t0 - 60000,
      updatedAt: t0,
      specReplicas: 3,
      readyReplicas: 1,
      availableReplicas: 1,
      specSummary: { replicas: 3 },
      statusSummary: { replicas: 3, readyReplicas: 1, availableReplicas: 1, updatedReplicas: 1 }
    };

    store.syncClusterResources(cluster.id, [underprovisionedDeployment]);
    const incidents = store.getIncidents(org.id, { clusterId: cluster.id });
    const incident = incidents.find((i) => i.resourceName === depName)!;
    assert.ok(incident);

    // Negative check: scale-to-zero is prohibited
    assert.throws(() => {
      store.triggerManualHeal(incident.id, org.id, { id: userId, name: 'SRE Lead' }, {
        actionType: 'ScaleDeployment',
        targetReplicas: 0
      });
    }, /between 1 and 20/);

    // Negative check: replicas > 20 is prohibited
    assert.throws(() => {
      store.triggerManualHeal(incident.id, org.id, { id: userId, name: 'SRE Lead' }, {
        actionType: 'ScaleDeployment',
        targetReplicas: 25
      });
    }, /between 1 and 20/);

    // Positive check: Scale from 2 to 4 replicas
    const result = store.triggerManualHeal(incident.id, org.id, { id: userId, name: 'SRE Lead' }, {
      actionType: 'ScaleDeployment',
      targetReplicas: 4
    });

    assert.equal(result.action.actionType, 'ScaleDeployment');
    assert.equal(result.action.target.name, depName);
    assert.equal(result.action.proposedValue, '4');

    const actions = store.claimPendingRemediationActions(cluster.id);
    const claimed = actions.find((a) => a.id === result.action.id)!;
    assert.ok(claimed);

    const completedAt = Date.now();
    store.recordRemediationResult(cluster.id, claimed.id, {
      success: true,
      message: 'Patched deployment spec.replicas to 4'
    });

    // Fresh telemetry confirms 4/4 ready & available
    const scaledHealthy: KubernetesResource = {
      ...underprovisionedDeployment,
      status: 'Running',
      health: 'HEALTHY',
      updatedAt: completedAt + 3000,
      specReplicas: 4,
      readyReplicas: 4,
      availableReplicas: 4,
      specSummary: { replicas: 4 },
      statusSummary: {
        replicas: 4,
        readyReplicas: 4,
        availableReplicas: 4,
        updatedReplicas: 4,
        unavailableReplicas: 0
      }
    };

    store.syncClusterResources(cluster.id, [scaledHealthy]);

    const resolved = store.getIncident(incident.id, org.id);
    assert.equal(resolved?.status, 'RESOLVED');
    assert.equal(resolved?.resolutionSource, 'AUTOMATIC_VERIFIED');

    const rem = store.getRemediation(incident.id, org.id);
    assert.equal(rem?.status, 'VERIFIED_RESOLVED');
  });
});
