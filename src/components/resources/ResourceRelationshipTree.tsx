import {
  Boxes,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Database,
  HardDrive,
  Layers,
  Network,
  Server,
  ShieldAlert,
  Terminal
} from 'lucide-react';
import React, { useMemo } from 'react';
import { KubernetesResource } from '../../types/index';
import { PodPhaseBadge, ResourceHealthBadge, WorkloadKindBadge } from '../common/Badges';

interface ResourceRelationshipTreeProps {
  primaryResource: KubernetesResource;
  allClusterResources: KubernetesResource[];
  onSelectResource?: (resource: KubernetesResource) => void;
}

export const ResourceRelationshipTree: React.FC<ResourceRelationshipTreeProps> = ({
  primaryResource,
  allClusterResources = [],
  onSelectResource
}) => {
  const safeClusterResources = useMemo(() => {
    return Array.isArray(allClusterResources)
      ? allClusterResources.filter((r): r is KubernetesResource => !!r)
      : [];
  }, [allClusterResources]);

  const isPod = primaryResource.kind === 'Pod';
  const isWorkload = ['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob'].includes(
    primaryResource.kind
  );
  const isNode = primaryResource.kind === 'Node';
  const isService = primaryResource.kind === 'Service';
  const isPVC = primaryResource.kind === 'PersistentVolumeClaim';

  // Helper to find child pods for a workload
  const findChildPods = (workload: KubernetesResource): KubernetesResource[] => {
    return safeClusterResources.filter((r) => {
      if (r.kind !== 'Pod' || r.namespace !== workload.namespace) return false;

      // Check direct ownerReference
      if (r.ownerReferences && r.ownerReferences.length > 0) {
        const matchesOwner = r.ownerReferences.some(
          (o) =>
            o &&
            ((o.kind === workload.kind && o.name === workload.name) ||
              (workload.kind === 'Deployment' &&
                o.kind === 'ReplicaSet' &&
                o.name?.startsWith(workload.name)) ||
              (workload.kind === 'CronJob' &&
                o.kind === 'Job' &&
                o.name?.startsWith(workload.name)))
        );
        if (matchesOwner) return true;
      }

      // Fallback to Kubernetes standard naming convention
      const prefix = `${workload.name}-`;
      return typeof r.name === 'string' && r.name.startsWith(prefix);
    });
  };

  // Helper to find parent workload for a pod
  const findParentWorkload = (pod: KubernetesResource): { parent?: KubernetesResource; controller?: string } => {
    if (pod.ownerReferences && pod.ownerReferences.length > 0) {
      const topOwner = pod.ownerReferences[0];
      if (topOwner && topOwner.kind === 'ReplicaSet') {
        const rsName = topOwner.name || '';
        const dep = safeClusterResources.find(
          (r) =>
            r.kind === 'Deployment' &&
            r.namespace === pod.namespace &&
            rsName.startsWith(`${r.name}-`)
        );
        if (dep) return { parent: dep, controller: rsName };
        return { controller: rsName };
      }
      if (topOwner) {
        const directParent = safeClusterResources.find(
          (r) =>
            r.kind === topOwner.kind &&
            r.name === topOwner.name &&
            r.namespace === pod.namespace
        );
        if (directParent) return { parent: directParent, controller: topOwner.name };
        return { controller: topOwner.name };
      }
    }

    // Name prefix fallback
    for (const r of safeClusterResources) {
      if (['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob'].includes(r.kind)) {
        if (r.namespace === pod.namespace && pod.name.startsWith(`${r.name}-`)) {
          return { parent: r, controller: pod.name.slice(0, pod.name.lastIndexOf('-')) };
        }
      }
    }

    return {};
  };

  // Helper to find the Node running a Pod
  const findPodNode = (pod: KubernetesResource): KubernetesResource | undefined => {
    const nodeName =
      pod.nodeName ||
      (pod.specSummary?.nodeName as string) ||
      ((pod as any).spec?.nodeName as string);
    if (!nodeName) return undefined;
    return safeClusterResources.find((r) => r.kind === 'Node' && r.name === nodeName);
  };

  // Helper to find Services selecting a Pod
  const findPodServices = (pod: KubernetesResource): KubernetesResource[] => {
    const podLabels = pod.labels || {};
    if (Object.keys(podLabels).length === 0) return [];

    return safeClusterResources.filter((r) => {
      if (r.kind !== 'Service' || r.namespace !== pod.namespace) return false;
      const selector = (r.specSummary?.selector as Record<string, string>) || (r as any).spec?.selector;
      if (!selector || typeof selector !== 'object' || Object.keys(selector).length === 0) {
        return false;
      }
      return Object.entries(selector).every(([k, v]) => podLabels[k] === v);
    });
  };

  // Helper to find PVCs referenced by a Pod
  const findPodPVCs = (pod: KubernetesResource): KubernetesResource[] => {
    const volumes = (pod.specSummary?.volumes as any[]) || (pod as any).spec?.volumes || [];
    const claimNames = new Set<string>();
    for (const v of volumes) {
      if (v?.persistentVolumeClaim?.claimName) {
        claimNames.add(v.persistentVolumeClaim.claimName);
      }
    }
    if (claimNames.size === 0) return [];
    return safeClusterResources.filter(
      (r) => r.kind === 'PersistentVolumeClaim' && r.namespace === pod.namespace && claimNames.has(r.name)
    );
  };

  // Helper to find Pods running on a Node
  const findNodePods = (node: KubernetesResource): KubernetesResource[] => {
    return safeClusterResources.filter((r) => {
      if (r.kind !== 'Pod') return false;
      const nodeName =
        r.nodeName ||
        (r.specSummary?.nodeName as string) ||
        ((r as any).spec?.nodeName as string);
      return nodeName === node.name;
    });
  };

  // Helper to find Pods mounting a PVC
  const findPVCPods = (pvc: KubernetesResource): KubernetesResource[] => {
    return safeClusterResources.filter((r) => {
      if (r.kind !== 'Pod' || r.namespace !== pvc.namespace) return false;
      const volumes = (r.specSummary?.volumes as any[]) || (r as any).spec?.volumes || [];
      return volumes.some((v) => v?.persistentVolumeClaim?.claimName === pvc.name);
    });
  };

  // Helper to find Pods selected by a Service
  const findServicePods = (service: KubernetesResource): KubernetesResource[] => {
    const selector =
      (service.specSummary?.selector as Record<string, string>) ||
      (service as any).spec?.selector;
    if (!selector || typeof selector !== 'object' || Object.keys(selector).length === 0) {
      return [];
    }

    return safeClusterResources.filter((r) => {
      if (r.kind !== 'Pod' || r.namespace !== service.namespace) return false;
      const podLabels = r.labels || {};
      return Object.entries(selector).every(([k, v]) => podLabels[k] === v);
    });
  };

  // 1. WORKLOAD VIEW (Deployment, StatefulSet, DaemonSet, Job)
  if (isWorkload) {
    const childPods = findChildPods(primaryResource);
    const desired = Number(primaryResource.specSummary?.replicas || 1);
    const ready = Number(
      primaryResource.statusSummary?.readyReplicas ??
      primaryResource.statusSummary?.availableReplicas ??
      0
    );

    return (
      <div className="space-y-4 font-mono text-xs">
        <div className="flex items-center justify-between text-zinc-400 pb-2 border-b border-zinc-800">
          <span className="font-bold uppercase tracking-wider text-[11px] text-zinc-300 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            Workload Hierarchy & Topology
          </span>
          <span className="text-[11px] text-zinc-500">
            {primaryResource.kind} ➔ ReplicaSet ➔ Pods ({childPods.length}) ➔ Containers
          </span>
        </div>

        {/* Workload Root */}
        <div className="p-3.5 bg-zinc-950 border border-sky-800/60 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <WorkloadKindBadge kind={primaryResource.kind} size="md" />
              <span className="font-bold text-zinc-100 text-sm">{primaryResource.name}</span>
              <span className="text-zinc-500 text-[11px]">({primaryResource.namespace})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] bg-zinc-900 text-zinc-300 border border-zinc-700">
                {ready}/{desired} Ready
              </span>
              <ResourceHealthBadge health={primaryResource.health} size="sm" />
            </div>
          </div>
        </div>

        {/* Child Pods Tree */}
        <div className="pl-6 border-l-2 border-dashed border-zinc-700/80 space-y-3 pt-1">
          {primaryResource.kind === 'Deployment' && (
            <div className="relative pl-4 before:content-[''] before:absolute before:left-[-24px] before:top-4 before:w-6 before:h-0.5 before:bg-zinc-700">
              <div className="p-2.5 bg-zinc-900/60 border border-zinc-800 rounded-lg flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2 text-zinc-300">
                  <span className="px-1.5 py-0.2 rounded bg-slate-900 text-slate-300 text-[10px] border border-slate-700 font-semibold">
                    ReplicaSet
                  </span>
                  <span className="font-semibold text-zinc-200 truncate max-w-xs">
                    {primaryResource.name}-controller
                  </span>
                </div>
                <span className="text-zinc-400">Controls {childPods.length || desired} Pod(s)</span>
              </div>
            </div>
          )}

          <div className="relative pl-4 before:content-[''] before:absolute before:left-[-24px] before:top-4 before:w-6 before:h-0.5 before:bg-zinc-700 space-y-2">
            <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
              Managed Pod Replicas ({childPods.length})
            </div>

            {childPods.length === 0 ? (
              <div className="p-3 bg-zinc-900/40 border border-zinc-800 rounded-lg text-zinc-500 text-center text-xs">
                No individual pod telemetry currently reported for this workload.
              </div>
            ) : (
              <div className="space-y-2">
                {childPods.map((pod) => {
                  const hasCrash =
                    pod.health === 'CRITICAL' ||
                    pod.status === 'CrashLoopBackOff' ||
                    pod.status === 'ImagePullBackOff';
                  const totalRestarts =
                    pod.containers?.reduce((acc, c) => acc + (c.restartCount || 0), 0) || 0;

                  return (
                    <div
                      key={pod.id}
                      onClick={() => onSelectResource && onSelectResource(pod)}
                      className={`p-3 bg-zinc-950 border rounded-xl space-y-2 transition-all cursor-pointer hover:border-sky-500/70 ${
                        hasCrash
                          ? 'border-rose-800/80 bg-rose-950/10'
                          : 'border-zinc-800 hover:bg-zinc-900/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              hasCrash ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'
                            }`}
                          />
                          <span className="font-bold text-zinc-200 text-xs truncate">
                            {pod.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <PodPhaseBadge phaseOrStatus={pod.status} restarts={totalRestarts} />
                          {onSelectResource && (
                            <button className="px-2 py-0.5 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded font-mono">
                              Inspect Pod →
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Containers */}
                      {pod.containers && pod.containers.length > 0 && (
                        <div className="pl-4 border-l border-zinc-800/80 space-y-1 pt-1">
                          {pod.containers.map((c, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between text-[11px] text-zinc-400 py-0.5"
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <Terminal className="w-3 h-3 text-zinc-500 shrink-0" />
                                <span className="text-zinc-300 font-semibold">{c.name}</span>
                              </div>
                              <span
                                className={`px-1.5 py-0.2 rounded text-[10px] ${
                                  c.ready
                                    ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40'
                                    : 'bg-rose-950/60 text-rose-300 border border-rose-800/40'
                                }`}
                              >
                                {c.ready ? 'Ready' : c.waitingReason || 'Not Ready'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 2. POD VIEW
  if (isPod) {
    const { parent, controller } = findParentWorkload(primaryResource);
    const node = findPodNode(primaryResource);
    const services = findPodServices(primaryResource);
    const pvcs = findPodPVCs(primaryResource);
    const nodeName =
      primaryResource.nodeName ||
      (primaryResource.specSummary?.nodeName as string) ||
      ((primaryResource as any).spec?.nodeName as string) ||
      'Unassigned';

    return (
      <div className="space-y-4 font-mono text-xs">
        <div className="flex items-center justify-between text-zinc-400 pb-2 border-b border-zinc-800">
          <span className="font-bold uppercase tracking-wider text-[11px] text-zinc-300 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            Pod Topology & Upstream / Downstream Links
          </span>
          <span className="text-[11px] text-zinc-500">
            Workload Parent ➔ Pod ➔ Node & Services
          </span>
        </div>

        {/* Upstream Parent Workload */}
        {parent ? (
          <div
            onClick={() => onSelectResource && onSelectResource(parent)}
            className="p-3 bg-zinc-950 border border-sky-900/50 hover:border-sky-500/80 rounded-xl cursor-pointer transition-all space-y-1"
          >
            <div className="text-[10px] uppercase text-zinc-500 flex items-center justify-between">
              <span>Parent Workload (Owner)</span>
              <span className="text-sky-400 flex items-center gap-1">
                Inspect <ChevronRight className="w-3 h-3" />
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <WorkloadKindBadge kind={parent.kind} />
                <span className="font-bold text-zinc-100">{parent.name}</span>
                <span className="text-zinc-500 text-[11px]">({parent.namespace})</span>
              </div>
              <ResourceHealthBadge health={parent.health} size="sm" />
            </div>
          </div>
        ) : controller ? (
          <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-400">
            <div className="text-[10px] uppercase text-zinc-500">Controller Reference</div>
            <div className="font-bold text-zinc-200 mt-0.5">{controller}</div>
          </div>
        ) : (
          <div className="p-2.5 bg-zinc-900/40 border border-zinc-800 rounded-lg text-zinc-400 text-[11px]">
            Standalone Pod (No parent controller detected)
          </div>
        )}

        {/* Current Pod Card */}
        <div className="pl-6 border-l-2 border-dashed border-sky-600/60 pt-1 space-y-3">
          <div className="relative pl-4 before:content-[''] before:absolute before:left-[-24px] before:top-4 before:w-6 before:h-0.5 before:bg-sky-600">
            <div className="p-3.5 bg-zinc-950 border border-sky-500/80 rounded-xl space-y-2 shadow-lg shadow-sky-950/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <WorkloadKindBadge kind="Pod" size="md" />
                  <span className="font-bold text-zinc-100 text-sm truncate">{primaryResource.name}</span>
                </div>
                <PodPhaseBadge phaseOrStatus={primaryResource.status} />
              </div>
              <div className="text-zinc-400 text-[11px] flex items-center gap-3">
                <span>Namespace: <strong className="text-zinc-200">{primaryResource.namespace}</strong></span>
              </div>
            </div>
          </div>

          {/* Connected Host Node & Connected Services Grid */}
          <div className="relative pl-4 before:content-[''] before:absolute before:left-[-24px] before:top-4 before:w-6 before:h-0.5 before:bg-zinc-700 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Scheduled Node */}
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-1.5">
                <div className="text-[10px] uppercase text-zinc-500 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Server className="w-3 h-3 text-sky-400" />
                    Scheduled Node
                  </span>
                  {node && onSelectResource && (
                    <button
                      onClick={() => onSelectResource(node)}
                      className="text-sky-400 hover:text-sky-300 text-[10px] flex items-center gap-0.5"
                    >
                      Inspect Node →
                    </button>
                  )}
                </div>
                <div className="font-bold text-zinc-100 text-xs truncate">{nodeName}</div>
                {node ? (
                  <div className="text-[11px] text-zinc-400 flex items-center gap-2 pt-0.5">
                    <span className="px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-300">
                      {node.status || 'Ready'}
                    </span>
                    <span>Allocatable CPU: {node.metrics?.cpu?.allocatable?.formatted || 'Allocated'}</span>
                  </div>
                ) : (
                  <div className="text-[11px] text-zinc-500">Node telemetry not collected</div>
                )}
              </div>

              {/* Matched Services */}
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-1.5">
                <div className="text-[10px] uppercase text-zinc-500 flex items-center gap-1">
                  <Network className="w-3 h-3 text-emerald-400" />
                  Targeted by Services ({services.length})
                </div>
                {services.length === 0 ? (
                  <div className="text-[11px] text-zinc-500">No matching service selectors</div>
                ) : (
                  <div className="space-y-1 pt-0.5">
                    {services.map((svc) => (
                      <div
                        key={svc.id}
                        onClick={() => onSelectResource && onSelectResource(svc)}
                        className="flex items-center justify-between text-[11px] text-zinc-300 hover:text-sky-300 cursor-pointer"
                      >
                        <span className="font-semibold truncate">{svc.name}</span>
                        <span className="text-[10px] text-zinc-500">
                          {((svc.specSummary?.type as string) || 'ClusterIP')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Persistent Volume Claims */}
            {pvcs.length > 0 && (
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-1.5">
                <div className="text-[10px] uppercase text-zinc-500 flex items-center gap-1">
                  <Database className="w-3 h-3 text-amber-400" />
                  Mounted Storage Claims ({pvcs.length})
                </div>
                <div className="space-y-1">
                  {pvcs.map((pvc) => (
                    <div
                      key={pvc.id}
                      onClick={() => onSelectResource && onSelectResource(pvc)}
                      className="flex items-center justify-between text-[11px] text-zinc-300 hover:text-sky-300 cursor-pointer"
                    >
                      <span className="font-semibold">{pvc.name}</span>
                      <span className="text-[10px] text-zinc-500">
                        {pvc.status} • {((pvc.specSummary?.storage as string) || 'Bound')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 3. NODE VIEW
  if (isNode) {
    const scheduledPods = findNodePods(primaryResource);
    const ready = primaryResource.status === 'Ready';

    return (
      <div className="space-y-4 font-mono text-xs">
        <div className="flex items-center justify-between text-zinc-400 pb-2 border-b border-zinc-800">
          <span className="font-bold uppercase tracking-wider text-[11px] text-zinc-300 flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-sky-400" />
            Node Infrastructure Topology
          </span>
          <span className="text-[11px] text-zinc-500">
            Node ➔ Scheduled Pods ({scheduledPods.length})
          </span>
        </div>

        {/* Node Card */}
        <div className="p-4 bg-zinc-950 border border-sky-800/60 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-sky-400" />
              <span className="font-bold text-zinc-100 text-sm">{primaryResource.name}</span>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                ready
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
                  : 'bg-rose-950/80 text-rose-300 border border-rose-700/60'
              }`}
            >
              {primaryResource.status || 'Ready'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px] text-zinc-400 border-t border-zinc-800/60">
            <div>
              <span className="text-zinc-500">Scheduled Pods:</span>{' '}
              <strong className="text-zinc-200">{scheduledPods.length}</strong>
            </div>
            <div>
              <span className="text-zinc-500">OS / Arch:</span>{' '}
              <strong className="text-zinc-200">
                {(primaryResource.statusSummary?.nodeInfo as any)?.osImage || 'Linux'}
              </strong>
            </div>
            <div>
              <span className="text-zinc-500">Kubelet:</span>{' '}
              <strong className="text-zinc-200">
                {(primaryResource.statusSummary?.nodeInfo as any)?.kubeletVersion || 'v1.30+'}
              </strong>
            </div>
            <div>
              <span className="text-zinc-500">Health:</span>{' '}
              <strong className="text-zinc-200">{primaryResource.health}</strong>
            </div>
          </div>
        </div>

        {/* Scheduled Pods on this Node */}
        <div className="space-y-2">
          <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
            <span>Pods Hosted on this Node ({scheduledPods.length})</span>
          </div>

          {scheduledPods.length === 0 ? (
            <div className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-xl text-center text-zinc-500 text-xs">
              No pods currently scheduled or running on this node.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {scheduledPods.map((p) => (
                <div
                  key={p.id}
                  onClick={() => onSelectResource && onSelectResource(p)}
                  className="p-3 bg-zinc-950 border border-zinc-800 hover:border-sky-500/70 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-2"
                >
                  <div className="truncate space-y-0.5">
                    <div className="font-bold text-zinc-200 text-xs truncate">{p.name}</div>
                    <div className="text-[10px] text-zinc-500 truncate">ns: {p.namespace}</div>
                  </div>
                  <PodPhaseBadge phaseOrStatus={p.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 4. SERVICE VIEW
  if (isService) {
    const targetPods = findServicePods(primaryResource);
    const selector =
      (primaryResource.specSummary?.selector as Record<string, string>) ||
      (primaryResource as any).spec?.selector ||
      {};

    return (
      <div className="space-y-4 font-mono text-xs">
        <div className="flex items-center justify-between text-zinc-400 pb-2 border-b border-zinc-800">
          <span className="font-bold uppercase tracking-wider text-[11px] text-zinc-300 flex items-center gap-1.5">
            <Network className="w-3.5 h-3.5 text-emerald-400" />
            Service Routing & Endpoints
          </span>
          <span className="text-[11px] text-zinc-500">
            Service ➔ Target Pods ({targetPods.length})
          </span>
        </div>

        <div className="p-3.5 bg-zinc-950 border border-emerald-800/60 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-zinc-100 text-sm">{primaryResource.name}</span>
              <span className="text-zinc-500 text-[11px]">({primaryResource.namespace})</span>
            </div>
            <span className="px-2 py-0.5 rounded text-[11px] bg-zinc-900 border border-zinc-700 text-zinc-300">
              {((primaryResource.specSummary?.type as string) || 'ClusterIP')}
            </span>
          </div>

          {/* Selector labels */}
          <div className="pt-2 border-t border-zinc-800/60 flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-zinc-500">Selector:</span>
            {Object.keys(selector).length === 0 ? (
              <span className="text-zinc-500 text-[11px]">None (Headless / External)</span>
            ) : (
              Object.entries(selector).map(([k, v]) => (
                <span
                  key={k}
                  className="px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-300"
                >
                  {k}={v}
                </span>
              ))
            )}
          </div>
        </div>

        {/* Selected target pods */}
        <div className="space-y-2">
          <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
            Target Pod Endpoints ({targetPods.length})
          </div>
          {targetPods.length === 0 ? (
            <div className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-xl text-center text-zinc-500 text-xs">
              No matching pods found in namespace {primaryResource.namespace}.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {targetPods.map((p) => (
                <div
                  key={p.id}
                  onClick={() => onSelectResource && onSelectResource(p)}
                  className="p-3 bg-zinc-950 border border-zinc-800 hover:border-sky-500/70 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-2"
                >
                  <div className="truncate">
                    <div className="font-bold text-zinc-200 text-xs truncate">{p.name}</div>
                  </div>
                  <PodPhaseBadge phaseOrStatus={p.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 5. PERSISTENT VOLUME CLAIM VIEW
  if (isPVC) {
    const mountingPods = findPVCPods(primaryResource);

    return (
      <div className="space-y-4 font-mono text-xs">
        <div className="flex items-center justify-between text-zinc-400 pb-2 border-b border-zinc-800">
          <span className="font-bold uppercase tracking-wider text-[11px] text-zinc-300 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-amber-400" />
            Storage Claim Relationships
          </span>
          <span className="text-[11px] text-zinc-500">
            PVC ➔ Pod Volume Mounts ({mountingPods.length})
          </span>
        </div>

        <div className="p-3.5 bg-zinc-950 border border-amber-800/60 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-amber-400" />
              <span className="font-bold text-zinc-100 text-sm">{primaryResource.name}</span>
              <span className="text-zinc-500 text-[11px]">({primaryResource.namespace})</span>
            </div>
            <span className="px-2 py-0.5 rounded text-[11px] bg-zinc-900 border border-zinc-700 text-zinc-300">
              {primaryResource.status}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
            Workloads & Pods Mounting This Volume ({mountingPods.length})
          </div>
          {mountingPods.length === 0 ? (
            <div className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-xl text-center text-zinc-500 text-xs">
              No active pods currently mount this PersistentVolumeClaim.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {mountingPods.map((p) => (
                <div
                  key={p.id}
                  onClick={() => onSelectResource && onSelectResource(p)}
                  className="p-3 bg-zinc-950 border border-zinc-800 hover:border-sky-500/70 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-2"
                >
                  <div className="truncate">
                    <div className="font-bold text-zinc-200 text-xs truncate">{p.name}</div>
                  </div>
                  <PodPhaseBadge phaseOrStatus={p.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-400">
      Resource ownership visualization for {primaryResource.kind}: {primaryResource.name}
    </div>
  );
};
