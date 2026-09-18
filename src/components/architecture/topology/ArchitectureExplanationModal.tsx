import {
  AlertOctagon,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Cpu,
  Database,
  Globe,
  HardDrive,
  Info,
  Layers,
  Network,
  Server,
  Sparkles,
  Terminal,
  X
} from 'lucide-react';
import React from 'react';
import { Cluster, Incident, KubernetesResource } from '../../../types/index';
import { ArchitectureTelemetryState } from '../types';
import { TopologyNode } from './types';

interface ArchitectureExplanationModalProps {
  isOpen: boolean;
  onClose: () => void;
  cluster: Cluster | null;
  resources: KubernetesResource[];
  telemetry: ArchitectureTelemetryState;
  incidents: Incident[];
  selectedNode?: TopologyNode | null;
  onSelectResource?: (resource: KubernetesResource) => void;
}

export const ArchitectureExplanationModal: React.FC<ArchitectureExplanationModalProps> = ({
  isOpen,
  onClose,
  cluster,
  resources,
  telemetry,
  incidents,
  selectedNode,
  onSelectResource
}) => {
  if (!isOpen) return null;

  const clusterName = cluster?.name || 'Current Cluster';
  const nodes = resources.filter((r) => r.kind === 'Node');
  const pods = resources.filter((r) => r.kind === 'Pod');
  const services = resources.filter((r) => r.kind === 'Service');
  const ingresses = resources.filter((r) => r.kind === 'Ingress' || r.kind === 'Gateway');
  const workloads = resources.filter((r) =>
    ['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob'].includes(r.kind)
  );
  const pvcs = resources.filter((r) => r.kind === 'PersistentVolumeClaim');
  const storageClasses = resources.filter((r) => r.kind === 'StorageClass');

  const healthyPods = pods.filter((p) => p.status === 'Running' || p.health === 'HEALTHY');
  const degradedPods = pods.filter((p) => p.health === 'CRITICAL' || p.health === 'WARNING');

  // Contextual resource explanation if a specific node is selected
  const isResourceSpecific = !!selectedNode && selectedNode.type !== 'cluster';
  const targetResource = selectedNode?.resource;
  const targetIncidents = selectedNode?.incidents || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <span>{isResourceSpecific ? `${selectedNode?.name} (${selectedNode?.kind})` : 'Architecture Explanation'}</span>
                <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 text-[10px] font-mono">
                  Telemetry Grounded
                </span>
              </h2>
              <p className="text-xs text-zinc-400 font-mono mt-0.5">
                {isResourceSpecific ? `Namespace: ${selectedNode?.namespace || 'cluster-scoped'} | Domain: ${selectedNode?.domainId}` : `Cluster: ${clusterName} (${cluster?.region || 'global'})`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-zinc-300 leading-relaxed font-sans">
          {isResourceSpecific ? (
            <>
              {/* Contextual Resource Overview */}
              <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800/80 space-y-2">
                <div className="text-[11px] uppercase tracking-wider font-mono font-bold text-zinc-400">
                  Resource Architecture Role
                </div>
                <p className="text-zinc-200">
                  <strong className="text-zinc-100 font-semibold">{selectedNode?.name}</strong> is a{' '}
                  <strong className="text-sky-300 font-semibold">{selectedNode?.kind}</strong> residing in domain{' '}
                  <span className="text-emerald-400 uppercase font-mono font-semibold">{selectedNode?.domainId}</span>.
                  {selectedNode?.kind === 'Deployment' && ' It manages declarative replica sets and zero-downtime rolling updates for application containers.'}
                  {selectedNode?.kind === 'Service' && ' It provides stable cluster-internal DNS, virtual IP assignment, and load balances traffic across healthy backing pods.'}
                  {selectedNode?.kind === 'Node' && ' It serves as a worker host in the compute tier, executing scheduled container pods and reporting node telemetry.'}
                  {selectedNode?.kind === 'PersistentVolumeClaim' && ' It reserves and binds persistent storage requested by container workloads.'}
                  {selectedNode?.kind === 'Ingress' && ' It acts as the HTTP/HTTPS edge reverse-proxy, routing ingress traffic to cluster services.'}
                </p>
                {selectedNode?.replicas && (
                  <div className="text-[11px] font-mono text-zinc-400 pt-1">
                    Replicas: <strong className="text-zinc-200">{selectedNode.replicas.ready}</strong> ready / <strong className="text-zinc-200">{selectedNode.replicas.desired}</strong> desired.
                  </div>
                )}
              </div>

              {/* Status & Live Health Analysis */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold font-mono text-cyan-400">
                  <Activity className="w-4 h-4" />
                  <span>1. Live Operational Health</span>
                </div>
                <div className="pl-6 space-y-1.5 text-zinc-300">
                  <p>
                    Health status is{' '}
                    <span
                      className={`font-semibold font-mono ${
                        selectedNode?.health === 'HEALTHY'
                          ? 'text-emerald-400'
                          : selectedNode?.health === 'CRITICAL'
                          ? 'text-rose-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {selectedNode?.health || 'UNKNOWN'}
                    </span>{' '}
                    with status descriptor &ldquo;{selectedNode?.statusText || 'Active'}&rdquo;.
                  </p>
                  {selectedNode?.metrics?.isAvailable ? (
                    <div className="p-2.5 bg-zinc-900 rounded-lg border border-zinc-800 text-[11px] font-mono text-zinc-300">
                      Telemetry: CPU {selectedNode.metrics.cpu} | Memory {selectedNode.metrics.memory}
                    </div>
                  ) : (
                    <div className="text-[11px] text-zinc-500 font-mono">
                      Telemetry: CPU and Memory metrics unavailable from cluster agent.
                    </div>
                  )}
                </div>
              </div>

              {/* Topology Relationships & Backing Endpoints */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold font-mono text-emerald-400">
                  <Network className="w-4 h-4" />
                  <span>2. Topology & Dependency Mesh</span>
                </div>
                <div className="pl-6 space-y-1.5 text-zinc-300">
                  {selectedNode?.backingPods && selectedNode.backingPods.length > 0 ? (
                    <p>
                      Directly correlates to{' '}
                      <strong className="text-zinc-100">{selectedNode.backingPods.length} backing pod(s)</strong>:{' '}
                      {selectedNode.backingPods.slice(0, 4).map((bp) => bp.name).join(', ')}
                      {selectedNode.backingPods.length > 4 ? ` and ${selectedNode.backingPods.length - 4} more.` : '.'}
                    </p>
                  ) : (
                    <p>
                      No sub-pod leaves currently bound under this resource in the active topology graph.
                    </p>
                  )}
                </div>
              </div>

              {/* Incidents & Root-Cause Insights */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold font-mono text-rose-400">
                  <AlertOctagon className="w-4 h-4" />
                  <span>3. Active Incidents & Diagnostic Analysis</span>
                </div>
                {targetIncidents.length > 0 ? (
                  <div className="pl-6 space-y-2">
                    {targetIncidents.map((inc) => (
                      <div
                        key={inc.id}
                        className="p-3 bg-rose-950/25 border border-rose-900/60 rounded-xl space-y-1 text-[11px]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-rose-300 font-bold">{inc.title}</span>
                          <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 font-mono text-[10px]">
                            {inc.severity}
                          </span>
                        </div>
                        <p className="text-zinc-300">
                          Failure Mode: <code className="text-rose-300">{inc.incidentType}</code>. Occurrences: {inc.occurrenceCount}.
                        </p>
                        <div className="text-[10px] text-zinc-400 font-mono">
                          First seen: {new Date(inc.firstSeenAt).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-emerald-400 pl-6 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>No active incidents or warning anomalies detected for this resource.</span>
                  </p>
                )}
              </div>

              {/* Recommended Diagnostic Action */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold font-mono text-zinc-300">
                  <Terminal className="w-4 h-4 text-sky-400" />
                  <span>4. Recommended CLI Diagnostic</span>
                </div>
                <div className="pl-6">
                  <div className="p-2.5 bg-zinc-900 rounded-lg border border-zinc-800 text-sky-300 font-mono text-[11px] overflow-x-auto">
                    kubectl describe {selectedNode?.kind.toLowerCase()} {selectedNode?.name}{' '}
                    {selectedNode?.namespace ? `-n ${selectedNode.namespace}` : ''}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Executive Overview */}
              <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800/80 space-y-2">
                <div className="text-[11px] uppercase tracking-wider font-mono font-bold text-zinc-400">
                  Cluster Architecture Summary
                </div>
                <p className="text-zinc-200">
                  {clusterName} comprises{' '}
                  <strong className="text-zinc-100 font-semibold">{nodes.length} worker nodes</strong> hosting{' '}
                  <strong className="text-zinc-100 font-semibold">{workloads.length} managed workloads</strong> and{' '}
                  <strong className="text-zinc-100 font-semibold">{pods.length} active pods</strong>. Network traffic is routed across{' '}
                  <strong className="text-zinc-100 font-semibold">{services.length} services</strong>
                  {ingresses.length > 0 ? ` and ${ingresses.length} edge Ingress controller(s)` : ''}.
                </p>
              </div>

              {/* 1. Ingress & Traffic Flow */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold font-mono text-cyan-400">
                  <Network className="w-4 h-4" />
                  <span>1. Ingress & Traffic Flow</span>
                </div>
                {ingresses.length > 0 ? (
                  <p className="text-zinc-400 pl-6">
                    External traffic ingresses via{' '}
                    {ingresses.map((ing) => (
                      <code key={ing.id} className="text-sky-300 bg-zinc-900 px-1 py-0.5 rounded mr-1">
                        {ing.name}
                      </code>
                    ))}
                    and is distributed to internal ClusterIP and NodePort services. Services discover and balance traffic across healthy backing pods using matching label selectors.
                  </p>
                ) : (
                  <p className="text-zinc-400 pl-6">
                    No external Ingress or Gateway resources were detected. Services operate internally within the cluster virtual IP network ({services.length} ClusterIP services observed).
                  </p>
                )}
              </div>

              {/* 2. Compute & Scheduling Distribution */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold font-mono text-emerald-400">
                  <Cpu className="w-4 h-4" />
                  <span>2. Compute & Scheduling Distribution</span>
                </div>
                <p className="text-zinc-400 pl-6">
                  Pods are scheduled across{' '}
                  <strong className="text-zinc-200">{nodes.length} Nodes</strong>.
                  {nodes.some((n) => (n.specSummary?.taints as any[])?.length > 0)
                    ? ' Dedicated node taints and tolerations are configured to isolate specific workloads.'
                    : ' Nodes operate with standard scheduling without explicit taints.'}
                </p>
              </div>

              {/* 3. Storage Persistence */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold font-mono text-amber-400">
                  <HardDrive className="w-4 h-4" />
                  <span>3. Storage Persistence</span>
                </div>
                {pvcs.length > 0 ? (
                  <p className="text-zinc-400 pl-6">
                    Persistent storage is provisioned via{' '}
                    <strong className="text-zinc-200">{pvcs.length} PersistentVolumeClaim(s)</strong> attached to{' '}
                    {storageClasses.length > 0 ? `${storageClasses.length} StorageClass(es)` : 'cluster default storage'}.
                  </p>
                ) : (
                  <p className="text-zinc-400 pl-6">
                    No persistent volume claims were detected. All currently running workloads appear to operate ephemerally or leverage external managed data stores.
                  </p>
                )}
              </div>

              {/* 4. Operational Health & Active Incidents */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold font-mono text-rose-400">
                  <AlertOctagon className="w-4 h-4" />
                  <span>4. Operational Health & Incidents</span>
                </div>
                {degradedPods.length > 0 || incidents.length > 0 ? (
                  <div className="pl-6 space-y-2">
                    <p className="text-zinc-300">
                      <span className="text-rose-400 font-semibold">{degradedPods.length} degraded pod(s)</span> and{' '}
                      <span className="text-rose-400 font-semibold">{incidents.length} active incident(s)</span> are currently detected:
                    </p>
                    <div className="space-y-1.5">
                      {incidents.slice(0, 4).map((inc) => (
                        <div
                          key={inc.id}
                          className="p-2.5 bg-rose-950/20 border border-rose-900/50 rounded-lg flex items-center justify-between"
                        >
                          <div>
                            <span className="text-rose-300 font-bold">{inc.title}</span>
                            <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                              {inc.resourceKind} / {inc.resourceName} in {inc.namespace || 'default'}
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 font-mono text-[10px]">
                            {inc.severity}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-emerald-400 pl-6 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>All observed cluster workloads and pods are currently in healthy operating states.</span>
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/30 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-zinc-950 font-bold rounded-lg transition cursor-pointer font-mono text-xs"
          >
            Close Explanation
          </button>
        </div>
      </div>
    </div>
  );
};
