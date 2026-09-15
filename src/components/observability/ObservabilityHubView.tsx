import {
  Activity,
  AlertCircle,
  Clock,
  Filter,
  Layers,
  Radio,
  RefreshCw,
  Search,
  Server,
  Terminal
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { Cluster, K8sEvent, KubernetesResource } from '../../types/index';
import { ClusterObservabilityView } from '../clusters/ClusterObservabilityView';
import { ClusterEventsView } from '../events/ClusterEventsView';
import { PodLogsViewer } from '../logs/PodLogsViewer';
import { ClusterStatusBadge } from '../common/Badges';
import { EmptyState } from '../common/UI';

export interface ObservabilityHubViewProps {
  clusters: Cluster[];
  initialClusterId?: string;
  initialPod?: { namespace: string; name: string };
  onRefresh?: () => void;
}

type ObservabilityTab = 'metrics' | 'logs' | 'events';

export const ObservabilityHubView: React.FC<ObservabilityHubViewProps> = ({
  clusters = [],
  initialClusterId,
  initialPod,
  onRefresh
}) => {
  const [selectedClusterId, setSelectedClusterId] = useState<string>(() => {
    if (initialClusterId && clusters.some((c) => c.id === initialClusterId)) {
      return initialClusterId;
    }
    return clusters[0]?.id || '';
  });

  const [activeTab, setActiveTab] = useState<ObservabilityTab>(() => {
    return initialPod ? 'logs' : 'metrics';
  });

  const [clusterResources, setClusterResources] = useState<KubernetesResource[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [clusterEvents, setClusterEvents] = useState<K8sEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Pod Logs state
  const [selectedNamespace, setSelectedNamespace] = useState<string>(
    initialPod?.namespace || 'default'
  );
  const [selectedPodName, setSelectedPodName] = useState<string>(
    initialPod?.name || ''
  );
  const [podSearchFilter, setPodSearchFilter] = useState<string>('');

  // Keep selectedClusterId synced if clusters list updates and none selected
  useEffect(() => {
    if (!selectedClusterId && clusters.length > 0) {
      setSelectedClusterId(clusters[0].id);
    }
  }, [clusters, selectedClusterId]);

  // Sync if initialPod or initialClusterId changes externally
  useEffect(() => {
    if (initialClusterId) {
      setSelectedClusterId(initialClusterId);
    }
    if (initialPod) {
      setSelectedNamespace(initialPod.namespace);
      setSelectedPodName(initialPod.name);
      setActiveTab('logs');
    }
  }, [initialClusterId, initialPod]);

  const selectedCluster = useMemo(() => {
    return clusters.find((c) => c.id === selectedClusterId) || clusters[0] || null;
  }, [clusters, selectedClusterId]);

  // Fetch resources for active cluster
  const loadClusterResources = async (clusterId: string) => {
    if (!clusterId) return;
    try {
      setLoadingResources(true);
      const res = await api.getClusterResources(clusterId);
      setClusterResources(Array.isArray(res) ? res : []);
    } catch (err) {
      console.warn('[ObservabilityHub] Failed to fetch cluster resources:', err);
      setClusterResources([]);
    } finally {
      setLoadingResources(false);
    }
  };

  // Fetch events for active cluster
  const loadClusterEvents = async (clusterId: string) => {
    if (!clusterId) return;
    try {
      setLoadingEvents(true);
      const evts = await api.getClusterEvents(clusterId);
      setClusterEvents(Array.isArray(evts) ? evts : []);
    } catch (err) {
      console.warn('[ObservabilityHub] Failed to fetch cluster events:', err);
      setClusterEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    if (selectedCluster?.id) {
      loadClusterResources(selectedCluster.id);
      loadClusterEvents(selectedCluster.id);
    }
  }, [selectedCluster?.id]);

  // Available Pods in this cluster
  const podResources = useMemo(() => {
    return clusterResources.filter((r) => r.kind === 'Pod');
  }, [clusterResources]);

  // Unique namespaces containing pods
  const availableNamespaces = useMemo(() => {
    const set = new Set<string>();
    podResources.forEach((p) => {
      if (p.namespace) set.add(p.namespace);
    });
    return Array.from(set).sort();
  }, [podResources]);

  // Filtered pods by namespace and search
  const filteredPods = useMemo(() => {
    return podResources.filter((p) => {
      const matchNs = selectedNamespace === 'all' || p.namespace === selectedNamespace;
      const matchSearch =
        !podSearchFilter ||
        p.name.toLowerCase().includes(podSearchFilter.toLowerCase());
      return matchNs && matchSearch;
    });
  }, [podResources, selectedNamespace, podSearchFilter]);

  // If no pod selected or current selection invalid, auto-select first available
  useEffect(() => {
    if (activeTab === 'logs' && !selectedPodName && filteredPods.length > 0) {
      setSelectedPodName(filteredPods[0].name);
      if (filteredPods[0].namespace) {
        setSelectedNamespace(filteredPods[0].namespace);
      }
    }
  }, [activeTab, selectedPodName, filteredPods]);

  if (!clusters.length) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <EmptyState
          icon={<Server className="w-10 h-10 text-zinc-500" />}
          title="No Connected Clusters"
          description="Register or connect a Kubernetes cluster to unlock live observability, metrics, logs, and telemetry streaming."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100">
      {/* Top Observability Hub Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/40 px-6 py-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-950 border border-sky-800/80 flex items-center justify-center text-sky-400 shrink-0">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-zinc-100">Observability Hub</h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30">
                  Telemetry & Diagnostics
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Full-stack infrastructure telemetry, real-time pod log streaming, and cluster audit events.
              </p>
            </div>
          </div>

          {/* Controls: Cluster Selector & Refresh */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5">
              <Server className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <select
                aria-label="Select Cluster"
                value={selectedCluster?.id || ''}
                onChange={(e) => {
                  setSelectedClusterId(e.target.value);
                  setSelectedPodName('');
                }}
                className="bg-transparent text-xs font-mono text-zinc-200 outline-none cursor-pointer pr-2"
              >
                {clusters.map((c) => (
                  <option key={c.id} value={c.id} className="bg-zinc-900 text-zinc-200">
                    {c.name} ({c.environment || 'production'})
                  </option>
                ))}
              </select>
              {selectedCluster && <ClusterStatusBadge status={selectedCluster.status} />}
            </div>

            <button
              onClick={() => {
                if (selectedCluster?.id) {
                  loadClusterResources(selectedCluster.id);
                  loadClusterEvents(selectedCluster.id);
                }
                if (onRefresh) onRefresh();
              }}
              title="Refresh telemetry"
              className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors cursor-pointer"
            >
              <RefreshCw
                className={`w-4 h-4 ${loadingResources || loadingEvents ? 'animate-spin text-sky-400' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* View Mode Tabs */}
        <div className="flex items-center gap-2 mt-4 border-t border-zinc-800/60 pt-3">
          <button
            onClick={() => setActiveTab('metrics')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'metrics'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Metrics & Telemetry</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'logs'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Live Pod Logs</span>
            {podResources.length > 0 && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                  activeTab === 'logs' ? 'bg-sky-700 text-sky-100' : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {podResources.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('events')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'events'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Cluster Events</span>
            {clusterEvents.length > 0 && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                  activeTab === 'events' ? 'bg-sky-700 text-sky-100' : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {clusterEvents.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area based on active tab */}
      <div className="flex-1 overflow-y-auto">
        {selectedCluster && (
          <>
            {activeTab === 'metrics' && (
              <ClusterObservabilityView
                clusterId={selectedCluster.id}
                clusterName={selectedCluster.name}
                resources={clusterResources}
              />
            )}

            {activeTab === 'logs' && (
              <div className="p-6 max-w-7xl mx-auto space-y-4">
                {/* Pod Selection Bar */}
                <div className="flex flex-wrap items-center gap-3 bg-zinc-900/60 border border-zinc-800/80 p-3 rounded-xl">
                  {/* Namespace filter */}
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <Filter className="w-3.5 h-3.5" />
                    <span>Namespace:</span>
                    <select
                      aria-label="Filter Namespace"
                      value={selectedNamespace}
                      onChange={(e) => {
                        setSelectedNamespace(e.target.value);
                        setSelectedPodName('');
                      }}
                      className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 outline-none cursor-pointer font-mono"
                    >
                      <option value="all">All Namespaces</option>
                      {availableNamespaces.map((ns) => (
                        <option key={ns} value={ns}>
                          {ns}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Pod Search */}
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search pods..."
                      value={podSearchFilter}
                      onChange={(e) => setPodSearchFilter(e.target.value)}
                      className="w-full pl-8 pr-3 py-1 bg-zinc-800/80 border border-zinc-700 rounded text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-sky-500 font-mono"
                    />
                  </div>

                  {/* Pod Selector dropdown */}
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <Terminal className="w-3.5 h-3.5 text-sky-400" />
                    <span>Target Pod:</span>
                    <select
                      aria-label="Select Target Pod"
                      value={selectedPodName}
                      onChange={(e) => {
                        const pod = podResources.find((p) => p.name === e.target.value);
                        setSelectedPodName(e.target.value);
                        if (pod?.namespace) {
                          setSelectedNamespace(pod.namespace);
                        }
                      }}
                      className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 outline-none cursor-pointer font-mono max-w-xs"
                    >
                      {filteredPods.length === 0 ? (
                        <option value="">No matching pods</option>
                      ) : (
                        filteredPods.map((p) => (
                          <option key={`${p.namespace}/${p.name}`} value={p.name}>
                            {p.namespace}/{p.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                {/* Embedded PodLogsViewer */}
                {selectedPodName ? (
                  <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950">
                    <PodLogsViewer
                      clusterId={selectedCluster.id}
                      namespace={
                        podResources.find((p) => p.name === selectedPodName)?.namespace ||
                        selectedNamespace === 'all'
                          ? 'default'
                          : selectedNamespace
                      }
                      podName={selectedPodName}
                      isEmbedded={true}
                    />
                  </div>
                ) : (
                  <EmptyState
                    icon={<Terminal className="w-8 h-8 text-zinc-500" />}
                    title="No Pod Selected"
                    description="Select a pod from the selector above to stream live standard output and diagnostic logs."
                  />
                )}
              </div>
            )}

            {activeTab === 'events' && (
              <div className="p-6 max-w-7xl mx-auto">
                <ClusterEventsView
                  events={clusterEvents}
                  clusterResources={clusterResources}
                  onRefresh={() => loadClusterEvents(selectedCluster.id)}
                  isLoading={loadingEvents}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
