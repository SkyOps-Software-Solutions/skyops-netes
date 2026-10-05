/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SkyOps Canonical Kubernetes Helpers & Domain Interpretation Engine
 * Single authoritative source of truth for interpreting Kubernetes resources,
 * metrics, replica semantics, metadata, and health throughout SkyOps.
 */

import { KubernetesResource, ResourceMetricValue } from '../types/index';
import {
  CanonicalKubernetesResource,
  DaemonSetResource,
  DeploymentResource,
  JobResource,
  NodeResource,
  PodResource,
  ServiceResource,
  StatefulSetResource,
  WorkloadKind
} from '../types/k8s';

// ==========================================
// QUANTITY PARSERS & FORMATTERS
// ==========================================

export function parseCpuQuantity(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) return null;
    return Math.round(raw * 1000);
  }
  const str = String(raw).trim();
  if (!str) return null;

  if (str.endsWith('n')) {
    const num = parseFloat(str.slice(0, -1));
    return Number.isFinite(num) && num >= 0 ? Math.round(num / 1_000_000) : null;
  }
  if (str.endsWith('u')) {
    const num = parseFloat(str.slice(0, -1));
    return Number.isFinite(num) && num >= 0 ? Math.round(num / 1_000) : null;
  }
  if (str.endsWith('m')) {
    const num = parseFloat(str.slice(0, -1));
    return Number.isFinite(num) && num >= 0 ? Math.round(num) : null;
  }
  const num = parseFloat(str);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 1000) : null;
}

export function parseMemoryQuantity(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) return null;
    return Math.round(raw);
  }
  const str = String(raw).trim();
  if (!str) return null;

  const binaryUnits: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    Pi: 1024 ** 5,
    Ei: 1024 ** 6
  };
  for (const [suffix, mult] of Object.entries(binaryUnits)) {
    if (str.endsWith(suffix)) {
      const num = parseFloat(str.slice(0, -suffix.length));
      return Number.isFinite(num) && num >= 0 ? Math.round(num * mult) : null;
    }
  }

  const decimalUnits: Record<string, number> = {
    k: 1000,
    M: 1000 ** 2,
    G: 1000 ** 3,
    T: 1000 ** 4,
    P: 1000 ** 5,
    E: 1000 ** 6
  };
  for (const [suffix, mult] of Object.entries(decimalUnits)) {
    if (str.endsWith(suffix)) {
      const num = parseFloat(str.slice(0, -suffix.length));
      return Number.isFinite(num) && num >= 0 ? Math.round(num * mult) : null;
    }
  }

  const num = parseFloat(str);
  return Number.isFinite(num) && num >= 0 ? Math.round(num) : null;
}

export function formatCpuMillicores(millicores: number | null | undefined): string {
  if (millicores === null || millicores === undefined || !Number.isFinite(millicores)) {
    return 'Unavailable';
  }
  if (millicores < 1000) {
    return `${millicores}m`;
  }
  const cores = millicores / 1000;
  return Number.isInteger(cores) ? `${cores} cores` : `${cores.toFixed(2)} cores`;
}

export function formatMemoryBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return 'Unavailable';
  }
  const kib = bytes / 1024;
  if (kib < 1024) return `${Math.round(kib)} KiB`;
  const mib = kib / 1024;
  if (mib < 1024) return `${Math.round(mib)} MiB`;
  const gib = mib / 1024;
  if (gib < 1024) return `${gib.toFixed(1)} GiB`;
  const tib = gib / 1024;
  return `${tib.toFixed(2)} TiB`;
}

// ==========================================
// 1. NODE HELPERS
// ==========================================

export interface NodeCapacityResult {
  cpu: ResourceMetricValue | null;
  memory: ResourceMetricValue | null;
  pods: number | null;
  formattedCpu: string;
  formattedMemory: string;
}

export function getNodeCapacity(node: KubernetesResource | NodeResource | null | undefined): NodeCapacityResult {
  if (!node) {
    return { cpu: null, memory: null, pods: null, formattedCpu: 'Unavailable', formattedMemory: 'Unavailable' };
  }

  const statusSummary = (node.statusSummary || {}) as Record<string, any>;
  const capacityMap = (statusSummary.capacity || {}) as Record<string, string>;

  // Check metrics.cpu.capacity first, then statusSummary.capacity.cpu
  const cpuMillis = node.metrics?.cpu?.capacity?.value ?? parseCpuQuantity(capacityMap.cpu);
  const memBytes = node.metrics?.memory?.capacity?.value ?? parseMemoryQuantity(capacityMap.memory);
  const pods = capacityMap.pods ? parseInt(capacityMap.pods, 10) : null;

  return {
    cpu: cpuMillis !== null ? { value: cpuMillis, unit: 'millicores', formatted: formatCpuMillicores(cpuMillis) } : null,
    memory: memBytes !== null ? { value: memBytes, unit: 'bytes', formatted: formatMemoryBytes(memBytes) } : null,
    pods: Number.isFinite(pods) ? pods : null,
    formattedCpu: formatCpuMillicores(cpuMillis),
    formattedMemory: formatMemoryBytes(memBytes)
  };
}

export interface NodeAllocatableResult {
  cpu: ResourceMetricValue | null;
  memory: ResourceMetricValue | null;
  pods: number | null;
  formattedCpu: string;
  formattedMemory: string;
}

export function getNodeAllocatable(node: KubernetesResource | NodeResource | null | undefined): NodeAllocatableResult {
  if (!node) {
    return { cpu: null, memory: null, pods: null, formattedCpu: 'Unavailable', formattedMemory: 'Unavailable' };
  }

  const statusSummary = (node.statusSummary || {}) as Record<string, any>;
  const allocMap = (statusSummary.allocatable || {}) as Record<string, string>;

  const cpuMillis =
    node.metrics?.cpu?.allocatable?.value ??
    parseCpuQuantity(allocMap.cpu) ??
    parseCpuQuantity(statusSummary.allocatableCpu);

  const memBytes =
    node.metrics?.memory?.allocatable?.value ??
    parseMemoryQuantity(allocMap.memory) ??
    parseMemoryQuantity(statusSummary.allocatableMemory);

  const pods = allocMap.pods ? parseInt(allocMap.pods, 10) : null;

  return {
    cpu: cpuMillis !== null ? { value: cpuMillis, unit: 'millicores', formatted: formatCpuMillicores(cpuMillis) } : null,
    memory: memBytes !== null ? { value: memBytes, unit: 'bytes', formatted: formatMemoryBytes(memBytes) } : null,
    pods: Number.isFinite(pods) ? pods : null,
    formattedCpu: formatCpuMillicores(cpuMillis),
    formattedMemory: formatMemoryBytes(memBytes)
  };
}

export interface NodeUsageResult {
  cpu: ResourceMetricValue | null;
  memory: ResourceMetricValue | null;
  formattedCpu: string;
  formattedMemory: string;
  isReported: boolean;
}

export function getNodeUsage(node: KubernetesResource | NodeResource | null | undefined): NodeUsageResult {
  if (!node) {
    return { cpu: null, memory: null, formattedCpu: 'Unavailable', formattedMemory: 'Unavailable', isReported: false };
  }

  const statusSummary = (node.statusSummary || {}) as Record<string, any>;
  const usageMap = (statusSummary.usage || {}) as Record<string, any>;

  const cpuMillis =
    node.metrics?.cpu?.usage?.value ??
    parseCpuQuantity(statusSummary.cpuUsage ?? usageMap.cpu);

  const memBytes =
    node.metrics?.memory?.usage?.value ??
    parseMemoryQuantity(statusSummary.memoryUsage ?? usageMap.memory);

  const isReported = cpuMillis !== null || memBytes !== null;

  return {
    cpu: cpuMillis !== null ? { value: cpuMillis, unit: 'millicores', formatted: formatCpuMillicores(cpuMillis) } : null,
    memory: memBytes !== null ? { value: memBytes, unit: 'bytes', formatted: formatMemoryBytes(memBytes) } : null,
    formattedCpu: formatCpuMillicores(cpuMillis),
    formattedMemory: formatMemoryBytes(memBytes),
    isReported
  };
}

export interface NodeUtilizationResult {
  cpuPercent: number | null;
  memoryPercent: number | null;
  formattedCpu: string;
  formattedMemory: string;
  isReported: boolean;
}

export function getNodeUtilization(node: KubernetesResource | NodeResource | null | undefined): NodeUtilizationResult {
  if (!node) {
    return { cpuPercent: null, memoryPercent: null, formattedCpu: 'Unavailable', formattedMemory: 'Unavailable', isReported: false };
  }

  // 1. Direct utilization percent on metrics
  let cpuPct = node.metrics?.cpu?.utilizationPercent ?? null;
  let memPct = node.metrics?.memory?.utilizationPercent ?? null;

  // 2. Derive from real usage and real allocatable if not precalculated
  if (cpuPct === null) {
    const usage = getNodeUsage(node);
    const alloc = getNodeAllocatable(node);
    if (usage.cpu?.value !== undefined && alloc.cpu?.value && alloc.cpu.value > 0) {
      cpuPct = Math.min(100, Math.round((usage.cpu.value / alloc.cpu.value) * 100));
    }
  }

  if (memPct === null) {
    const usage = getNodeUsage(node);
    const alloc = getNodeAllocatable(node);
    if (usage.memory?.value !== undefined && alloc.memory?.value && alloc.memory.value > 0) {
      memPct = Math.min(100, Math.round((usage.memory.value / alloc.memory.value) * 100));
    }
  }

  const isReported = cpuPct !== null || memPct !== null;

  return {
    cpuPercent: cpuPct,
    memoryPercent: memPct,
    formattedCpu: cpuPct !== null ? `${cpuPct}%` : 'Unavailable',
    formattedMemory: memPct !== null ? `${memPct}%` : 'Unavailable',
    isReported
  };
}

export interface NodePressureResult {
  hasMemoryPressure: boolean;
  hasDiskPressure: boolean;
  hasPIDPressure: boolean;
  isUnderPressure: boolean;
  summary: string;
}

export function getNodePressure(node: KubernetesResource | NodeResource | null | undefined): NodePressureResult {
  if (!node) {
    return { hasMemoryPressure: false, hasDiskPressure: false, hasPIDPressure: false, isUnderPressure: false, summary: 'Unavailable' };
  }

  const conditions = (node.conditions || (node.statusSummary as any)?.conditions || []) as any[];

  const hasMemoryPressure = conditions.some(
    (c) => c.type === 'MemoryPressure' && (c.status === 'True' || c.status === true)
  );
  const hasDiskPressure = conditions.some(
    (c) => c.type === 'DiskPressure' && (c.status === 'True' || c.status === true)
  );
  const hasPIDPressure = conditions.some(
    (c) => c.type === 'PIDPressure' && (c.status === 'True' || c.status === true)
  );

  const isUnderPressure = hasMemoryPressure || hasDiskPressure || hasPIDPressure;

  const pressures: string[] = [];
  if (hasMemoryPressure) pressures.push('MemoryPressure');
  if (hasDiskPressure) pressures.push('DiskPressure');
  if (hasPIDPressure) pressures.push('PIDPressure');

  return {
    hasMemoryPressure,
    hasDiskPressure,
    hasPIDPressure,
    isUnderPressure,
    summary: isUnderPressure ? pressures.join(', ') : 'None'
  };
}

export interface NodeMetadataResult {
  kubeletVersion: string;
  osImage: string;
  architecture: string;
  kernelVersion: string;
  containerRuntime: string;
  formatted: string;
}

export function getNodeMetadata(node: KubernetesResource | NodeResource | null | undefined): NodeMetadataResult {
  if (!node) {
    return {
      kubeletVersion: 'Unavailable',
      osImage: 'Unavailable',
      architecture: 'Unavailable',
      kernelVersion: 'Unavailable',
      containerRuntime: 'Unavailable',
      formatted: 'Unavailable'
    };
  }

  const statusSummary = (node.statusSummary || {}) as Record<string, any>;
  const nodeInfo = (statusSummary.nodeInfo || {}) as Record<string, any>;

  const kubeletVersion =
    nodeInfo.kubeletVersion ||
    statusSummary.kubeletVersion ||
    (node.specSummary as any)?.kubeletVersion ||
    'Unavailable';

  const osImage =
    nodeInfo.osImage ||
    statusSummary.osImage ||
    (node as any).osImage ||
    'Unavailable';

  const architecture =
    nodeInfo.architecture ||
    statusSummary.architecture ||
    (node as any).architecture ||
    'Unavailable';

  const kernelVersion =
    nodeInfo.kernelVersion ||
    statusSummary.kernelVersion ||
    'Unavailable';

  const containerRuntime =
    nodeInfo.containerRuntimeVersion ||
    statusSummary.containerRuntime ||
    'Unavailable';

  let formatted = osImage !== 'Unavailable' ? osImage : '';
  if (architecture !== 'Unavailable') {
    formatted = formatted ? `${formatted} (${architecture})` : architecture;
  }
  if (!formatted) formatted = kubeletVersion;

  return {
    kubeletVersion,
    osImage,
    architecture,
    kernelVersion,
    containerRuntime,
    formatted: formatted || 'Unavailable'
  };
}

// ==========================================
// 2. WORKLOAD REPLICA & STATUS HELPERS
// ==========================================

export interface WorkloadStatusResult {
  desired: number | null;
  ready: number | null;
  available: number | null;
  current: number | null;
  updated: number | null;
  misscheduled: number | null;
  succeeded: number | null;
  failed: number | null;
  active: number | null;
  formatted: string;
  isHealthy: boolean;
  isDegraded: boolean;
  kind: string;
}

export function getWorkloadStatus(resource: KubernetesResource | null | undefined): WorkloadStatusResult {
  if (!resource) {
    return {
      desired: null,
      ready: null,
      available: null,
      current: null,
      updated: null,
      misscheduled: null,
      succeeded: null,
      failed: null,
      active: null,
      formatted: 'Unavailable',
      isHealthy: false,
      isDegraded: false,
      kind: 'Unknown'
    };
  }

  const kind = resource.kind;
  const spec = (resource.specSummary || {}) as Record<string, any>;
  const status = (resource.statusSummary || {}) as Record<string, any>;

  // Kind-specific logic
  if (kind === 'DaemonSet') {
    // CRITICAL: NEVER use spec.replicas for DaemonSets
    const desired = status.desiredNumberScheduled !== undefined ? Number(status.desiredNumberScheduled) : (resource as any).desiredNumberScheduled ?? null;
    const current = status.currentNumberScheduled !== undefined ? Number(status.currentNumberScheduled) : null;
    const ready = status.numberReady !== undefined ? Number(status.numberReady) : (resource as any).numberReady ?? null;
    const available = status.numberAvailable !== undefined ? Number(status.numberAvailable) : (resource as any).numberAvailable ?? ready;
    const updated = status.updatedNumberScheduled !== undefined ? Number(status.updatedNumberScheduled) : null;
    const misscheduled = status.numberMisscheduled !== undefined ? Number(status.numberMisscheduled) : 0;

    let formatted = 'Unavailable';
    if (ready !== null && desired !== null) {
      formatted = `${ready} / ${desired}`;
    } else if (ready !== null) {
      formatted = `${ready} ready`;
    }

    const isHealthy = desired !== null && ready !== null && ready >= desired && (misscheduled === 0 || misscheduled === null);
    const isDegraded = (desired !== null && ready !== null && ready < desired) || (misscheduled !== null && misscheduled > 0);

    return {
      desired,
      ready,
      available,
      current,
      updated,
      misscheduled,
      succeeded: null,
      failed: null,
      active: null,
      formatted,
      isHealthy,
      isDegraded,
      kind
    };
  }

  if (kind === 'StatefulSet') {
    const desired = spec.replicas !== undefined ? Number(spec.replicas) : resource.specReplicas ?? status.replicas ?? 1;
    const ready = status.readyReplicas !== undefined ? Number(status.readyReplicas) : resource.readyReplicas ?? 0;
    const available = status.availableReplicas !== undefined ? Number(status.availableReplicas) : ready;
    const current = status.currentReplicas !== undefined ? Number(status.currentReplicas) : null;
    const updated = status.updatedReplicas !== undefined ? Number(status.updatedReplicas) : null;

    const formatted = `${ready} / ${desired}`;
    const isHealthy = ready >= desired;
    const isDegraded = ready < desired;

    return {
      desired,
      ready,
      available,
      current,
      updated,
      misscheduled: null,
      succeeded: null,
      failed: null,
      active: null,
      formatted,
      isHealthy,
      isDegraded,
      kind
    };
  }

  if (kind === 'Deployment' || kind === 'ReplicaSet' || kind === 'Rollout') {
    const desired =
      spec.replicas !== undefined
        ? Number(spec.replicas)
        : resource.specReplicas !== undefined
        ? Number(resource.specReplicas)
        : status.replicas !== undefined
        ? Number(status.replicas)
        : null;

    const ready =
      status.readyReplicas !== undefined
        ? Number(status.readyReplicas)
        : resource.readyReplicas !== undefined
        ? Number(resource.readyReplicas)
        : null;

    const available =
      status.availableReplicas !== undefined
        ? Number(status.availableReplicas)
        : resource.availableReplicas !== undefined
        ? Number(resource.availableReplicas)
        : ready;

    const updated = status.updatedReplicas !== undefined ? Number(status.updatedReplicas) : null;

    let formatted = 'Unavailable';
    if (ready !== null && desired !== null) {
      formatted = `${ready} / ${desired}`;
    } else if (ready !== null) {
      formatted = `${ready} ready`;
    } else if (desired !== null) {
      formatted = `${desired} desired`;
    }

    const isHealthy = desired !== null && ready !== null ? ready >= desired : true;
    const isDegraded = desired !== null && ready !== null ? ready < desired : false;

    return {
      desired,
      ready,
      available,
      current: null,
      updated,
      misscheduled: null,
      succeeded: null,
      failed: null,
      active: null,
      formatted,
      isHealthy,
      isDegraded,
      kind
    };
  }

  if (kind === 'Job') {
    const desired = spec.completions !== undefined ? Number(spec.completions) : 1;
    const succeeded = status.succeeded !== undefined ? Number(status.succeeded) : 0;
    const failed = status.failed !== undefined ? Number(status.failed) : 0;
    const active = status.active !== undefined ? Number(status.active) : 0;

    let formatted = `${succeeded} / ${desired} completed`;
    if (failed > 0) formatted += ` (${failed} failed)`;

    const isHealthy = failed === 0;
    const isDegraded = failed > 0;

    return {
      desired,
      ready: succeeded,
      available: succeeded,
      current: active,
      updated: null,
      misscheduled: null,
      succeeded,
      failed,
      active,
      formatted,
      isHealthy,
      isDegraded,
      kind
    };
  }

  if (kind === 'CronJob') {
    const activeJobs = Array.isArray(status.active) ? status.active.length : 0;
    const schedule = spec.schedule ? String(spec.schedule) : 'Periodic';
    return {
      desired: null,
      ready: activeJobs,
      available: activeJobs,
      current: activeJobs,
      updated: null,
      misscheduled: null,
      succeeded: null,
      failed: null,
      active: activeJobs,
      formatted: `${schedule} (${activeJobs} active)`,
      isHealthy: true,
      isDegraded: false,
      kind
    };
  }

  // Fallback for other resources: check if status has ready/replicas
  const desired = spec.replicas ?? (resource as any).replicas ?? null;
  const ready = status.readyReplicas ?? (resource as any).readyReplicas ?? null;
  const formatted = ready !== null && desired !== null ? `${ready} / ${desired}` : resource.status || '—';

  return {
    desired,
    ready,
    available: ready,
    current: null,
    updated: null,
    misscheduled: null,
    succeeded: null,
    failed: null,
    active: null,
    formatted,
    isHealthy: true,
    isDegraded: false,
    kind
  };
}

export function getWorkloadDesired(resource: KubernetesResource | null | undefined): number | null {
  return getWorkloadStatus(resource).desired;
}

export function getWorkloadReady(resource: KubernetesResource | null | undefined): number | null {
  return getWorkloadStatus(resource).ready;
}

export function getWorkloadAvailable(resource: KubernetesResource | null | undefined): number | null {
  return getWorkloadStatus(resource).available;
}

export function getWorkloadHealth(resource: KubernetesResource | null | undefined): 'HEALTHY' | 'WARNING' | 'CRITICAL' {
  if (!resource) return 'HEALTHY';
  if (resource.health === 'CRITICAL' || resource.health === 'WARNING') return resource.health;
  const status = getWorkloadStatus(resource);
  if (status.isDegraded) {
    return status.ready === 0 && (status.desired ?? 0) > 0 ? 'CRITICAL' : 'WARNING';
  }
  return 'HEALTHY';
}

// ==========================================
// 3. POD HELPERS
// ==========================================

export interface PodRestartCountResult {
  count: number | null;
  isReported: boolean;
  formatted: string;
}

export function getPodRestartCount(pod: KubernetesResource | PodResource | null | undefined): PodRestartCountResult {
  if (!pod) {
    return { count: null, isReported: false, formatted: 'Unavailable' };
  }

  // 1. Direct container list on pod
  const containers = pod.containers;
  const statusSummary = (pod.statusSummary || {}) as Record<string, any>;
  const statusContainers = [
    ...(Array.isArray(statusSummary.initContainerStatuses) ? statusSummary.initContainerStatuses : []),
    ...(Array.isArray(statusSummary.containerStatuses) ? statusSummary.containerStatuses : [])
  ];

  const candidateContainers = Array.isArray(containers) && containers.length > 0
    ? containers
    : statusContainers;

  if (candidateContainers.length > 0) {
    let totalRestarts = 0;
    let anyReported = false;

    for (const c of candidateContainers) {
      if (c && typeof c.restartCount === 'number' && Number.isFinite(c.restartCount)) {
        totalRestarts += c.restartCount;
        anyReported = true;
      }
    }

    if (anyReported) {
      return {
        count: totalRestarts,
        isReported: true,
        formatted: String(totalRestarts)
      };
    }
  }

  // 2. Direct restartCount on resource if populated
  if (typeof pod.restartCount === 'number' && Number.isFinite(pod.restartCount)) {
    return {
      count: pod.restartCount,
      isReported: true,
      formatted: String(pod.restartCount)
    };
  }

  // Missing telemetry: Return 'Unavailable', NEVER a fake 0!
  return {
    count: null,
    isReported: false,
    formatted: 'Unavailable'
  };
}

export function getPodHealth(pod: KubernetesResource | PodResource | null | undefined): 'HEALTHY' | 'WARNING' | 'CRITICAL' {
  if (!pod) return 'HEALTHY';
  if (pod.health === 'CRITICAL' || pod.health === 'WARNING') return pod.health;

  const status = pod.status;
  if (status === 'CrashLoopBackOff' || status === 'ImagePullBackOff' || status === 'OOMKilled' || status === 'Failed') {
    return 'CRITICAL';
  }
  if (status === 'Pending' || status === 'Unknown' || status === 'Error') {
    return 'WARNING';
  }
  return 'HEALTHY';
}

// ==========================================
// 4. SERVICE & ENDPOINT HELPERS
// ==========================================

export interface ServiceEndpointStatusResult {
  totalEndpoints: number | null;
  readyEndpoints: number | null;
  formatted: string;
  isSelectorless: boolean;
  isHeadless: boolean;
  isExternalName: boolean;
  isReported: boolean;
}

export function getServiceEndpointStatus(
  service: KubernetesResource | ServiceResource | null | undefined,
  allClusterResources?: KubernetesResource[]
): ServiceEndpointStatusResult {
  if (!service) {
    return {
      totalEndpoints: null,
      readyEndpoints: null,
      formatted: 'Unavailable',
      isSelectorless: false,
      isHeadless: false,
      isExternalName: false,
      isReported: false
    };
  }

  const spec = (service.specSummary || {}) as Record<string, any>;
  const status = (service.statusSummary || {}) as Record<string, any>;
  const svcType = spec.type || service.status || 'ClusterIP';
  const isExternalName = svcType === 'ExternalName';
  const isHeadless = spec.clusterIP === 'None';
  const hasSelector = spec.selector && Object.keys(spec.selector).length > 0;
  const isSelectorless = !hasSelector && !isExternalName;

  if (isExternalName) {
    return {
      totalEndpoints: null,
      readyEndpoints: null,
      formatted: spec.externalName ? `CNAME: ${spec.externalName}` : 'ExternalName',
      isSelectorless: false,
      isHeadless: false,
      isExternalName: true,
      isReported: true
    };
  }

  // 1. Direct status summaries
  let total = status.totalEndpoints ?? (service as any).totalEndpoints ?? null;
  let ready = status.readyEndpoints ?? (service as any).readyEndpoints ?? null;

  // 2. Discover from EndpointSlice resources in cluster if provided
  if ((total === null || ready === null) && allClusterResources && allClusterResources.length > 0) {
    const slices = allClusterResources.filter(
      (r) =>
        r.kind === 'EndpointSlice' &&
        (r.namespace || 'default') === (service.namespace || 'default') &&
        (r.labels?.['kubernetes.io/service-name'] === service.name ||
          r.name.startsWith(`${service.name}-`))
    );

    if (slices.length > 0) {
      let tCount = 0;
      let rCount = 0;
      for (const slice of slices) {
        const specSummary = (slice.specSummary || {}) as Record<string, any>;
        const endpoints = (specSummary.endpoints || (slice as any).endpoints || []) as any[];
        tCount += endpoints.length;
        rCount += endpoints.filter((ep: any) => ep.conditions?.ready !== false).length;
      }
      total = tCount;
      ready = rCount;
    }
  }

  if (total !== null && ready !== null) {
    return {
      totalEndpoints: total,
      readyEndpoints: ready,
      formatted: `${ready} / ${total} endpoints ready`,
      isSelectorless,
      isHeadless,
      isExternalName,
      isReported: true
    };
  }

  return {
    totalEndpoints: null,
    readyEndpoints: null,
    formatted: isSelectorless ? 'Selectorless (Manual Endpoints)' : isHeadless ? 'Headless' : 'Unavailable',
    isSelectorless,
    isHeadless,
    isExternalName,
    isReported: false
  };
}

export function getServiceHealth(
  service: KubernetesResource | ServiceResource | null | undefined,
  allClusterResources?: KubernetesResource[]
): 'HEALTHY' | 'WARNING' | 'CRITICAL' {
  if (!service) return 'HEALTHY';
  const endpointStatus = getServiceEndpointStatus(service, allClusterResources);

  if (endpointStatus.isExternalName) return 'HEALTHY';

  // If selector exists and endpoints report 0 ready endpoints -> CRITICAL traffic failure!
  if (!endpointStatus.isSelectorless && endpointStatus.isReported) {
    if (endpointStatus.readyEndpoints === 0 && (endpointStatus.totalEndpoints ?? 0) > 0) {
      return 'CRITICAL';
    }
    if ((endpointStatus.readyEndpoints ?? 0) === 0) {
      return 'CRITICAL';
    }
    if (endpointStatus.totalEndpoints !== null && endpointStatus.readyEndpoints !== null && endpointStatus.readyEndpoints < endpointStatus.totalEndpoints) {
      return 'WARNING';
    }
  }

  return service.health || 'HEALTHY';
}

// ==========================================
// 5. STORAGE / PVC HELPERS
// ==========================================

export interface StorageCapacityResult {
  requested: string | null;
  provisioned: string | null;
  formatted: string;
  isReported: boolean;
}

export function getStorageCapacity(resource: KubernetesResource | null | undefined): StorageCapacityResult {
  if (!resource) {
    return { requested: null, provisioned: null, formatted: 'Unavailable', isReported: false };
  }

  const spec = (resource.specSummary || {}) as Record<string, any>;
  const status = (resource.statusSummary || {}) as Record<string, any>;

  const requested = spec.resources?.requests?.storage || null;

  let provisioned: string | null = null;
  if (typeof status.capacity === 'string') {
    provisioned = status.capacity;
  } else if (status.capacity && typeof status.capacity.storage === 'string') {
    provisioned = status.capacity.storage;
  }

  const isReported = provisioned !== null || requested !== null;
  const formatted = provisioned || requested || 'Unavailable';

  return {
    requested,
    provisioned,
    formatted,
    isReported
  };
}

export interface StorageUsageResult {
  used: string | null;
  percent: number | null;
  formatted: string;
  isReported: boolean;
}

export function getStorageUsage(resource: KubernetesResource | null | undefined): StorageUsageResult {
  if (!resource) {
    return { used: null, percent: null, formatted: 'Unavailable', isReported: false };
  }

  const status = (resource.statusSummary || {}) as Record<string, any>;
  const allocated = status.allocatedResources?.storage || null;

  return {
    used: allocated,
    percent: null,
    formatted: allocated || 'Unavailable',
    isReported: allocated !== null
  };
}

// ==========================================
// 6. INCIDENT DURATION & TIMING HELPERS
// ==========================================

export interface IncidentDurationResult {
  durationMs: number | null;
  durationMinutes: number | null;
  formatted: string;
  isReported: boolean;
}

export function getIncidentDuration(incident: {
  createdAt?: number;
  firstSeenAt?: number;
  detectedAt?: number;
  resolvedAt?: number;
  acknowledgedAt?: number;
  durationMinutes?: number;
} | null | undefined): IncidentDurationResult {
  if (!incident) {
    return { durationMs: null, durationMinutes: null, formatted: 'Duration unavailable', isReported: false };
  }

  const startTime = incident.firstSeenAt || incident.detectedAt || incident.createdAt;
  const endTime = incident.resolvedAt;

  if (startTime && endTime && endTime >= startTime) {
    const diffMs = endTime - startTime;
    const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
    return {
      durationMs: diffMs,
      durationMinutes: diffMinutes,
      formatted: `${diffMinutes}m`,
      isReported: true
    };
  }

  if (startTime && !endTime) {
    const elapsedMs = Math.max(0, Date.now() - startTime);
    const elapsedMinutes = Math.max(1, Math.round(elapsedMs / 60000));
    return {
      durationMs: elapsedMs,
      durationMinutes: elapsedMinutes,
      formatted: `${elapsedMinutes}m (Active)`,
      isReported: true
    };
  }

  if (typeof incident.durationMinutes === 'number' && Number.isFinite(incident.durationMinutes) && incident.durationMinutes > 0) {
    return {
      durationMs: incident.durationMinutes * 60000,
      durationMinutes: incident.durationMinutes,
      formatted: `${incident.durationMinutes}m`,
      isReported: true
    };
  }

  return {
    durationMs: null,
    durationMinutes: null,
    formatted: 'Duration unavailable',
    isReported: false
  };
}
