import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  Database,
  DollarSign,
  ExternalLink,
  Flame,
  HardDrive,
  Info,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Zap
} from 'lucide-react';
import React, { useMemo, useState, useEffect } from 'react';
import { api } from '../../api/client';
import { Cluster, Incident, KubernetesResource, OverviewMetrics } from '../../types/index';
import { CostOverview } from '../../types/enterprise';
import { ClusterStatusBadge, SeverityBadge, StatusBadge } from '../common/Badges';
import { Button, EmptyState, Modal } from '../common/UI';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { BrandLogo } from '../common/BrandLogo';
import { ClusterInfrastructureBadges } from '../common/CloudProviderBadge';
import {
  computeScopedOverviewMetrics,
  correlateAndPrioritizeIncidents,
  determineOperationalHealth,
  PrioritizedIncident,
  OperationalHealthAssessment
} from './overviewLogic';

interface OverviewViewProps {
  metrics: OverviewMetrics | null;
  clusters: Cluster[];
  recentIncidents: Incident[];
  recentActivity: Array<{
    id: string;
    type: string;
    timestamp: number;
    title: string;
    description: string;
    incidentId?: string;
    clusterId?: string;
  }>;
  onSelectIncident: (id: string) => void;
  onSelectCluster: (id: string) => void;
  onOpenAddCluster: () => void;
  onRefresh: () => void;
  loading: boolean;
  onNavigateTab?: (tab: any) => void;
  lastUpdatedAt?: number | null;
  fetchError?: string | null;
  isStale?: boolean;
  refreshKey?: number;
}

const OverviewViewContent: React.FC<OverviewViewProps> = ({
  metrics,
  clusters = [],
  recentIncidents = [],
  recentActivity = [],
  onSelectIncident,
  onSelectCluster,
  onOpenAddCluster,
  onRefresh,
  loading,
  lastUpdatedAt,
  fetchError,
  isStale = false,
  refreshKey = 0,
  onNavigateTab
}) => {
  const [resources, setResources] = useState<KubernetesResource[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [resourceFetchError, setResourceFetchError] = useState<string | null>(null);
  const [resourcesLastUpdated, setResourcesLastUpdated] = useState<number | null>(null);
  const [scopedMetricsFromApi, setScopedMetricsFromApi] = useState<OverviewMetrics | null>(null);
  const [costOverview, setCostOverview] = useState<CostOverview | null>(null);
  const [clusterFilter, setClusterFilter] = useState<string>('all');
  const [activeIncidentTab, setActiveIncidentTab] = useState<'all' | 'critical' | 'high' | 'in_progress'>('all');
  const [autoHealingAll, setAutoHealingAll] = useState(false);
  const [showAutoHealConfirmModal, setShowAutoHealConfirmModal] = useState(false);
  const [healingIncidentId, setHealingIncidentId] = useState<string | null>(null);
  const [overviewNotice, setOverviewNotice] = useState<{ type: 'success' | 'warning' | 'error' | 'info'; message: string } | null>(null);

  // Sync resources and scoped overview data whenever cluster selection or refreshKey changes
  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        setLoadingResources(true);
        const [resData, ovData] = await Promise.all([
          clusterFilter !== 'all' ? api.getClusterResources(clusterFilter) : api.getAllResources(),
          api.getOverview(clusterFilter).catch((err) => {
            console.warn('Overview API notice:', err?.message || err);
            return null;
          })
        ]);

        if (isMounted) {
          setResources(Array.isArray(resData) ? resData : []);
          if (ovData) {
            setScopedMetricsFromApi(ovData.metrics || null);
            setCostOverview(ovData.costOverview || null);
          }
          setResourceFetchError(null);
          setResourcesLastUpdated(Date.now());
        }
      } catch (err: any) {
        if (isMounted) {
          console.warn('OverviewView resources fetch notice:', err?.message || err);
          setResourceFetchError(err?.message || 'Failed to sync cluster resources');
        }
      } finally {
        if (isMounted) setLoadingResources(false);
      }
    };

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [clusterFilter, refreshKey]);

  const safeClusters = Array.isArray(clusters) ? clusters : [];
  const safeIncidents = Array.isArray(recentIncidents) ? recentIncidents : [];
  const safeActivity = Array.isArray(recentActivity) ? recentActivity : [];
  const safeResources = Array.isArray(resources) ? resources : [];

  const isSingleCluster = clusterFilter !== 'all';
  const selectedCluster = useMemo(() => {
    return isSingleCluster ? safeClusters.find((c) => c.id === clusterFilter) || null : null;
  }, [safeClusters, isSingleCluster, clusterFilter]);

  // Scoped activity for the selected cluster
  const scopedActivity = useMemo(() => {
    if (!isSingleCluster) return safeActivity;
    return safeActivity.filter((a) => !a.clusterId || a.clusterId === clusterFilter);
  }, [safeActivity, isSingleCluster, clusterFilter]);

  // Compute strictly scoped KPI metrics without mixing fleet and cluster-level counts
  const scopedMetrics = useMemo(() => {
    return computeScopedOverviewMetrics({
      clusters: safeClusters,
      resources: safeResources,
      incidents: safeIncidents,
      clusterFilter,
      metrics: scopedMetricsFromApi || metrics
    });
  }, [safeClusters, safeResources, safeIncidents, clusterFilter, scopedMetricsFromApi, metrics]);

  // Open & active incidents strictly for the selected scope
  const openIncidents = useMemo(() => {
    const list = isSingleCluster
      ? safeIncidents.filter((i) => i.clusterId === clusterFilter)
      : safeIncidents;
    return list.filter(
      (i) => i && (i.status === 'OPEN' || i.status === 'IN_PROGRESS' || i.status === 'ACKNOWLEDGED')
    );
  }, [safeIncidents, isSingleCluster, clusterFilter]);

  // Deterministically prioritized and correlated incidents
  const prioritizedIncidents = useMemo(() => {
    const list = isSingleCluster
      ? safeIncidents.filter((i) => i.clusterId === clusterFilter)
      : safeIncidents;
    return correlateAndPrioritizeIncidents(list, safeResources, safeClusters);
  }, [safeIncidents, safeResources, safeClusters, isSingleCluster, clusterFilter]);

  // Incidents filtered by the active triage radar sub-tab
  const displayedIncidents = useMemo(() => {
    const openList = prioritizedIncidents.filter(
      (i) => i.status === 'OPEN' || i.status === 'IN_PROGRESS' || i.status === 'ACKNOWLEDGED'
    );
    if (activeIncidentTab === 'critical') return openList.filter((i) => i.severity === 'CRITICAL');
    if (activeIncidentTab === 'high') return openList.filter((i) => i.severity === 'HIGH');
    if (activeIncidentTab === 'in_progress') return openList.filter((i) => i.status === 'IN_PROGRESS');
    return openList;
  }, [prioritizedIncidents, activeIncidentTab]);

  // Authoritative operational health assessment with clear, transparent observations
  const healthAssessment = useMemo(() => {
    return determineOperationalHealth({
      clusters: safeClusters,
      selectedCluster,
      isSingleCluster,
      resources: safeResources,
      openIncidents,
      isStale,
      loading: loading || loadingResources,
      fetchError: fetchError || resourceFetchError,
      lastUpdatedAt: resourcesLastUpdated || lastUpdatedAt
    });
  }, [
    safeClusters,
    selectedCluster,
    isSingleCluster,
    safeResources,
    openIncidents,
    isStale,
    loading,
    loadingResources,
    fetchError,
    resourceFetchError,
    resourcesLastUpdated,
    lastUpdatedAt
  ]);

  const handleAutoHealAll = () => {
    setShowAutoHealConfirmModal(true);
  };

  const handleAutoHealAllConfirmed = async () => {
    try {
      setAutoHealingAll(true);
      setOverviewNotice(null);
      const targetClusterId = clusterFilter !== 'all' ? clusterFilter : undefined;
      const res = await api.autoHealAllIncidents(targetClusterId);
      if (res.total === 0) {
        setOverviewNotice({
          type: 'info',
          message: 'No active eligible incidents found in this scope.'
        });
      } else if (res.healed === res.total) {
        setOverviewNotice({
          type: 'success',
          message: `Successfully auto-healed and verified all ${res.healed} of ${res.total} incidents.`
        });
      } else if (res.healed > 0) {
        setOverviewNotice({
          type: 'warning',
          message: `Partial auto-healing: ${res.healed} of ${res.total} incidents healed and verified (${res.failed} skipped or require manual approval).`
        });
      } else {
        setOverviewNotice({
          type: 'error',
          message: `Auto-healing unexecuted: 0 of ${res.total} incidents healed (${res.failed} failed safety or policy checks).`
        });
      }
      onRefresh();
    } catch (err: any) {
      console.error('Failed to auto-heal fleet incidents:', err);
      setOverviewNotice({
        type: 'error',
        message: err?.message || 'Failed to auto-heal fleet incidents'
      });
    } finally {
      setAutoHealingAll(false);
      setShowAutoHealConfirmModal(false);
    }
  };

  const handleQuickAutoHeal = async (e: React.MouseEvent, incidentId: string) => {
    e.stopPropagation();
    if (healingIncidentId) return;
    try {
      setHealingIncidentId(incidentId);
      setOverviewNotice(null);
      const res = await api.autoHealIncident(incidentId);
      if (res.success && (res.incident?.status === 'RESOLVED' || res.remediation?.status === 'VERIFIED_RESOLVED')) {
        setOverviewNotice({
          type: 'success',
          message: `Incident ${incidentId} auto-healed and verified healthy (${res.remediation?.actionType || 'Remediated'}).`
        });
      } else {
        setOverviewNotice({
          type: 'warning',
          message: `Incident ${incidentId}: Action dispatched (${res.remediation?.status || 'PENDING'}), verification in progress.`
        });
      }
      onRefresh();
    } catch (err: any) {
      console.error(`Failed to auto-heal incident ${incidentId}:`, err);
      setOverviewNotice({
        type: 'error',
        message: err?.message || 'Failed to auto-heal incident'
      });
    } finally {
      setHealingIncidentId(null);
    }
  };

  const formatTimeAgo = (ts?: number) => {
    if (!ts || isNaN(ts) || ts <= 0) return 'Never';
    const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diffSec < 10) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  // Filtered nodes, pods, workloads for detailed breakdown cards
  const filteredNodes = useMemo(() => {
    const list = safeResources.filter((r) => r.kind === 'Node');
    return isSingleCluster ? list.filter((n) => n.clusterId === clusterFilter) : list;
  }, [safeResources, isSingleCluster, clusterFilter]);

  const filteredPods = useMemo(() => {
    const list = safeResources.filter((r) => r.kind === 'Pod');
    return isSingleCluster ? list.filter((p) => p.clusterId === clusterFilter) : list;
  }, [safeResources, isSingleCluster, clusterFilter]);

  const filteredWorkloads = useMemo(() => {
    const list = safeResources.filter((r) =>
      ['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob'].includes(r.kind)
    );
    return isSingleCluster ? list.filter((w) => w.clusterId === clusterFilter) : list;
  }, [safeResources, isSingleCluster, clusterFilter]);

  const crashingPods = useMemo(() => {
    return filteredPods.filter((p) => {
      const isCompleted = p.status === 'Completed' || p.status === 'Succeeded';
      const isTerminating = p.status === 'Terminating' || Boolean((p as any).metadata?.deletionTimestamp);
      if (isCompleted || isTerminating) return false;
      return (
        p.health === 'CRITICAL' ||
        p.status === 'CrashLoopBackOff' ||
        p.status === 'ImagePullBackOff' ||
        p.status === 'ErrImagePull' ||
        p.status === 'OOMKilled' ||
        p.status === 'Failed' ||
        p.status === 'Error'
      );
    });
  }, [filteredPods]);

  const pressureNodes = useMemo(() => {
    return filteredNodes.filter((n) => {
      const conds = Array.isArray(n.conditions) ? n.conditions : [];
      const hasPressure = conds.some(
        (c) =>
          (c.type === 'MemoryPressure' || c.type === 'DiskPressure' || c.type === 'PIDPressure') &&
          (c.status === 'True' || (c.status as any) === true)
      );
      const isNotReady = conds.some(
        (c) => c.type === 'Ready' && (c.status === 'False' || (c.status as any) === false)
      );
      return hasPressure || isNotReady || n.status !== 'Ready';
    });
  }, [filteredNodes]);

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-6 space-y-5 max-w-7xl mx-auto font-sans text-zinc-100">
      {/* 1. Clean Human-Readable Overview Header & Scope Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-bold tracking-tight text-white">
              {isSingleCluster && selectedCluster
                ? `${selectedCluster.displayName || selectedCluster.name} Overview`
                : 'Fleet Health & Operations Summary'}
            </h2>
            <span
              className={`px-2.5 py-0.5 rounded-md text-xs font-semibold flex items-center gap-1.5 border ${
                healthAssessment.status === 'HEALTHY'
                  ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/80'
                  : healthAssessment.status === 'WARNING'
                  ? 'bg-amber-950/70 text-amber-300 border-amber-800/80'
                  : healthAssessment.status === 'DEGRADED' || healthAssessment.status === 'SYNCING'
                  ? 'bg-sky-950/70 text-sky-300 border-sky-800/80'
                  : 'bg-rose-950/80 text-rose-300 border-rose-800/80'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  healthAssessment.status === 'HEALTHY'
                    ? 'bg-emerald-400'
                    : healthAssessment.status === 'WARNING'
                    ? 'bg-amber-400'
                    : healthAssessment.status === 'DEGRADED' || healthAssessment.status === 'SYNCING'
                    ? 'bg-sky-400'
                    : 'bg-rose-500 animate-pulse'
                }`}
              />
              {healthAssessment.status === 'HEALTHY'
                ? 'All Systems Healthy'
                : healthAssessment.status === 'WARNING'
                ? 'Attention Needed'
                : healthAssessment.status === 'CRITICAL'
                ? 'Critical Issues Detected'
                : `Status: ${healthAssessment.status}`}
            </span>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed">
            {healthAssessment.headline} • <span className="text-zinc-500">{healthAssessment.dataFreshnessText}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Cluster filter selector */}
          <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs">
            <Server className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-zinc-500">Scope:</span>
            <select
              value={clusterFilter}
              onChange={(e) => setClusterFilter(e.target.value)}
              className="bg-transparent text-zinc-100 font-medium focus:outline-none cursor-pointer pr-1"
              title="Filter overview by cluster"
            >
              <option value="all" className="bg-zinc-900 text-zinc-100">
                All Clusters ({safeClusters.length})
              </option>
              {safeClusters.map((c) => (
                <option key={c.id} value={c.id} className="bg-zinc-900 text-zinc-100">
                  {c.displayName || c.name}
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading || loadingResources}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${loading || loadingResources ? 'animate-spin text-sky-400' : ''}`} />}
          >
            {loading || loadingResources ? 'Syncing...' : 'Refresh'}
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

      {/* Auto-Heal Fleet Notification */}
      {overviewNotice && (
        <div
          className={`p-3.5 text-xs rounded-xl flex items-center justify-between border ${
            overviewNotice.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-200'
              : overviewNotice.type === 'info'
              ? 'bg-sky-950/60 border-sky-700/60 text-sky-200'
              : 'bg-rose-950/60 border-rose-800 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {overviewNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : overviewNotice.type === 'info' ? (
              <Info className="w-4 h-4 text-sky-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="font-medium">{overviewNotice.message}</span>
          </div>
          <button
            onClick={() => setOverviewNotice(null)}
            className="text-zinc-400 hover:text-zinc-200 ml-3 cursor-pointer text-sm"
          >
            &times;
          </button>
        </div>
      )}

      {/* Prominent Empty State if NO clusters exist */}
      {safeClusters.length === 0 && (
        <div className="p-8 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-center space-y-4 shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-sky-950/60 border border-sky-800/50 flex items-center justify-center mx-auto text-sky-400">
            <Server className="w-7 h-7" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="text-lg font-bold text-zinc-100">No Kubernetes Clusters Connected Yet</h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Connect your first Kubernetes cluster with the lightweight SkyOps Agent to monitor workloads, view live logs, and automatically heal crashes.
            </p>
          </div>
          <div>
            <Button
              variant="primary"
              size="md"
              onClick={onOpenAddCluster}
              icon={<Plus className="w-4 h-4" />}
              className="text-xs px-6 py-2"
            >
              Connect Your First Cluster
            </Button>
          </div>
        </div>
      )}

      {/* 2. Interactive Key Metrics Strip (Click any card to jump to that view) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {/* Total Clusters */}
        <button
          type="button"
          onClick={() => onNavigateTab?.('clusters')}
          className="p-3.5 rounded-xl bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 text-left transition-all flex flex-col justify-between cursor-pointer group"
        >
          <div className="text-xs font-medium text-zinc-400 flex items-center justify-between">
            <span>Clusters</span>
            <Server className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-xl font-bold text-white mt-1.5 tabular-nums">
            {scopedMetrics.totalClustersCount}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1.5">
            {isSingleCluster ? (
              <span className={selectedCluster?.status === 'HEALTHY' ? 'text-emerald-400' : 'text-amber-400'}>
                {selectedCluster?.displayName || selectedCluster?.name || 'Selected'}
              </span>
            ) : (
              <>
                <span className="text-emerald-400 font-medium">{scopedMetrics.healthyClustersCount} healthy</span>
                {scopedMetrics.criticalClustersCount > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-rose-400 font-medium">{scopedMetrics.criticalClustersCount} issue</span>
                  </>
                )}
              </>
            )}
          </div>
        </button>

        {/* Active Incidents */}
        <button
          type="button"
          onClick={() => onNavigateTab?.('incidents')}
          className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer group ${
            scopedMetrics.openIncidentsCount > 0
              ? 'bg-rose-950/20 hover:bg-rose-950/30 border-rose-800/60 text-rose-200'
              : 'bg-zinc-900/50 hover:bg-zinc-900 border-zinc-800/80 hover:border-zinc-700'
          }`}
        >
          <div className="text-xs font-medium flex items-center justify-between">
            <span className={scopedMetrics.openIncidentsCount > 0 ? 'text-rose-300' : 'text-zinc-400'}>
              Open Incidents
            </span>
            <AlertTriangle className={`w-3.5 h-3.5 ${scopedMetrics.openIncidentsCount > 0 ? 'text-rose-400' : 'text-zinc-500'}`} />
          </div>
          <div className="text-xl font-bold text-white mt-1.5 tabular-nums">
            {scopedMetrics.openIncidentsCount}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1.5">
            {scopedMetrics.openIncidentsCount === 0 ? (
              <span className="text-emerald-400">Zero active issues</span>
            ) : (
              <>
                <span className="text-rose-400 font-medium">{scopedMetrics.criticalIncidentsCount} critical</span>
                <span>•</span>
                <span className="text-amber-400 font-medium">{scopedMetrics.highIncidentsCount} high</span>
              </>
            )}
          </div>
        </button>

        {/* Workloads */}
        <button
          type="button"
          onClick={() => onNavigateTab?.('infrastructure')}
          className="p-3.5 rounded-xl bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 text-left transition-all flex flex-col justify-between cursor-pointer group"
        >
          <div className="text-xs font-medium text-zinc-400 flex items-center justify-between">
            <span>Workloads</span>
            <Layers className="w-3.5 h-3.5 text-indigo-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-xl font-bold text-zinc-100 mt-1.5 tabular-nums">
            {scopedMetrics.totalWorkloadsCount}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            {scopedMetrics.degradedWorkloadsCount > 0 ? (
              <span className="text-amber-400 font-medium">{scopedMetrics.degradedWorkloadsCount} degraded</span>
            ) : (
              <span className="text-emerald-400">{scopedMetrics.nominalWorkloadsCount} healthy</span>
            )}
          </div>
        </button>

        {/* Total Pods & Failing Count */}
        <button
          type="button"
          onClick={() => onNavigateTab?.('infrastructure')}
          className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer group ${
            scopedMetrics.crashingPodsCount > 0
              ? 'bg-amber-950/20 hover:bg-amber-950/30 border-amber-800/60'
              : 'bg-zinc-900/50 hover:bg-zinc-900 border-zinc-800/80 hover:border-zinc-700'
          }`}
        >
          <div className="text-xs font-medium flex items-center justify-between">
            <span className={scopedMetrics.crashingPodsCount > 0 ? 'text-amber-300' : 'text-zinc-400'}>Pods</span>
            <Boxes className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <div className="text-xl font-bold text-white mt-1.5 tabular-nums">
            {scopedMetrics.totalPodsCount}
          </div>
          <div className="text-[11px] mt-1">
            {scopedMetrics.totalPodsCount === 0 ? (
              <span className="text-zinc-500">No pods reported</span>
            ) : scopedMetrics.crashingPodsCount > 0 ? (
              <span className="text-rose-400 font-medium">{scopedMetrics.crashingPodsCount} failing</span>
            ) : (
              <span className="text-emerald-400">{scopedMetrics.healthyPodsCount} running</span>
            )}
          </div>
        </button>

        {/* Nodes Online */}
        <button
          type="button"
          onClick={() => onNavigateTab?.('infrastructure')}
          className="p-3.5 rounded-xl bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 text-left transition-all flex flex-col justify-between cursor-pointer group"
        >
          <div className="text-xs font-medium text-zinc-400 flex items-center justify-between">
            <span>Worker Nodes</span>
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-zinc-100 mt-1.5 tabular-nums">
            {scopedMetrics.totalNodesCount}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1">
            {scopedMetrics.totalNodesCount === 0 ? (
              <span className="text-zinc-500">No nodes</span>
            ) : scopedMetrics.pressureNodesCount > 0 ? (
              <span className="text-amber-400 font-medium">{scopedMetrics.pressureNodesCount} under pressure</span>
            ) : (
              <span className="text-emerald-400">{scopedMetrics.readyNodesCount} Ready</span>
            )}
          </div>
        </button>

        {/* Live Telemetry & Logs */}
        <button
          type="button"
          onClick={() => onNavigateTab?.('observability')}
          className="p-3.5 rounded-xl bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 text-left transition-all flex flex-col justify-between cursor-pointer group"
        >
          <div className="text-xs font-medium text-zinc-400 flex items-center justify-between">
            <span>Agent Telemetry</span>
            <Activity className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-xl font-bold text-emerald-400 mt-1.5 flex items-baseline gap-1.5 tabular-nums">
            <span>{scopedMetrics.connectedAgentsCount}</span>
            <span className="text-xs font-normal text-zinc-500">
              / {isSingleCluster ? 1 : safeClusters.length} online
            </span>
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            {scopedMetrics.offlineAgentsCount > 0 ? (
              <span className="text-rose-400">{scopedMetrics.offlineAgentsCount} agent offline</span>
            ) : (
              <span className="text-sky-400 flex items-center gap-1">
                View metrics & logs →
              </span>
            )}
          </div>
        </button>
      </div>

      {/* 3. Operational Attention Banner if Failing Resources */}
      {crashingPods.length > 0 && (
        <div className="p-4 rounded-xl bg-rose-950/25 border border-rose-800/60 text-xs space-y-3">
          <div className="flex items-center justify-between border-b border-rose-900/50 pb-2.5">
            <div className="flex items-center gap-2 text-rose-200 font-semibold">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>
                Unhealthy Pods Detected ({crashingPods.length} pod{crashingPods.length === 1 ? '' : 's'} crashing or failing)
              </span>
            </div>
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('infrastructure')}
                className="text-xs text-rose-300 hover:text-white font-medium cursor-pointer"
              >
                Open Infrastructure Explorer →
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {crashingPods.slice(0, 4).map((p) => (
              <div
                key={p.id}
                className="p-3 rounded-lg bg-zinc-950/80 border border-rose-900/40 flex items-center justify-between gap-3"
              >
                <div className="truncate">
                  <div className="font-semibold text-zinc-100 truncate font-mono text-xs">{p.name}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    Namespace: <span className="text-zinc-200 font-mono">{p.namespace}</span> •{' '}
                    <span className="text-rose-400 font-semibold">{p.status}</span> •{' '}
                    {p.containers?.reduce((acc, c) => acc + (c.restartCount || 0), 0) || 0} restarts
                  </div>
                </div>
                {p.clusterId && (
                  <button
                    onClick={() => onSelectCluster(p.clusterId)}
                    className="px-2.5 py-1 rounded-md bg-rose-950 text-rose-200 border border-rose-800 text-xs hover:bg-rose-900 transition-colors shrink-0 cursor-pointer font-medium"
                  >
                    Inspect →
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Two-Column Core Layout: Connected Clusters & Active Incidents */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Connected Clusters */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Server className="w-4 h-4 text-sky-400" />
                <span>Connected Kubernetes Clusters ({isSingleCluster ? 1 : safeClusters.length})</span>
              </h2>
              <p className="text-[11px] text-zinc-400">Click any cluster to inspect its workloads, pods, and live logs</p>
            </div>
            <div className="flex items-center gap-3">
              {onNavigateTab && (
                <button
                  onClick={() => onNavigateTab('clusters')}
                  className="text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  View all →
                </button>
              )}
            </div>
          </div>

          {safeClusters.length === 0 ? (
            <EmptyState
              title="No Kubernetes clusters connected"
              description="Connect your first cluster to start streaming telemetry and detecting incidents."
              action={{ label: 'Connect Cluster', onClick: onOpenAddCluster }}
            />
          ) : (
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden divide-y divide-zinc-800/70">
              {(isSingleCluster && selectedCluster ? [selectedCluster] : safeClusters).map((cluster) => {
                const clusterPods = safeResources.filter((p) => p.kind === 'Pod' && p.clusterId === cluster.id);
                const clusterCrashing = clusterPods.filter(
                  (p) =>
                    p.health === 'CRITICAL' ||
                    p.status === 'CrashLoopBackOff' ||
                    p.status === 'ImagePullBackOff' ||
                    p.status === 'ErrImagePull' ||
                    p.status === 'OOMKilled'
                );
                const clusterIncidents = openIncidents.filter((i) => i.clusterId === cluster.id);
                const clusterProvider = cluster.provider || cluster.infrastructure?.provider;
                const clusterRegion = cluster.region || cluster.infrastructure?.region;
                const clusterRegions = cluster.regions || cluster.infrastructure?.regions || [];
                const clusterZones = cluster.zones || cluster.infrastructure?.zones || [];
                const clusterInstanceTypes = cluster.instanceTypes || cluster.infrastructure?.instanceTypes || [];

                return (
                  <div
                    key={cluster.id}
                    onClick={() => onSelectCluster(cluster.id)}
                    className="p-4 hover:bg-zinc-800/40 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-zinc-100 truncate">
                          {cluster.displayName || cluster.name}
                        </span>
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                          {cluster.environment || 'production'}
                        </span>
                        <ClusterInfrastructureBadges
                          provider={clusterProvider}
                          region={clusterRegion}
                          regions={clusterRegions}
                          zones={clusterZones}
                          instanceTypes={clusterInstanceTypes}
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-zinc-400 text-xs">
                        <span>
                          {cluster.k8sVersion
                            ? `K8s ${cluster.k8sVersion}`
                            : cluster.agentStatus === 'CONNECTED'
                            ? 'K8s Ready'
                            : 'K8s —'}
                        </span>
                        <span className="text-zinc-600">•</span>
                        <span>{cluster.nodeCount} Nodes</span>
                        <span className="text-zinc-600">•</span>
                        <span>{cluster.podCount} Pods</span>

                        {clusterCrashing.length > 0 && (
                          <>
                            <span className="text-zinc-600">•</span>
                            <span className="text-rose-400 font-medium">
                              {clusterCrashing.length} failing pod{clusterCrashing.length === 1 ? '' : 's'}
                            </span>
                          </>
                        )}

                        {clusterIncidents.length > 0 && (
                          <>
                            <span className="text-zinc-600">•</span>
                            <span className="text-amber-400 font-medium">
                              {clusterIncidents.length} active incident{clusterIncidents.length === 1 ? '' : 's'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 sm:self-center justify-between sm:justify-end">
                      <div className="text-left sm:text-right">
                        <ClusterStatusBadge status={cluster.status} agentStatus={cluster.agentStatus} />
                        <div className="text-[11px] text-zinc-500 mt-1">
                          Updated {formatTimeAgo(cluster.lastHeartbeat || cluster.lastHeartbeatAt)}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-500" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column (5 cols): Active Incidents & Auto-Healing */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Active Incidents ({displayedIncidents.length})</span>
              </h2>
              <p className="text-[11px] text-zinc-400">Sorted by severity and operational impact</p>
            </div>
            {openIncidents.length > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleAutoHealAll}
                disabled={autoHealingAll}
                icon={<Zap className={`w-3.5 h-3.5 text-amber-300 ${autoHealingAll ? 'animate-bounce' : ''}`} />}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-xs"
                title="Auto-heal all active incidents across clusters"
              >
                {autoHealingAll ? 'Healing...' : 'Auto-Heal All'}
              </Button>
            )}
          </div>

          {/* Sub-tabs for incident filtering */}
          <div className="flex items-center gap-1.5 border-b border-zinc-800 pb-2 text-xs">
            <button
              onClick={() => setActiveIncidentTab('all')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                activeIncidentTab === 'all'
                  ? 'bg-zinc-800 text-white font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All ({openIncidents.length})
            </button>
            <button
              onClick={() => setActiveIncidentTab('critical')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                activeIncidentTab === 'critical'
                  ? 'bg-rose-950 text-rose-300 font-semibold border border-rose-800'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Critical ({scopedMetrics.criticalIncidentsCount})
            </button>
            <button
              onClick={() => setActiveIncidentTab('high')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                activeIncidentTab === 'high'
                  ? 'bg-amber-950 text-amber-300 font-semibold border border-amber-800'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              High ({scopedMetrics.highIncidentsCount})
            </button>
          </div>

          {displayedIncidents.length === 0 ? (
            <div className="p-8 border border-zinc-800/80 rounded-xl bg-zinc-900/30 text-center text-xs">
              <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <div className="font-semibold text-zinc-200 text-sm">All Clear — No Active Incidents</div>
              <div className="text-zinc-400 mt-1">
                All monitored Kubernetes workloads and nodes are healthy.
              </div>
            </div>
          ) : (
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden divide-y divide-zinc-800/70 text-xs">
              {displayedIncidents.slice(0, 6).map((inc) => (
                <div
                  key={inc.id}
                  onClick={() => onSelectIncident(inc.id)}
                  className="p-3.5 hover:bg-zinc-800/40 transition-colors cursor-pointer space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <SeverityBadge severity={inc.severity} size="sm" />
                      <StatusBadge status={inc.status} size="sm" />
                      {inc.correlatedCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-purple-950/70 border border-purple-800 text-purple-300 text-[10px] font-medium">
                          +{inc.correlatedCount} related
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-zinc-500">{formatTimeAgo(inc.lastSeenAt)}</span>
                  </div>

                  <div className="font-semibold text-zinc-100 text-sm leading-snug">{inc.title}</div>

                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-zinc-800/40">
                    <div className="text-[11px] text-zinc-400 truncate">
                      <span className="text-zinc-300 font-medium">{inc.clusterName}</span>
                      <span className="mx-1.5 text-zinc-600">•</span>
                      <span className="font-mono text-zinc-300">{inc.namespace}/{inc.resourceName}</span>
                    </div>

                    {inc.status !== 'RESOLVED' && inc.status !== 'CLOSED' && (
                      inc.remediationEligibility.isEligible ? (
                        <button
                          onClick={(e) => handleQuickAutoHeal(e, inc.id)}
                          disabled={healingIncidentId === inc.id}
                          className="px-2.5 py-1 bg-emerald-950/90 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 rounded-md text-[11px] transition-colors cursor-pointer flex items-center gap-1 font-semibold shrink-0"
                          title="Auto-heal this incident with closed-loop verification"
                        >
                          {healingIncidentId === inc.id ? (
                            <Loader2 className="w-3 h-3 animate-spin text-emerald-300" />
                          ) : (
                            <Zap className="w-3 h-3 text-amber-300" />
                          )}
                          <span>Auto-Heal</span>
                        </button>
                      ) : (
                        <span
                          className="px-2 py-0.5 bg-zinc-800/80 border border-zinc-700 text-zinc-400 rounded text-[10px] shrink-0"
                          title={inc.remediationEligibility.reason}
                        >
                          Inspect
                        </span>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 5. Recent Activity Stream */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-400" />
            <span>Recent Workspace Activity</span>
          </h2>
          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('audit')}
              className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer font-medium"
            >
              <span>View Full Activity Log</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4">
          {scopedActivity.length === 0 ? (
            <div className="text-xs text-zinc-500 py-2">
              No recent activity recorded in this session yet.
            </div>
          ) : (
            <div className="space-y-2.5 text-xs">
              {scopedActivity.slice(0, 6).map((act) => (
                <div
                  key={act.id}
                  className="flex items-center justify-between gap-3 text-zinc-300 pb-2.5 border-b border-zinc-800/50 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-zinc-500 text-[11px] shrink-0 w-16">{formatTimeAgo(act.timestamp)}</span>
                    <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono shrink-0 border border-zinc-700">
                      {act.type}
                    </span>
                    <span className="text-zinc-200 truncate">{act.description}</span>
                  </div>
                  {act.incidentId && (
                    <button
                      onClick={() => onSelectIncident(act.incidentId!)}
                      className="text-sky-400 hover:text-sky-300 shrink-0 text-xs font-medium cursor-pointer"
                    >
                      View Incident →
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Auto-Heal Confirmation Modal */}
      {showAutoHealConfirmModal && (
        <Modal
          isOpen={showAutoHealConfirmModal}
          onClose={() => setShowAutoHealConfirmModal(false)}
          title="Confirm Automated Fleet Remediation"
          maxWidth="max-w-lg"
        >
          <div className="space-y-4 font-mono text-xs">
            <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-lg text-amber-200">
              <div className="font-bold mb-1 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Operator Confirmation Required</span>
              </div>
              <p className="text-[11px] text-zinc-300 leading-relaxed">
                You are initiating automated closed-loop healing for{' '}
                <strong className="text-white">
                  {clusterFilter !== 'all' ? `cluster "${selectedCluster?.name || clusterFilter}"` : 'all connected clusters'}
                </strong>.
                SkyOps will execute bounded safe mutations (e.g. RolloutRestart, RestartPod) and verify telemetry recovery.
              </p>
            </div>

            <div className="space-y-2 border border-zinc-800 rounded-lg p-3 bg-zinc-900/50">
              <div className="text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                Target Incident Scope ({openIncidents.length} active)
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1.5 divide-y divide-zinc-800/40">
                {openIncidents.slice(0, 10).map((inc) => (
                  <div key={inc.id} className="pt-1.5 first:pt-0 flex items-center justify-between text-[11px]">
                    <span className="text-zinc-300 truncate max-w-[260px]">{inc.title}</span>
                    <span className="text-emerald-400 font-semibold shrink-0">
                      {inc.incidentType === 'ImagePullBackOff' ? 'RollbackDeployment' : 'RolloutRestart'}
                    </span>
                  </div>
                ))}
                {openIncidents.length > 10 && (
                  <div className="text-[10px] text-zinc-500 pt-1">
                    + {openIncidents.length - 10} additional eligible incidents...
                  </div>
                )}
              </div>
            </div>

            <div className="text-[10px] text-zinc-400">
              Incidents requiring manual architectural review or policy changes will be safely skipped.
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAutoHealConfirmModal(false)}
                disabled={autoHealingAll}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleAutoHealAllConfirmed}
                disabled={autoHealingAll}
                icon={autoHealingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
              >
                {autoHealingAll ? 'Executing Verified Healing...' : 'Confirm & Execute Auto-Heal'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export const OverviewView: React.FC<OverviewViewProps> = (props) => {
  return (
    <ErrorBoundary
      fallbackTitle="Command Center Error"
      fallbackMessage="An unexpected error occurred while rendering the Global Command Center overview. You can retry or refresh the page."
      onReset={props.onRefresh}
    >
      <OverviewViewContent {...props} />
    </ErrorBoundary>
  );
};
