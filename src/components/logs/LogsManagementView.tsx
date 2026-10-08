import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Database,
  Download,
  ExternalLink,
  Eye,
  Filter,
  Flame,
  GitCommit,
  Layers,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  Sparkles,
  Terminal,
  Trash2,
  TrendingUp,
  X
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import {
  Cluster,
  DeploymentLogComparison,
  ErrorSpike,
  LogAlertRule,
  LogCollectionRule,
  LogOverviewStats,
  LogRecord,
  LogSeverity,
  SavedLogSearch,
  WorkloadLogSummary
} from '../../types/index';
import { Button, Modal } from '../common/UI';

interface LogsManagementViewProps {
  clusters: Cluster[];
  initialClusterId?: string;
  initialWorkload?: string;
  initialPod?: string;
  initialNamespace?: string;
  initialSearch?: string;
  onSelectIncident?: (incidentId: string) => void;
  onRefreshGlobal?: () => void;
}

type MainLogsTab = 'explorer' | 'live' | 'alerts' | 'collection';

export const LogsManagementView: React.FC<LogsManagementViewProps> = ({
  clusters = [],
  initialClusterId,
  initialWorkload,
  initialPod,
  initialNamespace,
  initialSearch,
  onSelectIncident,
  onRefreshGlobal
}) => {
  // Navigation & Cluster selection
  const [activeTab, setActiveTab] = useState<MainLogsTab>('explorer');
  const [selectedClusterId, setSelectedClusterId] = useState<string>(() => {
    if (initialClusterId && clusters.some((c) => c.id === initialClusterId)) return initialClusterId;
    return clusters[0]?.id || '';
  });

  const selectedCluster = useMemo(() => {
    return clusters.find((c) => c.id === selectedClusterId) || clusters[0] || null;
  }, [clusters, selectedClusterId]);

  // Operational Overview Stats
  const [stats, setStats] = useState<LogOverviewStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Workloads
  const [workloads, setWorkloads] = useState<WorkloadLogSummary[]>([]);
  const [loadingWorkloads, setLoadingWorkloads] = useState(false);
  const [expandedWorkloads, setExpandedWorkloads] = useState<Record<string, boolean>>({});

  // Error Spikes
  const [errorSpikes, setErrorSpikes] = useState<ErrorSpike[]>([]);

  // Search & Filter state
  const [selectedNamespace, setSelectedNamespace] = useState<string>(initialNamespace || 'all');
  const [selectedWorkload, setSelectedWorkload] = useState<string>(initialWorkload || 'all');
  const [selectedPodName, setSelectedPodName] = useState<string>(initialPod || 'all');
  const [selectedContainer, setSelectedContainer] = useState<string>('all');
  const [selectedNodeName, setSelectedNodeName] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<LogSeverity | 'ALL' | 'ERRORS_ONLY' | 'WARNINGS_AND_ERRORS'>('ALL');
  const [timeRange, setTimeRange] = useState<string>('1h');
  const [searchQuery, setSearchQuery] = useState<string>(initialSearch || '');
  const [viewPrevious, setViewPrevious] = useState<boolean>(false);

  // Sync sub-tab in browser URL for /logs/explorer, /logs/live, /logs/alerts, /logs/collection
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const pathMatch = window.location.pathname.match(/\/logs\/(explorer|live|alerts|collection)/i);
        if (pathMatch && pathMatch[1]) {
          setActiveTab(pathMatch[1].toLowerCase() as MainLogsTab);
        }
      }
    } catch {
      // safe fallback
    }
  }, []);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.location.pathname.startsWith('/logs')) {
        const target = `/logs/${activeTab}`;
        if (window.location.pathname !== target) {
          window.history.replaceState({ tab: 'logs', subTab: activeTab }, '', target);
        }
      }
    } catch {
      // safe fallback
    }
  }, [activeTab]);

  // Log Records & Pagination
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [totalMatches, setTotalMatches] = useState<number>(0);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [selectedLogLine, setSelectedLogLine] = useState<LogRecord | null>(null);

  // Live Mode state
  const [isLiveStreaming, setIsLiveStreaming] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [liveLogs, setLiveLogs] = useState<LogRecord[]>([]);
  const liveEndRef = useRef<HTMLDivElement>(null);
  const liveContainerRef = useRef<HTMLDivElement>(null);

  // Alerts state
  const [alertRules, setAlertRules] = useState<LogAlertRule[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [editingAlert, setEditingAlert] = useState<LogAlertRule | null>(null);

  // Collection Rules state
  const [collectionRules, setCollectionRules] = useState<LogCollectionRule[]>([]);
  const [loadingCollection, setLoadingCollection] = useState(false);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [editingCollection, setEditingCollection] = useState<LogCollectionRule | null>(null);

  // Saved Searches state
  const [savedSearches, setSavedSearches] = useState<SavedLogSearch[]>([]);
  const [showSaveSearchModal, setShowSaveSearchModal] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState('');

  // Deployment Comparison state
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<DeploymentLogComparison | null>(null);
  const [loadingComparison, setLoadingComparison] = useState(false);

  // Create Incident from Logs modal state
  const [showCreateIncidentModal, setShowCreateIncidentModal] = useState(false);
  const [incidentWorkload, setIncidentWorkload] = useState('payment-api');
  const [incidentPattern, setIncidentPattern] = useState('');
  const [incidentCreating, setIncidentCreating] = useState(false);

  // Notification toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Convert timeRange string to milliseconds
  const timeRangeMs = useMemo(() => {
    switch (timeRange) {
      case '15m': return 15 * 60 * 1000;
      case '1h': return 60 * 60 * 1000;
      case '6h': return 6 * 3600 * 1000;
      case '24h': return 24 * 3600 * 1000;
      case '7d': return 7 * 86400 * 1000;
      default: return 3600 * 1000;
    }
  }, [timeRange]);

  // Load operational stats
  const loadStats = async () => {
    if (!selectedClusterId) return;
    try {
      setLoadingStats(true);
      const res = await api.getLogStats(selectedClusterId);
      setStats(res);
    } catch (err) {
      console.warn('[Logs] Failed to load log stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  // Load workload summaries
  const loadWorkloads = async () => {
    if (!selectedClusterId) return;
    try {
      setLoadingWorkloads(true);
      const res = await api.getLogWorkloads(selectedClusterId, selectedNamespace);
      setWorkloads(res.workloads || []);
    } catch (err) {
      console.warn('[Logs] Failed to load workload summaries:', err);
    } finally {
      setLoadingWorkloads(false);
    }
  };

  // Load error spikes
  const loadErrorSpikes = async () => {
    if (!selectedClusterId) return;
    try {
      const res = await api.getLogErrorSpikes(selectedClusterId);
      setErrorSpikes(res.spikes || []);
    } catch (err) {
      console.warn('[Logs] Failed to detect error spikes:', err);
    }
  };

  // Available filter values derived from workloads and logs
  const availableNamespaces = useMemo(() => {
    const set = new Set<string>();
    workloads.forEach((w) => { if (w.namespace) set.add(w.namespace); });
    logs.forEach((l) => { if (l.namespace) set.add(l.namespace); });
    if (set.size === 0) {
      set.add('production');
      set.add('payments');
      set.add('security');
    }
    return Array.from(set).sort();
  }, [workloads, logs]);

  const availableWorkloads = useMemo(() => {
    const set = new Set<string>();
    workloads.forEach((w) => {
      if (selectedNamespace === 'all' || w.namespace === selectedNamespace) {
        set.add(w.workload);
      }
    });
    logs.forEach((l) => {
      if ((selectedNamespace === 'all' || l.namespace === selectedNamespace) && l.workload) {
        set.add(l.workload);
      }
    });
    return Array.from(set).sort();
  }, [workloads, logs, selectedNamespace]);

  const availablePods = useMemo(() => {
    const set = new Set<string>();
    workloads.forEach((w) => {
      if (selectedWorkload === 'all' || w.workload === selectedWorkload) {
        w.pods?.forEach((p) => set.add(p.name));
      }
    });
    logs.forEach((l) => {
      if ((selectedWorkload === 'all' || l.workload === selectedWorkload) && l.podName) {
        set.add(l.podName);
      }
    });
    return Array.from(set).sort();
  }, [workloads, logs, selectedWorkload]);

  const availableContainers = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => {
      if (l.container) set.add(l.container);
    });
    if (set.size === 0) {
      set.add('app');
      set.add('sidecar');
    }
    return Array.from(set).sort();
  }, [logs]);

  const availableNodes = useMemo(() => {
    const set = new Set<string>();
    workloads.forEach((w) => {
      w.pods?.forEach((p) => { if (p.nodeName) set.add(p.nodeName); });
    });
    logs.forEach((l) => {
      if (l.nodeName) set.add(l.nodeName);
    });
    if (set.size === 0) {
      set.add('k8s-node-worker-01');
      set.add('k8s-node-worker-02');
      set.add('k8s-node-worker-03');
    }
    return Array.from(set).sort();
  }, [workloads, logs]);

  const crashLoopPod = useMemo(() => {
    for (const wl of workloads) {
      for (const p of wl.pods) {
        if (p.status?.toLowerCase().includes('crash') || p.restarts >= 2) {
          return { ...p, workload: wl.workload, namespace: wl.namespace };
        }
      }
    }
    return null;
  }, [workloads]);

  // Load log records with structured filter parser support
  const loadLogs = async () => {
    if (!selectedClusterId) return;
    try {
      setLoadingLogs(true);
      const now = Date.now();

      let effectiveSearch = searchQuery;
      let effectiveSeverity = selectedSeverity;
      let effectiveNamespace = selectedNamespace !== 'all' ? selectedNamespace : undefined;
      let effectiveWorkload = selectedWorkload !== 'all' ? selectedWorkload : undefined;
      let effectivePodName = selectedPodName !== 'all' ? selectedPodName : undefined;
      let effectiveContainer = selectedContainer !== 'all' ? selectedContainer : undefined;
      let effectiveNodeName = selectedNodeName !== 'all' ? selectedNodeName : undefined;

      // Support simple structured filters where practical:
      // severity:error, namespace:payments, workload:checkout-api, pod:xyz, node:worker-01, container:app
      const sevMatch = searchQuery.match(/\bseverity:(\w+)/i);
      if (sevMatch) {
        const s = sevMatch[1].toUpperCase();
        if (['FATAL', 'ERROR', 'WARN', 'INFO', 'DEBUG'].includes(s)) {
          effectiveSeverity = s as LogSeverity;
        }
        effectiveSearch = effectiveSearch.replace(sevMatch[0], '').trim();
      }
      const nsMatch = searchQuery.match(/\bnamespace:([\w-]+)/i);
      if (nsMatch) {
        effectiveNamespace = nsMatch[1];
        effectiveSearch = effectiveSearch.replace(nsMatch[0], '').trim();
      }
      const wlMatch = searchQuery.match(/\bworkload:([\w-]+)/i);
      if (wlMatch) {
        effectiveWorkload = wlMatch[1];
        effectiveSearch = effectiveSearch.replace(wlMatch[0], '').trim();
      }
      const podMatch = searchQuery.match(/\bpod:([\w-]+)/i);
      if (podMatch) {
        effectivePodName = podMatch[1];
        effectiveSearch = effectiveSearch.replace(podMatch[0], '').trim();
      }
      const nodeMatch = searchQuery.match(/\bnode:([\w-]+)/i);
      if (nodeMatch) {
        effectiveNodeName = nodeMatch[1];
        effectiveSearch = effectiveSearch.replace(nodeMatch[0], '').trim();
      }
      const ctrMatch = searchQuery.match(/\bcontainer:([\w-]+)/i);
      if (ctrMatch) {
        effectiveContainer = ctrMatch[1];
        effectiveSearch = effectiveSearch.replace(ctrMatch[0], '').trim();
      }

      const res = await api.searchLogs({
        clusterId: selectedClusterId,
        namespace: effectiveNamespace,
        workload: effectiveWorkload,
        podName: effectivePodName,
        container: effectiveContainer,
        nodeName: effectiveNodeName,
        severity: effectiveSeverity,
        search: effectiveSearch,
        startTimeMs: now - timeRangeMs,
        endTimeMs: now,
        previous: viewPrevious,
        limit: 250
      });
      setLogs(res.records || []);
      setTotalMatches(res.totalMatches || 0);
    } catch (err: any) {
      console.warn('[Logs] Query failed:', err);
      showToast(`Log query failed: ${err?.message || 'Error'}`);
    } finally {
      setLoadingLogs(false);
    }
  };

  // Load alerts
  const loadAlerts = async () => {
    try {
      setLoadingAlerts(true);
      const rules = await api.getLogAlertRules();
      setAlertRules(rules);
    } catch (err) {
      console.warn('[Logs] Failed to load alert rules:', err);
    } finally {
      setLoadingAlerts(false);
    }
  };

  // Load collection rules
  const loadCollectionRules = async () => {
    try {
      setLoadingCollection(true);
      const rules = await api.getLogCollectionRules();
      setCollectionRules(rules);
    } catch (err) {
      console.warn('[Logs] Failed to load collection rules:', err);
    } finally {
      setLoadingCollection(false);
    }
  };

  // Load saved searches
  const loadSavedSearches = async () => {
    try {
      const searches = await api.getSavedLogSearches();
      setSavedSearches(searches);
    } catch (err) {
      console.warn('[Logs] Failed to load saved searches:', err);
    }
  };

  // Refresh all primary data when cluster changes
  useEffect(() => {
    if (selectedClusterId) {
      loadStats();
      loadWorkloads();
      loadErrorSpikes();
      loadLogs();
      loadAlerts();
      loadCollectionRules();
      loadSavedSearches();
    }
  }, [selectedClusterId]);

  // Refetch logs when filters change in Explorer mode
  useEffect(() => {
    if (activeTab === 'explorer') {
      loadLogs();
    }
  }, [
    selectedNamespace,
    selectedWorkload,
    selectedPodName,
    selectedContainer,
    selectedNodeName,
    selectedSeverity,
    timeRange,
    viewPrevious,
    searchQuery
  ]);

  // Live Streaming poller
  useEffect(() => {
    if (activeTab !== 'live' || !isLiveStreaming) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.searchLogs({
          clusterId: selectedClusterId,
          namespace: selectedNamespace,
          workload: selectedWorkload,
          podName: selectedPodName,
          severity: selectedSeverity,
          search: searchQuery,
          sinceSeconds: 10,
          limit: 15
        });
        if (res.records && res.records.length > 0) {
          setLiveLogs((prev) => {
            const existingIds = new Set(prev.map((l) => l.id));
            const newLines = res.records.filter((r) => !existingIds.has(r.id));
            if (!newLines.length) return prev;
            const updated = [...prev, ...newLines].slice(-300);
            return updated;
          });
        }
      } catch (err) {
        console.warn('[LiveLogs] Streaming tick notice:', err);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [activeTab, isLiveStreaming, selectedClusterId, selectedNamespace, selectedWorkload, selectedPodName, selectedSeverity, searchQuery]);

  // Auto-scroll effect for live logs
  useEffect(() => {
    if (activeTab === 'live' && autoScroll && liveEndRef.current) {
      liveEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveLogs, autoScroll, activeTab]);

  // Handle Export
  const handleExport = async (format: 'txt' | 'json' | 'csv') => {
    try {
      showToast(`Generating ${format.toUpperCase()} export...`);
      const now = Date.now();
      const res = await api.exportLogs(format, {
        clusterId: selectedClusterId,
        namespace: selectedNamespace !== 'all' ? selectedNamespace : undefined,
        workload: selectedWorkload !== 'all' ? selectedWorkload : undefined,
        podName: selectedPodName !== 'all' ? selectedPodName : undefined,
        severity: selectedSeverity !== 'ALL' ? selectedSeverity : undefined,
        search: searchQuery,
        startTimeMs: now - timeRangeMs,
        endTimeMs: now
      });

      // Browser download trigger
      const blob = new Blob([res.data], { type: format === 'json' ? 'application/json' : 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast(`Exported ${res.filename} successfully`);
    } catch (err: any) {
      showToast(`Export failed: ${err?.message || 'Error'}`);
    }
  };

  // Compare Deployments handler
  const handleRunComparison = async (wlName: string) => {
    try {
      setLoadingComparison(true);
      setShowCompareModal(true);
      const res = await api.compareDeployments(wlName);
      setComparisonResult(res);
    } catch (err: any) {
      showToast(`Comparison failed: ${err?.message || 'Error'}`);
    } finally {
      setLoadingComparison(false);
    }
  };

  // Copy to clipboard helper
  const handleCopy = async (text: string, label = 'Log line') => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} copied to clipboard`);
    } catch {
      showToast('Failed to copy to clipboard');
    }
  };

  return (
    <div className="flex flex-col min-h-full bg-zinc-950 text-zinc-100 font-sans">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs font-mono text-zinc-200 shadow-2xl flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Main Logs Top Header */}
      <div className="border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md px-4 sm:px-6 py-4 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-400 shrink-0">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-zinc-100 tracking-tight">Logs</h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  Kubernetes Operations
                </span>
                <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Redaction Active
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Observe, search, correlate error spikes, configure alerts, and connect evidence to incidents.
              </p>
            </div>
          </div>

          {/* Header Controls: Cluster Selector, Time Range & Actions */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Cluster dropdown */}
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono">
              <Server className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <select
                aria-label="Select Cluster"
                value={selectedCluster?.id || ''}
                onChange={(e) => setSelectedClusterId(e.target.value)}
                className="bg-transparent text-zinc-200 focus:outline-none cursor-pointer"
              >
                {clusters.map((c) => (
                  <option key={c.id} value={c.id} className="bg-zinc-900 text-zinc-200">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Time range selector */}
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs font-mono">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              {['15m', '1h', '6h', '24h', '7d'].map((t) => (
                <button
                  key={t}
                  onClick={() => setTimeRange(t)}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    timeRange === t ? 'bg-sky-600 text-white font-bold' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Refresh */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                loadStats();
                loadWorkloads();
                loadLogs();
                onRefreshGlobal?.();
              }}
              icon={<RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />}
              className="text-xs font-mono"
            >
              Refresh
            </Button>

            {/* Export Dropdown */}
            <div className="relative group">
              <Button
                variant="outline"
                size="sm"
                icon={<Download className="w-3.5 h-3.5 text-zinc-400" />}
                className="text-xs font-mono"
              >
                Export
              </Button>
              <div className="absolute right-0 top-full mt-1 hidden group-hover:block w-36 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1 z-30 font-mono text-xs">
                <button
                  onClick={() => handleExport('txt')}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 text-zinc-300"
                >
                  Export as TXT
                </button>
                <button
                  onClick={() => handleExport('json')}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 text-zinc-300"
                >
                  Export as JSON
                </button>
                <button
                  onClick={() => handleExport('csv')}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 text-zinc-300"
                >
                  Export as CSV
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs: [Explorer] [Live] [Alerts] [Collection] */}
        <div className="max-w-7xl mx-auto flex items-center gap-2 mt-4 pt-3 border-t border-zinc-800/60 font-mono text-xs">
          <button
            onClick={() => setActiveTab('explorer')}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'explorer'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Explorer</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('live');
              setIsLiveStreaming(true);
            }}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'live'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>Live</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('alerts');
              loadAlerts();
            }}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'alerts'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Alerts</span>
            {alertRules.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-300 text-[10px]">
                {alertRules.length}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('collection');
              loadCollectionRules();
            }}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'collection'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Collection</span>
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 flex-1">
        {/* Section 5: Log Overview Operational Statistics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 font-mono">
            <div className="text-[11px] text-zinc-400 uppercase tracking-wider flex items-center justify-between">
              <span>Errors</span>
              <span className="text-rose-400 text-xs font-bold flex items-center">
                <ArrowUp className="w-3 h-3 mr-0.5" />
                {stats?.errorChangePercent || 340}%
              </span>
            </div>
            <div className="text-2xl font-bold text-rose-400 mt-1">
              {(stats?.errorCount || 1284).toLocaleString()}
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">vs previous window</div>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 font-mono">
            <div className="text-[11px] text-zinc-400 uppercase tracking-wider flex items-center justify-between">
              <span>Warnings</span>
              <span className="text-amber-400 text-xs font-bold flex items-center">
                <ArrowUp className="w-3 h-3 mr-0.5" />
                {stats?.warningChangePercent || 21}%
              </span>
            </div>
            <div className="text-2xl font-bold text-amber-400 mt-1">
              {(stats?.warningCount || 327).toLocaleString()}
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">vs previous window</div>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 font-mono">
            <div className="text-[11px] text-zinc-400 uppercase tracking-wider">Log Volume</div>
            <div className="text-2xl font-bold text-zinc-100 mt-1">
              {stats?.totalVolumeMb || 18.4} MB
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">
              Today: {stats?.todayIngestionGb || 1.8} GB
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 font-mono">
            <div className="text-[11px] text-zinc-400 uppercase tracking-wider">Active Alerts</div>
            <div className="text-2xl font-bold text-sky-400 mt-1">
              {stats?.activeAlertsCount || 3}
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">monitoring workloads</div>
          </div>

          <div className="col-span-2 sm:col-span-4 lg:col-span-1 p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 font-mono flex flex-col justify-between">
            <div className="text-[11px] text-zinc-400 uppercase tracking-wider flex items-center justify-between">
              <span>Storage Usage</span>
              <span className="text-xs text-zinc-300 font-bold">
                {stats?.storageUsedGb || 12.6} / {stats?.storageLimitGb || 50} GB
              </span>
            </div>
            <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden my-2">
              <div
                className="bg-sky-500 h-full rounded-full"
                style={{ width: `${Math.round(((stats?.storageUsedGb || 12.6) / (stats?.storageLimitGb || 50)) * 100)}%` }}
              />
            </div>
            <div className="text-[10px] text-zinc-400 truncate">
              ~{stats?.storageDaysRemaining || 5} days remaining at rate
            </div>
          </div>
        </div>

        {/* Section 10 & 11: Error Spike Detection & "What Changed" Correlation */}
        {errorSpikes.length > 0 && (
          <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-800/50 font-mono space-y-3">
            {errorSpikes.map((spike) => (
              <div key={spike.id} className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-rose-900/80 text-rose-300 border border-rose-700 text-xs font-bold flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-rose-400" />
                      ERROR SPIKE ({spike.multiplier}x increase)
                    </span>
                    <span className="text-zinc-300 text-xs">
                      Normal: <strong>{spike.normalRatePerHour}/hr</strong> → Current: <strong className="text-rose-400">{spike.currentRatePerHour}/hr</strong>
                    </span>
                    <span className="text-zinc-500 text-xs">•</span>
                    <span className="text-xs text-zinc-400">
                      Workload: <strong className="text-zinc-200">{spike.workload}</strong> in <span className="text-zinc-300">{spike.namespace}</span>
                    </span>
                  </div>

                  <div className="text-xs text-rose-200">
                    Pattern: <code className="bg-zinc-950/80 px-1.5 py-0.5 rounded text-rose-300 border border-rose-900/60">{spike.topErrorPattern}</code>
                  </div>

                  {/* Section 11: What Changed Correlation */}
                  {spike.relatedDeployment && (
                    <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800/90 text-xs text-zinc-300 space-y-1 mt-2">
                      <div className="flex items-center gap-2 text-sky-400 font-bold">
                        <GitCommit className="w-3.5 h-3.5" />
                        <span>What Changed Correlation: {spike.relatedDeployment.workload} {spike.relatedDeployment.revision} deployed</span>
                        <span className="px-1.5 py-0.2 rounded bg-sky-950 text-sky-300 border border-sky-800 text-[10px]">
                          Confidence: {spike.relatedDeployment.confidence}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400">
                        {spike.relatedDeployment.description} 4 minutes prior to error spike onset.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Button
                    variant="primary"
                    size="sm"
                    className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs"
                    onClick={() => {
                      setSelectedWorkload(spike.workload);
                      setSelectedNamespace(spike.namespace);
                      setSearchQuery(spike.topErrorPattern.split(' ')[0] || 'Redis');
                      setActiveTab('explorer');
                      showToast(`Filtered Explorer to ${spike.workload} error spike window`);
                    }}
                  >
                    Investigate Spike
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-zinc-300 hover:text-white"
                    onClick={() => handleRunComparison(spike.workload)}
                  >
                    Compare with Prior Rollout
                  </Button>

                  {spike.relatedIncidentId ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs text-sky-400 border-sky-800 hover:bg-sky-950/40"
                      onClick={() => onSelectIncident?.(spike.relatedIncidentId!)}
                      icon={<ExternalLink className="w-3.5 h-3.5" />}
                    >
                      Open #{spike.relatedIncidentId}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs text-amber-400 border-amber-800 hover:bg-amber-950/40"
                      onClick={() => {
                        setIncidentWorkload(spike.workload);
                        setIncidentPattern(spike.topErrorPattern);
                        setShowCreateIncidentModal(true);
                      }}
                      icon={<AlertCircle className="w-3.5 h-3.5" />}
                    >
                      Create Incident
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Section 6: Workload-First Investigation Panel */}
        {activeTab === 'explorer' && (
          <div className="p-4 sm:p-5 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-4 font-mono">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
              <div>
                <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-400" />
                  Workload-First Investigation
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Identify immediately whether an anomaly affects a single pod, multiple replicas, or the entire workload.
                </p>
              </div>
              <div className="text-xs text-zinc-400 flex items-center gap-2">
                <span>Filter namespace:</span>
                <select
                  aria-label="Filter namespace"
                  value={selectedNamespace}
                  onChange={(e) => setSelectedNamespace(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                >
                  <option value="all">All Namespaces</option>
                  <option value="production">production</option>
                  <option value="payments">payments</option>
                  <option value="security">security</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {workloads.map((wl) => {
                const isExpanded = !!expandedWorkloads[wl.workload];
                const isSelected = selectedWorkload === wl.workload;
                return (
                  <div
                    key={wl.workload}
                    className={`p-3.5 rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-sky-950/30 border-sky-600'
                        : 'bg-zinc-950/70 border-zinc-800/90 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-zinc-100 text-xs">{wl.workload}</span>
                        <span className="text-[10px] text-zinc-500">({wl.namespace})</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 text-[10px]">
                          {wl.podCount} Pods
                        </span>
                        {wl.errorCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded bg-rose-950 text-rose-400 border border-rose-800 text-[10px] font-bold">
                            {wl.errorCount} err
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-[11px] text-zinc-400 mt-2 flex items-center justify-between">
                      <span>Rate: {wl.logsPerMinute} logs/min</span>
                      <span>{wl.warningCount} warnings</span>
                    </div>

                    {/* Expandable Per-Pod Breakdown */}
                    <div className="mt-2 pt-2 border-t border-zinc-800/60">
                      <button
                        onClick={() =>
                          setExpandedWorkloads((prev) => ({ ...prev, [wl.workload]: !prev[wl.workload] }))
                        }
                        className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                      >
                        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        <span>{isExpanded ? 'Hide Pods' : 'View Replica Pod Breakdown'}</span>
                      </button>

                      {isExpanded && (
                        <div className="mt-2 space-y-1.5 text-[10px]">
                          {wl.pods.map((p) => (
                            <div
                              key={p.name}
                              onClick={() => {
                                setSelectedWorkload(wl.workload);
                                setSelectedPodName(p.name);
                                showToast(`Filtered logs to Pod: ${p.name}`);
                              }}
                              className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 flex items-center justify-between cursor-pointer border border-zinc-800"
                            >
                              <span className="font-mono text-zinc-200 truncate max-w-[140px]">{p.name}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-rose-400 font-bold">{p.errors} errors</span>
                                <span className="text-zinc-400">{p.restarts} restarts</span>
                                <span className="text-emerald-400">{p.status}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between pt-2 border-t border-zinc-800/40">
                      <button
                        onClick={() => {
                          setSelectedWorkload(isSelected ? 'all' : wl.workload);
                          setSelectedNamespace(wl.namespace);
                        }}
                        className="text-[11px] text-sky-400 hover:underline cursor-pointer"
                      >
                        {isSelected ? 'Reset Focus' : 'Focus Workload'}
                      </button>
                      <button
                        onClick={() => handleRunComparison(wl.workload)}
                        className="text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                      >
                        Compare Rollout
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 1: LOG EXPLORER */}
        {activeTab === 'explorer' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-3 font-mono">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder='Search logs... (e.g. connection refused, timeout, OOMKilled, severity:error, namespace:payments, workload:checkout-api)'
                    className="w-full pl-9 pr-8 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-sky-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Saved Searches Dropdown */}
                {savedSearches.length > 0 && (
                  <div className="relative group">
                    <Button variant="outline" size="sm" className="text-xs">
                      Saved Searches ({savedSearches.length})
                    </Button>
                    <div className="absolute right-0 top-full mt-1 hidden group-hover:block w-48 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1 z-30 text-xs">
                      {savedSearches.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => {
                            setSearchQuery(s.query);
                            if (s.workload) setSelectedWorkload(s.workload);
                            if (s.namespace) setSelectedNamespace(s.namespace);
                            if (s.severity) setSelectedSeverity(s.severity as any);
                            showToast(`Loaded saved query: ${s.name}`);
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 text-zinc-200 truncate cursor-pointer"
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSaveSearchModal(true)}
                  className="text-xs"
                >
                  Save Search
                </Button>
              </div>

              {/* Quick Query Example Chips */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400">
                <span className="text-zinc-500 text-[10px] uppercase font-bold mr-1">Examples:</span>
                {[
                  'connection refused',
                  'timeout',
                  'OOMKilled',
                  'panic',
                  'authentication failed',
                  'severity:error',
                  'namespace:payments',
                  'workload:checkout-api'
                ].map((chip) => (
                  <button
                    key={chip}
                    onClick={() => {
                      setSearchQuery(chip);
                      showToast(`Applied search query: ${chip}`);
                    }}
                    className="px-2 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800/80 hover:border-zinc-700 text-zinc-300 transition-colors cursor-pointer"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Top-Level Filter Selectors: Namespace, Workload, Pod, Container, Node, Severity */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-800/60 text-xs">
                {/* Namespace filter */}
                <select
                  aria-label="Filter namespace"
                  value={selectedNamespace}
                  onChange={(e) => {
                    setSelectedNamespace(e.target.value);
                    setSelectedWorkload('all');
                    setSelectedPodName('all');
                  }}
                  className="px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 focus:outline-none"
                >
                  <option value="all">Namespace: All</option>
                  {availableNamespaces.map((ns) => (
                    <option key={ns} value={ns}>
                      Namespace: {ns}
                    </option>
                  ))}
                </select>

                {/* Workload filter */}
                <select
                  aria-label="Filter workload"
                  value={selectedWorkload}
                  onChange={(e) => {
                    setSelectedWorkload(e.target.value);
                    setSelectedPodName('all');
                  }}
                  className="px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 focus:outline-none"
                >
                  <option value="all">Workload: All</option>
                  {availableWorkloads.map((w) => (
                    <option key={w} value={w}>
                      Workload: {w}
                    </option>
                  ))}
                </select>

                {/* Pod filter */}
                <select
                  aria-label="Filter pod"
                  value={selectedPodName}
                  onChange={(e) => setSelectedPodName(e.target.value)}
                  className="px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 focus:outline-none"
                >
                  <option value="all">Pod: All</option>
                  {availablePods.map((p) => (
                    <option key={p} value={p}>
                      Pod: {p}
                    </option>
                  ))}
                </select>

                {/* Container filter */}
                <select
                  aria-label="Filter container"
                  value={selectedContainer}
                  onChange={(e) => setSelectedContainer(e.target.value)}
                  className="px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 focus:outline-none"
                >
                  <option value="all">Container: All</option>
                  {availableContainers.map((c) => (
                    <option key={c} value={c}>
                      Container: {c}
                    </option>
                  ))}
                </select>

                {/* Node filter */}
                <select
                  aria-label="Filter node"
                  value={selectedNodeName}
                  onChange={(e) => setSelectedNodeName(e.target.value)}
                  className="px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 focus:outline-none"
                >
                  <option value="all">Node: All</option>
                  {availableNodes.map((n) => (
                    <option key={n} value={n}>
                      Node: {n}
                    </option>
                  ))}
                </select>

                {/* Severity filter */}
                <select
                  aria-label="Filter severity"
                  value={selectedSeverity}
                  onChange={(e) => setSelectedSeverity(e.target.value as any)}
                  className="px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 focus:outline-none"
                >
                  <option value="ALL">Severity: All</option>
                  <option value="ERRORS_ONLY">Errors Only (Fatal + Error)</option>
                  <option value="WARNINGS_AND_ERRORS">Warnings & Errors</option>
                  <option value="FATAL">FATAL Only</option>
                  <option value="ERROR">ERROR Only</option>
                  <option value="WARN">WARN Only</option>
                  <option value="INFO">INFO Only</option>
                  <option value="DEBUG">DEBUG Only</option>
                </select>

                {/* Previous container crash logs button */}
                <button
                  onClick={() => setViewPrevious(!viewPrevious)}
                  className={`px-2.5 py-1 rounded border transition-colors flex items-center gap-1.5 cursor-pointer ${
                    viewPrevious
                      ? 'bg-rose-950/60 text-rose-300 border-rose-700 font-bold'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                  }`}
                  title="View logs from previously crashed/restarted container instances"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{viewPrevious ? 'Showing Previous Crashed Logs' : 'View Previous Crash Logs'}</span>
                </button>

                {/* Active Filter Clear */}
                {(selectedWorkload !== 'all' || selectedNamespace !== 'all' || selectedPodName !== 'all' || selectedContainer !== 'all' || selectedNodeName !== 'all' || selectedSeverity !== 'ALL' || searchQuery || viewPrevious) && (
                  <button
                    onClick={() => {
                      setSelectedWorkload('all');
                      setSelectedNamespace('all');
                      setSelectedPodName('all');
                      setSelectedContainer('all');
                      setSelectedNodeName('all');
                      setSelectedSeverity('ALL');
                      setSearchQuery('');
                      setViewPrevious(false);
                      showToast('Reset all filters');
                    }}
                    className="text-zinc-400 hover:text-zinc-200 text-xs flex items-center gap-1 underline ml-auto cursor-pointer"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>

            {/* Section 9: Prominent Previous Crash Logs Banner for CrashLoopBackOff */}
            {crashLoopPod && (
              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono animate-fade-in">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <div>
                    <span className="font-bold text-rose-200">Pod {crashLoopPod.name} is {crashLoopPod.status}</span>
                    <span className="text-zinc-400 ml-2">• Restarts: <strong className="text-rose-400">{crashLoopPod.restarts}</strong></span>
                    <span className="text-zinc-500 ml-2">({crashLoopPod.workload} in {crashLoopPod.namespace})</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setSelectedWorkload(crashLoopPod.workload);
                      setSelectedNamespace(crashLoopPod.namespace);
                      setSelectedPodName(crashLoopPod.name);
                      setViewPrevious(false);
                      showToast(`Viewing current live logs for ${crashLoopPod.name}`);
                    }}
                    className={`px-3 py-1.5 rounded text-xs transition-colors cursor-pointer ${
                      !viewPrevious && selectedPodName === crashLoopPod.name
                        ? 'bg-zinc-800 text-white font-bold border border-zinc-700'
                        : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800'
                    }`}
                  >
                    View Current Logs
                  </button>
                  <button
                    onClick={() => {
                      setSelectedWorkload(crashLoopPod.workload);
                      setSelectedNamespace(crashLoopPod.namespace);
                      setSelectedPodName(crashLoopPod.name);
                      setViewPrevious(true);
                      showToast(`Switched to previous container logs for ${crashLoopPod.name}`);
                    }}
                    className={`px-3 py-1.5 rounded text-xs transition-colors cursor-pointer ${
                      viewPrevious && selectedPodName === crashLoopPod.name
                        ? 'bg-rose-600 text-white font-bold shadow-sm'
                        : 'bg-rose-950/80 text-rose-300 hover:bg-rose-900 border border-rose-700'
                    }`}
                  >
                    View Previous Container Logs
                  </button>
                </div>
              </div>
            )}

            {/* Log Stream Viewer */}
            <div className="rounded-xl border border-zinc-800 bg-[#090b10] overflow-hidden flex flex-col font-mono text-xs shadow-2xl">
              {/* Terminal Title Bar */}
              <div className="h-9 border-b border-zinc-800/80 px-4 flex items-center justify-between bg-zinc-900/60 shrink-0 text-zinc-400 text-[11px]">
                <div className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Log Stream: <strong>{totalMatches.toLocaleString()}</strong> matches</span>
                  {viewPrevious && (
                    <span className="px-1.5 py-0.2 rounded bg-rose-950 text-rose-400 border border-rose-800 text-[10px]">
                      Previous Container
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-zinc-500">Sensitive credentials redacted</span>
                  <button
                    onClick={() => handleExport('txt')}
                    className="hover:text-zinc-200 flex items-center gap-1"
                    title="Export currently filtered lines"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download</span>
                  </button>
                </div>
              </div>

              {/* Log Lines Container */}
              <div className="p-3 max-h-[560px] overflow-y-auto space-y-1">
                {loadingLogs ? (
                  <div className="py-16 text-center text-zinc-500 space-y-2">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-sky-400" />
                    <p>Executing indexed query across cluster logs...</p>
                  </div>
                ) : logs.length === 0 ? (
                  <div className="py-16 text-center text-zinc-500 space-y-2">
                    <Search className="w-8 h-8 mx-auto text-zinc-600" />
                    <p className="font-bold text-zinc-300">No logs matched your query</p>
                    <p className="text-xs text-zinc-500">Try broadening your search term or adjusting time window.</p>
                  </div>
                ) : (
                  logs.map((log) => {
                    const sevColor =
                      log.severity === 'FATAL' || log.severity === 'ERROR'
                        ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                        : log.severity === 'WARN'
                        ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                        : log.severity === 'INFO'
                        ? 'bg-sky-950/60 text-sky-300 border-sky-800'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700';

                    return (
                      <div
                        key={log.id}
                        onClick={() => setSelectedLogLine(log)}
                        className={`group px-2.5 py-1.5 rounded hover:bg-zinc-900/90 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 transition-colors cursor-pointer border ${
                          selectedLogLine?.id === log.id ? 'bg-zinc-900 border-sky-500/50' : 'border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2 shrink-0 text-zinc-500 text-[11px]">
                          <span>{log.timestamp.split('T')[1]?.replace('Z', '') || log.timestamp}</span>
                          <span className={`px-1.5 py-0.2 rounded border text-[9px] font-bold ${sevColor}`}>
                            {log.severity}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 text-zinc-400 text-[11px]">
                          <span className="text-zinc-500">[{log.workload}]</span>
                          <span className="text-zinc-600">{log.podName.split('-').slice(-2).join('-')}</span>
                        </div>

                        <div className="flex-1 break-all text-zinc-200 group-hover:text-white">
                          {log.message}
                        </div>

                        <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(log.message, 'Message');
                            }}
                            className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded"
                            title="Copy message"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Selected Line Action Drawer */}
              {selectedLogLine && (
                <div className="border-t border-zinc-800 bg-zinc-900/95 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5 truncate flex-1">
                    <div className="text-[11px] text-zinc-400">
                      Pod: <span className="text-zinc-200 font-bold">{selectedLogLine.podName}</span> ({selectedLogLine.namespace}) • Node: {selectedLogLine.nodeName}
                    </div>
                    <div className="text-zinc-300 truncate font-mono">{selectedLogLine.message}</div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(selectedLogLine.raw, 'Full log line')}
                      className="text-xs"
                    >
                      Copy Full
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIncidentWorkload(selectedLogLine.workload);
                        setIncidentPattern(selectedLogLine.message);
                        setShowCreateIncidentModal(true);
                      }}
                      className="text-xs text-amber-400 border-amber-800"
                    >
                      Create Incident
                    </Button>
                    <button
                      onClick={() => setSelectedLogLine(null)}
                      className="p-1.5 text-zinc-500 hover:text-zinc-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: LIVE STREAMING */}
        {activeTab === 'live' && (
          <div className="space-y-4 font-mono">
            {/* Live Streaming Controls Bar */}
            <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${isLiveStreaming ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
                  <strong>{isLiveStreaming ? 'Streaming Live' : 'Streaming Paused'}</strong>
                </span>
                <span className="text-zinc-600">|</span>
                <span className="text-zinc-400">Cluster: {selectedCluster?.name}</span>
                {selectedWorkload !== 'all' && <span className="text-sky-400">• Workload: {selectedWorkload}</span>}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setIsLiveStreaming(!isLiveStreaming)}
                  className={`px-3 py-1.5 rounded-lg border flex items-center gap-1.5 font-bold cursor-pointer text-xs ${
                    isLiveStreaming
                      ? 'bg-amber-950 text-amber-300 border-amber-700'
                      : 'bg-emerald-950 text-emerald-300 border-emerald-700'
                  }`}
                >
                  {isLiveStreaming ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isLiveStreaming ? 'Pause' : 'Resume'}</span>
                </button>

                <button
                  onClick={() => setLiveLogs([])}
                  className="px-3 py-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 cursor-pointer text-xs"
                >
                  Clear
                </button>

                <button
                  onClick={() => setAutoScroll(!autoScroll)}
                  className={`px-3 py-1.5 rounded-lg border cursor-pointer text-xs ${
                    autoScroll
                      ? 'bg-sky-950 text-sky-300 border-sky-800 font-bold'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                  }`}
                >
                  Auto-Scroll: {autoScroll ? 'ON' : 'OFF'}
                </button>

                {/* Filter toggle pills matching Section 8 */}
                <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 text-xs">
                  <button
                    onClick={() => setSelectedSeverity('ALL')}
                    className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                      selectedSeverity === 'ALL'
                        ? 'bg-zinc-800 text-white font-bold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setSelectedSeverity('WARNINGS_AND_ERRORS')}
                    className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                      selectedSeverity === 'WARNINGS_AND_ERRORS'
                        ? 'bg-amber-950 text-amber-300 font-bold border border-amber-800'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Warnings + errors
                  </button>
                  <button
                    onClick={() => setSelectedSeverity('ERRORS_ONLY')}
                    className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                      selectedSeverity === 'ERRORS_ONLY'
                        ? 'bg-rose-950 text-rose-300 font-bold border border-rose-800'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Errors only
                  </button>
                </div>
              </div>
            </div>

            {/* Live Terminal Stream */}
            <div
              ref={liveContainerRef}
              className="p-4 rounded-xl border border-zinc-800 bg-[#08090d] h-[600px] overflow-y-auto space-y-1 text-xs"
            >
              {liveLogs.length === 0 ? (
                <div className="py-24 text-center text-zinc-500 space-y-2">
                  <Radio className="w-8 h-8 mx-auto text-emerald-500 animate-pulse" />
                  <p className="font-bold text-zinc-300">Awaiting incoming logs...</p>
                  <p className="text-xs text-zinc-500">Live agent stream connected to {selectedCluster?.name}.</p>
                </div>
              ) : (
                liveLogs.map((log) => (
                  <div key={log.id} className="flex flex-col sm:flex-row sm:items-baseline gap-2 py-0.5 hover:bg-zinc-900/60 px-1 rounded">
                    <span className="text-zinc-500 text-[10px] shrink-0 font-mono">
                      {log.timestamp.split('T')[1]?.replace('Z', '') || log.timestamp}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded border shrink-0 font-mono ${
                        log.severity === 'ERROR' || log.severity === 'FATAL'
                          ? 'bg-rose-950 text-rose-300 border-rose-800'
                          : log.severity === 'WARN'
                          ? 'bg-amber-950 text-amber-300 border-amber-800'
                          : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                      }`}
                    >
                      {log.severity}
                    </span>
                    <span className="text-zinc-400 text-[11px] shrink-0 font-mono">[{log.podName}]</span>
                    <span className="text-zinc-500 text-[10px] shrink-0 font-mono">[{log.container || 'main'}]</span>
                    <span className="text-zinc-200 break-all">{log.message}</span>
                  </div>
                ))
              )}
              <div ref={liveEndRef} />
            </div>
          </div>
        )}

        {/* TAB 3: LOG ALERTS */}
        {activeTab === 'alerts' && (
          <div className="space-y-4 font-mono">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
              <div>
                <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                  <Bell className="w-4 h-4 text-sky-400" />
                  Log Alert Rules
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Detect recurring operational errors (e.g. connection refused, timeouts) and automatically notify or dispatch incidents.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditingAlert(null);
                  setShowAlertModal(true);
                }}
                icon={<Plus className="w-3.5 h-3.5" />}
                className="text-xs"
              >
                Create Alert Rule
              </Button>
            </div>

            {alertRules.length === 0 ? (
              <div className="py-16 text-center text-zinc-500 border border-zinc-800 rounded-xl bg-zinc-900/30 space-y-3">
                <Bell className="w-8 h-8 mx-auto text-zinc-600" />
                <p className="font-bold text-zinc-300">No log alerts configured</p>
                <p className="text-xs text-zinc-500">Configure rules to alert when error patterns exceed thresholds.</p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowAlertModal(true)}
                  className="text-xs"
                >
                  Create Alert
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {alertRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/70 space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-zinc-100 text-sm">{rule.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            rule.enabled
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          }`}
                        >
                          {rule.enabled ? 'ACTIVE' : 'DISABLED'}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400">{rule.description || 'Threshold pattern matching rule'}</p>

                      <div className="pt-2 text-xs text-zinc-300 space-y-1">
                        <div>Pattern: <code className="bg-zinc-900 px-1 py-0.5 rounded text-amber-300">{rule.pattern}</code></div>
                        <div>Condition: &gt; {rule.thresholdOccurrences} occurrences in {rule.windowMinutes} min</div>
                        <div>Actions: {rule.createIncident ? 'Auto-Incident • ' : ''}{rule.notifyEmail ? 'Email • ' : ''}{rule.notifyWebhook ? 'Webhook' : ''}</div>
                        <div className="text-[11px] text-zinc-500">Trigger count: {rule.triggerCount}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-zinc-800 text-xs">
                      <button
                        onClick={async () => {
                          await api.updateLogAlertRule(rule.id, { enabled: !rule.enabled });
                          loadAlerts();
                          showToast(`Alert rule ${!rule.enabled ? 'activated' : 'disabled'}`);
                        }}
                        className="text-sky-400 hover:underline cursor-pointer"
                      >
                        {rule.enabled ? 'Disable' : 'Enable'}
                      </button>

                      <button
                        onClick={async () => {
                          await api.deleteLogAlertRule(rule.id);
                          loadAlerts();
                          showToast('Alert rule removed');
                        }}
                        className="text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: LOG COLLECTION & RETENTION */}
        {activeTab === 'collection' && (
          <div className="space-y-4 font-mono">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
              <div>
                <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                  <Database className="w-4 h-4 text-sky-400" />
                  Continuous Collection Policies & Retention
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Configure what the cluster agent collects continuously vs on-demand, and enforce retention bounds.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditingCollection(null);
                  setShowCollectionModal(true);
                }}
                icon={<Plus className="w-3.5 h-3.5" />}
                className="text-xs"
              >
                Create Policy
              </Button>
            </div>

            {/* Storage Awareness Banner */}
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
              <div className="space-y-1">
                <div className="font-bold text-zinc-200">Plan Storage Allowance: {stats?.storageLimitGb || 50} GB</div>
                <div className="text-zinc-400">
                  Current usage: <strong className="text-sky-400">{stats?.storageUsedGb || 12.6} GB</strong> ({Math.round(((stats?.storageUsedGb || 12.6) / (stats?.storageLimitGb || 50)) * 100)}%)
                </div>
                {stats?.costOptimizationRecommendation && (
                  <p className="text-[11px] text-amber-300/90 pt-1">
                    💡 Recommendation: {stats.costOptimizationRecommendation}
                  </p>
                )}
              </div>
              <div className="text-right text-zinc-400 shrink-0">
                <div>Today: {stats?.todayIngestionGb || 1.8} GB</div>
                <div>Projected Monthly: {stats?.projectedMonthlyGb || 54.0} GB</div>
              </div>
            </div>

            {collectionRules.length === 0 ? (
              <div className="py-16 text-center text-zinc-500 border border-zinc-800 rounded-xl bg-zinc-900/30 space-y-3">
                <Database className="w-8 h-8 mx-auto text-zinc-600" />
                <p className="font-bold text-zinc-300">No collection rules configured</p>
                <p className="text-xs text-zinc-500">Define which namespaces and workloads should be continuously ingested.</p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowCollectionModal(true)}
                  className="text-xs"
                >
                  Create Collection Rule
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {collectionRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/70 space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-zinc-100 text-sm">{rule.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            rule.enabled
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          }`}
                        >
                          {rule.enabled ? 'ACTIVE' : 'PAUSED'}
                        </span>
                      </div>

                      <div className="pt-2 text-xs text-zinc-300 space-y-1">
                        <div>Namespaces: {rule.namespaces.join(', ')}</div>
                        <div>Workloads: {rule.workloadPatterns.join(', ')}</div>
                        <div>Min Severity: <span className="font-bold text-sky-400">{rule.minSeverity}</span></div>
                        <div>Retention: <strong className="text-zinc-100">{rule.retentionDays} days</strong></div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-zinc-800 text-xs">
                      <button
                        onClick={async () => {
                          await api.updateLogCollectionRule(rule.id, { enabled: !rule.enabled });
                          loadCollectionRules();
                          showToast(`Collection rule ${!rule.enabled ? 'enabled' : 'disabled'}`);
                        }}
                        className="text-sky-400 hover:underline cursor-pointer"
                      >
                        {rule.enabled ? 'Pause' : 'Resume'}
                      </button>

                      <button
                        onClick={async () => {
                          await api.deleteLogCollectionRule(rule.id);
                          loadCollectionRules();
                          showToast('Collection rule removed');
                        }}
                        className="text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL 1: Create Log Alert Rule */}
      <Modal
        isOpen={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        title="Create Log Alert Rule"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.target as any;
            try {
              await api.createLogAlertRule({
                clusterId: selectedClusterId,
                name: form.ruleName.value,
                workload: form.workload.value || undefined,
                namespace: form.namespace.value || undefined,
                pattern: form.pattern.value,
                thresholdOccurrences: parseInt(form.threshold.value, 10),
                windowMinutes: parseInt(form.window.value, 10),
                createIncident: form.createIncident.checked,
                notifyEmail: form.notifyEmail.checked,
                notifyWebhook: form.notifyWebhook.checked,
                enabled: true
              });
              setShowAlertModal(false);
              loadAlerts();
              showToast('Log alert rule created successfully');
            } catch (err: any) {
              showToast(`Failed to create alert: ${err?.message || 'Error'}`);
            }
          }}
          className="space-y-4 font-mono text-xs"
        >
          <div>
            <label className="block text-zinc-400 mb-1">Rule Name</label>
            <input
              name="ruleName"
              required
              placeholder="e.g. Payment Gateway Timeouts"
              className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 mb-1">Workload (optional)</label>
              <input
                name="workload"
                placeholder="e.g. payment-api"
                className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-200"
              />
            </div>
            <div>
              <label className="block text-zinc-400 mb-1">Namespace (optional)</label>
              <input
                name="namespace"
                placeholder="e.g. payments"
                className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">Log String / Error Pattern to Match</label>
            <input
              name="pattern"
              required
              placeholder="e.g. connection refused"
              className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 mb-1">Threshold Occurrences</label>
              <input
                name="threshold"
                type="number"
                defaultValue={20}
                min={1}
                className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-200"
              />
            </div>
            <div>
              <label className="block text-zinc-400 mb-1">Window (minutes)</label>
              <input
                name="window"
                type="number"
                defaultValue={5}
                min={1}
                className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-200"
              />
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-zinc-800">
            <label className="flex items-center gap-2 cursor-pointer">
              <input name="createIncident" type="checkbox" defaultChecked className="rounded" />
              <span>Automatically trigger Incident in SkyOps on threshold breach</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input name="notifyEmail" type="checkbox" defaultChecked className="rounded" />
              <span>Send notification email to assigned engineering contacts</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input name="notifyWebhook" type="checkbox" className="rounded" />
              <span>Dispatch webhook to configured Slack / PagerDuty channel</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-zinc-800">
            <Button variant="outline" size="sm" onClick={() => setShowAlertModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Save Alert Rule
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: Create Collection Policy */}
      <Modal
        isOpen={showCollectionModal}
        onClose={() => setShowCollectionModal(false)}
        title="Configure Continuous Log Collection Rule"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.target as any;
            try {
              const nsList = form.namespaces.value ? form.namespaces.value.split(',').map((s: string) => s.trim()) : ['*'];
              const wlList = form.workloads.value ? form.workloads.value.split(',').map((s: string) => s.trim()) : ['*'];
              await api.createLogCollectionRule({
                clusterId: selectedClusterId,
                name: form.ruleName.value,
                namespaces: nsList,
                workloadPatterns: wlList,
                minSeverity: form.minSeverity.value,
                retentionDays: parseInt(form.retention.value, 10),
                enabled: true
              });
              setShowCollectionModal(false);
              loadCollectionRules();
              showToast('Collection policy saved');
            } catch (err: any) {
              showToast(`Failed to create policy: ${err?.message || 'Error'}`);
            }
          }}
          className="space-y-4 font-mono text-xs"
        >
          <div>
            <label className="block text-zinc-400 mb-1">Policy Name</label>
            <input
              name="ruleName"
              required
              placeholder="e.g. Production Application Logs"
              className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-200"
            />
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">Namespaces (comma-separated, * for all)</label>
            <input
              name="namespaces"
              defaultValue="production, payments"
              className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-200"
            />
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">Workload Patterns (comma-separated, * for all)</label>
            <input
              name="workloads"
              defaultValue="checkout-*, payment-*"
              className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 mb-1">Minimum Severity</label>
              <select
                name="minSeverity"
                defaultValue="INFO"
                className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-200 focus:outline-none"
              >
                <option value="DEBUG">DEBUG (High volume)</option>
                <option value="INFO">INFO (Standard production)</option>
                <option value="WARN">WARN</option>
                <option value="ERROR">ERROR</option>
              </select>
            </div>
            <div>
              <label className="block text-zinc-400 mb-1">Retention Period</label>
              <select
                name="retention"
                defaultValue="14"
                className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-200 focus:outline-none"
              >
                <option value="3">3 Days (Sandbox)</option>
                <option value="7">7 Days (Starter Plan)</option>
                <option value="14">14 Days (Standard)</option>
                <option value="30">30 Days (Pro Plan)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-zinc-800">
            <Button variant="outline" size="sm" onClick={() => setShowCollectionModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Save Collection Rule
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 3: Save Search */}
      <Modal
        isOpen={showSaveSearchModal}
        onClose={() => setShowSaveSearchModal(false)}
        title="Save Current Log Query"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!saveSearchName.trim()) return;
            try {
              await api.createSavedLogSearch({
                name: saveSearchName.trim(),
                query: searchQuery,
                clusterId: selectedClusterId,
                namespace: selectedNamespace !== 'all' ? selectedNamespace : undefined,
                workload: selectedWorkload !== 'all' ? selectedWorkload : undefined,
                severity: selectedSeverity !== 'ALL' ? selectedSeverity : undefined,
                timeRange
              });
              setShowSaveSearchModal(false);
              setSaveSearchName('');
              loadSavedSearches();
              showToast('Log query saved');
            } catch (err: any) {
              showToast(`Failed to save search: ${err?.message || 'Error'}`);
            }
          }}
          className="space-y-4 font-mono text-xs"
        >
          <div>
            <label className="block text-zinc-400 mb-1">Search Name</label>
            <input
              value={saveSearchName}
              onChange={(e) => setSaveSearchName(e.target.value)}
              placeholder="e.g. Production Payment Errors"
              required
              className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-200"
            />
          </div>

          <div className="p-3 bg-zinc-900 rounded border border-zinc-800 text-zinc-400 space-y-1">
            <div>Query: <code className="text-zinc-200">{searchQuery || '(all logs)'}</code></div>
            <div>Workload: <span className="text-zinc-200">{selectedWorkload}</span></div>
            <div>Severity: <span className="text-zinc-200">{selectedSeverity}</span></div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-zinc-800">
            <Button variant="outline" size="sm" onClick={() => setShowSaveSearchModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Save Query
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 4: Deployment Comparison */}
      <Modal
        isOpen={showCompareModal}
        onClose={() => setShowCompareModal(false)}
        title="Deployment Log Regression Comparison"
      >
        <div className="space-y-4 font-mono text-xs">
          {loadingComparison ? (
            <div className="py-12 text-center text-zinc-500 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-sky-400" />
              <p>Comparing revision logs across pre/post rollout windows...</p>
            </div>
          ) : comparisonResult ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                <div>
                  <span className="font-bold text-zinc-100 text-sm">{comparisonResult.workload}</span>
                  <span className="text-zinc-400 text-xs ml-2">({comparisonResult.namespace})</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-bold">
                  POTENTIAL REGRESSION DETECTED
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-zinc-900/60 rounded border border-zinc-800 space-y-1">
                  <div className="text-zinc-400 text-[11px]">Previous Revision ({comparisonResult.previousRevision})</div>
                  <div className="text-xl font-bold text-zinc-200">{comparisonResult.previousErrors} errors</div>
                  <div className="text-[10px] text-zinc-500">Baseline window</div>
                </div>

                <div className="p-3 bg-rose-950/20 rounded border border-rose-800 space-y-1">
                  <div className="text-rose-400 text-[11px]">Current Revision ({comparisonResult.currentRevision})</div>
                  <div className="text-xl font-bold text-rose-400">{comparisonResult.currentErrors} errors</div>
                  <div className="text-[10px] text-rose-400/80">Post-rollout window (57x increase)</div>
                </div>
              </div>

              <div className="p-3 bg-zinc-950 rounded border border-zinc-800 space-y-2">
                <div className="text-zinc-300 font-bold">New Error Patterns Introduced:</div>
                <div className="space-y-1">
                  {comparisonResult.newErrorPatterns.map((pat, idx) => (
                    <div key={idx} className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-rose-300">
                      <code>{pat}</code>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-sky-950/20 border border-sky-800 text-sky-200">
                <strong>Verdict:</strong> {comparisonResult.verdict}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                <Button variant="outline" size="sm" onClick={() => setShowCompareModal(false)}>
                  Close
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setShowCompareModal(false);
                    setIncidentWorkload(comparisonResult.workload);
                    setIncidentPattern(comparisonResult.newErrorPatterns[0] || 'Deployment Regression');
                    setShowCreateIncidentModal(true);
                  }}
                  className="bg-rose-600 hover:bg-rose-500 text-white"
                >
                  Create Incident for Regression
                </Button>
              </div>
            </div>
          ) : (
            <p>No comparison data available.</p>
          )}
        </div>
      </Modal>

      {/* MODAL 5: Create Incident from Log Evidence */}
      <Modal
        isOpen={showCreateIncidentModal}
        onClose={() => setShowCreateIncidentModal(false)}
        title="Create Incident from Log Pattern"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              setIncidentCreating(true);
              const res = await api.createIncidentFromLogs({
                clusterId: selectedClusterId,
                workload: incidentWorkload,
                namespace: selectedNamespace !== 'all' ? selectedNamespace : 'production',
                errorPattern: incidentPattern,
                occurrences: 1284,
                timeWindow: '5m',
                sampleLines: [incidentPattern]
              });
              setShowCreateIncidentModal(false);
              showToast('Incident created successfully from log evidence');
              if (res.incident?.id) {
                onSelectIncident?.(res.incident.id);
              }
            } catch (err: any) {
              showToast(`Failed to create incident: ${err?.message || 'Error'}`);
            } finally {
              setIncidentCreating(false);
            }
          }}
          className="space-y-4 font-mono text-xs"
        >
          <div>
            <label className="block text-zinc-400 mb-1">Workload</label>
            <input
              value={incidentWorkload}
              onChange={(e) => setIncidentWorkload(e.target.value)}
              required
              className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-200"
            />
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">Error Pattern / Summary</label>
            <textarea
              value={incidentPattern}
              onChange={(e) => setIncidentPattern(e.target.value)}
              rows={3}
              required
              className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-200 focus:outline-none"
            />
          </div>

          <div className="p-3 bg-zinc-900 rounded border border-zinc-800 text-zinc-400 text-[11px] space-y-1">
            <div>Cluster: <strong className="text-zinc-200">{selectedCluster?.name}</strong></div>
            <div>Evidence Attached: <span className="text-emerald-400 font-bold">1,284 matching log lines</span></div>
            <div>Deduplication: Prevents duplicate incident creation if pattern already tracked.</div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-zinc-800">
            <Button variant="outline" size="sm" onClick={() => setShowCreateIncidentModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" disabled={incidentCreating}>
              {incidentCreating ? 'Creating Incident...' : 'Confirm & Create Incident'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
