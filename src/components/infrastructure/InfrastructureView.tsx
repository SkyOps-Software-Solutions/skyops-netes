import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Database,
  Filter,
  Flame,
  HardDrive,
  Layers,
  Network,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Server,
  Shield,
  Trash2,
  Workflow,
  Zap
} from 'lucide-react';
import { api } from '../../api/client';
import { Cluster, Incident, KubernetesResource } from '../../types/index';
import { ClusterStatusBadge } from '../common/Badges';
import { ServicesView } from '../services/ServicesView';
import { ArchitectureView } from '../architecture/ArchitectureView';
import { WorkloadDetailModal } from '../resources/WorkloadDetailModal';
import { PodDetailModal } from '../resources/PodDetailModal';
import { NodeDetailModal } from '../resources/NodeDetailModal';

export type InfraSubTab = 'workloads' | 'pods' | 'services' | 'nodes' | 'architecture';

interface InfrastructureViewProps {
  clusters: Cluster[];
  initialSubTab?: InfraSubTab;
  onSelectCluster: (clusterId: string) => void;
  onOpenAddCluster: () => void;
  onDeleteCluster: (clusterId: string) => void;
  onRefresh: () => void;
  loading: boolean;
  onSelectIncident?: (id: string) => void;
  onOpenLogs?: (clusterId: string, namespace: string, podName: string) => void;
}

export const InfrastructureView: React.FC<InfrastructureViewProps> = ({
  clusters = [],
  initialSubTab = 'workloads',
  onSelectCluster,
  onOpenAddCluster,
  onDeleteCluster,
  onRefresh,
  loading,
  onSelectIncident,
  onOpenLogs
}) => {
  const [subTab, setSubTab] = useState<InfraSubTab>(initialSubTab);
  const [resources, setResources] = useState<KubernetesResource[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [selectedClusterFilter, setSelectedClusterFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNamespaceFilter, setSelectedNamespaceFilter] = useState<string>('all');

  // Interactive Detail Modals for deep resource inspection
  const [selectedWorkload, setSelectedWorkload] = useState<KubernetesResource | null>(null);
  const [selectedPod, setSelectedPod] = useState<KubernetesResource | null>(null);
  const [selectedNode, setSelectedNode] = useState<KubernetesResource | null>(null);

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const fetchResources = async () => {
    try {
      setLoadingResources(true);
      const [resData, incData] = await Promise.all([
        api.getAllResources().catch(() => []),
        api.getIncidents().catch(() => [])
      ]);
      setResources(Array.isArray(resData) ? resData : []);
      setIncidents(Array.isArray(incData) ? incData : []);
    } catch (err) {
      console.warn('InfrastructureView resource fetch notice:', err);
    } finally {
      setLoadingResources(false);
    }
  };

  useEffect(() => {
    fetchResources();
  }, [clusters.length]);

  const safeClusters = Array.isArray(clusters) ? clusters : [];
  const safeResources = Array.isArray(resources) ? resources : [];

  // Filter resources by cluster
  const clusterFilteredResources = useMemo(() => {
    if (selectedClusterFilter === 'all') return safeResources;
    return safeResources.filter((r) => r.clusterId === selectedClusterFilter);
  }, [safeResources, selectedClusterFilter]);

  // Extract namespaces
  const namespaces = useMemo(() => {
    const set = new Set<string>();
    for (const r of clusterFilteredResources) {
      if (r.namespace) set.add(r.namespace);
    }
    return Array.from(set).sort();
  }, [clusterFilteredResources]);

  // Search and namespace filter
  const filteredResources = useMemo(() => {
    return clusterFilteredResources.filter((r) => {
      if (selectedNamespaceFilter !== 'all' && r.namespace !== selectedNamespaceFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = r.name.toLowerCase().includes(q);
        const matchNs = (r.namespace || '').toLowerCase().includes(q);
        const matchKind = r.kind.toLowerCase().includes(q);
        return matchName || matchNs || matchKind;
      }
      return true;
    });
  }, [clusterFilteredResources, selectedNamespaceFilter, searchQuery]);

  // Separate resources by kind
  const nodes = useMemo(
    () => filteredResources.filter((r) => r.kind === 'Node'),
    [filteredResources]
  );
  const workloads = useMemo(
    () =>
      filteredResources.filter((r) =>
        ['Deployment', 'StatefulSet', 'DaemonSet', 'Rollout', 'Job', 'CronJob'].includes(r.kind)
      ),
    [filteredResources]
  );
  const pods = useMemo(
    () => filteredResources.filter((r) => r.kind === 'Pod'),
    [filteredResources]
  );
  const services = useMemo(
    () => filteredResources.filter((r) => r.kind === 'Service'),
    [filteredResources]
  );

  // Quick health counts
  const degradedWorkloadsCount = useMemo(
    () => workloads.filter((w) => w.health === 'CRITICAL' || w.health === 'WARNING').length,
    [workloads]
  );
  const failingPodsCount = useMemo(
    () =>
      pods.filter(
        (p) =>
          p.health === 'CRITICAL' ||
          p.status === 'CrashLoopBackOff' ||
          p.status === 'ImagePullBackOff' ||
          p.status === 'OOMKilled'
      ).length,
    [pods]
  );

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6 font-sans text-zinc-100">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight">
            Kubernetes Infrastructure & Resources
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Inspect and troubleshoot deployments, running pods, networking services, worker nodes, and service dependencies across your clusters.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              onRefresh();
              fetchResources();
            }}
            disabled={loading || loadingResources}
            className="px-3 py-2 text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer flex items-center gap-1.5"
            title="Refresh cluster resources"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${loading || loadingResources ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={onOpenAddCluster}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Connect Cluster</span>
          </button>
        </div>
      </div>

      {/* 4 Interactive Resource Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <button
          onClick={() => setSubTab('workloads')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            subTab === 'workloads'
              ? 'bg-sky-500/10 border-sky-500/40 shadow-xs'
              : 'bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-medium">Workloads</span>
            <Layers className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1.5 font-mono tabular-nums">
            {workloads.length}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            {degradedWorkloadsCount > 0 ? (
              <span className="text-amber-400 font-medium">{degradedWorkloadsCount} need attention</span>
            ) : (
              <span className="text-emerald-400">All deployments healthy</span>
            )}
          </div>
        </button>

        <button
          onClick={() => setSubTab('pods')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            subTab === 'pods'
              ? 'bg-sky-500/10 border-sky-500/40 shadow-xs'
              : 'bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-medium">Pods</span>
            <Boxes className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1.5 font-mono tabular-nums">
            {pods.length}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            {failingPodsCount > 0 ? (
              <span className="text-rose-400 font-medium">{failingPodsCount} crashing or failing</span>
            ) : (
              <span className="text-emerald-400">All containers running</span>
            )}
          </div>
        </button>

        <button
          onClick={() => setSubTab('services')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            subTab === 'services'
              ? 'bg-sky-500/10 border-sky-500/40 shadow-xs'
              : 'bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-medium">Services & Ingress</span>
            <Network className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1.5 font-mono tabular-nums">
            {services.length}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            ClusterIP, NodePort & LoadBalancers
          </div>
        </button>

        <button
          onClick={() => setSubTab('nodes')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            subTab === 'nodes'
              ? 'bg-sky-500/10 border-sky-500/40 shadow-xs'
              : 'bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-medium">Worker Nodes</span>
            <Cpu className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1.5 font-mono tabular-nums">
            {nodes.length}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            {nodes.filter((n) => n.status === 'Ready').length} Ready across fleet
          </div>
        </button>
      </div>

      {/* Sub-Navigation & Filters Bar */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Sub-tabs */}
        <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800/80 overflow-x-auto">
          <button
            onClick={() => setSubTab('workloads')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              subTab === 'workloads'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Workloads ({workloads.length})</span>
          </button>

          <button
            onClick={() => setSubTab('pods')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              subTab === 'pods'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Pods ({pods.length})</span>
          </button>

          <button
            onClick={() => setSubTab('services')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              subTab === 'services'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Network className="w-3.5 h-3.5" />
            <span>Services ({services.length})</span>
          </button>

          <button
            onClick={() => setSubTab('nodes')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              subTab === 'nodes'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Nodes ({nodes.length})</span>
          </button>

          <button
            onClick={() => setSubTab('architecture')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              subTab === 'architecture'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Workflow className="w-3.5 h-3.5 text-sky-400" />
            <span>Topology Map</span>
          </button>
        </div>

        {/* Global Cluster & Search Filter */}
        {subTab !== 'architecture' && subTab !== 'services' && (
          <div className="flex flex-wrap items-center gap-2.5">
            {safeClusters.length > 0 && (
              <select
                value={selectedClusterFilter}
                onChange={(e) => setSelectedClusterFilter(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-sky-500 cursor-pointer"
              >
                <option value="all">All Clusters ({safeClusters.length})</option>
                {safeClusters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}

            {namespaces.length > 0 && subTab !== 'nodes' && (
              <select
                value={selectedNamespaceFilter}
                onChange={(e) => setSelectedNamespaceFilter(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-sky-500 cursor-pointer"
              >
                <option value="all">All Namespaces</option>
                {namespaces.map((ns) => (
                  <option key={ns} value={ns}>
                    {ns}
                  </option>
                ))}
              </select>
            )}

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by name or namespace..."
                className="bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-sky-500 w-48 sm:w-60"
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Tab Content */}
      {subTab === 'architecture' && (
        <ArchitectureView
          resources={safeResources}
          clusters={safeClusters}
          incidents={incidents}
          selectedClusterId={selectedClusterFilter}
          onSelectCluster={(cid) => setSelectedClusterFilter(cid)}
          onSelectIncident={onSelectIncident}
          onOpenLogs={onOpenLogs}
          onRefresh={() => {
            onRefresh();
            fetchResources();
          }}
          isLoading={loading || loadingResources}
        />
      )}

      {/* Nodes Tab */}
      {subTab === 'nodes' && (
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/70 text-[11px] font-medium text-zinc-400">
                  <th className="py-3 px-4">Node Name</th>
                  <th className="py-3 px-4">Cluster</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">CPU Capacity</th>
                  <th className="py-3 px-4">Memory Capacity</th>
                  <th className="py-3 px-4">Resource Pressure</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-sans">
                {nodes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-zinc-500">
                      No worker nodes match the selected filter.
                    </td>
                  </tr>
                ) : (
                  nodes.map((node) => {
                    const cluster = safeClusters.find((c) => c.id === node.clusterId);
                    const conditions = (node.conditions || []) as any[];
                    const hasMemoryPressure = conditions.some(
                      (c) => c.type === 'MemoryPressure' && (c.status === 'True' || c.status === true)
                    );
                    const hasDiskPressure = conditions.some(
                      (c) => c.type === 'DiskPressure' && (c.status === 'True' || c.status === true)
                    );

                    return (
                      <tr
                        key={`${node.clusterId}-${node.name}`}
                        onClick={() => setSelectedNode(node)}
                        className="hover:bg-zinc-800/40 transition-colors cursor-pointer"
                      >
                        <td className="py-3.5 px-4 font-semibold text-zinc-100 flex items-center gap-2 font-mono">
                          <Cpu className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>{node.name}</span>
                        </td>
                        <td className="py-3.5 px-4 text-zinc-300">{cluster?.name || node.clusterId}</td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`text-xs font-medium ${
                              node.status === 'Ready' ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {node.status || 'Ready'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-zinc-300 tabular-nums">
                          {(node.metrics as any)?.cpuUsage || (node.statusSummary as any)?.capacity?.cpu || (node as any).cpuAllocatable || '—'}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-zinc-300 tabular-nums">
                          {(node.metrics as any)?.memoryUsage || (node.statusSummary as any)?.capacity?.memory || (node as any).memoryAllocatable || '—'}
                        </td>
                        <td className="py-3.5 px-4">
                          {hasMemoryPressure || hasDiskPressure ? (
                            <span className="text-xs font-medium text-rose-400">
                              {hasMemoryPressure ? 'Memory Pressure' : 'Disk Pressure'}
                            </span>
                          ) : (
                            <span className="text-xs text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Healthy
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span className="text-sky-400 hover:text-sky-300 text-xs font-medium">
                            Inspect →
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Workloads Tab */}
      {subTab === 'workloads' && (
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/70 text-[11px] font-medium text-zinc-400">
                  <th className="py-3 px-4">Workload Name</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Namespace</th>
                  <th className="py-3 px-4">Cluster</th>
                  <th className="py-3 px-4">Ready Replicas</th>
                  <th className="py-3 px-4">Health</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-sans">
                {workloads.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-zinc-500">
                      No deployments or workloads match the selected filter.
                    </td>
                  </tr>
                ) : (
                  workloads.map((w) => {
                    const cluster = safeClusters.find((c) => c.id === w.clusterId);
                    const readyReplicas =
                      (w as any).readyReplicas ??
                      (w.statusSummary as any)?.readyReplicas ??
                      (w.statusSummary as any)?.availableReplicas;
                    const desiredReplicas =
                      (w as any).replicas ?? (w.specSummary as any)?.replicas;

                    return (
                      <tr
                        key={`${w.clusterId}-${w.namespace}-${w.name}`}
                        onClick={() => setSelectedWorkload(w)}
                        className="hover:bg-zinc-800/40 transition-colors cursor-pointer"
                      >
                        <td className="py-3.5 px-4 font-semibold text-zinc-100 flex items-center gap-2 font-mono">
                          <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          <span>{w.name}</span>
                        </td>
                        <td className="py-3.5 px-4 text-zinc-400">{w.kind}</td>
                        <td className="py-3.5 px-4 font-mono text-zinc-300">{w.namespace || 'default'}</td>
                        <td className="py-3.5 px-4 text-zinc-300">{cluster?.name || w.clusterId}</td>
                        <td className="py-3.5 px-4 font-mono text-zinc-200 tabular-nums">
                          {readyReplicas !== undefined && desiredReplicas !== undefined
                            ? `${readyReplicas} / ${desiredReplicas}`
                            : desiredReplicas !== undefined
                            ? `${desiredReplicas}`
                            : w.status || '—'}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`text-xs font-medium ${
                              w.health === 'CRITICAL'
                                ? 'text-rose-400'
                                : w.health === 'WARNING'
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {w.health === 'CRITICAL'
                              ? 'Critical'
                              : w.health === 'WARNING'
                              ? 'Degraded'
                              : 'Healthy'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span className="text-sky-400 hover:text-sky-300 text-xs font-medium">
                            Inspect →
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pods Tab */}
      {subTab === 'pods' && (
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/70 text-[11px] font-medium text-zinc-400">
                  <th className="py-3 px-4">Pod Name</th>
                  <th className="py-3 px-4">Namespace</th>
                  <th className="py-3 px-4">Cluster</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Restarts</th>
                  <th className="py-3 px-4">Worker Node</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-sans">
                {pods.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-zinc-500">
                      No pods match the selected filter.
                    </td>
                  </tr>
                ) : (
                  pods.map((pod) => {
                    const cluster = safeClusters.find((c) => c.id === pod.clusterId);
                    const isCrashing =
                      pod.status === 'CrashLoopBackOff' ||
                      pod.status === 'ImagePullBackOff' ||
                      pod.status === 'OOMKilled' ||
                      pod.health === 'CRITICAL';
                    const restarts =
                      (pod as any).restartCount ??
                      pod.containers?.reduce((sum, c) => sum + (c.restartCount || 0), 0) ??
                      0;

                    return (
                      <tr
                        key={`${pod.clusterId}-${pod.namespace}-${pod.name}`}
                        onClick={() => setSelectedPod(pod)}
                        className="hover:bg-zinc-800/40 transition-colors cursor-pointer"
                      >
                        <td className="py-3.5 px-4 font-semibold text-zinc-100 flex items-center gap-2 font-mono">
                          <Boxes className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span className="truncate max-w-[240px]">{pod.name}</span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-zinc-300">{pod.namespace || 'default'}</td>
                        <td className="py-3.5 px-4 text-zinc-300">{cluster?.name || pod.clusterId}</td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`text-xs font-medium ${
                              isCrashing
                                ? 'text-rose-400 font-semibold'
                                : pod.status === 'Running'
                                ? 'text-emerald-400'
                                : 'text-amber-400'
                            }`}
                          >
                            {pod.status || 'Unknown'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-zinc-300 tabular-nums">{restarts}</td>
                        <td className="py-3.5 px-4 font-mono text-zinc-400 truncate max-w-[160px]">
                          {(pod as any).nodeName || (pod.specSummary as any)?.nodeName || '—'}
                        </td>
                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-3">
                            {onOpenLogs && (
                              <button
                                onClick={() => onOpenLogs(pod.clusterId, pod.namespace, pod.name)}
                                className="text-sky-400 hover:text-sky-300 text-xs font-medium cursor-pointer"
                              >
                                Live Logs
                              </button>
                            )}
                            <button
                              onClick={() => setSelectedPod(pod)}
                              className="text-zinc-300 hover:text-white text-xs font-medium cursor-pointer"
                            >
                              Inspect →
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Services Tab */}
      {subTab === 'services' && (
        <ServicesView
          services={services}
          resources={safeResources}
          clusters={safeClusters}
          loading={loading || loadingResources}
          onRefresh={() => {
            onRefresh();
            fetchResources();
          }}
          onSelectCluster={onSelectCluster}
          onSelectIncident={onSelectIncident}
          isEmbedded
        />
      )}

      {/* Resource Detail Modals */}
      {selectedWorkload && (
        <WorkloadDetailModal
          workload={selectedWorkload}
          clusterResources={safeResources.filter((r) => r.clusterId === selectedWorkload.clusterId)}
          incidents={incidents.filter((i) => i.clusterId === selectedWorkload.clusterId)}
          onClose={() => setSelectedWorkload(null)}
          onSelectPod={(pod) => {
            setSelectedWorkload(null);
            setSelectedPod(pod);
          }}
          onSelectIncident={(incId) => {
            setSelectedWorkload(null);
            if (onSelectIncident) onSelectIncident(incId);
          }}
        />
      )}

      {selectedPod && (
        <PodDetailModal
          pod={selectedPod}
          clusterResources={safeResources.filter((r) => r.clusterId === selectedPod.clusterId)}
          incidents={incidents.filter((i) => i.clusterId === selectedPod.clusterId)}
          onClose={() => setSelectedPod(null)}
          onSelectIncident={(incId) => {
            setSelectedPod(null);
            if (onSelectIncident) onSelectIncident(incId);
          }}
        />
      )}

      {selectedNode && (
        <NodeDetailModal
          node={selectedNode}
          cluster={
            safeClusters.find((c) => c.id === selectedNode.clusterId) || {
              id: selectedNode.clusterId,
              name: selectedNode.clusterName || selectedNode.clusterId
            } as Cluster
          }
          clusterResources={safeResources.filter((r) => r.clusterId === selectedNode.clusterId)}
          incidents={incidents.filter((i) => i.clusterId === selectedNode.clusterId)}
          onClose={() => setSelectedNode(null)}
          onSelectPod={(pod) => {
            setSelectedNode(null);
            setSelectedPod(pod);
          }}
          onSelectIncident={(incId) => {
            setSelectedNode(null);
            if (onSelectIncident) onSelectIncident(incId);
          }}
        />
      )}
    </div>
  );
};
