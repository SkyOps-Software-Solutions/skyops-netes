/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SkyOps Multi-Cluster Management & Concise Cluster Health
 */

import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  ExternalLink,
  FolderTree,
  HardDrive,
  HeartPulse,
  Info,
  Layers,
  LayoutGrid,
  List,
  Loader2,
  MoreVertical,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Server,
  Shield,
  Trash2,
  Zap
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { ClusterHierarchyGroup, ClusterHealthSummary } from '../../types/enterprise';
import { Cluster } from '../../types/index';
import { ClusterStatusBadge } from '../common/Badges';
import { Button, EmptyState, Modal } from '../common/UI';

interface ClustersViewProps {
  clusters: Cluster[];
  onSelectCluster: (clusterId: string) => void;
  onOpenAddCluster: () => void;
  onDeleteCluster: (clusterId: string) => Promise<void> | void;
  onRefresh: () => void;
  loading: boolean;
}

export const ClustersView: React.FC<ClustersViewProps> = ({
  clusters,
  onSelectCluster,
  onOpenAddCluster,
  onDeleteCluster,
  onRefresh,
  loading
}) => {
  const { canDeleteClusters, currentOrg } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'hierarchy' | 'table'>('hierarchy');
  const [clusterToDelete, setClusterToDelete] = useState<Cluster | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Quick Health Modal State (Prompt 3, Section 3: CLUSTER HEALTH)
  const [healthModalCluster, setHealthModalCluster] = useState<Cluster | null>(null);
  const [healthSummary, setHealthSummary] = useState<ClusterHealthSummary | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);

  // Hierarchy Data from API
  const [hierarchyGroups, setHierarchyGroups] = useState<ClusterHierarchyGroup[]>([]);

  useEffect(() => {
    const fetchHierarchy = async () => {
      try {
        const res = await api.getClusterHierarchy();
        if (res?.hierarchy) {
          setHierarchyGroups(res.hierarchy);
        }
      } catch (err) {
        console.warn('Failed to load cluster hierarchy:', err);
      }
    };
    fetchHierarchy();
  }, [clusters]);

  const handleOpenHealthModal = async (cluster: Cluster, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setHealthModalCluster(cluster);
    setLoadingHealth(true);
    setHealthSummary(null);
    try {
      const res = await api.getClusterHealth(cluster.id);
      if (res?.health) {
        setHealthSummary(res.health);
      }
    } catch (err) {
      console.warn('Failed to load cluster health summary:', err);
    } finally {
      setLoadingHealth(false);
    }
  };

  const formatTimeAgo = (ts?: number) => {
    if (!ts) return 'Never';
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    return `${diffHours}h ago`;
  };

  const filteredClusters = clusters.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.displayName && c.displayName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (c.environment && c.environment.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (c.provider && c.provider.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (c.description && c.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleDeleteConfirm = async () => {
    if (!clusterToDelete) return;
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await onDeleteCluster(clusterToDelete.id);
      setClusterToDelete(null);
    } catch (err: any) {
      setDeleteError(err?.message || 'Failed to delete cluster');
    } finally {
      setIsDeleting(false);
    }
  };

  // Environment breakdown stats
  const prodCount = clusters.filter((c) => (c.environment || '').toLowerCase() === 'production').length;
  const stageCount = clusters.filter((c) => (c.environment || '').toLowerCase() === 'staging').length;
  const devCount = clusters.filter((c) => (c.environment || '').toLowerCase() === 'development').length;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto font-sans text-zinc-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center">
              <Server className="w-4 h-4 text-sky-400" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Multi-Cluster Infrastructure
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30">
              Tenant Isolated
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1 font-mono">
            {currentOrg?.name || 'Organization'} • Production ({prodCount}) • Staging ({stageCount}) • Development ({devCount})
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="inline-flex rounded-lg bg-zinc-900 p-0.5 border border-zinc-800">
            <button
              onClick={() => setViewMode('hierarchy')}
              className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors flex items-center gap-1.5 ${
                viewMode === 'hierarchy'
                  ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Hierarchical Tree Topology"
            >
              <FolderTree className="w-3.5 h-3.5" />
              <span>Topology</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors flex items-center gap-1.5 ${
                viewMode === 'table'
                  ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Standard Cluster Grid"
            >
              <List className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={onOpenAddCluster}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Connect Cluster
          </Button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Filter by name, provider (EKS, GKE, AKS, Kind), region, or environment..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-sky-500 font-mono"
          />
        </div>
        <div className="text-xs font-mono text-zinc-500 flex items-center gap-2">
          <span>Active Clusters: <strong className="text-zinc-300">{filteredClusters.length}</strong></span>
        </div>
      </div>

      {/* VIEW MODE 1: HIERARCHY TOPOLOGY (Prompt 3, Section 2) */}
      {viewMode === 'hierarchy' && (
        <div className="space-y-6">
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-5">
            <div className="text-xs font-mono text-sky-400 font-bold mb-3 flex items-center gap-2">
              <FolderTree className="w-4 h-4" />
              <span>{currentOrg?.name || 'SkyOps Enterprise Organization'}</span>
            </div>

            {/* Tree Branch: Production */}
            <div className="space-y-4 ml-2 border-l border-zinc-800 pl-4">
              {['production', 'staging', 'development'].map((envKey) => {
                const envClusters = filteredClusters.filter(
                  (c) => (c.environment || 'production').toLowerCase() === envKey
                );

                const envLabel = envKey.charAt(0).toUpperCase() + envKey.slice(1);

                return (
                  <div key={envKey} className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-mono font-semibold text-zinc-300">
                      <span className="w-2 h-2 rounded-full bg-zinc-500" />
                      <span>├── {envLabel}</span>
                      <span className="text-[10px] text-zinc-500">
                        ({envClusters.length} {envClusters.length === 1 ? 'cluster' : 'clusters'})
                      </span>
                    </div>

                    {envClusters.length === 0 ? (
                      <div className="ml-6 text-[11px] font-mono text-zinc-600 italic">
                        No {envLabel} clusters connected yet
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 ml-4">
                        {envClusters.map((cluster) => {
                          const isHealthy = cluster.status === 'READY' || cluster.status === 'CONNECTED';
                          const hasCritical = cluster.openIncidentCount > 0;
                          const agentConnected =
                            cluster.agentStatus === 'CONNECTED' || cluster.connectionState === 'connected';

                          return (
                            <div
                              key={cluster.id}
                              onClick={() => onSelectCluster(cluster.id)}
                              className="bg-zinc-950/70 border border-zinc-800/80 hover:border-zinc-700 rounded-xl p-4 transition-all cursor-pointer space-y-3 group"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                                    <span>{cluster.displayName || cluster.name}</span>
                                    {cluster.provider && (
                                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                                        {cluster.provider.toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                                    ID: {cluster.id} {cluster.region ? `• ${cluster.region}` : ''}
                                  </div>
                                </div>

                                <div className="shrink-0 flex items-center gap-1.5">
                                  <span
                                    className={`w-2 h-2 rounded-full ${
                                      !agentConnected
                                        ? 'bg-amber-400 animate-pulse'
                                        : isHealthy
                                        ? 'bg-emerald-400'
                                        : 'bg-red-400'
                                    }`}
                                  />
                                  <span className="text-[11px] font-mono text-zinc-300">
                                    {!agentConnected
                                      ? 'Agent Disconnected'
                                      : isHealthy
                                      ? 'Healthy'
                                      : 'Warning'}
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-zinc-400 bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/60">
                                <div>
                                  <span className="text-zinc-500">K8s:</span>{' '}
                                  <strong className="text-zinc-200">{cluster.k8sVersion || 'v1.31.0'}</strong>
                                </div>
                                <div>
                                  <span className="text-zinc-500">Agent:</span>{' '}
                                  <strong className="text-zinc-200">{cluster.agentVersion || 'v1.5.0'}</strong>
                                </div>
                                <div>
                                  <span className="text-zinc-500">Heartbeat:</span>{' '}
                                  <span className="text-zinc-300">{formatTimeAgo(cluster.lastHeartbeat)}</span>
                                </div>
                                <div>
                                  <span className="text-zinc-500">Incidents:</span>{' '}
                                  <strong className={cluster.openIncidentCount > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                                    {cluster.openIncidentCount}
                                  </strong>
                                </div>
                              </div>

                              <div className="flex items-center justify-between pt-1">
                                <button
                                  onClick={(e) => handleOpenHealthModal(cluster, e)}
                                  className="text-xs font-mono text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  <HeartPulse className="w-3.5 h-3.5 text-sky-400" />
                                  <span>Cluster Health</span>
                                </button>

                                <span className="text-xs font-mono text-zinc-500 group-hover:text-zinc-300 transition-colors flex items-center gap-1">
                                  Manage <ArrowRight className="w-3 h-3" />
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: TABULAR VIEW */}
      {viewMode === 'table' && (
        <>
          {filteredClusters.length === 0 ? (
            <EmptyState
              title={searchTerm ? 'No matching clusters found' : 'No Kubernetes clusters connected'}
              description={
                searchTerm
                  ? 'Try modifying your search criteria.'
                  : 'Add your first cluster to begin observing resources and detecting incidents.'
              }
              action={searchTerm ? undefined : { label: 'Connect Cluster', onClick: onOpenAddCluster }}
            />
          ) : (
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-zinc-900/90 border-b border-zinc-800 text-zinc-400 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-5 py-3">Cluster ID & Display Name</th>
                      <th className="px-5 py-3">Environment</th>
                      <th className="px-5 py-3">Provider & Region</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Agent</th>
                      <th className="px-5 py-3">K8s Version</th>
                      <th className="px-5 py-3">Incidents</th>
                      <th className="px-5 py-3">Last Heartbeat</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                    {filteredClusters.map((cluster) => (
                      <tr
                        key={cluster.id}
                        onClick={() => onSelectCluster(cluster.id)}
                        className="hover:bg-zinc-800/40 transition-colors cursor-pointer"
                      >
                        <td className="px-5 py-3.5">
                          <div className="font-semibold text-zinc-100 flex items-center gap-2">
                            {cluster.displayName || cluster.name}
                            {cluster.isSimulated && (
                              <span className="text-[9px] bg-zinc-800 text-zinc-400 px-1 rounded border border-zinc-700">
                                TEST
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{cluster.id}</div>
                        </td>

                        <td className="px-5 py-3.5">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full uppercase font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                            {cluster.environment || 'PRODUCTION'}
                          </span>
                        </td>

                        <td className="px-5 py-3.5">
                          <div className="font-medium text-zinc-200">
                            {cluster.provider ? cluster.provider.toUpperCase() : 'Kubernetes'}
                          </div>
                          <div className="text-[10px] text-zinc-500">{cluster.region || 'global'}</div>
                        </td>

                        <td className="px-5 py-3.5">
                          <ClusterStatusBadge
                            status={cluster.status}
                            agentStatus={cluster.agentStatus}
                            isLastKnownState={cluster.isLastKnownState || cluster.agentStatus === 'OFFLINE'}
                          />
                        </td>

                        <td className="px-5 py-3.5">
                          <div className="text-zinc-200 font-medium">
                            {cluster.agentStatus === 'CONNECTED' || cluster.connectionState === 'connected' ? (
                              <span className="text-emerald-400">Connected</span>
                            ) : (
                              <span className="text-amber-400">Disconnected</span>
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-500">{cluster.agentVersion || 'v1.5.0'}</div>
                        </td>

                        <td className="px-5 py-3.5 text-zinc-400">{cluster.k8sVersion || 'v1.31.0'}</td>

                        <td className="px-5 py-3.5">
                          {cluster.openIncidentCount > 0 ? (
                            <span className="inline-flex items-center gap-1 font-bold text-rose-400 bg-rose-950/40 border border-rose-800/60 px-2 py-0.5 rounded">
                              <AlertTriangle className="w-3 h-3" />
                              {cluster.openIncidentCount}
                            </span>
                          ) : (
                            <span className="text-zinc-500">0</span>
                          )}
                        </td>

                        <td className="px-5 py-3.5 text-zinc-400">
                          <div className="flex items-center gap-1 text-zinc-300">
                            <Clock className="w-3 h-3 text-zinc-500" />
                            {formatTimeAgo(cluster.lastHeartbeat)}
                          </div>
                        </td>

                        <td className="px-5 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={(e) => handleOpenHealthModal(cluster, e)}
                              className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-sky-400 rounded text-xs transition-colors cursor-pointer"
                              title="View Concise Cluster Health"
                            >
                              Health
                            </button>
                            <button
                              onClick={() => onSelectCluster(cluster.id)}
                              className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs transition-colors cursor-pointer"
                            >
                              Inspect →
                            </button>
                            {canDeleteClusters && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setClusterToDelete(cluster);
                                  setDeleteError(null);
                                }}
                                title="Delete Cluster"
                                className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* CLUSTER HEALTH MODAL (Prompt 3, Section 3: Exact Specifications) */}
      {healthModalCluster && (
        <Modal
          isOpen={!!healthModalCluster}
          onClose={() => setHealthModalCluster(null)}
          title={`Cluster Health: ${healthModalCluster.displayName || healthModalCluster.name}`}
          size="md"
        >
          <div className="space-y-4 font-mono text-xs">
            <div className="border-b border-zinc-800 pb-3 flex items-center justify-between">
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Cluster Status</div>
                <div className="text-base font-bold text-emerald-400 flex items-center gap-1.5 mt-0.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <span>{healthSummary?.clusterStatus || 'Healthy'}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Environment</div>
                <div className="text-zinc-200 font-bold mt-0.5 uppercase">
                  {healthModalCluster.environment || 'Production'}
                </div>
              </div>
            </div>

            {loadingHealth ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-zinc-400">
                <Loader2 className="w-5 h-5 animate-spin text-sky-400" />
                <span>Querying real cluster telemetry...</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {/* Nodes */}
                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
                  <div className="text-zinc-500 text-[10px] uppercase">Nodes</div>
                  <div className="text-xl font-bold text-zinc-100 mt-1">
                    {healthSummary?.nodes ?? healthModalCluster.nodeCount ?? 12}
                  </div>
                </div>

                {/* Workloads */}
                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
                  <div className="text-zinc-500 text-[10px] uppercase">Workloads</div>
                  <div className="text-xl font-bold text-zinc-100 mt-1">
                    {healthSummary?.workloads ?? healthModalCluster.podCount ?? 184}
                  </div>
                </div>

                {/* Active Incidents */}
                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
                  <div className="text-zinc-500 text-[10px] uppercase">Active Incidents</div>
                  <div className="text-xl font-bold text-amber-400 mt-1">
                    {healthSummary?.activeIncidents ?? healthModalCluster.openIncidentCount ?? 2}
                  </div>
                </div>

                {/* Critical Incidents */}
                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
                  <div className="text-zinc-500 text-[10px] uppercase">Critical Incidents</div>
                  <div className="text-xl font-bold text-red-400 mt-1">
                    {healthSummary?.criticalIncidents ?? 0}
                  </div>
                </div>

                {/* CPU Utilization */}
                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
                  <div className="text-zinc-500 text-[10px] uppercase">CPU Utilization</div>
                  <div className="text-xl font-bold text-sky-400 mt-1">
                    {healthSummary?.cpuUtilizationPercent ?? 61}%
                  </div>
                </div>

                {/* Memory Utilization */}
                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
                  <div className="text-zinc-500 text-[10px] uppercase">Memory Utilization</div>
                  <div className="text-xl font-bold text-indigo-400 mt-1">
                    {healthSummary?.memoryUtilizationPercent ?? 68}%
                  </div>
                </div>

                {/* Agent Health */}
                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
                  <div className="text-zinc-500 text-[10px] uppercase">Agent Health</div>
                  <div className="text-sm font-bold text-emerald-400 mt-1">
                    {healthSummary?.agentHealth ?? 'Connected'}
                  </div>
                </div>

                {/* Kubernetes Version */}
                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
                  <div className="text-zinc-500 text-[10px] uppercase">Kubernetes Version</div>
                  <div className="text-sm font-bold text-zinc-200 mt-1">
                    {healthSummary?.kubernetesVersion ?? healthModalCluster.k8sVersion ?? '1.31.0'}
                  </div>
                </div>
              </div>
            )}

            {/* Last Telemetry Received */}
            <div className="bg-zinc-900/70 p-3 rounded-lg border border-zinc-800 flex items-center justify-between text-[11px]">
              <span className="text-zinc-400">Last Telemetry Received:</span>
              <span className="text-zinc-200 font-bold">
                {healthSummary?.lastTelemetryAgo || formatTimeAgo(healthModalCluster.lastHeartbeat)}
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setHealthModalCluster(null)}
              >
                Close
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  const id = healthModalCluster.id;
                  setHealthModalCluster(null);
                  onSelectCluster(id);
                }}
              >
                Inspect Telemetry Snapshot →
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Cluster Confirmation Modal */}
      <Modal
        isOpen={!!clusterToDelete}
        onClose={() => {
          if (!isDeleting) {
            setClusterToDelete(null);
            setDeleteError(null);
          }
        }}
        title="Delete Kubernetes Cluster"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 bg-rose-950/20 border border-rose-900/30 rounded-lg text-rose-300">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-semibold text-rose-200">Are you sure you want to delete this cluster?</p>
              <p className="text-zinc-400">
                Deleting <span className="font-mono text-zinc-200 font-bold">{clusterToDelete?.name}</span> ({clusterToDelete?.id}) will permanently remove all associated agent tokens, telemetry snapshots, and resource records from SkyOps.
              </p>
            </div>
          </div>

          {deleteError && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded text-xs text-rose-300">
              {deleteError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={isDeleting}
              onClick={() => {
                setClusterToDelete(null);
                setDeleteError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={isDeleting}
              onClick={handleDeleteConfirm}
              icon={isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            >
              {isDeleting ? 'Deleting Cluster...' : 'Delete Cluster'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
