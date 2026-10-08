/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SkyOps Canonical Kubernetes Resource Model & Type System
 */

import { ConditionDiagnostic, ContainerDiagnostic, K8sEvent, ResourceMetrics, ResourceMetricValue } from './index';
import type { NodeCloudMetadata } from '../utils/cloudMetadata';

export type WorkloadKind = 'Deployment' | 'StatefulSet' | 'DaemonSet' | 'ReplicaSet' | 'Job' | 'CronJob' | 'Rollout';
export type ResourceHealthStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';

// Common base fields for all canonical Kubernetes resources
export interface BaseKubernetesResource {
  id: string;
  clusterId: string;
  clusterName?: string;
  kind: string;
  namespace: string;
  name: string;
  status: string;
  health: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  createdAt: number;
  updatedAt: number;
  uid?: string;
  generation?: number;
  apiVersion?: string;
  nodeName?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  ownerReferences?: Array<{ uid?: string; kind?: string; name?: string; controller?: boolean }>;
  conditions?: ConditionDiagnostic[];
  containers?: ContainerDiagnostic[];
  events?: K8sEvent[];
  observedAt?: number;
  ingestedAt?: number;
  metrics?: ResourceMetrics;
}

// 1. Node Model
export interface NodeCapacityMap {
  cpu?: string;
  memory?: string;
  pods?: string;
  ephemeralStorage?: string;
  [key: string]: string | undefined;
}

export interface NodeSystemInfo {
  kubeletVersion?: string;
  osImage?: string;
  architecture?: string;
  kernelVersion?: string;
  containerRuntime?: string;
  containerRuntimeVersion?: string;
  operatingSystem?: string;
  bootID?: string;
  machineID?: string;
}

export interface NodeStatusSummary {
  capacity?: NodeCapacityMap;
  allocatable?: NodeCapacityMap;
  nodeInfo?: NodeSystemInfo;
  kubeletVersion?: string;
  osImage?: string;
  architecture?: string;
  kernelVersion?: string;
  containerRuntime?: string;
  conditions?: ConditionDiagnostic[];
  usage?: {
    cpu?: string | number;
    memory?: string | number;
  };
  cpuUsage?: string | number;
  memoryUsage?: string | number;
  metricsObservedAt?: number;
  addresses?: Array<{ type: string; address: string }>;
  images?: Array<{ names: string[]; sizeBytes?: number }>;
  volumesInUse?: string[];
}

export interface NodeResource extends BaseKubernetesResource {
  kind: 'Node';
  statusSummary?: NodeStatusSummary;
  specSummary?: {
    podCIDR?: string;
    podCIDRs?: string[];
    providerID?: string;
    taints?: Array<{ key: string; value?: string; effect: string }>;
    unschedulable?: boolean;
  };
  cloudMetadata?: NodeCloudMetadata;
}

// 2. Deployment Model
export interface DeploymentResource extends BaseKubernetesResource {
  kind: 'Deployment';
  specSummary?: {
    replicas?: number;
    selector?: { matchLabels?: Record<string, string> };
    strategy?: { type: string };
    template?: { spec?: any };
  };
  statusSummary?: {
    replicas?: number;
    readyReplicas?: number;
    availableReplicas?: number;
    updatedReplicas?: number;
    unavailableReplicas?: number;
    collisionCount?: number;
    conditions?: ConditionDiagnostic[];
  };
  specReplicas?: number;
  readyReplicas?: number;
  availableReplicas?: number;
  updatedReplicas?: number;
}

// 3. StatefulSet Model
export interface StatefulSetResource extends BaseKubernetesResource {
  kind: 'StatefulSet';
  specSummary?: {
    replicas?: number;
    serviceName?: string;
    selector?: { matchLabels?: Record<string, string> };
    template?: { spec?: any };
  };
  statusSummary?: {
    replicas?: number;
    readyReplicas?: number;
    availableReplicas?: number;
    currentReplicas?: number;
    updatedReplicas?: number;
    currentRevision?: string;
    updateRevision?: string;
    collisionCount?: number;
    conditions?: ConditionDiagnostic[];
  };
  specReplicas?: number;
  readyReplicas?: number;
  availableReplicas?: number;
  currentReplicas?: number;
  updatedReplicas?: number;
}

// 4. DaemonSet Model (CRITICAL: Never uses spec.replicas)
export interface DaemonSetResource extends BaseKubernetesResource {
  kind: 'DaemonSet';
  specSummary?: {
    selector?: { matchLabels?: Record<string, string> };
    template?: { spec?: any };
    updateStrategy?: { type: string };
  };
  statusSummary?: {
    desiredNumberScheduled?: number;
    currentNumberScheduled?: number;
    numberReady?: number;
    numberAvailable?: number;
    numberMisscheduled?: number;
    updatedNumberScheduled?: number;
    numberUnavailable?: number;
    conditions?: ConditionDiagnostic[];
  };
  desiredNumberScheduled?: number;
  numberReady?: number;
  numberAvailable?: number;
  numberMisscheduled?: number;
  updatedNumberScheduled?: number;
}

// 5. ReplicaSet Model
export interface ReplicaSetResource extends BaseKubernetesResource {
  kind: 'ReplicaSet';
  specSummary?: {
    replicas?: number;
    selector?: { matchLabels?: Record<string, string> };
  };
  statusSummary?: {
    replicas?: number;
    readyReplicas?: number;
    availableReplicas?: number;
    fullyLabeledReplicas?: number;
  };
  specReplicas?: number;
  readyReplicas?: number;
}

// 6. Job Model
export interface JobResource extends BaseKubernetesResource {
  kind: 'Job';
  specSummary?: {
    completions?: number;
    parallelism?: number;
    backoffLimit?: number;
    activeDeadlineSeconds?: number;
  };
  statusSummary?: {
    active?: number;
    succeeded?: number;
    failed?: number;
    startTime?: string | number;
    completionTime?: string | number;
    conditions?: ConditionDiagnostic[];
  };
}

// 7. CronJob Model
export interface CronJobResource extends BaseKubernetesResource {
  kind: 'CronJob';
  specSummary?: {
    schedule?: string;
    suspend?: boolean;
    concurrencyPolicy?: string;
    successfulJobsHistoryLimit?: number;
    failedJobsHistoryLimit?: number;
  };
  statusSummary?: {
    active?: Array<{ uid?: string; name?: string; namespace?: string }>;
    lastScheduleTime?: string | number;
    lastSuccessfulTime?: string | number;
  };
}

// 8. Pod Model
export interface PodResource extends BaseKubernetesResource {
  kind: 'Pod';
  nodeName?: string;
  specSummary?: {
    nodeName?: string;
    restartPolicy?: string;
    serviceAccountName?: string;
    hostNetwork?: boolean;
    hostPID?: boolean;
    priority?: number;
    containers?: any[];
  };
  statusSummary?: {
    phase?: string;
    hostIP?: string;
    podIP?: string;
    podIPs?: Array<{ ip: string }>;
    startTime?: string;
    reason?: string;
    message?: string;
    containerStatuses?: any[];
    initContainerStatuses?: any[];
    ephemeralContainerStatuses?: any[];
    conditions?: ConditionDiagnostic[];
  };
  restartCount?: number;
}

// 9. Service Model
export type ServiceType = 'ClusterIP' | 'NodePort' | 'LoadBalancer' | 'ExternalName';

export interface ServiceResource extends BaseKubernetesResource {
  kind: 'Service';
  specSummary?: {
    type?: ServiceType | string;
    clusterIP?: string;
    clusterIPs?: string[];
    externalName?: string;
    loadBalancerIP?: string;
    loadBalancerSourceRanges?: string[];
    ports?: Array<{
      name?: string;
      protocol?: string;
      port: number;
      targetPort?: number | string;
      nodePort?: number;
    }>;
    selector?: Record<string, string>;
    sessionAffinity?: string;
  };
  statusSummary?: {
    loadBalancer?: {
      ingress?: Array<{ ip?: string; hostname?: string }>;
    };
    totalEndpoints?: number;
    readyEndpoints?: number;
    endpointCount?: number;
  };
}

// 10. EndpointSlice Model
export interface EndpointSliceResource extends BaseKubernetesResource {
  kind: 'EndpointSlice';
  addressType?: 'IPv4' | 'IPv6' | 'FQDN';
  endpoints?: Array<{
    addresses: string[];
    conditions?: { ready?: boolean; serving?: boolean; terminating?: boolean };
    targetRef?: { kind?: string; namespace?: string; name?: string; uid?: string };
    nodeName?: string;
    zone?: string;
  }>;
  ports?: Array<{ name?: string; port?: number; protocol?: string }>;
  specSummary?: {
    readyCount?: number;
    totalCount?: number;
    endpoints?: any[];
  };
  statusSummary?: {
    readyEndpoints?: number;
    totalEndpoints?: number;
  };
}

// 11. PersistentVolumeClaim (PVC) Model
export interface PersistentVolumeClaimResource extends BaseKubernetesResource {
  kind: 'PersistentVolumeClaim';
  specSummary?: {
    accessModes?: string[];
    storageClassName?: string;
    volumeName?: string;
    resources?: {
      requests?: { storage?: string };
      limits?: { storage?: string };
    };
  };
  statusSummary?: {
    phase?: 'Pending' | 'Bound' | 'Lost' | string;
    accessModes?: string[];
    capacity?: { storage?: string } | string;
    allocatedResources?: { storage?: string };
  };
}

// 12. PersistentVolume (PV) Model
export interface PersistentVolumeResource extends BaseKubernetesResource {
  kind: 'PersistentVolume';
  specSummary?: {
    capacity?: { storage?: string } | string;
    accessModes?: string[];
    persistentVolumeReclaimPolicy?: string;
    storageClassName?: string;
    claimRef?: { namespace?: string; name?: string; uid?: string };
  };
  statusSummary?: {
    phase?: 'Available' | 'Bound' | 'Released' | 'Failed' | string;
    reason?: string;
    message?: string;
  };
}

// 13. Ingress Model
export interface IngressResource extends BaseKubernetesResource {
  kind: 'Ingress';
  specSummary?: {
    ingressClassName?: string;
    rules?: Array<{
      host?: string;
      http?: {
        paths: Array<{
          path?: string;
          pathType?: string;
          backend?: {
            service?: { name: string; port: { number?: number; name?: string } };
          };
        }>;
      };
    }>;
    tls?: Array<{ hosts?: string[]; secretName?: string }>;
  };
  statusSummary?: {
    loadBalancer?: {
      ingress?: Array<{ ip?: string; hostname?: string }>;
    };
  };
}

// 14. ConfigMap Model
export interface ConfigMapResource extends BaseKubernetesResource {
  kind: 'ConfigMap';
  dataKeys?: string[];
  binaryDataKeys?: string[];
  immutable?: boolean;
}

// 15. Secret Metadata Model (NEVER contains raw secret payload)
export interface SecretMetadataResource extends BaseKubernetesResource {
  kind: 'Secret';
  type?: string;
  dataKeys?: string[];
  immutable?: boolean;
}

// 16. Namespace Model
export interface NamespaceResource extends BaseKubernetesResource {
  kind: 'Namespace';
  statusSummary?: {
    phase?: 'Active' | 'Terminating' | string;
    conditions?: ConditionDiagnostic[];
  };
}

// Discriminated Union of all Canonical Kubernetes Resources
export type CanonicalKubernetesResource =
  | NodeResource
  | DeploymentResource
  | StatefulSetResource
  | DaemonSetResource
  | ReplicaSetResource
  | JobResource
  | CronJobResource
  | PodResource
  | ServiceResource
  | EndpointSliceResource
  | PersistentVolumeClaimResource
  | PersistentVolumeResource
  | IngressResource
  | ConfigMapResource
  | SecretMetadataResource
  | NamespaceResource;

// Discriminated union of workloads
export type WorkloadResource =
  | DeploymentResource
  | StatefulSetResource
  | DaemonSetResource
  | ReplicaSetResource
  | JobResource
  | CronJobResource;
