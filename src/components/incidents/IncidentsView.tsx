import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Clock,
  Filter,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  X
} from 'lucide-react';
import React, { useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Cluster, Incident, IncidentSeverity, IncidentStatus } from '../../types/index';
import { SeverityBadge, StatusBadge } from '../common/Badges';
import { Button, EmptyState } from '../common/UI';

interface IncidentsViewProps {
  incidents: Incident[];
  clusters: Cluster[];
  onSelectIncident: (id: string) => void;
  onRefresh: () => void;
  loading: boolean;
}

export const IncidentsView: React.FC<IncidentsViewProps> = ({
  incidents,
  clusters,
  onSelectIncident,
  onRefresh,
  loading
}) => {
  const { canEditIncidents } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [clusterFilter, setClusterFilter] = useState<string>('ALL');
  const [clearing, setClearing] = useState(false);

  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to clear all incident tickets? Any active failing resources will regenerate tickets on the next telemetry sync.')) return;
    try {
      setClearing(true);
      await api.clearAllIncidents();
      onRefresh();
    } catch (err) {
      console.error('Failed to clear incidents:', err);
    } finally {
      setClearing(false);
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

  const safeIncidents = Array.isArray(incidents) ? incidents : [];
  const safeClusters = Array.isArray(clusters) ? clusters : [];

  const filteredIncidents = safeIncidents.filter((inc) => {
    if (!inc) return false;
    const q = (searchTerm || '').toLowerCase().trim();
    const matchesSearch =
      !q ||
      (inc.id && inc.id.toLowerCase().includes(q)) ||
      (inc.title && inc.title.toLowerCase().includes(q)) ||
      (inc.resourceName && inc.resourceName.toLowerCase().includes(q)) ||
      (inc.namespace && inc.namespace.toLowerCase().includes(q)) ||
      (inc.clusterName && inc.clusterName.toLowerCase().includes(q)) ||
      (inc.incidentType && inc.incidentType.toLowerCase().includes(q));

    const matchesStatus = statusFilter === 'ALL' || inc.status === statusFilter;
    const matchesSeverity = severityFilter === 'ALL' || inc.severity === severityFilter;
    const matchesCluster = clusterFilter === 'ALL' || inc.clusterId === clusterFilter;

    return Boolean(matchesSearch && matchesStatus && matchesSeverity && matchesCluster);
  });

  const activeFiltersCount =
    (statusFilter !== 'ALL' ? 1 : 0) + (severityFilter !== 'ALL' ? 1 : 0) + (clusterFilter !== 'ALL' ? 1 : 0);

  const resetFilters = () => {
    setStatusFilter('ALL');
    setSeverityFilter('ALL');
    setClusterFilter('ALL');
    setSearchTerm('');
  };

  return (
    <div className="p-6 lg:p-10 space-y-6 max-w-7xl mx-auto font-sans text-zinc-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/6 pb-5">
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
            Deduplicated Kubernetes failure states, occurrence telemetry, and root-cause evidence
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEditIncidents && incidents.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAll}
              disabled={loading || clearing}
              icon={<Trash2 className="w-3.5 h-3.5 text-zinc-400" />}
              className="text-zinc-400 hover:text-rose-400 hover:border-rose-900/60"
            >
              Clear All
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-400' : ''}`} />}
          >
            Refresh Incidents
          </Button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="cosmic-panel rounded-xl p-4 space-y-3 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Search Box */}
          <div className="sm:col-span-4 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search SKY ID, resource, namespace..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-[#05060A] border border-white/10 rounded-lg text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-sky-500 font-mono text-xs"
            />
          </div>

          {/* Status Filter */}
          <div className="sm:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-[#05060A] border border-white/10 rounded-lg text-zinc-200 focus:outline-none focus:border-sky-500 text-xs"
            >
              <option value="ALL">Status: All</option>
              <option value="OPEN">Status: OPEN</option>
              <option value="ACKNOWLEDGED">Status: ACKNOWLEDGED</option>
              <option value="IN_PROGRESS">Status: IN_PROGRESS</option>
              <option value="RESOLVED">Status: RESOLVED</option>
              <option value="CLOSED">Status: CLOSED</option>
            </select>
          </div>

          {/* Severity Filter */}
          <div className="sm:col-span-2">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-[#05060A] border border-white/10 rounded-lg text-zinc-200 focus:outline-none focus:border-sky-500 text-xs"
            >
              <option value="ALL">Severity: All</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
              <option value="INFO">INFO</option>
            </select>
          </div>

          {/* Cluster Filter */}
          <div className="sm:col-span-3">
            <select
              value={clusterFilter}
              onChange={(e) => setClusterFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-[#05060A] border border-white/10 rounded-lg text-zinc-200 focus:outline-none focus:border-sky-500 text-xs"
            >
              <option value="ALL">Cluster: All Clusters</option>
              {safeClusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.id}
                </option>
              ))}
            </select>
          </div>
        </div>

        {activeFiltersCount > 0 && (
          <div className="flex items-center justify-between pt-2 border-t border-white/6 text-xs text-zinc-400">
            <span>{activeFiltersCount} active filter(s) applied</span>
            <button
              onClick={resetFilters}
              className="text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer font-medium"
            >
              <X className="w-3 h-3" />
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Incidents Table */}
      {filteredIncidents.length === 0 ? (
        <EmptyState
          title={safeIncidents.length === 0 ? 'No active incidents' : 'No matching incidents'}
          description={
            safeIncidents.length === 0
              ? 'SkyOps has not detected any failure conditions on your clusters.'
              : 'Try clearing your active filters or modifying search keywords.'
          }
        />
      ) : (
        <div className="cosmic-panel rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-[#070B16] border-b border-white/6 text-zinc-400 uppercase text-[10px] tracking-wider font-mono">
                <tr>
                  <th className="px-5 py-3">Incident ID</th>
                  <th className="px-5 py-3">Severity</th>
                  <th className="px-5 py-3">Title / Problem</th>
                  <th className="px-5 py-3">Cluster / Resource</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Occurrences</th>
                  <th className="px-5 py-3">Last Seen</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-zinc-300">
                {filteredIncidents.map((inc) => (
                  <tr
                    key={inc.id}
                    onClick={() => onSelectIncident(inc.id)}
                    className="hover:bg-white/4 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3.5">
                      <span className="font-bold text-sky-400 font-mono">{inc.id}</span>
                      <div className="text-[10px] text-zinc-500 font-sans mt-0.5">{inc.incidentType || 'Failure'}</div>
                    </td>

                    <td className="px-5 py-3.5">
                      <SeverityBadge severity={inc.severity} size="sm" />
                    </td>

                    <td className="px-5 py-3.5 max-w-sm">
                      <div className="font-semibold text-white truncate tracking-tight">{inc.title || 'Incident Anomaly'}</div>
                      {inc.technicalDetails?.reason && (
                        <div className="text-[11px] text-zinc-500 truncate mt-0.5 font-mono">
                          Reason: {inc.technicalDetails.reason}
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="text-zinc-200 font-medium">{inc.clusterName || inc.clusterId || 'Cluster'}</div>
                      <div className="text-[11px] text-zinc-500 truncate font-mono">
                        ns: <strong className="text-zinc-400">{inc.namespace || 'default'}</strong> • {inc.resourceKind || 'Workload'}/
                        {inc.resourceName || 'Resource'}
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      <StatusBadge status={inc.status} size="sm" />
                    </td>

                    <td className="px-5 py-3.5">
                      <span className="font-semibold font-mono text-zinc-200 bg-[#0B1020] px-2 py-0.5 rounded border border-white/10">
                        {inc.occurrenceCount}x
                      </span>
                    </td>

                    <td className="px-5 py-3.5 text-zinc-400 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-zinc-300 text-xs">
                        <Clock className="w-3.5 h-3.5 text-zinc-500" />
                        {formatTimeAgo(inc.lastSeenAt)}
                      </div>
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => onSelectIncident(inc.id)}
                        className="px-3 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/20 hover:border-sky-400/40 rounded-lg text-xs transition-colors cursor-pointer font-medium"
                      >
                        Investigate →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
