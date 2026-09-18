import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronDown,
  Clock,
  Cpu,
  Database,
  Filter,
  Grid,
  HardDrive,
  Info,
  Layers,
  LayoutGrid,
  Network,
  Radio,
  RefreshCw,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Workflow,
  Zap
} from 'lucide-react';
import { Cluster, Incident, KubernetesResource } from '../../types/index';
import { Button } from '../common/UI';
import { NodeDetailModal } from '../resources/NodeDetailModal';
import { PodDetailModal } from '../resources/PodDetailModal';
import { ServiceDetailModal } from '../resources/ServiceDetailModal';
import { WorkloadDetailModal } from '../resources/WorkloadDetailModal';
import { ArchitectureDomainCard } from './ArchitectureDomainCard';
import { ArchitectureDomainView } from './ArchitectureDomainView';
import { buildArchitectureTelemetry } from './architectureTelemetry';
import { ClusterArchitectureGraph } from './ClusterArchitectureGraph';
import { GenericResourceDetailModal } from './GenericResourceDetailModal';
import { ArchitectureDomainId, ArchitectureTelemetryState } from './types';

interface ArchitectureViewProps {
  resources: KubernetesResource[];
  clusters: Cluster[];
  incidents: Incident[];
  selectedClusterId: string;
  onSelectCluster: (clusterId: string) => void;
  onSelectIncident?: (incidentId: string) => void;
  onOpenLogs?: (clusterId: string, namespace: string, podName: string) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export const ArchitectureView: React.FC<ArchitectureViewProps> = ({
  resources,
  clusters,
  incidents,
  selectedClusterId,
  onSelectCluster,
  onSelectIncident,
  onOpenLogs,
  onRefresh,
  isLoading = false
}) => {
  const [selectedNamespace, setSelectedNamespace] = useState<string>('all');
  const [activeDomainId, setActiveDomainId] = useState<ArchitectureDomainId | null>(null);
  const [viewLayout, setViewLayout] = useState<'graph' | 'grid'>('graph');
  const [activeResource, setActiveResource] = useState<KubernetesResource | null>(null);

  // Filter resources by selectedClusterId if specific cluster chosen
  const clusterFilteredResources = useMemo(() => {
    if (!selectedClusterId || selectedClusterId === 'all') {
      return resources;
    }
    return resources.filter((r) => r.clusterId === selectedClusterId);
  }, [resources, selectedClusterId]);

  // Compute available namespaces from real telemetry
  const availableNamespaces = useMemo(() => {
    const nsSet = new Set<string>();
    for (const r of clusterFilteredResources) {
      if (r.namespace) nsSet.add(r.namespace);
    }
    return Array.from(nsSet).sort();
  }, [clusterFilteredResources]);

  // Target cluster entity if selected
  const activeCluster = useMemo(() => {
    return clusters.find((c) => c.id === selectedClusterId) || clusters[0] || null;
  }, [clusters, selectedClusterId]);

  // Build the complete Architecture Telemetry State
  const telemetry: ArchitectureTelemetryState = useMemo(() => {
    return buildArchitectureTelemetry(clusterFilteredResources, clusters, incidents);
  }, [clusterFilteredResources, clusters, incidents]);

  // Identify resource kind for modal dispatch
  const isWorkloadKind = (kind: string) => {
    return ['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob', 'Rollout'].includes(kind);
  };

  // Close active modal
  const handleCloseModal = () => {
    setActiveResource(null);
  };

  // Switch modal to a new resource when clicked inside topology tree
  const handleSelectResourceInModal = (res: KubernetesResource) => {
    setActiveResource(res);
  };

  const domainKeys: ArchitectureDomainId[] = [
    'compute',
    'workloads',
    'networking',
    'storage',
    'configuration',
    'scheduling',
    'scaling',
    'security'
  ];

  return (
    <div className="space-y-6">
      {/* Top Architecture Controls Header */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-bold tracking-wider text-sky-400 uppercase">
                Architecture Center
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold flex items-center gap-1 ${
                  telemetry.freshness === 'LIVE'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : telemetry.freshness === 'STALE'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    telemetry.freshness === 'LIVE'
                      ? 'bg-emerald-400 animate-pulse'
                      : telemetry.freshness === 'STALE'
                      ? 'bg-amber-400'
                      : 'bg-zinc-500'
                  }`}
                />
                {telemetry.freshness === 'LIVE'
                  ? 'LIVE TELEMETRY'
                  : telemetry.freshness === 'STALE'
                  ? `STALE (${telemetry.ageSeconds}s ago)`
                  : 'TELEMETRY UNAVAILABLE'}
              </span>
            </div>
            <h1 className="text-xl font-bold text-zinc-100 tracking-tight">
              Real Cluster Architecture & Telemetry Mesh
            </h1>
            <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
              Verified end-to-end topology computed dynamically from live Kubernetes agent telemetry across Compute, Networking, Workloads, Storage, Configuration, Scheduling, Scaling, and Security.
            </p>
          </div>

          {/* Controls: Cluster Select, Namespace Filter, View Mode, Refresh */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Cluster Selector */}
            <div className="relative">
              <select
                value={selectedClusterId}
                onChange={(e) => onSelectCluster(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:border-sky-500 appearance-none font-mono cursor-pointer"
              >
                <option value="all">Fleet View (All Clusters)</option>
                {clusters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.region || 'global'})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500 absolute right-2.5 top-3 pointer-events-none" />
            </div>

            {/* Namespace Filter */}
            <div className="relative">
              <select
                value={selectedNamespace}
                onChange={(e) => setSelectedNamespace(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:border-sky-500 appearance-none font-mono cursor-pointer"
              >
                <option value="all">All Namespaces</option>
                {availableNamespaces.map((ns) => (
                  <option key={ns} value={ns}>
                    ns: {ns}
                  </option>
                ))}
              </select>
              <Filter className="w-3.5 h-3.5 text-zinc-500 absolute right-2.5 top-3 pointer-events-none" />
            </div>

            {/* View Mode Toggle (Graph vs Grid) */}
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
              <button
                onClick={() => setViewLayout('graph')}
                title="Architecture Mesh Graph"
                className={`p-1.5 rounded text-xs transition-colors cursor-pointer ${
                  viewLayout === 'graph'
                    ? 'bg-sky-500/20 text-sky-400 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Workflow className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewLayout('grid')}
                title="Domain Cards Grid"
                className={`p-1.5 rounded text-xs transition-colors cursor-pointer ${
                  viewLayout === 'grid'
                    ? 'bg-sky-500/20 text-sky-400 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>

            {/* Refresh */}
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isLoading}
                title="Poll live telemetry"
                className="p-2 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-sky-400' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* Telemetry Status Strip */}
        <div className="mt-5 pt-4 border-t border-zinc-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-zinc-950/80 p-3 rounded-lg border border-zinc-800/80">
            <div className="text-[10px] font-mono uppercase text-zinc-500">Fleet Objects</div>
            <div className="text-base font-bold text-zinc-100 mt-0.5">
              {telemetry.totalResourceCount}
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5">Verified across 8 domains</div>
          </div>

          <div className="bg-zinc-950/80 p-3 rounded-lg border border-zinc-800/80">
            <div className="text-[10px] font-mono uppercase text-zinc-500">Fleet Health</div>
            <div className="text-base font-bold text-emerald-400 mt-0.5 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>
                {clusterFilteredResources.filter((r) => r.health === 'HEALTHY').length} Healthy
              </span>
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5">
              {clusterFilteredResources.filter((r) => r.health === 'WARNING' || r.health === 'CRITICAL').length} degraded
            </div>
          </div>

          <div className="bg-zinc-950/80 p-3 rounded-lg border border-zinc-800/80">
            <div className="text-[10px] font-mono uppercase text-zinc-500">Active Incidents</div>
            <div className="text-base font-bold text-zinc-100 mt-0.5 flex items-center gap-1.5">
              {incidents.length > 0 ? (
                <span className="text-red-400 flex items-center gap-1">
                  <AlertOctagon className="w-4 h-4" /> {incidents.length} Active
                </span>
              ) : (
                <span className="text-zinc-400">0 Active</span>
              )}
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5">Automated detection active</div>
          </div>

          <div className="bg-zinc-950/80 p-3 rounded-lg border border-zinc-800/80">
            <div className="text-[10px] font-mono uppercase text-zinc-500">Telemetry Ingress</div>
            <div className="text-base font-bold text-zinc-100 mt-0.5 font-mono">
              {telemetry.ageSeconds !== null ? `${telemetry.ageSeconds}s ago` : 'Syncing'}
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5">SkyOps Agent stream</div>
          </div>
        </div>
      </div>

      {/* LEVEL 1 VS LEVEL 2 VIEW SWITCHER */}
      {activeDomainId ? (
        /* LEVEL 2: SPECIFIC DOMAIN DEEP DIVE */
        <ArchitectureDomainView
          domainId={activeDomainId}
          telemetry={telemetry}
          clusters={clusters}
          selectedClusterId={selectedClusterId}
          selectedNamespace={selectedNamespace}
          onBack={() => setActiveDomainId(null)}
          onSelectResource={(res) => setActiveResource(res)}
          onSelectIncident={onSelectIncident}
          onOpenLogs={onOpenLogs}
        />
      ) : (
        /* LEVEL 1: OVERVIEW ARCHITECTURE VIEW */
        <div className="space-y-6">
          {viewLayout === 'graph' ? (
            /* Interactive Central Cluster Architecture Graph */
            <div className="space-y-6">
              <ClusterArchitectureGraph
                cluster={activeCluster}
                telemetry={telemetry}
                onSelectDomain={(id) => setActiveDomainId(id)}
              />

              {/* Quick Summary Grid Below Graph */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {domainKeys.map((key) => (
                  <ArchitectureDomainCard
                    key={key}
                    domain={telemetry.domains[key]}
                    onSelectDomain={(id) => setActiveDomainId(id)}
                  />
                ))}
              </div>
            </div>
          ) : (
            /* Domain Cards Grid Mode */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {domainKeys.map((key) => (
                <ArchitectureDomainCard
                  key={key}
                  domain={telemetry.domains[key]}
                  onSelectDomain={(id) => setActiveDomainId(id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* DETAIL MODAL DRILL-DOWN CONTINUITY */}
      {activeResource && (
        <>
          {activeResource.kind === 'Node' && (
            <NodeDetailModal
              node={activeResource}
              clusterResources={clusterFilteredResources}
              incidents={incidents}
              onClose={handleCloseModal}
              onSelectPod={handleSelectResourceInModal}
            />
          )}

          {activeResource.kind === 'Pod' && (
            <PodDetailModal
              pod={activeResource}
              clusterResources={clusterFilteredResources}
              incidents={incidents}
              onClose={handleCloseModal}
              onSelectNode={handleSelectResourceInModal}
              onSelectWorkload={handleSelectResourceInModal}
              onSelectService={handleSelectResourceInModal}
              onSelectIncident={onSelectIncident}
              onOpenLogs={onOpenLogs}
            />
          )}

          {isWorkloadKind(activeResource.kind) && (
            <WorkloadDetailModal
              workload={activeResource}
              clusterResources={clusterFilteredResources}
              incidents={incidents}
              onClose={handleCloseModal}
              onSelectPod={handleSelectResourceInModal}
            />
          )}

          {activeResource.kind === 'Service' && (
            <ServiceDetailModal
              service={activeResource}
              clusterResources={clusterFilteredResources}
              incidents={incidents}
              onClose={handleCloseModal}
              onSelectPod={handleSelectResourceInModal}
              onSelectResource={handleSelectResourceInModal}
              onSelectIncident={onSelectIncident}
            />
          )}

          {!['Node', 'Pod', 'Service'].includes(activeResource.kind) &&
            !isWorkloadKind(activeResource.kind) && (
              <GenericResourceDetailModal
                resource={activeResource}
                clusterResources={clusterFilteredResources}
                incidents={incidents}
                onClose={handleCloseModal}
                onSelectResource={handleSelectResourceInModal}
                onSelectIncident={onSelectIncident}
              />
            )}
        </>
      )}
    </div>
  );
};
