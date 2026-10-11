/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SkyOps Overview Intelligence & Operational Logic Engine
 * Provides deterministic aggregation, incident prioritization, correlation,
 * health assessment, change-awareness, and action eligibility for the Command Center.
 */

import { Cluster, Incident, KubernetesResource, OverviewMetrics } from '../../types/index';
import { CostOverview } from '../../types/enterprise';

export type CertaintyLevel =
  | 'CONFIRMED'
  | 'SUSPECTED_RELATED'
  | 'UNVERIFIED_HYPOTHESIS'
  | 'RESOLVED'
  | 'INSUFFICIENT_EVIDENCE';

export interface ChangeContext {
  hasChange: boolean;
  changeSummary: string;
  temporalDistance?: string;
  causality: 'CONFIRMED_CAUSAL' | 'TEMPORAL_CORRELATION' | 'NO_CHANGE_RECORDED';
}

export interface RemediationEligibility {
  isEligible: boolean;
  actionType?: string;
  reason: string;
  requiresApproval: boolean;
}

export interface PrioritizedIncident extends Incident {
  priorityScore: number;
  priorityRank: number;
  certaintyLevel: CertaintyLevel;
  priorityExplanation: string;
  correlatedIncidentIds: string[];
  correlatedCount: number;
  isRootCauseCandidate: boolean;
  affectedServices: string[];
  changeContext: ChangeContext;
  remediationEligibility: RemediationEligibility;
}

export interface OperationalHealthAssessment {
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'DEGRADED' | 'UNAVAILABLE' | 'SYNCING';
  headline: string;
  observations: string[];
  telemetryState: 'CURRENT' | 'STALE' | 'EMPTY' | 'UNAVAILABLE';
  dataFreshnessText: string;
  agentLinkState: 'ALL_CONNECTED' | 'PARTIAL_OFFLINE' | 'DISCONNECTED';
}

export interface ScopedOverviewMetrics {
  totalClustersCount: number;
  healthyClustersCount: number;
  criticalClustersCount: number;
  warningClustersCount: number;
  offlineClustersCount: number;
  totalNodesCount: number;
  readyNodesCount: number;
  pressureNodesCount: number;
  totalPodsCount: number;
  healthyPodsCount: number;
  crashingPodsCount: number;
  totalWorkloadsCount: number;
  nominalWorkloadsCount: number;
  degradedWorkloadsCount: number;
  openIncidentsCount: number;
  criticalIncidentsCount: number;
  highIncidentsCount: number;
  inProgressIncidentsCount: number;
  connectedAgentsCount: number;
  offlineAgentsCount: number;
  isTelemetryAvailable: boolean;
}

/**
 * Derives operational health assessment separating infrastructure health,
 * agent connectivity, and telemetry availability without masking failures.
 */
export function determineOperationalHealth(params: {
  clusters: Cluster[];
  selectedCluster: Cluster | null;
  isSingleCluster: boolean;
  resources: KubernetesResource[];
  openIncidents: Incident[];
  isStale?: boolean;
  loading?: boolean;
  fetchError?: string | null;
  lastUpdatedAt?: number | null;
}): OperationalHealthAssessment {
  const {
    clusters,
    selectedCluster,
    isSingleCluster,
    resources,
    openIncidents,
    isStale = false,
    loading = false,
    fetchError = null,
    lastUpdatedAt = null
  } = params;

  const observations: string[] = [];
  const safeClusters = Array.isArray(clusters) ? clusters : [];

  // Determine freshness text
  let dataFreshnessText = 'Never updated';
  if (lastUpdatedAt && !isNaN(lastUpdatedAt) && lastUpdatedAt > 0) {
    const sec = Math.max(0, Math.floor((Date.now() - lastUpdatedAt) / 1000));
    dataFreshnessText = sec < 10 ? 'Synced just now' : `Synced ${sec}s ago`;
  }

  // 1. Telemetry availability state
  let telemetryState: 'CURRENT' | 'STALE' | 'EMPTY' | 'UNAVAILABLE' = 'CURRENT';
  if (fetchError && resources.length === 0) {
    telemetryState = 'UNAVAILABLE';
    observations.push(`API sync failure: ${fetchError}`);
  } else if (isStale) {
    telemetryState = 'STALE';
    observations.push('Telemetry is stale; awaiting live agent synchronization');
  } else if (resources.length === 0 && safeClusters.length > 0) {
    telemetryState = 'EMPTY';
    observations.push('No Kubernetes resources currently reported in this scope');
  }

  // 2. Agent Link State
  let agentLinkState: 'ALL_CONNECTED' | 'PARTIAL_OFFLINE' | 'DISCONNECTED' = 'ALL_CONNECTED';
  if (isSingleCluster && selectedCluster) {
    if (selectedCluster.agentStatus !== 'CONNECTED') {
      agentLinkState = 'DISCONNECTED';
      observations.push(`Cluster agent is ${selectedCluster.agentStatus || 'OFFLINE'} (heartbeat missed)`);
    }
  } else if (safeClusters.length > 0) {
    const offlineCount = safeClusters.filter(
      (c) => c.agentStatus === 'OFFLINE' || c.status === 'AGENT_OFFLINE'
    ).length;
    if (offlineCount === safeClusters.length) {
      agentLinkState = 'DISCONNECTED';
      observations.push(`All ${safeClusters.length} cluster agents are offline`);
    } else if (offlineCount > 0) {
      agentLinkState = 'PARTIAL_OFFLINE';
      observations.push(`${offlineCount} of ${safeClusters.length} cluster agents are offline`);
    }
  }

  // 3. Resource diagnostics
  const relevantPods = resources.filter((r) => r.kind === 'Pod');
  const crashingPods = relevantPods.filter((p) => {
    const isCompleted = p.status === 'Completed' || p.status === 'Succeeded';
    const isTerminating = p.status === 'Terminating' || Boolean((p as any).metadata?.deletionTimestamp);
    if (isCompleted || isTerminating) return false;
    return (
      p.health === 'CRITICAL' ||
      p.status === 'CrashLoopBackOff' ||
      p.status === 'ImagePullBackOff' ||
      p.status === 'ErrImagePull' ||
      p.status === 'OOMKilled' ||
      p.status === 'Failed' ||
      p.status === 'Error'
    );
  });

  const relevantNodes = resources.filter((r) => r.kind === 'Node');
  const pressureNodes = relevantNodes.filter((n) => {
    const conds = Array.isArray(n.conditions) ? n.conditions : [];
    const hasPressure = conds.some(
      (c) =>
        (c.type === 'MemoryPressure' || c.type === 'DiskPressure' || c.type === 'PIDPressure') &&
        (c.status === 'True' || (c.status as any) === true)
    );
    const notReady = conds.some(
      (c) => c.type === 'Ready' && (c.status === 'False' || (c.status as any) === false)
    );
    return hasPressure || notReady || n.status !== 'Ready';
  });

  const criticalIncidents = openIncidents.filter((i) => i.severity === 'CRITICAL');
  const highIncidents = openIncidents.filter((i) => i.severity === 'HIGH');

  if (crashingPods.length > 0) {
    observations.push(`${crashingPods.length} pod(s) failing or crashing in backoff loops`);
  }
  if (pressureNodes.length > 0) {
    observations.push(`${pressureNodes.length} node(s) reporting resource pressure or NotReady`);
  }
  if (criticalIncidents.length > 0) {
    observations.push(`${criticalIncidents.length} critical severity incident(s) open`);
  }
  if (highIncidents.length > 0) {
    observations.push(`${highIncidents.length} high severity incident(s) open`);
  }

  // Determine Overall Status
  let status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'DEGRADED' | 'UNAVAILABLE' | 'SYNCING' = 'HEALTHY';
  let headline = 'Operational baseline nominal';

  if (loading && safeClusters.length === 0) {
    status = 'SYNCING';
    headline = 'Syncing Kubernetes telemetry...';
  } else if (fetchError && safeClusters.length === 0) {
    status = 'UNAVAILABLE';
    headline = 'Telemetry synchronization unavailable';
  } else if (safeClusters.length === 0) {
    status = 'SYNCING';
    headline = 'No clusters connected';
    observations.push('Connect a cluster to begin streaming real-time telemetry');
  } else if (criticalIncidents.length > 0 || crashingPods.length > 0) {
    status = 'CRITICAL';
    headline = `Operator attention required: ${crashingPods.length} failing pod(s), ${criticalIncidents.length} critical incident(s)`;
  } else if (agentLinkState === 'DISCONNECTED') {
    status = 'DEGRADED';
    headline = isSingleCluster
      ? `Agent disconnected from ${selectedCluster?.name || 'cluster'}`
      : 'All cluster telemetry agents are offline';
  } else if (
    highIncidents.length > 0 ||
    pressureNodes.length > 0 ||
    agentLinkState === 'PARTIAL_OFFLINE' ||
    isStale
  ) {
    status = 'WARNING';
    headline = `Degraded conditions observed: ${pressureNodes.length} pressured node(s), ${highIncidents.length} high incident(s)`;
  } else if (resources.length === 0) {
    status = 'DEGRADED';
    headline = 'Cluster connected; awaiting initial resource inventory';
  } else {
    status = 'HEALTHY';
    headline = `All ${relevantNodes.length} nodes and ${relevantPods.length} pods operational without active alerts`;
    if (observations.length === 0) {
      observations.push('Cluster readiness checks and container health probes are nominal');
    }
  }

  return {
    status,
    headline,
    observations,
    telemetryState,
    dataFreshnessText,
    agentLinkState
  };
}

/**
 * Extracts change context preceding an incident from technicalDetails and resource metadata.
 */
export function extractChangeContext(
  incident: Incident,
  resources: KubernetesResource[]
): ChangeContext {
  const tech = incident.technicalDetails || {};
  const prevImg = tech.previousImage || (incident as any).previousImage;
  const currImg = tech.image || (incident as any).currentImage;

  // 1. Explicit previous vs current container image
  if (prevImg && currImg && prevImg !== currImg) {
    const isImageFailure = incident.incidentType === 'ImagePullBackOff' || incident.incidentType === 'ErrImagePull';
    return {
      hasChange: true,
      changeSummary: `Image updated from ${prevImg} to ${currImg}`,
      temporalDistance: tech.changeTime ? `${Math.round((incident.firstSeenAt - Number(tech.changeTime)) / 60000)}m before onset` : 'prior to onset',
      causality: isImageFailure ? 'CONFIRMED_CAUSAL' : 'TEMPORAL_CORRELATION'
    };
  }

  // 2. Check deployment restart annotation
  const matchingWorkload = resources.find(
    (r) =>
      r.clusterId === incident.clusterId &&
      r.namespace === incident.namespace &&
      r.name === incident.resourceName &&
      ['Deployment', 'StatefulSet', 'DaemonSet'].includes(r.kind)
  );

  if (matchingWorkload?.annotations?.['kubectl.kubernetes.io/restartedAt']) {
    const restartTime = new Date(matchingWorkload.annotations['kubectl.kubernetes.io/restartedAt']).getTime();
    if (!isNaN(restartTime) && restartTime <= incident.firstSeenAt + 60000) {
      return {
        hasChange: true,
        changeSummary: 'Workload rollout restart triggered',
        temporalDistance: `${Math.max(1, Math.round((incident.firstSeenAt - restartTime) / 60000))}m before onset`,
        causality: 'TEMPORAL_CORRELATION'
      };
    }
  }

  return {
    hasChange: false,
    changeSummary: 'No deployment changes recorded preceding this incident',
    causality: 'NO_CHANGE_RECORDED'
  };
}

/**
 * Evaluates whether an incident can be safely auto-healed or remediated.
 */
export function evaluateRemediationEligibility(
  incident: Incident,
  cluster: Cluster | null
): RemediationEligibility {
  if (incident.status === 'RESOLVED' || incident.status === 'CLOSED') {
    return {
      isEligible: false,
      reason: 'Incident is already resolved',
      requiresApproval: false
    };
  }

  if (cluster && cluster.agentStatus !== 'CONNECTED') {
    return {
      isEligible: false,
      reason: 'Cluster agent is disconnected; mutation commands cannot be executed',
      requiresApproval: false
    };
  }

  const kind = (incident.resourceKind || '').toLowerCase();
  const type = incident.incidentType || '';

  if (type === 'CrashLoopBackOff' || type === 'OOMKilled' || type === 'PodFailed') {
    return {
      isEligible: true,
      actionType: kind === 'deployment' ? 'RolloutRestart' : 'RestartPod',
      reason: 'Eligible for closed-loop container restart with health verification',
      requiresApproval: false
    };
  }

  if (type === 'ImagePullBackOff' || type === 'ErrImagePull') {
    const hasRollback = Boolean((incident.technicalDetails as any)?.previousImage);
    return {
      isEligible: true,
      actionType: kind === 'deployment' ? 'RollbackDeployment' : 'ReplacePodImage',
      reason: hasRollback ? 'Eligible for automatic image rollback' : 'Requires valid target container image specification',
      requiresApproval: false
    };
  }

  if (type === 'DeploymentDegraded') {
    return {
      isEligible: true,
      actionType: 'RolloutRestart',
      reason: 'Eligible for controller rollout restart',
      requiresApproval: false
    };
  }

  return {
    isEligible: false,
    reason: 'Complex or unmapped incident type; manual investigation recommended',
    requiresApproval: true
  };
}

/**
 * Groups and correlates incidents, scoring their operational priority deterministically.
 */
export function correlateAndPrioritizeIncidents(
  incidents: Incident[],
  resources: KubernetesResource[],
  clusters: Cluster[]
): PrioritizedIncident[] {
  const safeIncidents = Array.isArray(incidents) ? incidents.filter(Boolean) : [];
  if (safeIncidents.length === 0) return [];

  // Grouping map by node or workload controller to identify shared root cause
  const nodeStressedIncidents = new Map<string, string[]>(); // nodeName -> incidentIds
  const workloadDegradedIncidents = new Map<string, string[]>(); // clusterId:ns:workload -> incidentIds

  for (const inc of safeIncidents) {
    const nodeName = inc.technicalDetails?.nodeName;
    if (nodeName) {
      const list = nodeStressedIncidents.get(nodeName) || [];
      list.push(inc.id);
      nodeStressedIncidents.set(nodeName, list);
    }

    const wlKey = `${inc.clusterId}:${inc.namespace || 'default'}:${inc.resourceName}`;
    const wlList = workloadDegradedIncidents.get(wlKey) || [];
    wlList.push(inc.id);
    workloadDegradedIncidents.set(wlKey, wlList);
  }

  const results: PrioritizedIncident[] = safeIncidents.map((inc) => {
    const cluster = clusters.find((c) => c.id === inc.clusterId) || null;
    const changeCtx = extractChangeContext(inc, resources);
    const remediation = evaluateRemediationEligibility(inc, cluster);

    // 1. Calculate Priority Score deterministically
    let score = 0;
    const explanationParts: string[] = [];

    // Severity weights
    if (inc.severity === 'CRITICAL') {
      score += 100;
      explanationParts.push('Critical severity (+100)');
    } else if (inc.severity === 'HIGH') {
      score += 70;
      explanationParts.push('High severity (+70)');
    } else if (inc.severity === 'MEDIUM') {
      score += 40;
      explanationParts.push('Medium severity (+40)');
    } else {
      score += 10;
      explanationParts.push('Low/Info severity (+10)');
    }

    // Status weights
    if (inc.status === 'OPEN') {
      score += 20;
      explanationParts.push('Active open state (+20)');
    } else if (inc.status === 'IN_PROGRESS' || inc.status === 'ACKNOWLEDGED') {
      score += 10;
      explanationParts.push('In-progress investigation (+10)');
    }

    // Correlated incidents discovery
    const correlatedIds = new Set<string>();
    const nodeName = inc.technicalDetails?.nodeName;
    if (nodeName && (nodeStressedIncidents.get(nodeName)?.length || 0) > 1) {
      const coLocated = (nodeStressedIncidents.get(nodeName) || []).filter((id) => id !== inc.id);
      coLocated.forEach((id) => correlatedIds.add(id));
      score += Math.min(30, coLocated.length * 10);
      explanationParts.push(`${coLocated.length} co-located incidents on node ${nodeName} (+${Math.min(30, coLocated.length * 10)})`);
    }

    const wlKey = `${inc.clusterId}:${inc.namespace || 'default'}:${inc.resourceName}`;
    if ((workloadDegradedIncidents.get(wlKey)?.length || 0) > 1) {
      const peerIncidents = (workloadDegradedIncidents.get(wlKey) || []).filter((id) => id !== inc.id);
      peerIncidents.forEach((id) => correlatedIds.add(id));
    }

    // Node resource condition check
    if (nodeName) {
      const nodeRes = resources.find((r) => r.kind === 'Node' && r.name === nodeName);
      if (nodeRes?.conditions?.some((c) => (c.type === 'MemoryPressure' || c.type === 'DiskPressure') && c.status === 'True')) {
        score += 25;
        explanationParts.push('Host node reporting resource pressure (+25)');
      }
    }

    // Recent change proximity
    if (changeCtx.hasChange) {
      score += 15;
      explanationParts.push('Correlated with recent change (+15)');
    }

    // Service blast radius
    const affectedServices: string[] = [];
    const exposingServices = resources.filter(
      (r) =>
        r.kind === 'Service' &&
        r.namespace === inc.namespace &&
        r.clusterId === inc.clusterId
    );
    for (const svc of exposingServices) {
      if (svc.name && (inc.resourceName.includes(svc.name) || svc.name.includes(inc.resourceName))) {
        affectedServices.push(svc.name);
      }
    }
    if (affectedServices.length > 0) {
      score += 20;
      explanationParts.push(`Affects exposed service (${affectedServices.join(', ')}) (+20)`);
    }

    // 2. Classify Evidence Certainty
    let certaintyLevel: CertaintyLevel = 'UNVERIFIED_HYPOTHESIS';
    if (inc.status === 'RESOLVED' || inc.status === 'CLOSED') {
      certaintyLevel = 'RESOLVED';
    } else if (cluster && cluster.agentStatus !== 'CONNECTED') {
      certaintyLevel = 'INSUFFICIENT_EVIDENCE';
    } else if (
      inc.technicalDetails?.observedState === 'CrashLoopBackOff' ||
      inc.technicalDetails?.observedState === 'OOMKilled' ||
      inc.technicalDetails?.observedState === 'ImagePullBackOff' ||
      (inc.technicalDetails?.events?.length || 0) > 0
    ) {
      certaintyLevel = 'CONFIRMED';
    } else if (correlatedIds.size > 0) {
      certaintyLevel = 'SUSPECTED_RELATED';
    } else {
      certaintyLevel = 'UNVERIFIED_HYPOTHESIS';
    }

    const isRootCauseCandidate =
      inc.resourceKind === 'Node' ||
      (inc.resourceKind === 'Deployment' && inc.incidentType === 'ImagePullBackOff') ||
      correlatedIds.size > 0;

    return {
      ...inc,
      priorityScore: score,
      priorityRank: 0, // Assigned after sort
      certaintyLevel,
      priorityExplanation: explanationParts.join(' • '),
      correlatedIncidentIds: Array.from(correlatedIds),
      correlatedCount: correlatedIds.size,
      isRootCauseCandidate,
      affectedServices,
      changeContext: changeCtx,
      remediationEligibility: remediation
    };
  });

  // Sort descending by priority score, then by latest observation
  results.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }
    return (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
  });

  // Assign 1-indexed rank
  results.forEach((inc, idx) => {
    inc.priorityRank = idx + 1;
  });

  return results;
}

/**
 * Computes strictly scoped metrics for a single cluster or the whole fleet.
 */
export function computeScopedOverviewMetrics(params: {
  clusters: Cluster[];
  resources: KubernetesResource[];
  incidents: Incident[];
  clusterFilter: string;
  metrics: OverviewMetrics | null;
}): ScopedOverviewMetrics {
  const { clusters, resources, incidents, clusterFilter, metrics } = params;
  const isSingleCluster = clusterFilter !== 'all';
  const safeClusters = Array.isArray(clusters) ? clusters : [];
  const safeResources = Array.isArray(resources) ? resources : [];
  const safeIncidents = Array.isArray(incidents) ? incidents : [];

  const selectedCluster = isSingleCluster
    ? safeClusters.find((c) => c.id === clusterFilter) || null
    : null;

  const scopedClusters = isSingleCluster
    ? (selectedCluster ? [selectedCluster] : [])
    : safeClusters;

  const scopedResources = isSingleCluster
    ? safeResources.filter((r) => r.clusterId === clusterFilter)
    : safeResources;

  const scopedIncidents = isSingleCluster
    ? safeIncidents.filter((i) => i.clusterId === clusterFilter)
    : safeIncidents;

  const openIncidents = scopedIncidents.filter(
    (i) => i && (i.status === 'OPEN' || i.status === 'IN_PROGRESS' || i.status === 'ACKNOWLEDGED')
  );

  const criticalIncidents = openIncidents.filter((i) => i.severity === 'CRITICAL');
  const highIncidents = openIncidents.filter((i) => i.severity === 'HIGH');
  const inProgressIncidents = openIncidents.filter((i) => i.status === 'IN_PROGRESS');

  const nodes = scopedResources.filter((r) => r.kind === 'Node');
  const pods = scopedResources.filter((r) => r.kind === 'Pod');
  const workloads = scopedResources.filter((r) =>
    ['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob'].includes(r.kind)
  );

  const pressureNodes = nodes.filter((n) => {
    const conds = Array.isArray(n.conditions) ? n.conditions : [];
    return conds.some(
      (c) =>
        ((c.type === 'MemoryPressure' || c.type === 'DiskPressure' || c.type === 'PIDPressure') &&
          (c.status === 'True' || (c.status as any) === true)) ||
        (c.type === 'Ready' && (c.status === 'False' || (c.status as any) === false))
    ) || n.status !== 'Ready';
  });

  const crashingPods = pods.filter((p) => {
    const isCompleted = p.status === 'Completed' || p.status === 'Succeeded';
    const isTerminating = p.status === 'Terminating' || Boolean((p as any).metadata?.deletionTimestamp);
    if (isCompleted || isTerminating) return false;
    return (
      p.health === 'CRITICAL' ||
      p.status === 'CrashLoopBackOff' ||
      p.status === 'ImagePullBackOff' ||
      p.status === 'ErrImagePull' ||
      p.status === 'OOMKilled' ||
      p.status === 'Failed' ||
      p.status === 'Error'
    );
  });

  const degradedWorkloads = workloads.filter(
    (w) => w.health === 'CRITICAL' || w.health === 'WARNING'
  );

  const totalClustersCount = isSingleCluster ? (selectedCluster ? 1 : 0) : (metrics?.totalClusters ?? safeClusters.length);
  const healthyClustersCount = isSingleCluster
    ? (selectedCluster?.status === 'HEALTHY' ? 1 : 0)
    : (metrics?.healthyClusters ?? safeClusters.filter((c) => c.status === 'HEALTHY').length);
  const criticalClustersCount = isSingleCluster
    ? (selectedCluster?.status === 'CRITICAL' ? 1 : 0)
    : (metrics?.criticalClusters ?? safeClusters.filter((c) => c.status === 'CRITICAL').length);
  const warningClustersCount = isSingleCluster
    ? (selectedCluster?.status === 'WARNING' ? 1 : 0)
    : (metrics?.warningClusters ?? safeClusters.filter((c) => c.status === 'WARNING').length);
  const offlineClustersCount = isSingleCluster
    ? (selectedCluster?.agentStatus === 'OFFLINE' || selectedCluster?.status === 'AGENT_OFFLINE' ? 1 : 0)
    : (metrics?.offlineClusters ?? safeClusters.filter((c) => c.status === 'AGENT_OFFLINE' || c.agentStatus === 'OFFLINE').length);

  const totalNodesCount = isSingleCluster
    ? (nodes.length > 0 ? nodes.length : (selectedCluster?.nodeCount || 0))
    : (nodes.length > 0 ? nodes.length : (metrics?.totalNodes ?? 0));

  const readyNodesCount = Math.max(0, totalNodesCount - pressureNodes.length);

  const totalPodsCount = isSingleCluster
    ? (pods.length > 0 ? pods.length : (selectedCluster?.podCount || 0))
    : (pods.length > 0 ? pods.length : (metrics?.totalPods ?? 0));

  const healthyPodsCount = Math.max(0, totalPodsCount - crashingPods.length);

  const totalWorkloadsCount = workloads.length > 0
    ? workloads.length
    : (isSingleCluster ? 0 : (metrics?.totalWorkloads ?? 0));

  const nominalWorkloadsCount = Math.max(0, totalWorkloadsCount - degradedWorkloads.length);

  const connectedAgentsCount = isSingleCluster
    ? (selectedCluster?.agentStatus === 'CONNECTED' ? 1 : 0)
    : (metrics?.connectedAgents ?? safeClusters.filter((c) => c.agentStatus === 'CONNECTED').length);

  const offlineAgentsCount = isSingleCluster
    ? (selectedCluster?.agentStatus === 'OFFLINE' || selectedCluster?.status === 'AGENT_OFFLINE' ? 1 : 0)
    : (metrics?.offlineAgents ?? safeClusters.filter((c) => c.agentStatus === 'OFFLINE' || c.status === 'AGENT_OFFLINE').length);

  const isTelemetryAvailable = safeResources.length > 0;

  return {
    totalClustersCount,
    healthyClustersCount,
    criticalClustersCount,
    warningClustersCount,
    offlineClustersCount,
    totalNodesCount,
    readyNodesCount,
    pressureNodesCount: pressureNodes.length,
    totalPodsCount,
    healthyPodsCount,
    crashingPodsCount: crashingPods.length,
    totalWorkloadsCount,
    nominalWorkloadsCount,
    degradedWorkloadsCount: degradedWorkloads.length,
    openIncidentsCount: openIncidents.length,
    criticalIncidentsCount: criticalIncidents.length,
    highIncidentsCount: highIncidents.length,
    inProgressIncidentsCount: inProgressIncidents.length,
    connectedAgentsCount,
    offlineAgentsCount,
    isTelemetryAvailable
  };
}
