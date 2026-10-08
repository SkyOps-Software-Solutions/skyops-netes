/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SkyOps Centralized Infrastructure & Cloud Metadata Engine
 *
 * Provides authoritative discovery, normalization, and cluster-level aggregation
 * of real Kubernetes infrastructure metadata (Provider, Region, Availability Zone, Instance Type).
 */

export type CloudProvider = 'AWS' | 'GCP' | 'Azure' | 'Other' | 'Self-hosted' | 'Hybrid' | 'Unknown';

export interface NodeCloudMetadata {
  nodeName: string;
  provider: CloudProvider;
  region: string;
  zone: string;
  instanceType: string;
  providerID?: string;
  isControlPlane?: boolean;
}

export interface ClusterCloudMetadata {
  provider: CloudProvider;
  region: string;
  regions: string[];
  zones: string[];
  instanceTypes: string[];
  nodes: NodeCloudMetadata[];
}

/**
 * Normalizes provider string into canonical CloudProvider:
 * AWS | GCP | Azure | Other | Self-hosted | Hybrid | Unknown
 */
export function normalizeCloudProvider(rawProvider?: string): CloudProvider {
  if (!rawProvider) return 'Unknown';
  const p = rawProvider.trim().toLowerCase();
  if (p === 'aws' || p === 'eks' || p.startsWith('aws:') || p.startsWith('aws:///')) return 'AWS';
  if (p === 'gcp' || p === 'gke' || p.startsWith('gce:') || p.startsWith('gce://') || p.startsWith('gcp:')) return 'GCP';
  if (p === 'azure' || p === 'aks' || p.startsWith('azure:') || p.startsWith('azure://')) return 'Azure';
  if (
    p === 'self-hosted' ||
    p === 'self_hosted' ||
    p === 'baremetal' ||
    p === 'bare-metal' ||
    p === 'k3s' ||
    p === 'kind' ||
    p === 'minikube' ||
    p === 'microk8s' ||
    p === 'kubeadm' ||
    p === 'on-prem' ||
    p === 'on-premise'
  ) return 'Self-hosted';
  if (p === 'hybrid') return 'Hybrid';
  if (
    p === 'other' ||
    p === 'digitalocean' ||
    p === 'doks' ||
    p === 'linode' ||
    p === 'lke' ||
    p === 'civo' ||
    p === 'equinix' ||
    p === 'hetzner' ||
    p === 'hcloud' ||
    p === 'vultr' ||
    p === 'scaleway' ||
    p === 'oracle' ||
    p === 'oci' ||
    p === 'alibaba' ||
    p === 'openstack'
  ) return 'Other';
  return 'Unknown';
}

/**
 * Helper to format raw Kubernetes memory capacity into clean human-readable GiB
 */
export function formatK8sMemory(memStr?: string): string {
  if (!memStr || typeof memStr !== 'string') return '';
  const trimmed = memStr.trim();
  if (trimmed.endsWith('Ki')) {
    const kib = parseInt(trimmed, 10);
    if (!isNaN(kib)) {
      const gib = (kib / (1024 * 1024)).toFixed(1).replace(/\.0$/, '');
      return `${gib} GiB`;
    }
  }
  if (trimmed.endsWith('Mi')) {
    const mib = parseInt(trimmed, 10);
    if (!isNaN(mib)) {
      const gib = (mib / 1024).toFixed(1).replace(/\.0$/, '');
      return `${gib} GiB`;
    }
  }
  if (trimmed.endsWith('Gi')) {
    return `${trimmed.replace('Gi', '').trim()} GiB`;
  }
  return trimmed;
}

/**
 * Helper to format raw Kubernetes CPU capacity into clean vCPU
 */
export function formatK8sCpu(cpuStr?: string): string {
  if (!cpuStr || typeof cpuStr !== 'string') return '';
  const trimmed = cpuStr.trim();
  if (trimmed.endsWith('m')) {
    const millicores = parseInt(trimmed, 10);
    return `${(millicores / 1000).toFixed(1)} vCPU`;
  }
  return `${trimmed} vCPU`;
}

/**
 * Discovers real CloudProvider for a Node using node.spec.providerID and node labels.
 */
export function detectNodeProvider(
  providerID?: string,
  labels: Record<string, string> = {},
  existingProviderMetadata?: string,
  nodeName?: string
): CloudProvider {
  // 1. Primary: node.spec.providerID
  if (providerID && typeof providerID === 'string') {
    const pid = providerID.trim().toLowerCase();
    if (pid.startsWith('aws://') || pid.startsWith('aws:')) {
      return 'AWS';
    }
    if (pid.startsWith('gce://') || pid.startsWith('gce:') || pid.startsWith('gcp://')) {
      return 'GCP';
    }
    if (pid.startsWith('azure://') || pid.startsWith('azure:')) {
      return 'Azure';
    }
    if (
      pid.startsWith('kind://') ||
      pid.startsWith('k3s://') ||
      pid.startsWith('minikube://') ||
      pid.startsWith('microk8s://')
    ) {
      return 'Self-hosted';
    }
    if (
      pid.startsWith('digitalocean://') ||
      pid.startsWith('linode://') ||
      pid.startsWith('oci://') ||
      pid.startsWith('equinix://') ||
      pid.startsWith('openstack://') ||
      pid.startsWith('hcloud://') ||
      pid.startsWith('scaleway://') ||
      pid.startsWith('vultr://')
    ) {
      return 'Other';
    }
  }

  // 2. Secondary: Agent-provided node labels
  const labelKeys = Object.keys(labels);
  if (
    labelKeys.some((k) => k.startsWith('eks.amazonaws.com') || k.includes('alpha.eksctl.io') || k.includes('k8s.io/cloud-provider-aws')) ||
    labels['node.kubernetes.io/instance-type']?.match(/^[a-z][0-9][a-z]?\.[a-z0-9]+$/i)
  ) {
    return 'AWS';
  }
  if (
    labelKeys.some((k) => k.startsWith('cloud.google.com') || k.includes('gke-') || k.includes('topology.gke.io')) ||
    labels['node.kubernetes.io/instance-type']?.match(/^(e2|n1|n2|n2d|c2|c2d|m1|m2|t2d|a2|g2)-[a-z0-9-]+$/i)
  ) {
    return 'GCP';
  }
  if (
    labelKeys.some((k) => k.includes('azure.com') || k.includes('aks-')) ||
    labels['node.kubernetes.io/instance-type']?.startsWith('Standard_')
  ) {
    return 'Azure';
  }
  if (
    labelKeys.some((k) => k.includes('doks.digitalocean.com') || k.includes('digitalocean.com'))
  ) {
    return 'Other';
  }
  if (
    labelKeys.some((k) => k.includes('k3s.io') || k.includes('minikube.k8s.io') || k.includes('kind.x-k8s.io') || k.includes('microk8s.io'))
  ) {
    return 'Self-hosted';
  }

  // 3. Fallback: Existing provider metadata if already collected by agent or cluster context
  if (existingProviderMetadata) {
    const normalized = normalizeCloudProvider(existingProviderMetadata);
    if (normalized !== 'Unknown') return normalized;
  }

  // 4. Node characteristics check: Vanilla kubeadm / bare-metal / on-premise clusters
  const lowerName = (nodeName || '').toLowerCase();
  const isKubeadmNode =
    lowerName === 'controlplane' ||
    lowerName === 'node01' ||
    lowerName === 'node02' ||
    lowerName.startsWith('master') ||
    lowerName.startsWith('worker') ||
    labelKeys.some((k) => k.includes('node-role.kubernetes.io/control-plane') || k.includes('node-role.kubernetes.io/master'));

  if (isKubeadmNode) {
    return 'Self-hosted';
  }

  return 'Unknown';
}

/**
 * Discovers Region from Kubernetes node labels, zone heuristics, or providerID.
 */
export function detectNodeRegion(
  labels: Record<string, string> = {},
  providerID?: string,
  fallbackRegion?: string
): string {
  const rawRegion =
    labels['topology.kubernetes.io/region'] ||
    labels['failure-domain.beta.kubernetes.io/region'] ||
    labels['k8s.io/region'] ||
    labels['region'];

  if (rawRegion && typeof rawRegion === 'string' && rawRegion.trim()) {
    return rawRegion.trim().toLowerCase();
  }

  // Heuristic: Extract region from zone label (e.g. us-east-1a -> us-east-1, us-central1-b -> us-central1)
  const zoneLabel =
    labels['topology.kubernetes.io/zone'] ||
    labels['failure-domain.beta.kubernetes.io/zone'] ||
    labels['topology.gke.io/zone'];

  if (zoneLabel && typeof zoneLabel === 'string') {
    const trimmedZone = zoneLabel.trim().toLowerCase();
    // Match standard pattern: <region>-<zone-letter or number> (e.g., us-east-1a, ap-south-1b, europe-west3-c)
    const match = trimmedZone.match(/^([a-z]+-[a-z]+-\d+|[a-z]+-\d+|[a-z]+-[a-z]+\d+)[a-z]$/i);
    if (match && match[1]) {
      return match[1];
    }
    // GKE / European / Azure regions e.g. westeurope-1 -> westeurope
    const azureMatch = trimmedZone.match(/^([a-z]+)-\d+$/i);
    if (azureMatch && azureMatch[1]) {
      return azureMatch[1];
    }
  }

  // Check providerID for embedded region
  if (providerID && typeof providerID === 'string') {
    const pid = providerID.toLowerCase();
    const awsMatch = pid.match(/aws:\/\/\/([a-z]+-[a-z]+-\d+)[a-z]\//i);
    if (awsMatch && awsMatch[1]) return awsMatch[1];
    const gceMatch = pid.match(/gce:\/\/[^/]+\/([a-z]+-[a-z]+\d+)-[a-z]\//i);
    if (gceMatch && gceMatch[1]) return gceMatch[1];
  }

  if (fallbackRegion && fallbackRegion !== 'Unknown' && fallbackRegion.trim()) {
    return fallbackRegion.trim().toLowerCase();
  }

  return 'Unknown';
}

/**
 * Discovers Availability Zone from Kubernetes node labels or providerID.
 */
export function detectNodeZone(
  labels: Record<string, string> = {},
  providerID?: string,
  fallbackZone?: string
): string {
  const rawZone =
    labels['topology.kubernetes.io/zone'] ||
    labels['failure-domain.beta.kubernetes.io/zone'] ||
    labels['topology.gke.io/zone'] ||
    labels['topology.ebs.csi.aws.com/zone'] ||
    labels['zone'];

  if (rawZone && typeof rawZone === 'string' && rawZone.trim()) {
    return rawZone.trim().toLowerCase();
  }

  // Check providerID
  if (providerID && typeof providerID === 'string') {
    const pid = providerID.toLowerCase();
    const awsMatch = pid.match(/aws:\/\/\/([a-z]+-[a-z]+-\d+[a-z])\//i);
    if (awsMatch && awsMatch[1]) return awsMatch[1];
    const gceMatch = pid.match(/gce:\/\/[^/]+\/([a-z]+-[a-z]+\d+-[a-z])\//i);
    if (gceMatch && gceMatch[1]) return gceMatch[1];
  }

  if (fallbackZone && fallbackZone !== 'Unknown' && fallbackZone.trim()) {
    return fallbackZone.trim().toLowerCase();
  }

  return 'Unknown';
}

/**
 * Discovers Instance Type from Kubernetes node labels, or synthesizes real hardware capacity.
 */
export function detectNodeInstanceType(
  labels: Record<string, string> = {},
  nodeStatusSummary?: any
): string {
  const rawType =
    labels['node.kubernetes.io/instance-type'] ||
    labels['beta.kubernetes.io/instance-type'] ||
    labels['k8s.io/instance-type'] ||
    labels['instance.hedging.internal'] ||
    labels['node.kubernetes.io/instance'] ||
    labels['instance-type'];

  if (rawType && typeof rawType === 'string' && rawType.trim()) {
    return rawType.trim();
  }

  // Synthesize from real hardware capacity/allocatable if present
  if (nodeStatusSummary) {
    const capacity = nodeStatusSummary.capacity || {};
    const allocatable = nodeStatusSummary.allocatable || {};
    const rawCpu = capacity.cpu || allocatable.cpu || nodeStatusSummary.allocatableCpu;
    const rawMem = capacity.memory || allocatable.memory || nodeStatusSummary.allocatableMemory;

    const formattedCpu = formatK8sCpu(rawCpu);
    const formattedMem = formatK8sMemory(rawMem);

    if (formattedCpu && formattedMem) {
      return `${formattedCpu} • ${formattedMem}`;
    }
    if (formattedCpu) {
      return formattedCpu;
    }
  }

  return 'Unknown';
}

/**
 * Discovers complete real Cloud metadata for an individual Node.
 */
export function discoverNodeCloudMetadata(
  node: any,
  clusterFallback?: { provider?: string; region?: string }
): NodeCloudMetadata {
  const nodeName = node.name || node.metadata?.name || 'unknown-node';
  const labels: Record<string, string> =
    node.labels ||
    node.metadata?.labels ||
    node.raw?.metadata?.labels ||
    {};

  const providerID: string | undefined =
    node.specSummary?.providerID ||
    node.spec?.providerID ||
    node.providerID ||
    node.raw?.spec?.providerID;

  const existingProvider =
    node.provider ||
    node.cloudProvider ||
    node.specSummary?.provider ||
    clusterFallback?.provider;

  const statusSummary = node.statusSummary || node.status || {};

  const provider = detectNodeProvider(providerID, labels, existingProvider, nodeName);
  const region = detectNodeRegion(labels, providerID, clusterFallback?.region);
  const zone = detectNodeZone(labels, providerID);
  const instanceType = detectNodeInstanceType(labels, statusSummary);

  const isControlPlane =
    nodeName.toLowerCase().includes('controlplane') ||
    nodeName.toLowerCase().includes('master') ||
    Object.keys(labels).some((k) => k.includes('control-plane') || k.includes('master'));

  return {
    nodeName,
    provider,
    region,
    zone,
    instanceType,
    providerID,
    isControlPlane
  };
}

/**
 * Aggregates cluster-level cloud infrastructure metadata from its nodes according to specification rules:
 * - Cluster Provider:
 *   - If all nodes share the same provider, that is the cluster provider.
 *   - If mixed, mark Hybrid.
 *   - If no nodes, fallback if provided.
 * - Cluster Regions:
 *   - List of distinct regions across all nodes.
 *   - Display primary region (or multi-region indicator).
 * - Cluster Zones:
 *   - List of distinct zones across all nodes.
 * - Cluster Instance Types:
 *   - Distinct node types across the cluster.
 */
export function aggregateClusterCloudMetadata(
  nodes: any[],
  fallbackClusterProvider?: string,
  fallbackClusterRegion?: string
): ClusterCloudMetadata {
  if (!nodes || nodes.length === 0) {
    const fallbackNorm = fallbackClusterProvider ? normalizeCloudProvider(fallbackClusterProvider) : 'Unknown';
    const fallbackReg = fallbackClusterRegion || 'Unknown';
    return {
      provider: fallbackNorm,
      region: fallbackReg,
      regions: fallbackReg !== 'Unknown' ? [fallbackReg] : [],
      zones: [],
      instanceTypes: [],
      nodes: []
    };
  }

  const nodeMetas = nodes.map((n) =>
    discoverNodeCloudMetadata(n, { provider: fallbackClusterProvider, region: fallbackClusterRegion })
  );

  // 1. Cluster Provider
  const nodeProviders = nodeMetas.map((n) => n.provider).filter((p) => p !== 'Unknown');
  const distinctProviders = Array.from(new Set(nodeProviders));

  let clusterProvider: CloudProvider = 'Unknown';
  if (distinctProviders.length === 1) {
    clusterProvider = distinctProviders[0];
  } else if (distinctProviders.length > 1) {
    clusterProvider = 'Hybrid';
  } else if (fallbackClusterProvider) {
    clusterProvider = normalizeCloudProvider(fallbackClusterProvider);
  } else {
    // If all nodes are self-hosted or bare-metal
    clusterProvider = 'Self-hosted';
  }

  // 2. Cluster Regions
  const distinctRegions = Array.from(
    new Set(nodeMetas.map((n) => n.region).filter((r) => r !== 'Unknown'))
  ).sort();

  let primaryRegion = 'Unknown';
  if (distinctRegions.length === 1) {
    primaryRegion = distinctRegions[0];
  } else if (distinctRegions.length > 1) {
    primaryRegion = distinctRegions.join(', ');
  } else if (fallbackClusterRegion && fallbackClusterRegion !== 'Unknown') {
    primaryRegion = fallbackClusterRegion;
    distinctRegions.push(fallbackClusterRegion);
  }

  // 3. Cluster Zones
  const distinctZones = Array.from(
    new Set(nodeMetas.map((n) => n.zone).filter((z) => z !== 'Unknown'))
  ).sort();

  // 4. Cluster Instance Types
  const distinctInstanceTypes = Array.from(
    new Set(nodeMetas.map((n) => n.instanceType).filter((t) => t !== 'Unknown'))
  ).sort();

  return {
    provider: clusterProvider,
    region: primaryRegion,
    regions: distinctRegions,
    zones: distinctZones,
    instanceTypes: distinctInstanceTypes,
    nodes: nodeMetas
  };
}

/**
 * Visual styling descriptor for Cloud Providers
 */
export interface CloudProviderVisual {
  label: string;
  shortLabel: string;
  badgeClass: string;
  iconName: 'aws' | 'gcp' | 'azure' | 'self-hosted' | 'other' | 'hybrid' | 'unknown';
}

export function getCloudProviderVisual(provider?: string): CloudProviderVisual {
  const norm = normalizeCloudProvider(provider);
  switch (norm) {
    case 'AWS':
      return {
        label: 'AWS (Amazon Web Services)',
        shortLabel: 'AWS',
        badgeClass: 'bg-amber-950/60 text-amber-300 border-amber-700/80',
        iconName: 'aws'
      };
    case 'GCP':
      return {
        label: 'Google Cloud (GCP)',
        shortLabel: 'GCP',
        badgeClass: 'bg-sky-950/60 text-sky-300 border-sky-700/80',
        iconName: 'gcp'
      };
    case 'Azure':
      return {
        label: 'Microsoft Azure',
        shortLabel: 'Azure',
        badgeClass: 'bg-blue-950/60 text-blue-300 border-blue-700/80',
        iconName: 'azure'
      };
    case 'Self-hosted':
      return {
        label: 'Self-Hosted / Bare-Metal',
        shortLabel: 'Self-Hosted',
        badgeClass: 'bg-purple-950/60 text-purple-300 border-purple-700/80',
        iconName: 'self-hosted'
      };
    case 'Hybrid':
      return {
        label: 'Hybrid Multi-Cloud',
        shortLabel: 'Hybrid',
        badgeClass: 'bg-indigo-950/60 text-indigo-300 border-indigo-700/80',
        iconName: 'hybrid'
      };
    case 'Other':
      return {
        label: 'Cloud Infrastructure',
        shortLabel: 'Cloud',
        badgeClass: 'bg-teal-950/60 text-teal-300 border-teal-700/80',
        iconName: 'other'
      };
    default:
      return {
        label: 'Kubernetes Cluster',
        shortLabel: 'K8s',
        badgeClass: 'bg-zinc-850 text-zinc-300 border-zinc-700',
        iconName: 'unknown'
      };
  }
}
