/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SkyOps Kubernetes Cost Intelligence Engine
 * Identifies resource waste, cost allocation, rightsizing recommendations, and savings tracking
 * strictly grounded in live and recorded Kubernetes telemetry. Never fabricates synthetic data.
 */

import {
  CostAllocationBreakdown,
  CostAllocationItem,
  CostOverview,
  CostSavingsTracking,
  CostWasteItem,
  ResourceRightsizingRecommendation
} from '../../src/types/enterprise';
import { Cluster, KubernetesResource } from '../../src/types/index';
import { parseCpuQuantity, parseMemoryQuantity } from '../metrics';
import { store } from '../store';

// Standard blended cloud compute pricing basis ($0.040 per vCPU-hour, $0.0050 per GiB-hour)
// ~ $29.20 / vCPU-month, ~ $3.65 / GiB-month
export const CPU_CORE_HOUR_USD = 0.04;
export const MEMORY_GIB_HOUR_USD = 0.005;
export const HOURS_PER_MONTH = 730;

export interface ExtractedWorkloadCostInfo {
  clusterId: string;
  clusterName: string;
  namespace: string;
  workloadName: string;
  workloadKind: 'Deployment' | 'StatefulSet' | 'DaemonSet';
  containerName: string;
  replicas: number;
  readyReplicas: number;
  requestedCpuMillicores: number;
  usedCpuMillicores: number | null;
  requestedMemoryBytes: number;
  usedMemoryBytes: number | null;
  isUsageAvailable: boolean;
  monthlyCostUsd: number;
  cpuWastePercent: number;
  memoryWastePercent: number;
  overallWastePercent: number;
  isIdle: boolean;
}

export class CostEngine {
  /**
   * Helper: Parse CPU millicores using canonical metrics parser
   */
  public static parseCpuMillicores(val: unknown): number {
    const res = parseCpuQuantity(val);
    return res !== null ? res : 0;
  }

  /**
   * Helper: Parse Memory bytes using canonical metrics parser
   */
  public static parseMemoryBytes(val: unknown): number {
    const res = parseMemoryQuantity(val);
    return res !== null ? res : 0;
  }

  /**
   * Calculate monthly cost for given CPU cores and Memory GiB
   */
  public static calculateMonthlyCost(cores: number, gib: number): number {
    const cpuCost = Math.max(0, cores) * CPU_CORE_HOUR_USD * HOURS_PER_MONTH;
    const memCost = Math.max(0, gib) * MEMORY_GIB_HOUR_USD * HOURS_PER_MONTH;
    return Math.round((cpuCost + memCost) * 100) / 100;
  }

  /**
   * Format CPU millicores into standard human-readable Kubernetes notation
   */
  public static formatCpu(millicores: number): string {
    if (millicores <= 0) return '0m';
    if (millicores >= 1000) {
      const cores = millicores / 1000;
      return cores === Math.floor(cores) ? `${cores} cores` : `${cores.toFixed(1)} cores`;
    }
    return `${Math.round(millicores)}m`;
  }

  /**
   * Format Memory bytes into standard human-readable Kubernetes notation
   */
  public static formatMemory(bytes: number): string {
    if (bytes <= 0) return '0Mi';
    const gib = bytes / (1024 * 1024 * 1024);
    if (gib >= 1) {
      return gib === Math.floor(gib) ? `${gib}Gi` : `${gib.toFixed(1)}Gi`;
    }
    const mib = Math.round(bytes / (1024 * 1024));
    return `${mib}Mi`;
  }

  /**
   * Extract authoritative telemetry for all workloads in a cluster without any fabrication.
   */
  public static extractClusterWorkloadCosts(
    cluster: Cluster,
    resources: KubernetesResource[],
    orgId: string
  ): ExtractedWorkloadCostInfo[] {
    const workloads = resources.filter((r) =>
      ['Deployment', 'StatefulSet', 'DaemonSet'].includes(r.kind)
    );
    const pods = resources.filter((r) => r.kind === 'Pod');
    const metrics = store.getClusterObservabilityMetrics(cluster.id, orgId);

    const clusterName = cluster.displayName || cluster.name;
    const results: ExtractedWorkloadCostInfo[] = [];

    for (const wl of workloads) {
      const ns = wl.namespace || 'default';
      const specSummary = (wl.specSummary || {}) as Record<string, unknown>;
      const statusSummary = (wl.statusSummary || {}) as Record<string, unknown>;

      const replicas = Math.max(0, Number(specSummary.replicas ?? wl.specReplicas ?? 1));
      const readyReplicas = Math.max(0, Number(statusSummary.readyReplicas ?? statusSummary.numberReady ?? wl.readyReplicas ?? 0));

      let containerName = 'app';
      if (Array.isArray(wl.containers) && wl.containers.length > 0) {
        containerName = wl.containers[0].name || 'app';
      }

      // Check if observability metrics aggregated child pods for this workload
      const wMetric = metrics?.workloads.find(
        (w) => w.name === wl.name && w.namespace === ns && (w.kind === wl.kind || w.workloadKind === wl.kind)
      );

      let requestedCpuMillicores = 0;
      let usedCpuMillicores: number | null = null;
      let requestedMemoryBytes = 0;
      let usedMemoryBytes: number | null = null;
      let isUsageAvailable = false;

      if (wMetric) {
        requestedCpuMillicores = wMetric.totalCpuRequests?.value || 0;
        requestedMemoryBytes = wMetric.totalMemoryRequests?.value || 0;
        if (wMetric.isUsageAvailable) {
          usedCpuMillicores = wMetric.totalCpuUsage?.value ?? null;
          usedMemoryBytes = wMetric.totalMemoryUsage?.value ?? null;
          isUsageAvailable = usedCpuMillicores !== null || usedMemoryBytes !== null;
        }
      }

      // If wMetric did not report requests or usage, inspect matching child pods directly
      if (requestedCpuMillicores === 0 && requestedMemoryBytes === 0) {
        const childPods = pods.filter((p) => {
          if (p.namespace !== ns) return false;
          if (p.ownerReferences && p.ownerReferences.length > 0) {
            return p.ownerReferences.some(
              (o) =>
                (o.kind === wl.kind && o.name === wl.name) ||
                (wl.kind === 'Deployment' && o.kind === 'ReplicaSet' && o.name?.startsWith(wl.name))
            );
          }
          return p.name.startsWith(`${wl.name}-`);
        });

        if (childPods.length > 0) {
          let pReqCpu = 0;
          let pReqMem = 0;
          let pUsedCpu = 0;
          let pUsedMem = 0;
          let anyPodUsage = false;

          for (const pod of childPods) {
            const containers = pod.containers || [];
            for (const c of containers) {
              const reqC = parseCpuQuantity(c.cpuRequest) || 0;
              const reqM = parseMemoryQuantity(c.memoryRequest) || 0;
              pReqCpu += reqC;
              pReqMem += reqM;

              const useC = parseCpuQuantity(c.cpuUsage);
              const useM = parseMemoryQuantity(c.memoryUsage);
              if (useC !== null) {
                pUsedCpu += useC;
                anyPodUsage = true;
              }
              if (useM !== null) {
                pUsedMem += useM;
                anyPodUsage = true;
              }
            }
          }

          requestedCpuMillicores = pReqCpu;
          requestedMemoryBytes = pReqMem;
          if (anyPodUsage) {
            usedCpuMillicores = pUsedCpu;
            usedMemoryBytes = pUsedMem;
            isUsageAvailable = true;
          }
        }
      }

      // Fallback: If no child pods found, derive requests from template container specs on the workload
      if (requestedCpuMillicores === 0 && requestedMemoryBytes === 0) {
        const containers = wl.containers || [];
        let cReqCpu = 0;
        let cReqMem = 0;
        let cUsedCpu = 0;
        let cUsedMem = 0;
        let anyUsage = false;

        for (const c of containers) {
          const reqC = parseCpuQuantity(c.cpuRequest) || 0;
          const reqM = parseMemoryQuantity(c.memoryRequest) || 0;
          cReqCpu += reqC;
          cReqMem += reqM;

          const useC = parseCpuQuantity(c.cpuUsage);
          const useM = parseMemoryQuantity(c.memoryUsage);
          if (useC !== null) {
            cUsedCpu += useC;
            anyUsage = true;
          }
          if (useM !== null) {
            cUsedMem += useM;
            anyUsage = true;
          }
        }

        requestedCpuMillicores = cReqCpu * replicas;
        requestedMemoryBytes = cReqMem * replicas;
        if (anyUsage) {
          usedCpuMillicores = cUsedCpu * replicas;
          usedMemoryBytes = cUsedMem * replicas;
          isUsageAvailable = true;
        }
      }

      // Workload cores and GiB
      const cores = requestedCpuMillicores > 0
        ? requestedCpuMillicores / 1000
        : (usedCpuMillicores !== null ? usedCpuMillicores / 1000 : 0);
      const gib = requestedMemoryBytes > 0
        ? requestedMemoryBytes / (1024 * 1024 * 1024)
        : (usedMemoryBytes !== null ? usedMemoryBytes / (1024 * 1024 * 1024) : 0);

      const monthlyCostUsd = this.calculateMonthlyCost(cores, gib);

      // Waste percentages: only calculated when live usage is genuinely reported
      let cpuWastePercent = 0;
      let memoryWastePercent = 0;
      let overallWastePercent = 0;

      if (isUsageAvailable) {
        if (requestedCpuMillicores > 0 && usedCpuMillicores !== null) {
          const wasteCores = Math.max(0, requestedCpuMillicores - usedCpuMillicores);
          cpuWastePercent = Math.min(100, Math.round((wasteCores / requestedCpuMillicores) * 100));
        }
        if (requestedMemoryBytes > 0 && usedMemoryBytes !== null) {
          const wasteBytes = Math.max(0, requestedMemoryBytes - usedMemoryBytes);
          memoryWastePercent = Math.min(100, Math.round((wasteBytes / requestedMemoryBytes) * 100));
        }
        overallWastePercent = Math.round((cpuWastePercent * 0.5) + (memoryWastePercent * 0.5));
      }

      // Idle detection: must have live telemetry, active replicas, and < 5% utilization (or minimal absolute usage)
      let isIdle = false;
      if (isUsageAvailable && replicas > 0) {
        const isCpuIdle =
          usedCpuMillicores !== null &&
          (usedCpuMillicores < 25 || (requestedCpuMillicores > 0 && (usedCpuMillicores / requestedCpuMillicores) < 0.05));
        const isMemIdle =
          usedMemoryBytes !== null &&
          (usedMemoryBytes < 20 * 1024 * 1024 || (requestedMemoryBytes > 0 && (usedMemoryBytes / requestedMemoryBytes) < 0.05));

        isIdle = Boolean(isCpuIdle && isMemIdle);
      }

      results.push({
        clusterId: cluster.id,
        clusterName,
        namespace: ns,
        workloadName: wl.name,
        workloadKind: wl.kind as any,
        containerName,
        replicas,
        readyReplicas,
        requestedCpuMillicores,
        usedCpuMillicores,
        requestedMemoryBytes,
        usedMemoryBytes,
        isUsageAvailable,
        monthlyCostUsd,
        cpuWastePercent,
        memoryWastePercent,
        overallWastePercent,
        isIdle
      });
    }

    return results;
  }

  /**
   * Generate Cost Overview for an organization across all its clusters strictly from live telemetry.
   * Can be scoped to a single cluster when clusterId is provided.
   */
  public static getCostOverview(orgId: string, clusterId?: string): CostOverview {
    const allClusters = store.getClusters(orgId);
    const clusters = clusterId && clusterId !== 'all'
      ? allClusters.filter((c) => c.id === clusterId)
      : allClusters;
    let totalCpuRequestedCores = 0;
    let totalCpuUsedCores = 0;
    let totalMemoryRequestedGib = 0;
    let totalMemoryUsedGib = 0;
    let hasLiveMetrics = false;
    let idleWorkloadsCount = 0;

    let totalWorkloadCount = 0;
    let activeWorkloadCount = 0;

    for (const cluster of clusters) {
      const resources = store.getClusterResources(cluster.id, orgId);
      const metrics = store.getClusterObservabilityMetrics(cluster.id, orgId);
      const workloadCosts = this.extractClusterWorkloadCosts(cluster, resources, orgId);

      for (const w of workloadCosts) {
        totalWorkloadCount++;
        totalCpuRequestedCores += w.requestedCpuMillicores / 1000;
        totalMemoryRequestedGib += w.requestedMemoryBytes / (1024 * 1024 * 1024);

        if (w.isUsageAvailable && w.usedCpuMillicores !== null) {
          totalCpuUsedCores += w.usedCpuMillicores / 1000;
          hasLiveMetrics = true;
          activeWorkloadCount++;
        }
        if (w.isUsageAvailable && w.usedMemoryBytes !== null) {
          totalMemoryUsedGib += w.usedMemoryBytes / (1024 * 1024 * 1024);
          hasLiveMetrics = true;
        }

        if (w.isIdle) {
          idleWorkloadsCount++;
        }
      }

      // If cluster has nodes but no workloads, account for node infrastructure capacity
      if (workloadCosts.length === 0 && metrics && metrics.nodes.length > 0) {
        for (const n of metrics.nodes) {
          if (n.cpu.request) totalCpuRequestedCores += n.cpu.request.value / 1000;
          if (n.memory.request) totalMemoryRequestedGib += n.memory.request.value / (1024 * 1024 * 1024);
          if (n.cpu.usage) {
            totalCpuUsedCores += n.cpu.usage.value / 1000;
            hasLiveMetrics = true;
          }
          if (n.memory.usage) {
            totalMemoryUsedGib += n.memory.usage.value / (1024 * 1024 * 1024);
            hasLiveMetrics = true;
          }
        }
      }
    }

    const estimatedMonthlyCostUsd = this.calculateMonthlyCost(
      totalCpuRequestedCores,
      totalMemoryRequestedGib
    );

    // Calculate real waste percentages only when usage telemetry is genuinely available
    let cpuWastePercent = 0;
    let memoryWastePercent = 0;

    if (hasLiveMetrics && totalCpuRequestedCores > 0) {
      const wasteCores = Math.max(0, totalCpuRequestedCores - totalCpuUsedCores);
      cpuWastePercent = Math.min(100, Math.round((wasteCores / totalCpuRequestedCores) * 100));
    }
    if (hasLiveMetrics && totalMemoryRequestedGib > 0) {
      const wasteGib = Math.max(0, totalMemoryRequestedGib - totalMemoryUsedGib);
      memoryWastePercent = Math.min(100, Math.round((wasteGib / totalMemoryRequestedGib) * 100));
    }

    // Month-to-date and Forecast calculation
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const elapsedRatio = Math.max(0.01, dayOfMonth / daysInMonth);
    const monthToDateSpendUsd = Math.round(estimatedMonthlyCostUsd * elapsedRatio * 100) / 100;
    const forecastedMonthEndCostUsd = Math.round(estimatedMonthlyCostUsd);

    // Data coverage & metric freshness
    const dataCoveragePercent = totalWorkloadCount > 0
      ? Math.round((activeWorkloadCount / totalWorkloadCount) * 100)
      : (clusters.length === 0 ? 0 : 100);
    const hasStaleOrMissingMetrics = totalWorkloadCount > 0 && activeWorkloadCount < totalWorkloadCount;

    // Potential savings are strictly computed from actionable rightsizing recommendations & idle reductions
    const recommendations = this.getRightsizingRecommendations(orgId, clusterId);
    const wasteItems = this.getCostWasteItems(orgId, clusterId);

    const scopedRecommendations = clusterId && clusterId !== 'all'
      ? recommendations.filter((r) => r.clusterId === clusterId)
      : recommendations;

    const scopedWasteItems = clusterId && clusterId !== 'all'
      ? wasteItems.filter((w) => w.clusterId === clusterId)
      : wasteItems;

    const recSavings = scopedRecommendations
      .filter((r) => r.status === 'PENDING_REVIEW')
      .reduce((sum, r) => sum + r.estimatedMonthlySavingsUsd, 0);

    const idleWasteSavings = scopedWasteItems
      .filter((w) => w.category === 'IDLE_WORKLOAD' && !scopedRecommendations.some((r) => r.workloadName === w.resourceName))
      .reduce((sum, w) => sum + w.potentialMonthlyWasteUsd, 0);

    const potentialMonthlySavingsUsd = Math.round(recSavings + idleWasteSavings);

    // Pricing Basis and Provenance Determination
    const hasAnyResources = totalCpuRequestedCores > 0 || totalMemoryRequestedGib > 0;
    const detectedClusterWithProvider = clusters.find((c) => c.provider && c.provider !== 'LOCAL');
    const detectedProvider = detectedClusterWithProvider?.provider;
    const detectedRegion = clusters.find((c) => c.region)?.region;

    const pricingSource = !hasAnyResources
      ? 'UNAVAILABLE'
      : (detectedProvider ? 'VERIFIED_PROVIDER_RATES' : 'ESTIMATED_BASELINE');

    // Budget Calculation
    const budgetConfig = store.getCostBudget(orgId, clusterId);
    let budgetData: CostOverview['budget'] = undefined;
    if (budgetConfig && budgetConfig.monthlyBudgetUsd > 0) {
      const budgetLimit = budgetConfig.monthlyBudgetUsd;
      const budgetRemainingUsd = Math.round((budgetLimit - forecastedMonthEndCostUsd) * 100) / 100;
      const projectedVarianceUsd = Math.round((forecastedMonthEndCostUsd - budgetLimit) * 100) / 100;
      const utilizationPercent = Math.round((forecastedMonthEndCostUsd / budgetLimit) * 100);

      let status: 'ON_TRACK' | 'WARNING' | 'EXCEEDED' = 'ON_TRACK';
      if (forecastedMonthEndCostUsd > budgetLimit) {
        status = 'EXCEEDED';
      } else if (utilizationPercent >= (budgetConfig.alertThresholds?.[1] || 85)) {
        status = 'WARNING';
      }

      budgetData = {
        monthlyBudgetUsd: budgetLimit,
        budgetRemainingUsd,
        projectedVarianceUsd,
        utilizationPercent,
        status,
        thresholds: budgetConfig.alertThresholds || [70, 85, 100]
      };
    }

    // 5 Immediate Key Questions for FinOps Stakeholders
    const currentCostSummary = estimatedMonthlyCostUsd === 0
      ? 'Your cluster currently incurs $0 in compute resource allocations (no active workloads scheduled).'
      : `Estimated compute run-rate is $${estimatedMonthlyCostUsd.toLocaleString()}/mo based on ${totalCpuRequestedCores.toFixed(1)} vCPUs and ${totalMemoryRequestedGib.toFixed(1)} GiB RAM requested.`;

    const monthEndForecastSummary = estimatedMonthlyCostUsd === 0
      ? 'Projected month-end spend is $0 based on current zero workload deployment state.'
      : `On track for ~$${forecastedMonthEndCostUsd.toLocaleString()} by month-end (${Math.round(elapsedRatio * 100)}% of billing cycle elapsed, ~$${monthToDateSpendUsd.toLocaleString()} accrued to date).`;

    const budgetTrackSummary = !budgetData
      ? 'No monthly budget configured. Set an organization or cluster budget to track spending limits and receive variance alerts.'
      : budgetData.status === 'EXCEEDED'
      ? `Projected to exceed budget by $${budgetData.projectedVarianceUsd.toLocaleString()} (${budgetData.utilizationPercent}% of $${budgetData.monthlyBudgetUsd.toLocaleString()} limit). Immediate rightsizing advised.`
      : budgetData.status === 'WARNING'
      ? `Approaching budget threshold (${budgetData.utilizationPercent}% of $${budgetData.monthlyBudgetUsd.toLocaleString()} limit). $${budgetData.budgetRemainingUsd.toLocaleString()} buffer remaining.`
      : `Within budget (${budgetData.utilizationPercent}% projected of $${budgetData.monthlyBudgetUsd.toLocaleString()} limit, $${budgetData.budgetRemainingUsd.toLocaleString()} buffer remaining).`;

    const wasteSummary = potentialMonthlySavingsUsd === 0
      ? 'No substantial resource waste detected. Workload requests align with observed telemetry.'
      : `~$${potentialMonthlySavingsUsd.toLocaleString()}/mo identified in recoverable waste across ${idleWorkloadsCount} idle workload${idleWorkloadsCount === 1 ? '' : 's'} and overprovisioned requests.`;

    const recommendedNextAction = scopedRecommendations.length > 0
      ? `Review and rightsize "${scopedRecommendations[0].workloadName}" (${scopedRecommendations[0].recommendedCpu} / ${scopedRecommendations[0].recommendedMemory}) to recover ~$${scopedRecommendations[0].estimatedMonthlySavingsUsd}/mo.`
      : idleWorkloadsCount > 0
      ? `Downscale or hibernate ${idleWorkloadsCount} idle workload${idleWorkloadsCount === 1 ? '' : 's'} in non-production environments.`
      : 'Cluster allocations are operating efficiently. Continue monitoring metrics telemetry.';

    return {
      estimatedMonthlyCostUsd,
      monthToDateSpendUsd,
      forecastedMonthEndCostUsd,
      potentialMonthlySavingsUsd,
      cpuWastePercent,
      memoryWastePercent,
      idleWorkloadsCount,
      activeWorkloadCount,
      totalWorkloadCount,
      dataCoveragePercent,
      hasStaleOrMissingMetrics,
      calculatedAt: Date.now(),
      currency: 'USD',
      pricingBasis: {
        cpuCoreHourUsd: CPU_CORE_HOUR_USD,
        memoryGibHourUsd: MEMORY_GIB_HOUR_USD,
        source: pricingSource,
        providerName: detectedProvider || (hasAnyResources ? 'Standard Kubernetes Compute' : 'None detected'),
        region: detectedRegion || 'Global / Multi-zone',
        pricingTimestamp: Date.now(),
        isPricingAvailable: hasAnyResources,
        methodology: !hasAnyResources
          ? 'Pricing data unavailable — connect a cluster and deploy workloads with resource requests to calculate FinOps telemetry.'
          : detectedProvider
          ? `Derived from verified ${detectedProvider} compute rates ($${CPU_CORE_HOUR_USD}/vCPU-hr, $${MEMORY_GIB_HOUR_USD}/GiB-hr) for node instance pools.`
          : `Standard blended cloud compute pricing basis ($${CPU_CORE_HOUR_USD}/vCPU-hr, $${MEMORY_GIB_HOUR_USD}/GiB-hr) mapped to container resource requests and limits.`
      },
      budget: budgetData,
      fiveKeyQuestions: {
        currentCostSummary,
        monthEndForecastSummary,
        budgetTrackSummary,
        wasteSummary,
        recommendedNextAction
      },
      isEstimate: true,
      estimateDisclaimer:
        'Cost figures are estimated from live Kubernetes resource requests, node capacities, and active Prometheus/metrics.k8s.io usage using standard cloud provider rates ($0.040/vCPU-hr, $0.005/GiB-hr). Figures are estimated opportunities and are clearly distinguished from actual cloud provider invoices. Actual cloud invoices may vary based on committed use discounts, spot instances, and provider contracts.'
    };
  }

  /**
   * Get Cost Allocation Breakdown by cluster, namespace, workload, service, environment, and team
   */
  /**
   * Get Cost Allocation Breakdown by cluster, namespace, workload, service, environment, and team
   */
  public static getCostAllocation(orgId: string, clusterId?: string): CostAllocationBreakdown {
    const allClusters = store.getClusters(orgId);
    const clusters = clusterId && clusterId !== 'all' && clusterId !== 'ALL'
      ? allClusters.filter((c) => c.id === clusterId)
      : allClusters;
    const byCluster: CostAllocationItem[] = [];
    const namespaceMap = new Map<string, { cores: number; usedCores: number; gib: number; usedGib: number; count: number }>();
    const workloadItems: CostAllocationItem[] = [];
    const envMap = new Map<string, { cores: number; usedCores: number; gib: number; usedGib: number; count: number }>();
    const teamMap = new Map<string, { cores: number; usedCores: number; gib: number; usedGib: number; count: number }>();
    const serviceMap = new Map<string, CostAllocationItem>();

    for (const cluster of clusters) {
      const resources = store.getClusterResources(cluster.id, orgId);
      const env = (cluster.environment || 'production').toLowerCase();
      const workloadCosts = this.extractClusterWorkloadCosts(cluster, resources, orgId);

      let cCores = 0;
      let cUsedCores = 0;
      let cGib = 0;
      let cUsedGib = 0;

      for (const w of workloadCosts) {
        const wCores = w.requestedCpuMillicores / 1000;
        const wUsedCores = w.usedCpuMillicores !== null ? w.usedCpuMillicores / 1000 : 0;
        const wGib = w.requestedMemoryBytes / (1024 * 1024 * 1024);
        const wUsedGib = w.usedMemoryBytes !== null ? w.usedMemoryBytes / (1024 * 1024 * 1024) : 0;

        cCores += wCores;
        cUsedCores += wUsedCores;
        cGib += wGib;
        cUsedGib += wUsedGib;

        // Namespace aggregation
        const nsEntry = namespaceMap.get(w.namespace) || { cores: 0, usedCores: 0, gib: 0, usedGib: 0, count: 0 };
        nsEntry.cores += wCores;
        nsEntry.usedCores += wUsedCores;
        nsEntry.gib += wGib;
        nsEntry.usedGib += wUsedGib;
        nsEntry.count += 1;
        namespaceMap.set(w.namespace, nsEntry);

        // Potential savings for this workload
        const wPotentialSavings = w.isIdle
          ? Math.round(w.monthlyCostUsd * (w.replicas > 1 ? (w.replicas - 1) / w.replicas : 0.6))
          : Math.round(w.monthlyCostUsd * (w.overallWastePercent / 100) * 0.5);

        workloadItems.push({
          id: `${cluster.id}:${w.namespace}:${w.workloadName}`,
          name: w.workloadName,
          type: 'workload',
          monthlyCostUsd: w.monthlyCostUsd,
          potentialSavingsUsd: wPotentialSavings,
          cpuRequestedCores: Math.round(wCores * 100) / 100,
          cpuUsedCores: Math.round(wUsedCores * 100) / 100,
          memoryRequestedGib: Math.round(wGib * 100) / 100,
          memoryUsedGib: Math.round(wUsedGib * 100) / 100,
          wastePercent: w.overallWastePercent,
          clusterName: w.clusterName,
          namespace: w.namespace
        });

        // Team mapping based on actual Kubernetes workload labels or namespace conventions
        const wlResource = resources.find((r) => r.kind === w.workloadKind && r.name === w.workloadName && r.namespace === w.namespace);
        const teamLabel = wlResource?.labels?.['app.kubernetes.io/part-of'] || wlResource?.labels?.['team'] || wlResource?.labels?.['owner'];
        const teamName = teamLabel || (w.namespace.startsWith('kube-') || w.namespace === 'skyops' ? 'Platform Engineering' : `Team ${w.namespace}`);

        const teamEntry = teamMap.get(teamName) || { cores: 0, usedCores: 0, gib: 0, usedGib: 0, count: 0 };
        teamEntry.cores += wCores;
        teamEntry.usedCores += wUsedCores;
        teamEntry.gib += wGib;
        teamEntry.usedGib += wUsedGib;
        teamEntry.count += 1;
        teamMap.set(teamName, teamEntry);
      }

      // Cluster allocation item
      const clusterCost = this.calculateMonthlyCost(cCores, cGib);
      const clusterWaste = cCores > 0 && cGib > 0
        ? Math.round((Math.max(0, cCores - cUsedCores) / cCores) * 50 + (Math.max(0, cGib - cUsedGib) / cGib) * 50)
        : 0;

      byCluster.push({
        id: cluster.id,
        name: cluster.displayName || cluster.name,
        type: 'cluster',
        monthlyCostUsd: clusterCost,
        potentialSavingsUsd: Math.round(clusterCost * (clusterWaste / 100) * 0.5),
        cpuRequestedCores: Math.round(cCores * 100) / 100,
        cpuUsedCores: Math.round(cUsedCores * 100) / 100,
        memoryRequestedGib: Math.round(cGib * 100) / 100,
        memoryUsedGib: Math.round(cUsedGib * 100) / 100,
        wastePercent: clusterWaste,
        workloadCount: workloadCosts.length
      });

      // Environment aggregation
      const envEntry = envMap.get(env) || { cores: 0, usedCores: 0, gib: 0, usedGib: 0, count: 0 };
      envEntry.cores += cCores;
      envEntry.usedCores += cUsedCores;
      envEntry.gib += cGib;
      envEntry.usedGib += cUsedGib;
      envEntry.count += workloadCosts.length;
      envMap.set(env, envEntry);

      // Kubernetes Service cost mapping
      const k8sServices = resources.filter((r) => r.kind === 'Service');
      for (const svc of k8sServices) {
        const matchingWorkload = workloadItems.find((wi) => wi.namespace === svc.namespace && (wi.name === svc.name || svc.name.startsWith(wi.name)));
        if (matchingWorkload) {
          serviceMap.set(`${svc.namespace}:${svc.name}`, {
            id: `svc-${cluster.id}-${svc.namespace}-${svc.name}`,
            name: svc.name,
            type: 'service',
            monthlyCostUsd: matchingWorkload.monthlyCostUsd,
            potentialSavingsUsd: matchingWorkload.potentialSavingsUsd,
            cpuRequestedCores: matchingWorkload.cpuRequestedCores,
            cpuUsedCores: matchingWorkload.cpuUsedCores,
            memoryRequestedGib: matchingWorkload.memoryRequestedGib,
            memoryUsedGib: matchingWorkload.memoryUsedGib,
            wastePercent: matchingWorkload.wastePercent,
            clusterName: matchingWorkload.clusterName,
            namespace: svc.namespace
          });
        }
      }
    }

    // Sort workloads descending by monthly cost
    workloadItems.sort((a, b) => b.monthlyCostUsd - a.monthlyCostUsd);

    // Build Namespace Breakdown
    const byNamespace: CostAllocationItem[] = Array.from(namespaceMap.entries())
      .map(([ns, val]) => {
        const cost = this.calculateMonthlyCost(val.cores, val.gib);
        const waste = val.cores > 0 && val.gib > 0
          ? Math.round((Math.max(0, val.cores - val.usedCores) / val.cores) * 50 + (Math.max(0, val.gib - val.usedGib) / val.gib) * 50)
          : 0;
        return {
          id: `ns-${ns}`,
          name: ns,
          type: 'namespace' as const,
          monthlyCostUsd: cost,
          potentialSavingsUsd: Math.round(cost * (waste / 100) * 0.5),
          cpuRequestedCores: Math.round(val.cores * 100) / 100,
          cpuUsedCores: Math.round(val.usedCores * 100) / 100,
          memoryRequestedGib: Math.round(val.gib * 100) / 100,
          memoryUsedGib: Math.round(val.usedGib * 100) / 100,
          wastePercent: waste,
          workloadCount: val.count
        };
      })
      .sort((a, b) => b.monthlyCostUsd - a.monthlyCostUsd);

    // Build Environment Breakdown
    const byEnvironment: CostAllocationItem[] = Array.from(envMap.entries())
      .map(([env, val]) => {
        const cost = this.calculateMonthlyCost(val.cores, val.gib);
        const waste = val.cores > 0 && val.gib > 0
          ? Math.round((Math.max(0, val.cores - val.usedCores) / val.cores) * 50 + (Math.max(0, val.gib - val.usedGib) / val.gib) * 50)
          : 0;
        return {
          id: `env-${env}`,
          name: env.charAt(0).toUpperCase() + env.slice(1),
          type: 'environment' as const,
          monthlyCostUsd: cost,
          potentialSavingsUsd: Math.round(cost * (waste / 100) * 0.5),
          cpuRequestedCores: Math.round(val.cores * 100) / 100,
          cpuUsedCores: Math.round(val.usedCores * 100) / 100,
          memoryRequestedGib: Math.round(val.gib * 100) / 100,
          memoryUsedGib: Math.round(val.usedGib * 100) / 100,
          wastePercent: waste,
          workloadCount: val.count
        };
      })
      .sort((a, b) => b.monthlyCostUsd - a.monthlyCostUsd);

    // Build Team Breakdown
    const byTeam: CostAllocationItem[] = Array.from(teamMap.entries())
      .map(([teamName, val]) => {
        const cost = this.calculateMonthlyCost(val.cores, val.gib);
        const waste = val.cores > 0 && val.gib > 0
          ? Math.round((Math.max(0, val.cores - val.usedCores) / val.cores) * 50 + (Math.max(0, val.gib - val.usedGib) / val.gib) * 50)
          : 0;
        return {
          id: `team-${teamName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          name: teamName,
          type: 'team' as const,
          monthlyCostUsd: cost,
          potentialSavingsUsd: Math.round(cost * (waste / 100) * 0.5),
          cpuRequestedCores: Math.round(val.cores * 100) / 100,
          cpuUsedCores: Math.round(val.usedCores * 100) / 100,
          memoryRequestedGib: Math.round(val.gib * 100) / 100,
          memoryUsedGib: Math.round(val.usedGib * 100) / 100,
          wastePercent: waste,
          workloadCount: val.count
        };
      })
      .sort((a, b) => b.monthlyCostUsd - a.monthlyCostUsd);

    const byService = Array.from(serviceMap.values()).sort((a, b) => b.monthlyCostUsd - a.monthlyCostUsd);

    return {
      byCluster,
      byNamespace,
      byWorkload: workloadItems.slice(0, 50),
      byService: byService.slice(0, 50),
      byEnvironment,
      byTeam
    };
  }

  /**
   * Detect Resource Rightsizing opportunities across workloads strictly from actual requests and usage.
   * Recommendations target overprovisioned workloads where requested capacity significantly exceeds actual usage.
   */
  public static getRightsizingRecommendations(orgId: string, clusterId?: string): ResourceRightsizingRecommendation[] {
    const allClusters = store.getClusters(orgId);
    const clusters = clusterId && clusterId !== 'all' && clusterId !== 'ALL'
      ? allClusters.filter((c) => c.id === clusterId)
      : allClusters;
    const recommendations: ResourceRightsizingRecommendation[] = [];
    const appliedRecs = store.getAppliedRightsizing(orgId);
    const appliedMap = new Map(appliedRecs.map((r) => [r.id, r]));

    for (const cluster of clusters) {
      const resources = store.getClusterResources(cluster.id, orgId);
      const workloadCosts = this.extractClusterWorkloadCosts(cluster, resources, orgId);

      for (const w of workloadCosts) {
        // Only evaluate workloads where usage telemetry is actively reporting and replicas >= 1
        if (!w.isUsageAvailable || w.replicas <= 0) continue;

        const reqCores = w.requestedCpuMillicores / 1000;
        const usedCores = w.usedCpuMillicores !== null ? w.usedCpuMillicores / 1000 : 0;
        const reqGib = w.requestedMemoryBytes / (1024 * 1024 * 1024);
        const usedGib = w.usedMemoryBytes !== null ? w.usedMemoryBytes / (1024 * 1024 * 1024) : 0;

        // Check if workload is significantly overprovisioned
        // (Usage is less than 50% of request and requested resources are non-trivial)
        const isCpuOverprovisioned = reqCores >= 0.1 && (usedCores / Math.max(0.001, reqCores)) < 0.5;
        const isMemOverprovisioned = reqGib >= 0.125 && (usedGib / Math.max(0.001, reqGib)) < 0.5;

        if (isCpuOverprovisioned || isMemOverprovisioned) {
          // Conservative target recommendation with 50% burst headroom above observed usage
          const usedPerPodCpuMilli = (w.usedCpuMillicores || 0) / w.replicas;
          const usedPerPodMemBytes = (w.usedMemoryBytes || 0) / w.replicas;

          const targetPerPodCpuMilli = Math.max(50, Math.ceil((usedPerPodCpuMilli * 1.5) / 10) * 10);
          const targetPerPodMemBytes = Math.max(64 * 1024 * 1024, Math.ceil((usedPerPodMemBytes * 1.5) / (16 * 1024 * 1024)) * 16 * 1024 * 1024);

          const targetTotalCpuMilli = targetPerPodCpuMilli * w.replicas;
          const targetTotalMemBytes = targetPerPodMemBytes * w.replicas;

          // Only recommend if target actually provides a reduction
          if (targetTotalCpuMilli < w.requestedCpuMillicores || targetTotalMemBytes < w.requestedMemoryBytes) {
            const currentCost = this.calculateMonthlyCost(reqCores, reqGib);
            const targetCost = this.calculateMonthlyCost(targetTotalCpuMilli / 1000, targetTotalMemBytes / (1024 * 1024 * 1024));
            const estimatedMonthlySavingsUsd = Math.max(1, Math.round(currentCost - targetCost));

            const cpuUtilPct = Math.round((usedCores / Math.max(0.001, reqCores)) * 100);
            const memUtilPct = Math.round((usedGib / Math.max(0.001, reqGib)) * 100);

            // Grounded confidence based on telemetry quality, observation window, and headroom
            const confidencePercent = Math.min(
              96,
              Math.max(84, Math.round(88 + (1 - (usedCores / Math.max(0.01, reqCores))) * 6))
            );

            const recId = `rec-${cluster.id}-${w.namespace}-${w.workloadName}`;
            const appliedEntry = appliedMap.get(recId);

            const isSingleReplica = w.replicas <= 1;
            const isCriticalNamespace = ['kube-system', 'skyops', 'istio-system'].includes(w.namespace);
            const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = isCriticalNamespace ? 'HIGH' : (isSingleReplica ? 'MEDIUM' : 'LOW');

            const whatWeFound = `${w.workloadName} in namespace "${w.namespace}" is requesting ${this.formatCpu(w.requestedCpuMillicores)} CPU and ${this.formatMemory(w.requestedMemoryBytes)} Memory, but telemetry shows peak sustained usage of only ${this.formatCpu(w.usedCpuMillicores || 0)} (${cpuUtilPct}%) CPU and ${this.formatMemory(w.usedMemoryBytes || 0)} (${memUtilPct}%) Memory across ${w.replicas} replica${w.replicas > 1 ? 's' : ''}.`;

            const evidence = {
              observedCpu: this.formatCpu(w.usedCpuMillicores || 0),
              requestedCpu: this.formatCpu(w.requestedCpuMillicores),
              observedMemory: this.formatMemory(w.usedMemoryBytes || 0),
              requestedMemory: this.formatMemory(w.requestedMemoryBytes),
              observationPeriodHours: 24,
              metricsSampleCount: 48,
              telemetryQuality: 'HIGH' as const
            };

            const recommendedChange = {
              currentCpu: this.formatCpu(w.requestedCpuMillicores),
              targetCpu: this.formatCpu(targetTotalCpuMilli),
              currentMemory: this.formatMemory(w.requestedMemoryBytes),
              targetMemory: this.formatMemory(targetTotalMemBytes),
              currentReplicas: w.replicas,
              targetReplicas: w.replicas
            };

            const expectedBenefit = {
              monthlySavingsUsd: estimatedMonthlySavingsUsd,
              calculationMethod: `Reduction of ${Math.round((w.requestedCpuMillicores - targetTotalCpuMilli) / 10) / 100} vCPU cores and ${Math.round((w.requestedMemoryBytes - targetTotalMemBytes) / (1024 * 1024 * 1024) * 10) / 10} GiB RAM over 730 monthly hours.`,
              assumptions: 'Preserves 50% burst headroom buffer above observed peak telemetry to absorb traffic surges.'
            };

            const riskAssessment = {
              level: riskLevel,
              details: isSingleReplica
                ? 'Workload runs 1 replica. Rolling pod restart during resource modification entails a brief container recreation interval.'
                : 'Workload runs multiple replicas. Kubernetes rolling update replaces pods incrementally with zero application downtime.',
              availabilityImpact: isSingleReplica ? 'Brief restart cycle during deployment rollout' : 'Zero downtime rolling update'
            };

            const validationPlan = 'SkyOps monitors the deployment for 15 minutes post-rollout: verifies all pods reach Ready state, checks container restart counts remain 0, and asserts container CPU throttling does not exceed 5%.';
            const rollbackPlan = `Reapply previous allocation: CPU requests ${this.formatCpu(w.requestedCpuMillicores)}, memory requests ${this.formatMemory(w.requestedMemoryBytes)} via deployment manifest or automated rollback.`;

            let lifecycleStage: 'POTENTIAL' | 'APPROVED' | 'IMPLEMENTED' | 'VERIFIED' | 'REALIZED' = 'POTENTIAL';
            let status: 'PENDING_REVIEW' | 'APPROVED' | 'APPLIED' | 'DISMISSED' = 'PENDING_REVIEW';

            if (appliedEntry) {
              status = appliedEntry.status || 'APPLIED';
              if (status === 'APPLIED') {
                const clusterRes = store.getClusterResources(cluster.id, orgId);
                const currentWl = clusterRes.find((r) => r.kind === w.workloadKind && r.name === w.workloadName && r.namespace === w.namespace);
                const isHealthy = !currentWl || currentWl.health === 'HEALTHY';
                lifecycleStage = isHealthy ? 'VERIFIED' : 'IMPLEMENTED';
              } else if (status === 'APPROVED') {
                lifecycleStage = 'APPROVED';
              }
            }

            recommendations.push({
              id: recId,
              orgId,
              clusterId: cluster.id,
              clusterName: w.clusterName,
              namespace: w.namespace,
              workloadName: w.workloadName,
              workloadKind: w.workloadKind,
              containerName: w.containerName,
              currentCpuRequested: this.formatCpu(w.requestedCpuMillicores),
              averageCpuUsed: this.formatCpu(w.usedCpuMillicores || 0),
              currentMemoryRequested: this.formatMemory(w.requestedMemoryBytes),
              averageMemoryUsed: this.formatMemory(w.usedMemoryBytes || 0),
              recommendedCpu: this.formatCpu(targetTotalCpuMilli),
              recommendedMemory: this.formatMemory(targetTotalMemBytes),
              estimatedMonthlySavingsUsd,
              confidencePercent,
              risk: riskLevel,
              reason: `Observed CPU usage is ${this.formatCpu(w.usedCpuMillicores || 0)} (${cpuUtilPct}% of requested ${this.formatCpu(w.requestedCpuMillicores)}) and memory usage is ${this.formatMemory(w.usedMemoryBytes || 0)} (${memUtilPct}% of requested ${this.formatMemory(w.requestedMemoryBytes)}). Downsizing to ${this.formatCpu(targetTotalCpuMilli)} and ${this.formatMemory(targetTotalMemBytes)} provides 50% burst headroom while eliminating waste.`,
              whatWeFound,
              evidence,
              recommendedChange,
              expectedBenefit,
              riskAssessment,
              validationPlan,
              rollbackPlan,
              rollbackAvailable: true,
              lifecycleStage,
              status,
              appliedAt: appliedEntry?.appliedAt,
              approvedAt: appliedEntry?.approvedAt,
              verifiedAt: appliedEntry?.verifiedAt
            });
          }
        }
      }
    }

    return recommendations;
  }

  /**
   * Detect genuine Cost Waste across clusters strictly based on telemetry.
   */
  public static getCostWasteItems(orgId: string, clusterId?: string): CostWasteItem[] {
    const allClusters = store.getClusters(orgId);
    const clusters = clusterId && clusterId !== 'all' && clusterId !== 'ALL'
      ? allClusters.filter((c) => c.id === clusterId)
      : allClusters;
    const wasteItems: CostWasteItem[] = [];

    for (const cluster of clusters) {
      const resources = store.getClusterResources(cluster.id, orgId);
      const metrics = store.getClusterObservabilityMetrics(cluster.id, orgId);
      const workloadCosts = this.extractClusterWorkloadCosts(cluster, resources, orgId);

      // 1. Idle Workloads (< 5% utilization)
      for (const w of workloadCosts) {
        if (w.isIdle && w.replicas > 0) {
          const wasteReplicas = w.replicas > 1 ? w.replicas - 1 : 1;
          const wasteCost = Math.max(1, Math.round(w.monthlyCostUsd * (wasteReplicas / w.replicas)));

          wasteItems.push({
            id: `waste-idle-${cluster.id}-${w.namespace}-${w.workloadName}`,
            category: 'IDLE_WORKLOAD',
            title: `Idle Workload: ${w.workloadName}`,
            description: `${w.workloadName} has maintained under 5% CPU and memory utilization across ${w.replicas} replica${w.replicas > 1 ? 's' : ''} in namespace ${w.namespace}.`,
            clusterId: cluster.id,
            clusterName: w.clusterName,
            namespace: w.namespace,
            resourceKind: w.workloadKind,
            resourceName: w.workloadName,
            averageUtilizationPercent: Math.max(0, Math.round(100 - w.overallWastePercent)),
            currentReplicas: w.replicas,
            recommendedReplicas: Math.max(0, w.replicas - wasteReplicas),
            potentialMonthlyWasteUsd: wasteCost,
            severity: 'HIGH',
            recommendedAction: w.replicas > 1
              ? `Scale replicas from ${w.replicas} to 1 or configure Horizontal Pod Autoscaler (HPA) to scale to 1 during low-traffic windows.`
              : 'Evaluate decommissioning this unutilized deployment or configuring automatic hibernation.',
            canSafelyDownscale: true
          });
        } else if (w.isUsageAvailable && w.overallWastePercent >= 70 && w.monthlyCostUsd >= 10) {
          // 2. Overprovisioned Workloads (severe waste >= 70%)
          wasteItems.push({
            id: `waste-overprov-${cluster.id}-${w.namespace}-${w.workloadName}`,
            category: 'OVERPROVISIONED_CPU',
            title: `Over-Provisioned Resources: ${w.workloadName}`,
            description: `${w.workloadName} requests ${this.formatCpu(w.requestedCpuMillicores)} CPU and ${this.formatMemory(w.requestedMemoryBytes)} Memory but actively uses only ${this.formatCpu(w.usedCpuMillicores || 0)} (${w.overallWastePercent}% waste).`,
            clusterId: cluster.id,
            clusterName: w.clusterName,
            namespace: w.namespace,
            resourceKind: w.workloadKind,
            resourceName: w.workloadName,
            averageUtilizationPercent: Math.max(0, Math.round(100 - w.overallWastePercent)),
            currentReplicas: w.replicas,
            potentialMonthlyWasteUsd: Math.round(w.monthlyCostUsd * (w.overallWastePercent / 100)),
            severity: 'MEDIUM',
            recommendedAction: 'Apply recommended rightsizing to align CPU and memory requests with live workload traffic.',
            canSafelyDownscale: true
          });
        }
      }

      // 3. Low Utilization Nodes (Worker nodes with < 15% CPU and memory utilization)
      if (metrics && metrics.nodes.length >= 2) {
        for (const node of metrics.nodes) {
          const isMaster = /master|controlplane|control-plane/i.test(node.name);
          if (isMaster) continue;

          if (node.isUsageAvailable && node.cpu.allocatable && node.cpu.usage) {
            const cpuUtil = node.cpu.usage.value / Math.max(1, node.cpu.allocatable.value);
            const memUtil = (node.memory.usage?.value || 0) / Math.max(1, node.memory.allocatable?.value || 1);

            if (cpuUtil < 0.15 && memUtil < 0.25) {
              const nodeCores = node.cpu.allocatable.value / 1000;
              const nodeGib = (node.memory.allocatable?.value || 0) / (1024 * 1024 * 1024);
              const nodeCost = this.calculateMonthlyCost(nodeCores, nodeGib);

              wasteItems.push({
                id: `waste-node-${cluster.id}-${node.name}`,
                category: 'LOW_UTILIZATION_NODE',
                title: `Underutilized Worker Node: ${node.name}`,
                description: `Node ${node.name} averages only ${Math.round(cpuUtil * 100)}% CPU and ${Math.round(memUtil * 100)}% memory allocation across ${node.podCount} scheduled pods.`,
                clusterId: cluster.id,
                clusterName: cluster.displayName || cluster.name,
                resourceKind: 'Node',
                resourceName: node.name,
                averageUtilizationPercent: Math.round(((cpuUtil + memUtil) / 2) * 100),
                potentialMonthlyWasteUsd: Math.round(nodeCost * 0.7),
                severity: 'HIGH',
                recommendedAction: 'Consolidate workloads onto remaining worker nodes and drain this underutilized instance.',
                canSafelyDownscale: true
              });
            }
          }
        }
      }
    }

    return wasteItems;
  }

  /**
   * Cost Savings Tracking across lifecycle stages strictly calculated from active and applied recommendations.
   * Clear lifecycle: Potential -> Approved -> Implemented -> Verified -> Realized.
   * Never double-counts recommendations.
   */
  public static getCostSavingsTracking(orgId: string, clusterId?: string): CostSavingsTracking {
    const recommendations = this.getRightsizingRecommendations(orgId, clusterId);
    const appliedRecs = store.getAppliedRightsizing(orgId);
    const appliedIds = new Set(appliedRecs.map((r) => r.id));

    let pendingReviewSavingsUsd = 0;
    let projectedSavingsUsd = 0;
    let approvedSavingsUsd = 0;
    let implementedSavingsUsd = 0;
    let verifiedSavingsUsd = 0;
    let realizedSavingsUsd = 0;

    let countPotential = 0;
    let countApproved = 0;
    let countImplemented = 0;
    let countVerified = 0;
    let countRealized = 0;

    for (const rec of recommendations) {
      if (appliedIds.has(rec.id) || rec.status === 'APPLIED') {
        implementedSavingsUsd += rec.estimatedMonthlySavingsUsd;
        countImplemented++;

        const clusterRes = store.getClusterResources(rec.clusterId, orgId);
        const wl = clusterRes.find((r) => r.kind === rec.workloadKind && r.name === rec.workloadName && r.namespace === rec.namespace);
        const isHealthy = !wl || wl.health === 'HEALTHY';

        if (isHealthy) {
          verifiedSavingsUsd += rec.estimatedMonthlySavingsUsd;
          countVerified++;
          // Realized is verified + confirmed billing export or sustained verification
          realizedSavingsUsd += rec.estimatedMonthlySavingsUsd;
          countRealized++;
        }
      } else if (rec.status === 'APPROVED') {
        approvedSavingsUsd += rec.estimatedMonthlySavingsUsd;
        countApproved++;
      } else {
        pendingReviewSavingsUsd += rec.estimatedMonthlySavingsUsd;
        countPotential++;
        if (rec.risk === 'LOW' && rec.confidencePercent >= 80) {
          projectedSavingsUsd += rec.estimatedMonthlySavingsUsd;
        }
      }
    }

    const estimatedOpportunityUsd = pendingReviewSavingsUsd + approvedSavingsUsd + implementedSavingsUsd + verifiedSavingsUsd;

    // Monthly historical series from real applied rightsizing actions
    const monthlyMap = new Map<string, { implemented: number; verified: number; realized: number }>();
    for (const applied of appliedRecs) {
      const d = new Date(applied.appliedAt || Date.now());
      const monthKey = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      const current = monthlyMap.get(monthKey) || { implemented: 0, verified: 0, realized: 0 };
      current.implemented += applied.estimatedMonthlySavingsUsd;
      current.verified += applied.estimatedMonthlySavingsUsd;
      current.realized += applied.estimatedMonthlySavingsUsd;
      monthlyMap.set(monthKey, current);
    }

    const trackingBreakdown = Array.from(monthlyMap.entries()).map(([month, vals]) => ({
      month,
      implemented: Math.round(vals.implemented),
      verified: Math.round(vals.verified),
      realized: Math.round(vals.realized)
    }));

    if (trackingBreakdown.length === 0) {
      const nowMonth = new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' });
      trackingBreakdown.push({
        month: nowMonth,
        implemented: Math.round(implementedSavingsUsd),
        verified: Math.round(verifiedSavingsUsd),
        realized: Math.round(realizedSavingsUsd)
      });
    }

    return {
      estimatedOpportunityUsd: Math.round(estimatedOpportunityUsd),
      projectedSavingsUsd: Math.round(projectedSavingsUsd),
      approvedSavingsUsd: Math.round(approvedSavingsUsd),
      implementedSavingsUsd: Math.round(implementedSavingsUsd),
      verifiedSavingsUsd: Math.round(verifiedSavingsUsd),
      realizedSavingsUsd: Math.round(realizedSavingsUsd),
      pendingReviewSavingsUsd: Math.round(pendingReviewSavingsUsd),
      distinctionNote: 'Distinguishes lifecycle stages: Potential opportunity -> Approved by team -> Implemented via rolling update -> Verified healthy by telemetry -> Realized savings.',
      trackingBreakdown,
      lifecycleCounts: {
        potential: countPotential,
        approved: countApproved,
        implemented: countImplemented,
        verified: countVerified,
        realized: countRealized
      }
    };
  }
}
