import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Filter,
  GitBranch,
  History,
  Layers,
  Network,
  RefreshCw,
  Search,
  Server,
  Sliders,
  Sparkles,
  Terminal,
  Zap
} from 'lucide-react';
import { api } from '../../api/client';
import { Incident } from '../../types/index';
import {
  BoundedInvestigationWindow,
  EvidenceTimelineItem,
  HistoricalIncidentMatch,
  IncidentSmartLogsReport,
  RelatedLogCategory,
  RelatedLogGroup,
  RelatedLogItem
} from '../../types/logs';

interface IncidentRelatedLogsSectionProps {
  incident: Incident;
  onOpenLogs?: (clusterId: string, namespace?: string, workloadOrPod?: string, search?: string) => void;
  onSelectIncident?: (incidentId: string) => void;
}

export const IncidentRelatedLogsSection: React.FC<IncidentRelatedLogsSectionProps> = ({
  incident,
  onOpenLogs,
  onSelectIncident
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [report, setReport] = useState<IncidentSmartLogsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Investigation window configuration state
  const [preMinutes, setPreMinutes] = useState<number>(15);
  const [postMinutes, setPostMinutes] = useState<number>(15);
  const [isConfiguringWindow, setIsConfiguringWindow] = useState<boolean>(false);

  // Active view filters & drilldown
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'related' | 'timeline' | 'rca' | 'similar'>('related');
  const [searchFilter, setSearchFilter] = useState<string>('');

  const fetchSmartLogs = async (pre = preMinutes, post = postMinutes) => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getIncidentSmartLogs(incident.id, {
        preMinutes: pre,
        postMinutes: post
      });
      setReport(res.report);
      // Auto expand the direct workload item
      const firstDirect = res.report.groups.find((g) => g.category === 'DIRECT')?.items[0];
      if (firstDirect) {
        setExpandedItems((prev) => ({ ...prev, [firstDirect.id]: true }));
      }
    } catch (err: any) {
      console.warn('Failed to fetch incident smart logs:', err);
      setError(err?.message || 'Failed to correlate logs across dependency graph');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSmartLogs(preMinutes, postMinutes);
  }, [incident.id]);

  const toggleExpandItem = (id: string) => {
    setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleApplyWindow = () => {
    setIsConfiguringWindow(false);
    fetchSmartLogs(preMinutes, postMinutes);
  };

  const getCategoryIcon = (cat: RelatedLogCategory) => {
    switch (cat) {
      case 'DIRECT':
        return <Terminal className="w-4 h-4 text-rose-400" />;
      case 'CONNECTED_SERVICE':
        return <Network className="w-4 h-4 text-sky-400" />;
      case 'DEPENDENCY':
        return <Boxes className="w-4 h-4 text-amber-400" />;
      case 'INFRASTRUCTURE':
        return <Server className="w-4 h-4 text-purple-400" />;
      case 'DEPLOYMENT_CHANGE':
        return <GitBranch className="w-4 h-4 text-emerald-400" />;
      case 'K8S_EVENT':
        return <Activity className="w-4 h-4 text-indigo-400" />;
      default:
        return <Layers className="w-4 h-4 text-zinc-400" />;
    }
  };

  // Filter items by category & search term
  const filteredGroups = (report?.groups || []).map((group) => {
    if (selectedCategory !== 'ALL' && group.category !== selectedCategory) {
      return { ...group, items: [] };
    }
    const filteredItems = group.items.filter((item) => {
      if (!searchFilter.trim()) return true;
      const q = searchFilter.toLowerCase();
      return (
        item.resourceName.toLowerCase().includes(q) ||
        item.relevanceReasons.some((r) => r.toLowerCase().includes(q)) ||
        (item.topErrorPattern && item.topErrorPattern.toLowerCase().includes(q)) ||
        item.sampleLogs.some((l) => l.message.toLowerCase().includes(q))
      );
    });
    return { ...group, items: filteredItems };
  }).filter((g) => g.items.length > 0);

  const totalErrorsAcrossAll = (report?.groups || []).reduce((acc, g) => acc + g.totalErrors, 0);
  const totalWarningsAcrossAll = (report?.groups || []).reduce((acc, g) => acc + g.totalWarnings, 0);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 space-y-4 font-mono">
      {/* Header & Sub-Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-400" />
              Incident-Aware Smart Logs & Dependency Graph
            </h3>
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">
              Evidence First
            </span>
          </div>
          <p className="text-xs text-zinc-400 font-sans mt-0.5">
            Automatically surfaces direct logs, related workloads, dependencies, infrastructure, and deployment changes.
          </p>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Investigation Window Toggle */}
          <button
            type="button"
            onClick={() => setIsConfiguringWindow(!isConfiguringWindow)}
            className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-850 text-zinc-300 border border-zinc-800 flex items-center gap-1.5 cursor-pointer transition-colors"
            title="Configure Bounded Investigation Window"
          >
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span>
              Window: -{report?.window.configuredPreMinutes || preMinutes}m / +
              {report?.window.configuredPostMinutes || postMinutes}m
            </span>
            <Sliders className="w-3 h-3 text-zinc-500" />
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => fetchSmartLogs()}
            disabled={loading}
            className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-850 text-zinc-300 border border-zinc-800 flex items-center gap-1 cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-400' : 'text-zinc-400'}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Deep link into Logs Explorer */}
          {onOpenLogs && (
            <button
              type="button"
              onClick={() =>
                onOpenLogs(
                  incident.clusterId,
                  incident.namespace,
                  report?.targetWorkload || incident.resourceName,
                  report?.queryContext.investigationQuery
                )
              }
              className="px-2.5 py-1 rounded bg-sky-950/60 hover:bg-sky-900 text-sky-300 border border-sky-800 flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Query in Explorer →</span>
            </button>
          )}
        </div>
      </div>

      {/* Investigation Window Configuration Drawer */}
      {isConfiguringWindow && (
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-sky-400" />
              Configure Smart Investigation Window
            </span>
            <span className="text-[11px] text-zinc-500">
              Bounded to avoid unbounded cluster log collection
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="space-y-1">
              <label className="text-zinc-400 block text-[11px]">
                Pre-incident window (minutes before onset):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="5"
                  max="60"
                  step="5"
                  value={preMinutes}
                  onChange={(e) => setPreMinutes(parseInt(e.target.value, 10))}
                  className="w-full accent-sky-500"
                />
                <span className="text-zinc-200 font-bold w-12 text-right">-{preMinutes}m</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-zinc-400 block text-[11px]">
                Post-incident window (minutes after onset):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="5"
                  max="60"
                  step="5"
                  value={postMinutes}
                  onChange={(e) => setPostMinutes(parseInt(e.target.value, 10))}
                  className="w-full accent-sky-500"
                />
                <span className="text-zinc-200 font-bold w-12 text-right">+{postMinutes}m</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={() => setIsConfiguringWindow(false)}
              className="px-3 py-1 rounded bg-zinc-850 hover:bg-zinc-800 text-zinc-400 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyWindow}
              className="px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white font-bold cursor-pointer transition-colors"
            >
              Apply Investigation Window
            </button>
          </div>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-2">
        <div className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('related')}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              activeTab === 'related'
                ? 'bg-zinc-800 text-white border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            <span>Related Logs</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-300 font-bold">
              {filteredGroups.reduce((acc, g) => acc + g.items.length, 0)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('timeline')}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              activeTab === 'timeline'
                ? 'bg-zinc-800 text-white border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            <span>Evidence Timeline</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-300 font-bold">
              {report?.evidenceTimeline.length || 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rca')}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              activeTab === 'rca'
                ? 'bg-zinc-800 text-white border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Evidence-Based RCA</span>
            {report?.rootCauseHypothesis && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-bold">
                {report.rootCauseHypothesis.confidence}%
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('similar')}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              activeTab === 'similar'
                ? 'bg-zinc-800 text-white border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
            }`}
          >
            <History className="w-3.5 h-3.5 text-purple-400" />
            <span>Historical Incidents</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-300 font-bold">
              {report?.similarHistoricalIncidents.length || 0}
            </span>
          </button>
        </div>

        {/* Global Summary Badge */}
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span className="text-rose-400 font-bold">{totalErrorsAcrossAll} errors</span>
          <span className="text-zinc-700">·</span>
          <span className="text-amber-400 font-bold">{totalWarningsAcrossAll} warnings</span>
          <span className="text-zinc-700">·</span>
          <span>{report?.totalCorrelatedLogs || 0} total lines in window</span>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center text-xs text-zinc-500 space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin text-sky-400" />
          <span>Correlating topology & evaluating dependency log streams...</span>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl border border-rose-800 bg-rose-950/40 text-xs text-rose-300 space-y-2">
          <div className="flex items-center gap-2 font-bold">
            <AlertOctagon className="w-4 h-4 text-rose-400" />
            <span>Log Correlation Diagnostic Notice</span>
          </div>
          <p className="font-sans text-rose-200">{error}</p>
        </div>
      ) : (
        <>
          {/* TAB 1: RELATED LOGS ACROSS CATEGORIES */}
          {activeTab === 'related' && (
            <div className="space-y-4">
              {/* Category Filter Pills & Search */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-850 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('ALL')}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                      selectedCategory === 'ALL'
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    All Categories
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('DIRECT')}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                      selectedCategory === 'DIRECT'
                        ? 'bg-rose-950/70 text-rose-300 border border-rose-800/80'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Direct Logs
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('CONNECTED_SERVICE')}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                      selectedCategory === 'CONNECTED_SERVICE'
                        ? 'bg-sky-950/70 text-sky-300 border border-sky-800/80'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Connected Services
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('DEPENDENCY')}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                      selectedCategory === 'DEPENDENCY'
                        ? 'bg-amber-950/70 text-amber-300 border border-amber-800/80'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Dependencies
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('INFRASTRUCTURE')}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                      selectedCategory === 'INFRASTRUCTURE'
                        ? 'bg-purple-950/70 text-purple-300 border border-purple-800/80'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Infrastructure / Node
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('DEPLOYMENT_CHANGE')}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                      selectedCategory === 'DEPLOYMENT_CHANGE'
                        ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/80'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Deployment Logs
                  </button>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Filter related logs..."
                    className="bg-zinc-950 border border-zinc-800 rounded pl-8 pr-2.5 py-1 text-xs text-zinc-200 focus:outline-none w-full sm:w-48 placeholder:text-zinc-600"
                  />
                </div>
              </div>

              {/* Grouped Logs Presentation */}
              {filteredGroups.length === 0 ? (
                <div className="p-8 rounded-xl border border-dashed border-zinc-800 text-center space-y-1.5">
                  <Terminal className="w-6 h-6 text-zinc-500 mx-auto" />
                  <div className="text-xs font-bold text-zinc-300">
                    No Correlated Logs Found in Selected Category
                  </div>
                  <p className="text-[11px] text-zinc-500 font-sans">
                    Try broadening the investigation window or checking across All Categories.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredGroups.map((group) => (
                    <div key={group.category} className="space-y-2.5">
                      <div className="flex items-center justify-between text-xs text-zinc-400 uppercase tracking-wider font-bold">
                        <div className="flex items-center gap-2">
                          {getCategoryIcon(group.category)}
                          <span>{group.categoryLabel}</span>
                          <span className="text-[10px] text-zinc-500">
                            ({group.items.length} {group.items.length === 1 ? 'target' : 'targets'})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                          {group.totalErrors > 0 && (
                            <span className="text-rose-400 font-bold">{group.totalErrors} errors</span>
                          )}
                          {group.totalWarnings > 0 && (
                            <span className="text-amber-400">{group.totalWarnings} warnings</span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        {group.items.map((item) => {
                          const isExpanded = expandedItems[item.id];
                          return (
                            <div
                              key={item.id}
                              className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 hover:border-zinc-700/80 transition-all overflow-hidden"
                            >
                              {/* Clickable Card Header */}
                              <div
                                onClick={() => toggleExpandItem(item.id)}
                                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none hover:bg-zinc-900/60 transition-colors"
                              >
                                <div className="space-y-1 flex-1">
                                  <div className="flex items-center gap-2">
                                    {isExpanded ? (
                                      <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                                    )}
                                    <span className="font-bold text-zinc-100 text-xs hover:text-sky-400 transition-colors">
                                      {item.resourceName}
                                    </span>
                                    <span className="text-[10px] text-zinc-500">
                                      ({item.resourceKind}
                                      {item.namespace ? ` · ${item.namespace}` : ''})
                                    </span>
                                    {item.relevanceScore >= 90 && (
                                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-bold">
                                        High Relevance
                                      </span>
                                    )}
                                  </div>

                                  {/* Quick summary reason */}
                                  <div className="text-[11px] text-zinc-400 pl-6 flex items-center gap-2">
                                    <span>{item.relationshipDescription}</span>
                                    {item.topErrorPattern && (
                                      <>
                                        <span className="text-zinc-600">·</span>
                                        <span className="text-rose-400/90 truncate max-w-xs" title={item.topErrorPattern}>
                                          {item.topErrorPattern}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* Counts & Explorer Link */}
                                <div className="flex items-center gap-3 pl-6 sm:pl-0">
                                  <div className="text-right text-xs">
                                    {item.errorCount > 0 ? (
                                      <span className="text-rose-400 font-bold block">
                                        {item.errorCount.toLocaleString()} errors
                                      </span>
                                    ) : item.warningCount > 0 ? (
                                      <span className="text-amber-400 font-bold block">
                                        {item.warningCount.toLocaleString()} warnings
                                      </span>
                                    ) : (
                                      <span className="text-zinc-400 font-semibold block">
                                        {item.totalLogsCount} logs
                                      </span>
                                    )}
                                    <span className="text-[10px] text-zinc-500">
                                      {item.totalLogsCount} lines in window
                                    </span>
                                  </div>

                                  {onOpenLogs && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenLogs(
                                          item.deepLinkFilter.clusterId,
                                          item.deepLinkFilter.namespace,
                                          item.resourceName
                                        );
                                      }}
                                      className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-sky-300 transition-colors"
                                      title="Open in Logs Explorer"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Expanded Evidence & Logs View */}
                              {isExpanded && (
                                <div className="p-4 border-t border-zinc-800 bg-zinc-950/70 space-y-3">
                                  {/* Why Related? Card */}
                                  <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs space-y-1.5">
                                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold block">
                                      Why Related?
                                    </span>
                                    <div className="space-y-1">
                                      {item.relevanceReasons.map((reason, idx) => (
                                        <div key={idx} className="flex items-start gap-2 text-zinc-300 text-xs">
                                          <span className="text-emerald-400 font-bold shrink-0">✓</span>
                                          <span className="font-sans leading-relaxed">{reason}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Sample Log Lines */}
                                  {item.sampleLogs.length > 0 ? (
                                    <div className="space-y-1.5">
                                      <div className="flex items-center justify-between text-[10px] uppercase text-zinc-400">
                                        <span>Sample Observed Log Stream ({item.sampleLogs.length} lines):</span>
                                        {onOpenLogs && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              onOpenLogs(
                                                item.deepLinkFilter.clusterId,
                                                item.deepLinkFilter.namespace,
                                                item.resourceName
                                              )
                                            }
                                            className="text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
                                          >
                                            View all {item.totalLogsCount} logs →
                                          </button>
                                        )}
                                      </div>
                                      <div className="rounded-lg bg-zinc-950 border border-zinc-850 p-2.5 space-y-1 text-xs max-h-56 overflow-y-auto">
                                        {item.sampleLogs.map((log, lidx) => (
                                          <div
                                            key={lidx}
                                            className="flex items-start gap-2 text-[11px] font-mono leading-relaxed hover:bg-zinc-900/50 p-1 rounded transition-colors"
                                          >
                                            <span className="text-zinc-500 shrink-0 text-[10px]">
                                              {new Date(log.timestampMs).toLocaleTimeString([], {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                second: '2-digit'
                                              })}
                                            </span>
                                            <span
                                              className={`px-1 py-0.2 rounded text-[9px] font-bold shrink-0 ${
                                                log.severity === 'FATAL' || log.severity === 'ERROR'
                                                  ? 'bg-rose-950 text-rose-300'
                                                  : log.severity === 'WARN'
                                                  ? 'bg-amber-950 text-amber-300'
                                                  : 'bg-zinc-800 text-zinc-400'
                                              }`}
                                            >
                                              {log.severity}
                                            </span>
                                            <span className="text-zinc-400 text-[10px] shrink-0">
                                              [{log.podName.slice(-8)}:{log.container}]
                                            </span>
                                            <span className="text-zinc-200 break-words flex-1">{log.message}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="p-3 bg-zinc-900/30 rounded border border-zinc-850 text-xs text-zinc-500 text-center">
                                      No raw lines captured in buffer for this target during the active window.
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: UNIFIED EVIDENCE TIMELINE */}
          {activeTab === 'timeline' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-zinc-400 border-b border-zinc-850 pb-2">
                <span>
                  Chronological progression of deployments, warnings, errors, restarts, and events:
                </span>
                <span className="text-[11px] text-zinc-500 font-mono">
                  Window: {report?.window.durationMinutes} minutes total
                </span>
              </div>

              <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-800">
                {(report?.evidenceTimeline || []).map((evt) => {
                  const isIncident = evt.type === 'INCIDENT_DETECTED';
                  const isDeploy = evt.type === 'DEPLOYMENT';
                  const isError = evt.type === 'LOG_ERROR' || evt.type === 'LOG_FATAL';
                  const isWarning = evt.type === 'LOG_WARNING';

                  return (
                    <div key={evt.id} className="relative flex items-start gap-3 text-xs">
                      {/* Node circle */}
                      <div
                        className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 ${
                          isIncident
                            ? 'bg-rose-500 border-rose-950 ring-2 ring-rose-500/30'
                            : isDeploy
                            ? 'bg-emerald-400 border-emerald-950'
                            : isError
                            ? 'bg-rose-400 border-rose-950'
                            : isWarning
                            ? 'bg-amber-400 border-zinc-950'
                            : 'bg-sky-400 border-zinc-950'
                        }`}
                      />

                      {/* Content card */}
                      <div
                        className={`p-3 rounded-xl border flex-1 space-y-1 ${
                          isIncident
                            ? 'bg-rose-950/30 border-rose-800/80 text-rose-200'
                            : isDeploy
                            ? 'bg-emerald-950/20 border-emerald-800/60 text-emerald-200'
                            : isError
                            ? 'bg-zinc-900/60 border-rose-900/40 text-zinc-200'
                            : 'bg-zinc-900/40 border-zinc-800 text-zinc-300'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-zinc-100 text-xs">{evt.timeFormatted}</span>
                            <span className="text-[10px] text-zinc-500">({evt.relativeOffset})</span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                                isDeploy
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : isIncident
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : isError
                                  ? 'bg-rose-500/10 text-rose-400'
                                  : 'bg-zinc-800 text-zinc-400'
                              }`}
                            >
                              {evt.type.replace('_', ' ')}
                            </span>
                          </div>
                          <span className="text-[11px] text-zinc-400 font-semibold">{evt.source}</span>
                        </div>

                        <div className="font-semibold text-zinc-100 text-xs">{evt.headline}</div>
                        <div className="text-[11px] text-zinc-400 font-sans">{evt.detail}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: EVIDENCE-BASED ROOT CAUSE ANALYSIS & CONNECTED CHAIN */}
          {activeTab === 'rca' && (
            <div className="space-y-4">
              {report?.rootCauseHypothesis ? (
                <div className="space-y-4">
                  {/* RCA Hypothesis Banner */}
                  <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-400" />
                        <span className="font-bold text-amber-200 uppercase tracking-wider text-xs">
                          ROOT CAUSE HYPOTHESIS
                        </span>
                      </div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Confidence: {report.rootCauseHypothesis.confidence}%
                      </span>
                    </div>

                    <div className="text-sm font-bold text-white">
                      {report.rootCauseHypothesis.title}
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold block">
                        Supporting Evidence:
                      </span>
                      {report.rootCauseHypothesis.supportingEvidence.map((ev, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs text-zinc-200">
                          <span className="text-emerald-400 font-bold shrink-0">✓</span>
                          <span className="font-sans leading-relaxed">{ev}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Connected Evidence Chain */}
                  <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-3">
                    <div className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                      <Network className="w-4 h-4 text-sky-400" />
                      Connected Evidence Chain
                    </div>
                    <p className="text-xs text-zinc-400 font-sans">
                      Temporal and causal propagation mapped across observed logs and cluster mutations:
                    </p>

                    <div className="space-y-3 pt-2">
                      {report.rootCauseHypothesis.connectedChain.map((step, idx) => (
                        <div key={idx} className="space-y-2">
                          <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-3">
                              <span className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 text-sky-400 font-bold flex items-center justify-center text-[10px]">
                                {step.step}
                              </span>
                              <div>
                                <span className="font-bold text-zinc-100 block">{step.actor}</span>
                                <span className="text-zinc-400 text-[11px] font-sans">{step.observation}</span>
                              </div>
                            </div>
                          </div>

                          {/* Arrow down to next step */}
                          {idx < report.rootCauseHypothesis.connectedChain.length - 1 && (
                            <div className="flex items-center justify-center gap-2 text-[11px] text-zinc-500 font-mono py-0.5">
                              <span>↓</span>
                              <span>
                                {step.offsetSeconds ? `+${step.offsetSeconds}s ` : ''}
                                ({step.transitionText || 'cascaded to next layer'})
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 rounded-xl border border-zinc-800 text-center text-xs text-zinc-400">
                  Insufficient signals observed to construct high-confidence causal hypothesis.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SIMILAR HISTORICAL INCIDENTS */}
          {activeTab === 'similar' && (
            <div className="space-y-3">
              <div className="text-xs text-zinc-400">
                Correlated historical precedents with matching error patterns and workloads:
              </div>

              {(!report?.similarHistoricalIncidents || report.similarHistoricalIncidents.length === 0) ? (
                <div className="p-6 rounded-xl border border-dashed border-zinc-800 text-center space-y-1">
                  <Sparkles className="w-5 h-5 text-zinc-500 mx-auto" />
                  <div className="text-xs font-bold text-zinc-300">First-Time Observed Failure Pattern</div>
                  <p className="text-[11px] text-zinc-500 font-sans">
                    No historical incidents with matching fingerprint or error pattern in recorded cluster history.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {report.similarHistoricalIncidents.map((hist) => (
                    <div
                      key={hist.id}
                      className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            onClick={() => onSelectIncident && onSelectIncident(hist.id)}
                            className="font-bold text-white hover:text-purple-400 cursor-pointer transition-colors"
                          >
                            {hist.id}
                          </span>
                          <span className="text-zinc-600">·</span>
                          <span className="text-zinc-400">{hist.daysAgo} days ago</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-bold">
                            {hist.similarityScore}% match
                          </span>
                        </div>

                        <div className="font-semibold text-zinc-200">{hist.title}</div>
                        <div className="text-[11px] text-zinc-400 font-sans">
                          Workload: <span className="text-zinc-200 font-mono">{hist.affectedWorkload}</span> ·{' '}
                          Pattern: <span className="text-rose-400 font-mono">{hist.errorPattern}</span>
                        </div>

                        {hist.previousResolution && (
                          <div className="text-[11px] text-emerald-400 bg-emerald-950/30 border border-emerald-900/40 p-2 rounded flex items-start gap-1.5 font-sans">
                            <span className="font-bold">Previous Resolution:</span>
                            <span>{hist.previousResolution}</span>
                          </div>
                        )}
                      </div>

                      {onSelectIncident && (
                        <button
                          type="button"
                          onClick={() => onSelectIncident(hist.id)}
                          className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
                        >
                          <span>View Previous Incident</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
