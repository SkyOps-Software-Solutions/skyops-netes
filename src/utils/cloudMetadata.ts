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
 * AWS | GCP | Azure | Other | Self-hosted | Unknown
 *
 * NOTE: Never infers provider from the cluster name.
 */
export function normalizeCloudProvider(rawProvider?: string): CloudProvider {
  if (!rawProvider) return 'Unknown';
  const p = rawProvider.trim().toLowerCase();
  if (p === 'aws' || p === 'eks' || p.startsWith('aws:') || p.startsWith('aws:///')) return 'AWS';
  if (p === 'gcp' || p === 'gke' || p.startsWith('gce:') || p.startsWith('gce://') || p.startsWith('gcp:')) return 'GCP';
  if (p === 'azure' || p === 'aks' || p.startsWith('azure:') || p.startsWith('azure://')) return 'Azure';
  if (p === 'self-hosted' || p === 'self_hosted' || p === 'baremetal' || p === 'k3s' || p === 'kind' || p === 'minikube') return 'Self-hosted';
  if (p === 'hybrid') return 'Hybrid';
  if (p === 'other' || p === 'digitalocean' || p === 'linode' || p === 'civo' || p === 'equinix') return 'Other';
  return 'Unknown';
}

/**
 * Discovers real CloudProvider for a Node using node.spec.providerID and node labels.
 */
export function detectNodeProvider(
  providerID?: string,
  labels: Record<string, string> = {},
  existingProviderMetadata?: string
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
      pid.startsWith('openstack://')
    ) {
      return 'Other';
    }
  }

  // 2. Secondary: Agent-provided node labels
  const labelKeys = Object.keys(labels);
  if (
    labelKeys.some((k) => k.startsWith('eks.amazonaws.com') || k.includes('alpha.eksctl.io')) ||
    labels['node.kubernetes.io/instance-type']?.match(/^[a-z][0-9][a-z]?\.[a-z0-9]+$/i)
  ) {
    return 'AWS';
  }
  if (
    labelKeys.some((k) => k.startsWith('cloud.google.com') || k.includes('gke-')) ||
    labels['node.kubernetes.io/instance-type']?.match(/^(e2|n1|n2|n2d|c2|c2d|m1|m2|t2d|a2)-[a-z0-9-]+$/i)
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
    labelKeys.some((k) => k.includes('k3s.io') || k.includes('minikube.k8s.io') || k.includes('kind.x-k8s.io'))
  ) {
    return 'Self-hosted';
  }

  // 3. Fallback: Existing provider metadata if already collected by agent
  if (existingProviderMetadata) {
    const normalized = normalizeCloudProvider(existingProviderMetadata);
    if (normalized !== 'Unknown') return normalized;
  }

  return 'Unknown';
}

/**
 * Discovers Region from Kubernetes node labels:
 * Primary: topology.kubernetes.io/region
 * Fallback: failure-domain.beta.kubernetes.io/region
 */
export function detectNodeRegion(labels: Record<string, string> = {}): string {
  const rawRegion =
    labels['topology.kubernetes.io/region'] ||
    labels['failure-domain.beta.kubernetes.io/region'];

  if (!rawRegion || typeof rawRegion !== 'string' || !rawRegion.trim()) {
    return 'Unknown';
  }

  // Normalize region codes (e.g., lowercase trimmed)
  return rawRegion.trim().toLowerCase();
}

/**
 * Discovers Availability Zone from Kubernetes node labels:
 * Primary: topology.kubernetes.io/zone
 * Fallback: failure-domain.beta.kubernetes.io/zone
 */
export function detectNodeZone(labels: Record<string, string> = {}): string {
  const rawZone =
    labels['topology.kubernetes.io/zone'] ||
    labels['failure-domain.beta.kubernetes.io/zone'];

  if (!rawZone || typeof rawZone !== 'string' || !rawZone.trim()) {
    return 'Unknown';
  }

  return rawZone.trim().toLowerCase();
}

/**
 * Discovers Instance Type from Kubernetes node labels:
 * Primary: node.kubernetes.io/instance-type
 * Fallback: beta.kubernetes.io/instance-type
 */
export function detectNodeInstanceType(labels: Record<string, string> = {}): string {
  const rawType =
    labels['node.kubernetes.io/instance-type'] ||
    labels['beta.kubernetes.io/instance-type'];

  if (!rawType || typeof rawType !== 'string' || !rawType.trim()) {
    return 'Unknown';
  }

  return rawType.trim();
}

/**
 * Discovers complete real Cloud metadata for an individual Node.
 */
export function discoverNodeCloudMetadata(node: any): NodeCloudMetadata {
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
    node.specSummary?.provider;

  const provider = detectNodeProvider(providerID, labels, existingProvider);
  const region = detectNodeRegion(labels);
  const zone = detectNodeZone(labels);
  const instanceType = detectNodeInstanceType(labels);

  return {
    nodeName,
    provider,
    region,
    zone,
    instanceType,
    providerID
  };
}

/**
 * Aggregates cluster-level cloud infrastructure metadata from its nodes according to specification rules:
 * - Cluster Provider:
 *   - If all nodes share the same provider, that is the cluster provider.
 *   - If mixed, mark Hybrid.
 *   - If no nodes, Unknown (or fallback if provided).
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
  fallbackClusterProvider?: string
): ClusterCloudMetadata {
  if (!nodes || nodes.length === 0) {
    const fallbackNorm = fallbackClusterProvider ? normalizeCloudProvider(fallbackClusterProvider) : 'Unknown';
    return {
      provider: fallbackNorm,
      region: 'Unknown',
      regions: [],
      zones: [],
      instanceTypes: [],
      nodes: []
    };
  }

  const nodeMetas = nodes.map(discoverNodeCloudMetadata);

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
