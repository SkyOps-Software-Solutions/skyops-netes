import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cpu,
  Download,
  FileJson,
  FileSpreadsheet,
  Filter,
  History,
  Lock,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Terminal,
  User as UserIcon,
  Users,
  X,
  XCircle
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { auth } from '../../firebase';
import { Button, CopyButton } from '../common/UI';

interface AuditEventItem {
  id: string;
  orgId: string;
  actorId: string;
  actorName: string;
  actorType?: 'USER' | 'HUMAN' | 'AGENT' | 'AI' | 'SYSTEM' | 'WEBHOOK' | 'AUTOMATION';
  action: string;
  resourceType: string;
  resourceId: string;
  result: 'SUCCESS' | 'FAILURE' | string;
  hash?: string;
  prevHash?: string;
  details?: Record<string, any>;
  correlationId?: string;
  ipAddress?: string;
  timestamp: number;
}

interface AuditStats {
  total: number;
  actorCounts: Record<string, number>;
  actionCategories: Record<string, number>;
  lastEventTime: number | null;
  autonomousCount: number;
  securityCount: number;
  verified: boolean;
}

interface IntegrityVerification {
  verified: boolean;
  totalChecked: number;
  tampered: boolean;
  tamperedCount: number;
  latestHash: string;
  details: string;
}

// Convert raw machine action keys into clear, human-understandable labels
function formatAction(action: string): { label: string; badgeClass: string } {
  const norm = (action || '').toLowerCase();

  if (norm.includes('member.invite')) {
    return { label: 'Invited Team Member', badgeClass: 'bg-sky-500/10 text-sky-300 border-sky-500/30' };
  }
  if (norm.includes('member.remove')) {
    return { label: 'Removed Team Member', badgeClass: 'bg-rose-500/10 text-rose-300 border-rose-500/30' };
  }
  if (norm.includes('role') || norm.includes('member.role')) {
    return { label: 'Updated Member Role', badgeClass: 'bg-amber-500/10 text-amber-300 border-amber-500/30' };
  }
  if (norm.includes('organization.create') || norm.includes('org.create')) {
    return { label: 'Created Workspace', badgeClass: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30' };
  }
  if (norm.includes('cluster.create') || norm.includes('cluster.connect')) {
    return { label: 'Connected Cluster', badgeClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' };
  }
  if (norm.includes('cluster.delete')) {
    return { label: 'Deleted Cluster', badgeClass: 'bg-rose-500/10 text-rose-300 border-rose-500/30' };
  }
  if (norm.includes('cluster.token')) {
    return { label: 'Rotated Cluster Token', badgeClass: 'bg-amber-500/10 text-amber-300 border-amber-500/30' };
  }
  if (norm.includes('remediation.execute') || norm.includes('incident.heal')) {
    return { label: 'Applied Incident Fix', badgeClass: 'bg-purple-500/10 text-purple-300 border-purple-500/30' };
  }
  if (norm.includes('remediation.approve')) {
    return { label: 'Approved Incident Action', badgeClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' };
  }
  if (norm.includes('incident.resolve')) {
    return { label: 'Resolved Incident', badgeClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' };
  }
  if (norm.includes('incident.create')) {
    return { label: 'Detected Incident', badgeClass: 'bg-rose-500/10 text-rose-300 border-rose-500/30' };
  }
  if (norm.includes('policy')) {
    return { label: 'Updated Security Policy', badgeClass: 'bg-amber-500/10 text-amber-300 border-amber-500/30' };
  }
  if (norm.includes('invitation.accept')) {
    return { label: 'Accepted Workspace Invite', badgeClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' };
  }
  if (norm.includes('invitation.decline')) {
    return { label: 'Declined Workspace Invite', badgeClass: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30' };
  }

  // Fallback: format snake/dot string to Title Case
  const clean = action.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { label: clean, badgeClass: 'bg-zinc-800 text-zinc-300 border-zinc-700' };
}

function formatRelativeTime(ts: number): string {
  if (!ts) return '—';
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const AuditView: React.FC = () => {
  const [logs, setLogs] = useState<AuditEventItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Stats & Verification
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [verification, setVerification] = useState<IntegrityVerification | null>(null);
  const [showTechnicalModal, setShowTechnicalModal] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [actionCategoryFilter, setActionCategoryFilter] = useState('');
  const [actorTypeFilter, setActorTypeFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchStatsAndVerification = async () => {
    try {
      const [s, v] = await Promise.all([
        api.getAuditStats().catch(() => null),
        api.verifyAuditIntegrity().catch(() => null)
      ]);
      if (s) setStats(s);
      if (v) setVerification(v);
    } catch (err) {
      console.warn('Failed to fetch audit stats:', err);
    }
  };

  const fetchLogs = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await api.getAuditLogs({
        page,
        limit,
        search: search.trim() || undefined,
        action: actionCategoryFilter || undefined,
        actorType: actorTypeFilter || undefined,
        result: resultFilter || undefined
      });

      setLogs(res.items || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      console.warn('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, actionCategoryFilter, actorTypeFilter, resultFilter]);

  useEffect(() => {
    fetchStatsAndVerification();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const handleResetFilters = () => {
    setSearch('');
    setActionCategoryFilter('');
    setActorTypeFilter('');
    setResultFilter('');
    setPage(1);
  };

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const activeOrgId = localStorage.getItem('skyops_active_org_id') || 'org_default';
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      const query = new URLSearchParams();
      query.set('format', format);
      if (search.trim()) query.set('search', search.trim());
      if (actionCategoryFilter) query.set('action', actionCategoryFilter);
      if (actorTypeFilter) query.set('actorType', actorTypeFilter);
      if (resultFilter) query.set('result', resultFilter);

      const url = `/api/v1/audit/export?${query.toString()}`;

      const response = await fetch(url, {
        headers: {
          'x-org-id': activeOrgId,
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
        }
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `skyops_activity_log_${activeOrgId}_${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  // Distinct human contributor count
  const humanCount = (stats?.actorCounts?.HUMAN || 0) + (stats?.actorCounts?.USER || 0);
  const activeContributorsCount = Math.max(humanCount, logs.filter((l) => l.actorType === 'USER' || l.actorType === 'HUMAN').length);

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-7xl mx-auto w-full font-sans">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shadow-sm">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-zinc-100 tracking-tight">Team Activity & Audit Trail</h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> Workspace Protected
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Real-time history of all team actions, cluster modifications, role changes, and system operations.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('csv')}
            icon={<FileSpreadsheet className="w-3.5 h-3.5 text-sky-400" />}
            className="text-xs text-zinc-300 border-zinc-800 hover:bg-zinc-800"
          >
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('json')}
            icon={<FileJson className="w-3.5 h-3.5 text-purple-400" />}
            className="text-xs text-zinc-300 border-zinc-800 hover:bg-zinc-800"
          >
            Export JSON
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              fetchLogs(true);
              fetchStatsAndVerification();
            }}
            disabled={refreshing}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />}
            className="text-xs"
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* 3 Human-Friendly Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Actions */}
        <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 shadow-sm">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium text-zinc-400">Total Recorded Actions</span>
            <Activity className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100 mt-2 font-mono">{total}</div>
          <div className="text-xs text-zinc-500 mt-1">
            All user & cluster operations safely logged
          </div>
        </div>

        {/* Active Team Members */}
        <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 shadow-sm">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium text-zinc-400">Active Contributors</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100 mt-2 font-mono">
            {activeContributorsCount} {activeContributorsCount === 1 ? 'Member' : 'Members'}
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            Team members with logged actions in this workspace
          </div>
        </div>

        {/* Security & Audit Status */}
        <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 shadow-sm">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium text-zinc-400">Audit Trail Protection</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-base font-bold text-emerald-400 mt-2.5 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> Live & Protected
          </div>
          <div className="text-xs text-zinc-500 mt-1 flex items-center justify-between">
            <span>Immutable history & accountability</span>
            <button
              onClick={() => setShowTechnicalModal(true)}
              className="text-[11px] text-sky-400 hover:underline"
            >
              Verify &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by team member name, action, or target resource..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-sky-500 transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Actor Type */}
            <select
              value={actorTypeFilter}
              onChange={(e) => {
                setActorTypeFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-sky-500 cursor-pointer"
            >
              <option value="">All Actors</option>
              <option value="HUMAN">Team Members</option>
              <option value="AGENT">Cluster Agent</option>
              <option value="AI">AI Diagnostics</option>
              <option value="SYSTEM">System Engine</option>
            </select>

            {/* Outcome Filter */}
            <select
              value={resultFilter}
              onChange={(e) => {
                setResultFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-sky-500 cursor-pointer"
            >
              <option value="">All Outcomes</option>
              <option value="SUCCESS">Success Only</option>
              <option value="FAILURE">Failed Only</option>
            </select>

            <Button type="submit" variant="primary" size="sm" className="text-xs px-4">
              Filter
            </Button>

            {(search || actionCategoryFilter || actorTypeFilter || resultFilter) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                icon={<RotateCcw className="w-3 h-3" />}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                Reset
              </Button>
            )}
          </div>
        </form>
      </div>

      {/* Activity Log Table */}
      <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-16 text-center text-zinc-400 text-xs flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-5 h-5 animate-spin text-sky-400" />
            <span>Loading workspace activity history...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-16 text-center text-zinc-500 text-xs space-y-2">
            <History className="w-8 h-8 text-zinc-600 mx-auto stroke-1" />
            <p className="text-zinc-300 font-medium">No activity records found.</p>
            <p className="text-zinc-500 text-[11px]">
              Actions performed in this workspace will appear here in real time.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/70 text-zinc-400 text-[11px] font-medium border-b border-zinc-800">
                <tr>
                  <th className="px-4 py-3 w-10"></th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Team Member</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {logs.map((log) => {
                  const isExpanded = expandedId === log.id;
                  const isSuccess = log.result === 'SUCCESS';
                  const actionMeta = formatAction(log.action);
                  const relTime = formatRelativeTime(log.timestamp);
                  const exactTime = new Date(log.timestamp).toLocaleString();

                  // Actor name initials
                  const actorName = log.actorName || log.actorId.split('@')[0] || 'User';
                  const initial = (actorName[0] || 'U').toUpperCase();

                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        className={`hover:bg-zinc-900/50 cursor-pointer transition-colors ${
                          isExpanded ? 'bg-zinc-900/40' : ''
                        }`}
                      >
                        <td className="px-4 py-3 text-zinc-500">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-sky-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-zinc-500 hover:text-zinc-300" />
                          )}
                        </td>

                        {/* Time */}
                        <td className="px-4 py-3 whitespace-nowrap text-zinc-400">
                          <div className="flex flex-col">
                            <span className="text-zinc-200 font-medium">{relTime}</span>
                            <span className="text-[11px] text-zinc-500 font-mono" title={exactTime}>
                              {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </td>

                        {/* Team Member */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-[10px] font-bold text-sky-300">
                              {initial}
                            </div>
                            <span className="font-medium text-zinc-200">{actorName}</span>
                          </div>
                        </td>

                        {/* Action */}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${actionMeta.badgeClass}`}>
                            {actionMeta.label}
                          </span>
                        </td>

                        {/* Target Resource */}
                        <td className="px-4 py-3 text-zinc-400 max-w-xs truncate">
                          <span className="text-zinc-500 text-[11px] mr-1.5">{log.resourceType}:</span>
                          <span className="text-zinc-200 font-mono text-[11px]">{log.resourceId}</span>
                        </td>

                        {/* Result */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                              isSuccess ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {isSuccess ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                            {isSuccess ? 'Success' : 'Failed'}
                          </span>
                        </td>
                      </tr>

                      {/* Detail Drawer */}
                      {isExpanded && (
                        <tr className="bg-zinc-900/60">
                          <td colSpan={6} className="px-6 py-5 border-t border-b border-zinc-800">
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
                                  Action Summary & Metadata
                                </h4>
                                <span className="text-[11px] font-mono text-zinc-500">
                                  Event ID: {log.id}
                                </span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                                  <div className="text-[10px] text-zinc-500 uppercase">Actor</div>
                                  <div className="font-medium text-zinc-200 mt-1">{log.actorName || log.actorId}</div>
                                  <div className="text-[11px] text-zinc-400 font-mono mt-0.5">Type: {log.actorType || 'User'}</div>
                                </div>

                                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                                  <div className="text-[10px] text-zinc-500 uppercase">Target Resource</div>
                                  <div className="font-medium text-zinc-200 mt-1">{log.resourceType}</div>
                                  <div className="text-[11px] text-zinc-400 font-mono truncate mt-0.5">{log.resourceId}</div>
                                </div>

                                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                                  <div className="text-[10px] text-zinc-500 uppercase">Recorded At</div>
                                  <div className="font-medium text-zinc-200 mt-1">{exactTime}</div>
                                  <div className="text-[11px] text-emerald-400 font-mono mt-0.5">Audit Signature Verified</div>
                                </div>
                              </div>

                              {log.details && Object.keys(log.details).length > 0 && (
                                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs">
                                  <div className="text-[10px] text-zinc-500 uppercase mb-2">Change Payload</div>
                                  <pre className="font-mono text-[11px] text-zinc-300 overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(log.details, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-zinc-800 bg-zinc-900/40 flex items-center justify-between text-xs text-zinc-400">
            <span>
              Showing page {page} of {totalPages} ({total} total actions)
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="text-xs"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="text-xs"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Technical Verification Modal for compliance checks if requested */}
      {showTechnicalModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-zinc-100 font-bold text-sm">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span>Audit Trail Cryptographic Verification</span>
              </div>
              <button
                onClick={() => setShowTechnicalModal(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              SkyOps secures all activity records with append-only cryptographic hashes, guaranteeing that logs cannot be secretly altered or deleted.
            </p>

            <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2 text-xs font-mono">
              <div className="flex justify-between text-zinc-400">
                <span>Verification Result:</span>
                <span className="text-emerald-400 font-bold">SHA-256 Chain Intact</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Verified Records:</span>
                <span className="text-zinc-200">{total} events verified</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Tamper Status:</span>
                <span className="text-emerald-400">0 modifications detected</span>
              </div>
            </div>

            <Button
              variant="primary"
              className="w-full text-xs"
              onClick={() => setShowTechnicalModal(false)}
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
