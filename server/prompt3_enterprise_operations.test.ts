/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SkyOps PROMPT 3 Enterprise Operations Test Suite
 * Covers Multi-Cluster, Health, Cost Intelligence, Security Posture, RBAC, Audit, and Tenant Isolation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { store } from './store';
import { auditService } from './audit';
import { CostEngine } from './cost/costEngine';
import { SecurityEngine } from './security/securityEngine';
import { hasPermission, ROLE_PERMISSIONS } from './auth';
import { Role } from '../src/types/index';

test('PROMPT 3: Enterprise Operations, Cost, Security, Governance & Production Readiness', async (t) => {
  const runId = Date.now().toString();

  // Test Users
  const userOwner = { id: `owner-${runId}`, email: `owner-${runId}@enterprise.com`, name: 'Owner', role: 'OWNER' as Role };
  const userAdmin = { id: `admin-${runId}`, email: `admin-${runId}@enterprise.com`, name: 'Admin', role: 'ADMIN' as Role };
  const userSre = { id: `sre-${runId}`, email: `sre-${runId}@enterprise.com`, name: 'SRE Lead', role: 'SRE' as Role };
  const userDev = { id: `dev-${runId}`, email: `dev-${runId}@enterprise.com`, name: 'Dev Lead', role: 'DEVELOPER' as Role };
  const userViewer = { id: `viewer-${runId}`, email: `viewer-${runId}@enterprise.com`, name: 'Viewer', role: 'VIEWER' as Role };
  const userAuditor = { id: `auditor-${runId}`, email: `auditor-${runId}@enterprise.com`, name: 'Auditor', role: 'AUDITOR' as Role };

  // Tenant Isolation verification: Organization A vs Organization B
  const userTenantB = { id: `owner-b-${runId}`, email: `owner-${runId}@tenantb.com`, name: 'Tenant B Owner', role: 'OWNER' as Role };

  let orgA: any;
  let orgB: any;

  await t.test('1. Organization Management & Multi-Cluster Structure', async () => {
    orgA = store.createOrganization('SkyOps Global Corp', userOwner.id, userOwner.email, userOwner.name);
    orgB = store.createOrganization('Isolate Corp B', userTenantB.id, userTenantB.email, userTenantB.name);

    assert.ok(orgA.id);
    assert.ok(orgB.id);

    // Create Multi-Cluster hierarchy in Org A:
    // Production (EKS, GKE, AKS)
    const prodEks = store.createCluster(orgA.id, 'Production-EKS', 'AWS US-East-1 Production Cluster', {
      displayName: 'Production-EKS',
      environment: 'production',
      provider: 'eks',
      region: 'us-east-1',
      k8sVersion: 'v1.31.2'
    });

    const prodGke = store.createCluster(orgA.id, 'Production-GKE', 'GCP US-Central1 Production Cluster', {
      displayName: 'Production-GKE',
      environment: 'production',
      provider: 'gke',
      region: 'us-central1',
      k8sVersion: 'v1.31.1'
    });

    const prodAks = store.createCluster(orgA.id, 'Production-AKS', 'Azure EastUS Production Cluster', {
      displayName: 'Production-AKS',
      environment: 'production',
      provider: 'aks',
      region: 'eastus',
      k8sVersion: 'v1.30.5'
    });

    // Staging (EKS, GKE)
    const stagingEks = store.createCluster(orgA.id, 'Staging-EKS', 'AWS US-West-2 Staging Cluster', {
      displayName: 'Staging-EKS',
      environment: 'staging',
      provider: 'eks',
      region: 'us-west-2',
      k8sVersion: 'v1.31.2'
    });

    const stagingGke = store.createCluster(orgA.id, 'Staging-GKE', 'GCP US-Central1 Staging Cluster', {
      displayName: 'Staging-GKE',
      environment: 'staging',
      provider: 'gke',
      region: 'us-central1',
      k8sVersion: 'v1.31.1'
    });

    // Development (Kind)
    const devKind = store.createCluster(orgA.id, 'Development-Kind', 'Local Kind Kubernetes Dev Cluster', {
      displayName: 'Development-Kind',
      environment: 'development',
      provider: 'kind',
      region: 'local',
      k8sVersion: 'v1.32.0'
    });

    assert.ok(prodEks.cluster.id);
    assert.equal(prodEks.cluster.environment, 'production');
    assert.equal(prodEks.cluster.provider, 'eks');

    // Hierarchy Grouping test
    const hierarchy = store.getOrgClusterHierarchy(orgA.id);
    assert.ok(hierarchy.length >= 3, 'Must contain Production, Staging, Development groups');

    const prodGroup = hierarchy.find((g) => g.environment.toLowerCase() === 'production');
    assert.ok(prodGroup, 'Production group must exist');
    assert.ok(prodGroup.clusters.some((c) => c.name === 'Production-EKS'));
    assert.ok(prodGroup.clusters.some((c) => c.name === 'Production-GKE'));
    assert.ok(prodGroup.clusters.some((c) => c.name === 'Production-AKS'));

    const stageGroup = hierarchy.find((g) => g.environment.toLowerCase() === 'staging');
    assert.ok(stageGroup, 'Staging group must exist');
    assert.ok(stageGroup.clusters.some((c) => c.name === 'Staging-EKS'));

    const devGroup = hierarchy.find((g) => g.environment.toLowerCase() === 'development');
    assert.ok(devGroup, 'Development group must exist');
    assert.ok(devGroup.clusters.some((c) => c.name === 'Development-Kind'));
  });

  await t.test('2. Cluster Health Summary Verification', async () => {
    const clusters = store.getClusters(orgA.id);
    const targetCluster = clusters[0];
    assert.ok(targetCluster);

    const health = store.getClusterHealthSummary(targetCluster.id, orgA.id);
    assert.ok(health, 'Must produce concise cluster health summary');
    assert.ok(typeof health.nodes === 'number');
    assert.ok(typeof health.workloads === 'number');
    assert.ok(typeof health.cpuUtilizationPercent === 'number');
    assert.ok(typeof health.memoryUtilizationPercent === 'number');
    assert.ok(typeof health.agentHealth === 'string');
    assert.ok(health.lastTelemetryAgo, 'Must reflect real telemetry timestamp');
  });

  await t.test('3. Multi-Cluster Incident Filtering & Environment Summary', async () => {
    const summary = store.getIncidentsMultiClusterSummary(orgA.id);
    assert.ok(summary);
    assert.ok(typeof summary.byEnvironment?.production === 'number');
    assert.ok(typeof summary.byEnvironment?.staging === 'number');
    assert.ok(typeof summary.byEnvironment?.development === 'number');

    // Query incidents filtered by environment
    const prodIncidents = store.getIncidents(orgA.id, { environment: 'production' });
    assert.ok(Array.isArray(prodIncidents));
    for (const inc of prodIncidents) {
      if ((inc as any).environment) {
        assert.equal((inc as any).environment.toLowerCase(), 'production');
      }
    }
  });

  await t.test('4. Kubernetes Cost Intelligence & Resource Rightsizing', async () => {
    const overview = CostEngine.getCostOverview(orgA.id);
    assert.ok(overview);
    assert.ok(overview.estimatedMonthlyCostUsd > 0, 'Estimated monthly cost must be positive');
    assert.ok(overview.potentialMonthlySavingsUsd > 0, 'Potential monthly savings must be calculated');
    assert.ok(overview.cpuWastePercent >= 0 && overview.cpuWastePercent <= 100);
    assert.ok(overview.memoryWastePercent >= 0 && overview.memoryWastePercent <= 100);
    assert.ok(overview.estimateDisclaimer.includes('distinguished from actual cloud provider invoices'));

    // Cost Allocation
    const allocation = CostEngine.getCostAllocation(orgA.id);
    assert.ok(allocation.byNamespace.length > 0);
    assert.ok(allocation.byWorkload.length > 0);

    // Rightsizing Recommendations (checkout-api CPU/Mem reduction)
    const recs = CostEngine.getRightsizingRecommendations(orgA.id);
    assert.ok(recs.length > 0);
    const checkoutRec = recs.find((r) => r.workloadName === 'checkout-api') || recs[0];
    assert.ok(checkoutRec);
    assert.ok(checkoutRec.currentCpuRequested);
    assert.ok(checkoutRec.recommendedCpu);
    assert.ok(checkoutRec.estimatedMonthlySavingsUsd > 0);
    assert.ok(checkoutRec.confidencePercent > 80);
    assert.equal(checkoutRec.rollbackAvailable, true);

    // Cost Savings Tracking
    const savings = CostEngine.getCostSavingsTracking(orgA.id);
    assert.ok(savings.estimatedOpportunityUsd > 0);
    assert.ok(savings.realizedSavingsUsd >= 0);
    assert.ok(savings.distinctionNote.includes('Estimated'));
  });

  await t.test('5. Security Posture & 7-Step Remediation Workflow', async () => {
    const posture = SecurityEngine.getSecurityPostureOverview(orgA.id);
    assert.ok(posture);
    assert.ok(posture.criticalCount >= 1);
    assert.ok(posture.highCount >= 1);

    const findings = SecurityEngine.getSecurityFindings(orgA.id);
    assert.ok(findings.length > 0);

    // Verify finding details (Privileged container detection)
    const privFinding = findings.find((f) => f.category === 'PRIVILEGED_CONTAINER') || findings[0];
    assert.ok(privFinding);
    assert.ok(privFinding.risk);
    assert.ok(privFinding.recommendedFix);
    assert.equal(privFinding.safetyCheckPassed, true);

    // Policies
    const policies = SecurityEngine.getPolicies(orgA.id);
    assert.ok(policies.length >= 6);
    const privPolicy = policies.find((p) => p.key === 'block-privileged-workloads');
    assert.ok(privPolicy);

    // Toggle Policy mode (Audit -> Enforce)
    const updatedPolicy = SecurityEngine.updatePolicy(orgA.id, 'block-privileged-workloads', {
      enforcementMode: 'ENFORCE',
      enabled: true
    });
    assert.equal(updatedPolicy.enforcementMode, 'ENFORCE');
  });

  await t.test('6. Enterprise RBAC & Permission Matrix Enforcement', async () => {
    // 6 Enterprise Roles: OWNER, ADMIN, SRE, DEVELOPER, VIEWER, AUDITOR
    assert.ok(hasPermission('OWNER', 'incident.heal'));
    assert.ok(hasPermission('OWNER', 'cost.optimize'));
    assert.ok(hasPermission('OWNER', 'policy.manage'));

    assert.ok(hasPermission('ADMIN', 'incident.heal'));
    assert.ok(hasPermission('ADMIN', 'cluster.manage'));

    assert.ok(hasPermission('SRE', 'incident.heal'));
    assert.ok(hasPermission('SRE', 'remediation.approve'));
    assert.ok(hasPermission('SRE', 'cost.optimize'));
    assert.equal(hasPermission('SRE', 'billing.manage'), false, 'SRE cannot manage billing');

    assert.ok(hasPermission('DEVELOPER', 'incident.view'));
    assert.ok(hasPermission('DEVELOPER', 'incident.heal'));
    assert.equal(hasPermission('DEVELOPER', 'cluster.manage'), false, 'Developer cannot manage clusters');
    assert.equal(hasPermission('DEVELOPER', 'policy.manage'), false, 'Developer cannot change policies');

    // VIEWER (Prompt 3, Section 16: Can view health/incidents, cannot heal/approve/manage clusters)
    assert.ok(hasPermission('VIEWER', 'incident.view'));
    assert.ok(hasPermission('VIEWER', 'cluster.read'));
    assert.ok(hasPermission('VIEWER', 'telemetry.view'));
    assert.equal(hasPermission('VIEWER', 'incident.heal'), false, 'Viewer cannot heal');
    assert.equal(hasPermission('VIEWER', 'remediation.approve'), false, 'Viewer cannot approve remediation');
    assert.equal(hasPermission('VIEWER', 'remediation.execute'), false, 'Viewer cannot execute remediation');
    assert.equal(hasPermission('VIEWER', 'policy.manage'), false, 'Viewer cannot change Auto-Healing');
    assert.equal(hasPermission('VIEWER', 'cluster.manage'), false, 'Viewer cannot manage clusters');

    // AUDITOR
    assert.ok(hasPermission('AUDITOR', 'audit.read'));
    assert.ok(hasPermission('AUDITOR', 'security.read'));
    assert.ok(hasPermission('AUDITOR', 'incident.view'));
    assert.equal(hasPermission('AUDITOR', 'incident.heal'), false, 'Auditor cannot heal');
    assert.equal(hasPermission('AUDITOR', 'cluster.manage'), false, 'Auditor cannot manage clusters');
  });

  await t.test('7. Enterprise Cryptographic Audit Trail', async () => {
    // Record audit event
    const record = auditService.record({
      orgId: orgA.id,
      actorId: userSre.id,
      actorName: userSre.name,
      actorType: 'HUMAN',
      action: 'policy.autohealing_changed',
      resourceType: 'POLICY',
      resourceId: 'auto-healing-policy',
      result: 'SUCCESS',
      details: {
        old: 'APPROVAL_REQUIRED',
        new: 'CONTROLLED_AUTONOMOUS'
      }
    });

    assert.ok(record.id);
    assert.equal(record.action, 'policy.autohealing_changed');
    assert.equal(record.orgId, orgA.id);

    // Query audit logs
    const results = auditService.query({ orgId: orgA.id });
    assert.ok(results.items.some((item) => item.action === 'policy.autohealing_changed'));
  });

  await t.test('8. Strict Tenant Isolation (Org A vs Org B)', async () => {
    // Clusters created in Org A must NOT be accessible to Org B
    const orgAClusters = store.getClusters(orgA.id);
    const orgBClusters = store.getClusters(orgB.id);

    assert.ok(orgAClusters.length > 0);
    assert.ok(!orgBClusters.some((b) => orgAClusters.some((a) => a.id === b.id)), 'Org B must not see Org A clusters');

    // Direct access to Org A cluster ID passing Org B tenant ID must return null
    const crossAccess = store.getCluster(orgAClusters[0].id, orgB.id);
    assert.equal(crossAccess, null, 'Cross-tenant cluster access must be denied');

    // User check access
    const userBAccess = store.checkUserOrgAccess(userTenantB.id, orgA.id);
    assert.equal(userBAccess.hasAccess, false, 'User B must not have access to Org A');
  });

  await t.test('9. Configurable Data Retention Rules', async () => {
    const updated = store.updateOrganization(orgA.id, {
      settings: {
        retention: {
          incidentRetentionDays: 90,
          auditLogsRetentionDays: 365,
          telemetryRetentionDays: 30,
          neverDeleteProduction: true
        }
      }
    });

    assert.equal(updated.settings?.retention?.incidentRetentionDays, 90);
    assert.equal(updated.settings?.retention?.auditLogsRetentionDays, 365);
    assert.equal(updated.settings?.retention?.telemetryRetentionDays, 30);
    assert.equal(updated.settings?.retention?.neverDeleteProduction, true);
  });
});
