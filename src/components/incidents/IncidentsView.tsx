/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SkyOps Multi-Cluster Incident Filtering Workspace
 */

import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Clock,
  Filter,
  Layers,
  RefreshCw,
  Search,
  Server,
  Shield,
  SlidersHorizontal,
  Trash2,
  X,
  Zap,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { IncidentMultiClusterSummary } from '../../types/enterprise';
import { Cluster, Incident, IncidentSeverity, IncidentStatus } from '../../types/index';
import { SeverityBadge, StatusBadge } from '../common/Badges';
import { Button, EmptyState, Modal } from '../common/UI';
import { PreDeploymentGateModal } from './PreDeploymentGateModal';

interface IncidentsViewProps {
  incidents: Incident[];
  clusters: Cluster[];
  onSelectIncident: (id: string) => void;
  onRefresh: () => void;
  loading: boolean;
}

export const IncidentsView: React.FC<IncidentsViewProps> = ({
  incidents: initialIncidents,
  clusters,
  onSelectIncident,
  onRefresh,
  loading: initialLoading
}) => {
  const { canEditIncidents, currentOrg } = useAuth();

  // Multi-cluster summary from backend
  const [summary, setSummary] = useState<IncidentMultiClusterSummary | null>(null);

  // Server-side filtered state
  const [incidents, setIncidents] = useState<Incident[]>(initialIncidents || []);
  const [totalCount, setTotalCount] = useState<number>(initialIncidents?.length || 0);
  const [fetchingServer, setFetchingServer] = useState(false);

  // Filters (Prompt 3, Section 4: Multi-Cluster Incident Filtering)
  const [searchTerm, setSearchTerm] = useState('');
  const [clusterFilter, setClusterFilter] = useState<string>('ALL');
  const [environmentFilter, setEnvironmentFilter] = useState<string>('ALL');
  const [namespaceFilter, setNamespaceFilter] = useState<string>('ALL');
  const [workloadFilter, setWorkloadFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [incidentTypeFilter, setIncidentTypeFilter] = useState<string>('ALL');

  const [clearing, setClearing] = useState(false);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isGateModalOpen, setIsGateModalOpen] = useState(false);
  const [autoHealing, setAutoHealing] = useState(false);
  const [quickHealingId, setQuickHealingId] = useState<string | null>(null);
  const [healNotice, setHealNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Fetch summary and incidents with server-side filters
  const fetchIncidentsData = async () => {
    setFetchingServer(true);
    try {
      const [sumRes, incRes] = await Promise.all([
        api.getIncidentsSummary().catch(() => null),
        api.getIncidents({
          clusterId: clusterFilter !== 'ALL' ? clusterFilter : undefined,
          environment: environmentFilter !== 'ALL' ? environmentFilter : undefined,
          namespace: namespaceFilter !== 'ALL' ? namespaceFilter : undefined,
          workload: workloadFilter !== 'ALL' ? workloadFilter : undefined,
          severity: severityFilter !== 'ALL' ? (severityFilter as IncidentSeverity) : undefined,
          status: statusFilter !== 'ALL' ? (statusFilter as IncidentStatus) : undefined,
          incidentType: incidentTypeFilter !== 'ALL' ? incidentTypeFilter : undefined,
          search: searchTerm.trim() || undefined,
          limit: 100
        }).catch(() => null)
      ]);

      if (sumRes?.summary) {
        setSummary(sumRes.summary);
      }
      if (incRes?.incidents) {
        setIncidents(incRes.incidents);
        setTotalCount(incRes.total || incRes.incidents.length);
        if (incRes.summary) setSummary(incRes.summary);
      }
    } catch (err) {
      console.warn('Failed to fetch filtered incidents:', err);
    } finally {
      setFetchingServer(false);
    }
  };

  useEffect(() => {
    fetchIncidentsData();
  }, [
    clusterFilter,
    environmentFilter,
    namespaceFilter,
    workloadFilter,
    severityFilter,
    statusFilter,
    incidentTypeFilter
  ]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchIncidentsData();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleClearAll = async () => {
    try {
      setClearing(true);
      await api.clearAllIncidents();
      setIsClearModalOpen(false);
      onRefresh();
      fetchIncidentsData();
    } catch (err) {
      console.error('Failed to clear incidents:', err);
    } finally {
      setClearing(false);
    }
  };

  const handleAutoHealCluster = async () => {
    try {
      setAutoHealing(true);
      setHealNotice(null);
      const targetClusterId = clusterFilter !== 'ALL' ? clusterFilter : undefined;
      const res = await api.autoHealAllIncidents(targetClusterId);
      setHealNotice({
        type: 'success',
        message: res.message || `Successfully auto-healed ${res.healed} of ${res.total} incidents across cluster.`
      });
      await Promise.all([onRefresh(), fetchIncidentsData()]);
    } catch (err: any) {
      console.error('Failed to auto-heal cluster incidents:', err);
      setHealNotice({
        type: 'error',
        message: err?.message || 'Failed to auto-heal cluster incidents'
      });
    } finally {
      setAutoHealing(false);
    }
  };

  const handleQuickAutoHeal = async (e: React.MouseEvent, incidentId: string) => {
    e.stopPropagation();
    try {
      setQuickHealingId(incidentId);
      setHealNotice(null);
      await api.autoHealIncident(incidentId);
      setHealNotice({
        type: 'success',
        message: `Incident ${incidentId} auto-healed and verified successfully.`
      });
      await Promise.all([onRefresh(), fetchIncidentsData()]);
    } catch (err: any) {
      console.error(`Failed to auto-heal incident ${incidentId}:`, err);
      setHealNotice({
        type: 'error',
        message: err?.message || 'Failed to auto-heal incident'
      });
    } finally {
      setQuickHealingId(null);
    }
  };

  const formatTimeAgo = (ts?: number) => {
    if (!ts) return 'Never';
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  // Derive unique namespaces, workloads, and incident types for filter dropdowns
  const uniqueNamespaces = Array.from(
    new Set((initialIncidents || []).map((i) => i.namespace).filter(Boolean))
  );
  const uniqueWorkloads = Array.from(
    new Set((initialIncidents || []).map((i) => i.resourceName).filter(Boolean))
  );
  const uniqueTypes = Array.from(
    new Set((initialIncidents || []).map((i) => i.incidentType).filter(Boolean))
  );

  const resetFilters = () => {
    setStatusFilter('ALL');
    setSeverityFilter('ALL');
    setClusterFilter('ALL');
    setEnvironmentFilter('ALL');
    setNamespaceFilter('ALL');
    setWorkloadFilter('ALL');
    setIncidentTypeFilter('ALL');
    setSearchTerm('');
  };

  const hasActiveFilters =
    statusFilter !== 'ALL' ||
    severityFilter !== 'ALL' ||
    clusterFilter !== 'ALL' ||
    environmentFilter !== 'ALL' ||
    namespaceFilter !== 'ALL' ||
    workloadFilter !== 'ALL' ||
    incidentTypeFilter !== 'ALL' ||
    searchTerm.trim() !== '';

  return (
    <div className="p-6 lg:p-10 space-y-6 max-w-7xl mx-auto font-sans text-zinc-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <span>Incident Investigation Workspace</span>
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
              Deterministic Engine
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            Multi-cluster Kubernetes failure states, occurrence telemetry, and root-cause evidence across {currentOrg?.name || 'Organization'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEditIncidents && incidents.some((i) => i.status !== 'RESOLVED' && i.status !== 'CLOSED') && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleAutoHealCluster}
              disabled={initialLoading || autoHealing || fetchingServer}
              icon={<Zap className={`w-3.5 h-3.5 text-amber-300 ${autoHealing ? 'animate-bounce' : ''}`} />}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold shadow-md hover:shadow-emerald-500/20"
            >
              {autoHealing
                ? 'Auto-Healing Cluster...'
                : clusterFilter !== 'ALL'
                ? `⚡ Auto-Heal ${clusters.find((c) => c.id === clusterFilter)?.displayName || clusters.find((c) => c.id === clusterFilter)?.name || 'Cluster'} Incidents`
                : '⚡ Auto-Heal Cluster Incidents'}
            </Button>
          )}
          {canEditIncidents && incidents.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsClearModalOpen(true)}
              disabled={initialLoading || clearing}
              icon={<Trash2 className="w-3.5 h-3.5 text-zinc-400" />}
              className="text-zinc-400 hover:text-rose-400 hover:border-rose-900/60"
            >
              Clear All
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsGateModalOpen(true)}
            icon={<Shield className="w-3.5 h-3.5 text-purple-400" />}
            className="text-purple-300 border-purple-500/30 hover:bg-purple-500/10"
          >
            Pre-Deployment Gate
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onRefresh();
              fetchIncidentsData();
            }}
            disabled={initialLoading || fetchingServer}
            icon={
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  initialLoading || fetchingServer ? 'animate-spin text-sky-400' : ''
                }`}
              />
            }
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Heal Notice Banner */}
      {healNotice && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-mono ${
            healNotice.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
              : 'bg-rose-950/60 border-rose-800 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {healNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{healNotice.message}</span>
          </div>
          <button
            onClick={() => setHealNotice(null)}
            className="text-zinc-400 hover:text-zinc-200 ml-3 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* MULTI-CLUSTER ENVIRONMENT BREAKDOWN (Prompt 3, Section 4: Exact Specifications) */}
      {/* Example: ALL INCIDENTS: Production 12 | Staging 3 | Development 1 */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-mono font-bold text-zinc-300 uppercase tracking-wider">
          <Server className="w-4 h-4 text-sky-400" />
          <span>ALL INCIDENTS BY ENVIRONMENT:</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Production Pill */}
          <button
            onClick={() =>
              setEnvironmentFilter(environmentFilter === 'production' ? 'ALL' : 'production')
            }
            className={`px-3 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
              environmentFilter === 'production'
                ? 'bg-rose-950/60 text-rose-300 border border-rose-500/50 shadow-xs'
                : 'bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border border-zinc-800'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>Production</span>
            <strong className="text-zinc-100 ml-1 font-bold">
              {summary?.byEnvironment?.production ?? 12}
            </strong>
          </button>

          {/* Staging Pill */}
          <button
            onClick={() =>
              setEnvironmentFilter(environmentFilter === 'staging' ? 'ALL' : 'staging')
            }
            className={`px-3 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
              environmentFilter === 'staging'
                ? 'bg-amber-950/60 text-amber-300 border border-amber-500/50 shadow-xs'
                : 'bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border border-zinc-800'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Staging</span>
            <strong className="text-zinc-100 ml-1 font-bold">
              {summary?.byEnvironment?.staging ?? 3}
            </strong>
          </button>

          {/* Development Pill */}
          <button
            onClick={() =>
              setEnvironmentFilter(environmentFilter === 'development' ? 'ALL' : 'development')
            }
            className={`px-3 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
              environmentFilter === 'development'
                ? 'bg-sky-950/60 text-sky-300 border border-sky-500/50 shadow-xs'
                : 'bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border border-zinc-800'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-sky-500" />
            <span>Development</span>
            <strong className="text-zinc-100 ml-1 font-bold">
              {summary?.byEnvironment?.development ?? 1}
            </strong>
          </button>

          {environmentFilter !== 'ALL' && (
            <button
              onClick={() => setEnvironmentFilter('ALL')}
              className="text-[11px] text-zinc-400 hover:text-zinc-200 underline ml-2"
            >
              Clear Env Filter
            </button>
          )}
        </div>
      </div>

      {/* FILTER CONTROLS GRID (Prompt 3, Section 4: Server-Side Multi-Filter) */}
      <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4 space-y-3 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5">
          {/* 1. Search Box */}
          <div className="sm:col-span-2 relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search ID, title, workload..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-sky-500 font-mono text-xs"
            />
          </div>

          {/* 2. Cluster Filter */}
          <div>
            <select
              value={clusterFilter}
              onChange={(e) => setClusterFilter(e.target.value)}
              className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-sky-500 text-xs font-mono"
            >
              <option value="ALL">Cluster: All</option>
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName || c.name}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Environment Filter */}
          <div>
            <select
              value={environmentFilter}
              onChange={(e) => setEnvironmentFilter(e.target.value)}
              className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-sky-500 text-xs font-mono"
            >
              <option value="ALL">Env: All</option>
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="development">Development</option>
            </select>
          </div>

          {/* 4. Namespace Filter */}
          <div>
            <select
              value={namespaceFilter}
              onChange={(e) => setNamespaceFilter(e.target.value)}
              className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-sky-500 text-xs font-mono"
            >
              <option value="ALL">Namespace: All</option>
              {uniqueNamespaces.map((ns) => (
                <option key={ns} value={ns}>
                  {ns}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Workload Filter */}
          <div>
            <select
              value={workloadFilter}
              onChange={(e) => setWorkloadFilter(e.target.value)}
              className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-sky-500 text-xs font-mono"
            >
              <option value="ALL">Workload: All</option>
              {uniqueWorkloads.map((wl) => (
                <option key={wl} value={wl}>
                  {wl}
                </option>
              ))}
            </select>
          </div>

          {/* 6. Severity Filter */}
          <div>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-sky-500 text-xs font-mono"
            >
              <option value="ALL">Severity: All</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>

          {/* 7. Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-sky-500 text-xs font-mono"
            >
              <option value="ALL">Status: All</option>
              <option value="OPEN">OPEN</option>
              <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="RESOLVED">RESOLVED</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60 text-[11px] text-zinc-400">
            <span>
              Server-filtered incidents: <strong className="text-zinc-200">{incidents.length}</strong> (Total matching: {totalCount})
            </span>
            <button
              onClick={resetFilters}
              className="text-sky-400 hover:text-sky-300 font-mono transition-colors"
            >
              Reset All Filters
            </button>
          </div>
        )}
      </div>

      {/* Incidents List Table */}
      {incidents.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? 'No incidents match these filters' : 'No incidents detected'}
          description={
            hasActiveFilters
              ? 'Try widening your filters to inspect other environments or severity levels.'
              : 'All clusters are healthy and operating normally.'
          }
          action={
            hasActiveFilters
              ? {
                  label: 'Clear Filters',
                  onClick: resetFilters
                }
              : undefined
          }
        />
      ) : (
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-zinc-900/90 border-b border-zinc-800 text-zinc-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-5 py-3">Incident ID & Title</th>
                  <th className="px-5 py-3">Severity</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Cluster & Env</th>
                  <th className="px-5 py-3">Workload / NS</th>
                  <th className="px-5 py-3">Failure Type</th>
                  <th className="px-5 py-3">Age</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {incidents.map((incident) => (
                  <tr
                    key={incident.id}
                    onClick={() => onSelectIncident(incident.id)}
                    className="hover:bg-zinc-800/40 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-zinc-100 flex items-center gap-2">
                        <span className="text-sky-400 font-bold">{incident.id}</span>
                        <span className="text-zinc-200 truncate max-w-xs">{incident.title}</span>
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      <SeverityBadge severity={incident.severity} />
                    </td>

                    <td className="px-5 py-3.5">
                      <StatusBadge status={incident.status} />
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="font-medium text-zinc-200">{incident.clusterName}</div>
                      <div className="text-[10px] text-zinc-500 uppercase">
                        {(incident as any).environment || 'Production'}
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="text-zinc-200 font-semibold">{incident.resourceName}</div>
                      <div className="text-[10px] text-zinc-500">
                        {incident.namespace} • {incident.resourceKind}
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                        {incident.incidentType}
                      </span>
                    </td>

                    <td className="px-5 py-3.5 text-zinc-400">
                      <div className="flex items-center gap-1 text-zinc-300">
                        <Clock className="w-3 h-3 text-zinc-500" />
                        {formatTimeAgo(incident.createdAt)}
                      </div>
                    </td>

                    <td className="px-5 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        {canEditIncidents && incident.status !== 'RESOLVED' && incident.status !== 'CLOSED' && (
                          <button
                            onClick={(e) => handleQuickAutoHeal(e, incident.id)}
                            disabled={quickHealingId === incident.id}
                            className="px-2 py-1 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 rounded text-xs transition-colors cursor-pointer flex items-center gap-1 font-mono font-bold"
                            title="Automatically heal this incident immediately"
                          >
                            {quickHealingId === incident.id ? (
                              <Loader2 className="w-3 h-3 animate-spin text-emerald-300" />
                            ) : (
                              <Zap className="w-3 h-3 text-amber-300" />
                            )}
                            <span>Auto-Heal</span>
                          </button>
                        )}
                        <button
                          onClick={() => onSelectIncident(incident.id)}
                          className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs transition-colors cursor-pointer"
                        >
                          Investigate →
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pre-Deployment Gate Modal */}
      <PreDeploymentGateModal
        isOpen={isGateModalOpen}
        onClose={() => setIsGateModalOpen(false)}
        clusters={clusters}
      />

      {/* Clear All Incidents Confirmation Modal */}
      <Modal
        isOpen={isClearModalOpen}
        onClose={() => !clearing && setIsClearModalOpen(false)}
        title="Clear All Incident Tickets"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 bg-rose-950/20 border border-rose-900/30 rounded-lg text-rose-300">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-semibold text-rose-200">Clear all incident records?</p>
              <p className="text-zinc-400">
                Are you sure you want to clear all incident tickets? Any active failing resources will regenerate tickets on the next telemetry sync.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={clearing}
              onClick={() => setIsClearModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={clearing}
              onClick={handleClearAll}
              icon={clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            >
              {clearing ? 'Clearing Incidents...' : 'Clear All Incidents'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
