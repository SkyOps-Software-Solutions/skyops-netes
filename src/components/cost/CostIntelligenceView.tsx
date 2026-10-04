/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SkyOps Kubernetes Cost Intelligence View
 * Displays cost overview, allocation, resource rightsizing, cost waste, and savings tracking.
 */

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coins,
  Cpu,
  Database,
  DollarSign,
  Filter,
  HardDrive,
  Info,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  Server,
  Shield,
  Sliders,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  CostAllocationBreakdown,
  CostAllocationItem,
  CostOverview,
  CostSavingsTracking,
  CostWasteItem,
  ResourceRightsizingRecommendation
} from '../../types/enterprise';
import { Button, Modal } from '../common/UI';

export const CostIntelligenceView: React.FC = () => {
  const { canApplyCostOptimization, isViewer } = useAuth();
  const [overview, setOverview] = useState<CostOverview | null>(null);
  const [allocation, setAllocation] = useState<CostAllocationBreakdown | null>(null);
  const [recommendations, setRecommendations] = useState<ResourceRightsizingRecommendation[]>([]);
  const [wasteItems, setWasteItems] = useState<CostWasteItem[]>([]);
  const [savings, setSavings] = useState<CostSavingsTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Allocation active tab
  const [activeAllocTab, setActiveAllocTab] = useState<'cluster' | 'namespace' | 'workload' | 'team'>('namespace');
  const [allocSearch, setAllocSearch] = useState('');

  // Rightsizing modal state
  const [selectedRec, setSelectedRec] = useState<ResourceRightsizingRecommendation | null>(null);
  const [applyingRec, setApplyingRec] = useState(false);
  const [applySuccessMsg, setApplySuccessMsg] = useState<string | null>(null);

  const fetchData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const [ovData, allocData, recsData, wasteData, savingsData] = await Promise.all([
        api.getCostOverview().catch(() => null),
        api.getCostAllocation().catch(() => null),
        api.getRightsizingRecommendations().catch(() => null),
        api.getCostWaste().catch(() => null),
        api.getCostSavings().catch(() => null)
      ]);

      if (ovData?.overview) setOverview(ovData.overview);
      if (allocData?.allocation) setAllocation(allocData.allocation);
      if (recsData?.recommendations) setRecommendations(recsData.recommendations);
      if (wasteData?.wasteItems) setWasteItems(wasteData.wasteItems);
      if (savingsData?.savings) setSavings(savingsData.savings);
    } catch (err) {
      console.warn('[CostView] Failed to fetch cost intelligence:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleApplyRightsizing = async () => {
    if (!selectedRec) return;
    setApplyingRec(true);
    try {
      const res = await api.applyRightsizing(selectedRec.id);
      setApplySuccessMsg(res.message);
      // Update local recommendation status
      setRecommendations((prev) =>
        prev.map((r) => (r.id === selectedRec.id ? { ...r, status: 'APPLIED' } : r))
      );
      setTimeout(() => {
        setSelectedRec(null);
        setApplySuccessMsg(null);
      }, 2000);
    } catch (err: any) {
      alert(err?.message || 'Failed to apply rightsizing recommendation');
    } finally {
      setApplyingRec(false);
    }
  };

  const currentAllocationList: CostAllocationItem[] = allocation
    ? activeAllocTab === 'cluster'
      ? allocation.byCluster
      : activeAllocTab === 'namespace'
      ? allocation.byNamespace
      : activeAllocTab === 'workload'
      ? allocation.byWorkload
      : allocation.byTeam
    : [];

  const filteredAllocationList = currentAllocationList.filter((item) =>
    item.name.toLowerCase().includes(allocSearch.toLowerCase()) ||
    (item.clusterName && item.clusterName.toLowerCase().includes(allocSearch.toLowerCase())) ||
    (item.namespace && item.namespace.toLowerCase().includes(allocSearch.toLowerCase()))
  );

  if (loading && !overview) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-zinc-400 font-mono text-xs">
        <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
        <span>Aggregating Kubernetes Cloud Cost Telemetry...</span>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
                Kubernetes Cost Intelligence
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold">
                  LIVE RIGHTSIGHTING
                </span>
              </h1>
              <p className="text-xs font-mono text-zinc-400 mt-0.5">
                Identify Kubernetes resource waste, over-provisioned containers, rightsizing opportunities, and realized ROI
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />}
          >
            {refreshing ? 'Recalculating...' : 'Refresh Cost Model'}
          </Button>
        </div>
      </div>

      {/* Clear Estimates Disclaimer Banner */}
      <div className="flex items-start gap-3 p-3.5 rounded-lg bg-sky-950/30 border border-sky-500/20 text-xs text-sky-300">
        <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-sky-200">Standard Cloud Cost Estimates Disclaimer</p>
          <p className="text-zinc-400 text-[11px] leading-relaxed">
            {overview?.estimateDisclaimer ||
              'Cost calculations reflect live Kubernetes CPU and memory requests, node capacities, and Prometheus telemetry based on standard provider pricing ($0.040/vCPU-hr, $0.005/GiB-hr). Figures are estimated opportunities and are clearly distinguished from actual cloud provider invoices.'}
          </p>
        </div>
      </div>

      {/* SECTION 5: COST OVERVIEW */}
      <div className="space-y-3">
        <h2 className="text-xs font-mono font-bold tracking-wider text-zinc-400 uppercase flex items-center gap-2">
          <Coins className="w-3.5 h-3.5 text-sky-400" />
          Cost Overview
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Estimated Monthly Cost */}
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between">
            <span className="text-[11px] font-mono text-zinc-400">Estimated Monthly Cost</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-zinc-100">
                ${(overview?.estimatedMonthlyCostUsd ?? 0).toLocaleString()}
              </span>
              <span className="text-[11px] font-mono text-zinc-500">/mo</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-400">
              <Server className="w-3 h-3 text-sky-400" />
              <span>All registered clusters</span>
            </div>
          </div>

          {/* Potential Optimization */}
          <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex flex-col justify-between">
            <span className="text-[11px] font-mono text-emerald-300 font-semibold">Potential Optimization</span>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-emerald-400">
                ${(overview?.potentialMonthlySavingsUsd ?? 0).toLocaleString()}
              </span>
              <span className="text-[11px] font-mono text-emerald-500">/mo</span>
            </div>
            <div className="mt-3 flex items-center gap-1 text-[11px] text-emerald-300 font-mono">
              <TrendingDown className="w-3 h-3" />
              <span>Recoverable waste</span>
            </div>
          </div>

          {/* CPU Waste */}
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between">
            <span className="text-[11px] font-mono text-zinc-400">CPU Waste</span>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-amber-400">
                {overview?.cpuWastePercent ?? 0}%
              </span>
              <span className="text-[11px] font-mono text-zinc-500">unutilized</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-400">
              <Cpu className="w-3 h-3 text-amber-400" />
              <span>Requested vs live cores</span>
            </div>
          </div>

          {/* Memory Waste */}
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between">
            <span className="text-[11px] font-mono text-zinc-400">Memory Waste</span>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-amber-400">
                {overview?.memoryWastePercent ?? 0}%
              </span>
              <span className="text-[11px] font-mono text-zinc-500">unutilized</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-400">
              <HardDrive className="w-3 h-3 text-amber-400" />
              <span>Allocated vs resident GiB</span>
            </div>
          </div>

          {/* Idle Workloads */}
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between">
            <span className="text-[11px] font-mono text-zinc-400">Idle Workloads</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-red-400">
                {overview?.idleWorkloadsCount ?? 0}
              </span>
              <span className="text-[11px] font-mono text-zinc-500">under 5%</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-400">
              <AlertTriangle className="w-3 h-3 text-red-400" />
              <span>Candidate downscale</span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 10: COST SAVINGS TRACKING */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-mono font-bold tracking-wider text-zinc-400 uppercase flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            Cost Savings Tracking Lifecycle
          </h2>
          <span className="text-[11px] font-mono text-zinc-500">
            Strict verification lifecycle: Estimated → Projected → Implemented → Verified → Realized
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3.5 rounded-lg bg-zinc-900/40 border border-zinc-800/80">
            <span className="text-[10px] font-mono text-zinc-400 uppercase">Estimated Opportunity</span>
            <p className="text-lg font-bold font-mono text-zinc-200 mt-1">
              ${(savings?.estimatedOpportunityUsd ?? 0).toLocaleString()}/mo
            </p>
            <span className="text-[10px] text-zinc-500">Theoretical upper ceiling</span>
          </div>

          <div className="p-3.5 rounded-lg bg-zinc-900/40 border border-zinc-800/80">
            <span className="text-[10px] font-mono text-sky-400 uppercase">Projected</span>
            <p className="text-lg font-bold font-mono text-sky-300 mt-1">
              ${(savings?.projectedSavingsUsd ?? 0).toLocaleString()}/mo
            </p>
            <span className="text-[10px] text-zinc-500">Feasible without risk</span>
          </div>

          <div className="p-3.5 rounded-lg bg-zinc-900/40 border border-zinc-800/80">
            <span className="text-[10px] font-mono text-amber-400 uppercase">Implemented</span>
            <p className="text-lg font-bold font-mono text-amber-300 mt-1">
              ${(savings?.implementedSavingsUsd ?? 0).toLocaleString()}/mo
            </p>
            <span className="text-[10px] text-zinc-500">Applied in cluster</span>
          </div>

          <div className="p-3.5 rounded-lg bg-zinc-900/40 border border-zinc-800/80">
            <span className="text-[10px] font-mono text-indigo-400 uppercase">Verified</span>
            <p className="text-lg font-bold font-mono text-indigo-300 mt-1">
              ${(savings?.verifiedSavingsUsd ?? 0).toLocaleString()}/mo
            </p>
            <span className="text-[10px] text-zinc-500">Live metrics confirmed</span>
          </div>

          <div className="p-3.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30">
            <span className="text-[10px] font-mono text-emerald-300 uppercase font-semibold">Realized</span>
            <p className="text-lg font-bold font-mono text-emerald-400 mt-1">
              ${(savings?.realizedSavingsUsd ?? 0).toLocaleString()}/mo
            </p>
            <span className="text-[10px] text-emerald-400/80">Audited cloud savings</span>
          </div>
        </div>
      </div>

      {/* SECTION 7, 8, 9: RESOURCE RIGHTSIZING & RECOMMENDATIONS */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-mono font-bold tracking-wider text-zinc-400 uppercase flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-sky-400" />
              Resource Optimization & Rightsizing Recommendations
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Workloads where requested resources significantly exceed actual telemetry usage. All actions go through the existing safety engine.
            </p>
          </div>
          <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-zinc-800/80 text-zinc-300 border border-zinc-700/60">
            {recommendations.length} Active Recommendations
          </span>
        </div>

        {recommendations.length === 0 ? (
          <div className="p-8 rounded-xl bg-zinc-900/40 border border-zinc-800 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <p className="text-sm font-semibold text-zinc-200">No Over-Provisioned Workloads Detected</p>
            <p className="text-xs text-zinc-400 max-w-lg mx-auto">
              All active workloads are currently sized within safe resource margins, or awaiting live telemetry from connected cluster nodes.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className={`p-5 rounded-xl border flex flex-col justify-between transition-all ${
                  rec.status === 'APPLIED'
                    ? 'bg-emerald-950/20 border-emerald-500/30'
                    : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-zinc-100 font-mono">{rec.workloadName}</h3>
                      <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                        {rec.clusterName} • ns/{rec.namespace}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold uppercase ${
                        rec.risk === 'LOW'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {rec.risk} Risk
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="p-2.5 rounded bg-zinc-950/60 border border-zinc-800">
                      <span className="text-[10px] text-zinc-500 uppercase">CPU Requested</span>
                      <p className="text-zinc-200 font-semibold mt-0.5">{rec.currentCpuRequested}</p>
                      <span className="text-[10px] text-zinc-400 mt-1 block">Avg Used: {rec.averageCpuUsed}</span>
                    </div>

                    <div className="p-2.5 rounded bg-zinc-950/60 border border-zinc-800">
                      <span className="text-[10px] text-zinc-500 uppercase">Memory Requested</span>
                      <p className="text-zinc-200 font-semibold mt-0.5">{rec.currentMemoryRequested}</p>
                      <span className="text-[10px] text-zinc-400 mt-1 block">Avg Used: {rec.averageMemoryUsed}</span>
                    </div>
                  </div>

                  {/* Proposed State */}
                  <div className="mt-3 p-2.5 rounded-lg bg-sky-950/20 border border-sky-500/20 text-xs">
                    <span className="text-[10px] font-mono text-sky-400 uppercase font-semibold">
                      Potential Optimization
                    </span>
                    <div className="mt-1 flex items-center justify-between text-zinc-200 font-mono">
                      <span>
                        CPU: <span className="text-zinc-400">{rec.currentCpuRequested}</span> →{' '}
                        <span className="text-sky-300 font-semibold">{rec.recommendedCpu}</span>
                      </span>
                      <span>
                        Mem: <span className="text-zinc-400">{rec.currentMemoryRequested}</span> →{' '}
                        <span className="text-sky-300 font-semibold">{rec.recommendedMemory}</span>
                      </span>
                    </div>
                  </div>

                  <p className="mt-3 text-[11px] text-zinc-400 leading-relaxed line-clamp-2">{rec.reason}</p>
                </div>

                <div className="mt-5 pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono text-zinc-500">Estimated Saving</span>
                    <p className="text-sm font-bold font-mono text-emerald-400">
                      ${rec.estimatedMonthlySavingsUsd}/month
                    </p>
                  </div>

                  {rec.status === 'APPLIED' ? (
                    <span className="flex items-center gap-1.5 text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Applied
                    </span>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={isViewer}
                      onClick={() => setSelectedRec(rec)}
                    >
                      Review Recommendation
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 8: COST WASTE DETECTION */}
      <div className="space-y-3">
        <h2 className="text-xs font-mono font-bold tracking-wider text-zinc-400 uppercase flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          Cost Waste Detection
        </h2>

        {wasteItems.length === 0 ? (
          <div className="p-8 rounded-xl bg-zinc-900/40 border border-zinc-800 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <p className="text-sm font-semibold text-zinc-200">Zero Resource Waste Detected</p>
            <p className="text-xs text-zinc-400 max-w-lg mx-auto">
              No unutilized worker nodes, idle workloads, or off-hours compute waste detected across registered clusters.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {wasteItems.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 flex items-start justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold font-mono text-zinc-200">{item.title}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {item.clusterName}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">{item.description}</p>
                  <div className="flex items-center gap-2 pt-1 text-[11px] text-zinc-400">
                    <span className="text-sky-300 font-mono">Action:</span>
                    <span>{item.recommendedAction}</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[10px] font-mono text-zinc-500">Monthly Waste</span>
                  <p className="text-sm font-bold font-mono text-amber-400">
                    ${item.potentialMonthlyWasteUsd}
                  </p>
                  <span className="inline-block mt-2 text-[10px] font-mono text-zinc-400 px-2 py-0.5 rounded bg-zinc-800">
                    Review
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 6: COST ALLOCATION */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-mono font-bold tracking-wider text-zinc-400 uppercase flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              Cost Allocation Breakdown
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Granular cost visibility by cluster, namespace, workload, service, environment, and team
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={allocSearch}
                onChange={(e) => setAllocSearch(e.target.value)}
                placeholder="Filter allocation..."
                className="pl-8 pr-3 py-1 text-xs bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-sky-500 font-mono w-44"
              />
            </div>

            <div className="flex rounded-lg bg-zinc-900 p-0.5 border border-zinc-800">
              {(['namespace', 'workload', 'cluster', 'team'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveAllocTab(tab)}
                  className={`px-3 py-1 text-xs font-mono rounded-md capitalize transition-all ${
                    activeAllocTab === tab
                      ? 'bg-zinc-800 text-sky-300 shadow font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Allocation Table */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400">
              <tr>
                <th className="p-3 font-medium uppercase text-[10px]">Resource / Group</th>
                <th className="p-3 font-medium uppercase text-[10px]">CPU Requested / Used</th>
                <th className="p-3 font-medium uppercase text-[10px]">Memory Requested / Used</th>
                <th className="p-3 font-medium uppercase text-[10px]">Waste %</th>
                <th className="p-3 font-medium uppercase text-[10px]">Monthly Cost</th>
                <th className="p-3 font-medium uppercase text-[10px]">Potential Savings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredAllocationList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-zinc-500 font-mono text-xs">
                    No resource allocation data available for this category.
                  </td>
                </tr>
              ) : (
                filteredAllocationList.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-zinc-100">{item.name}</span>
                        {item.namespace && (
                          <span className="text-[10px] text-zinc-500">ns/{item.namespace}</span>
                        )}
                        {item.clusterName && (
                          <span className="text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                            {item.clusterName}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-zinc-300">
                      {item.cpuRequestedCores}c <span className="text-zinc-500">/ {item.cpuUsedCores}c</span>
                    </td>
                    <td className="p-3 text-zinc-300">
                      {item.memoryRequestedGib}Gi <span className="text-zinc-500">/ {item.memoryUsedGib}Gi</span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          item.wastePercent > 35
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-emerald-500/10 text-emerald-400'
                        }`}
                      >
                        {item.wastePercent}%
                      </span>
                    </td>
                    <td className="p-3 font-bold text-zinc-100">
                      ${item.monthlyCostUsd?.toLocaleString()}/month
                    </td>
                    <td className="p-3 text-emerald-400 font-semibold">
                      ${item.potentialSavingsUsd?.toLocaleString()}/month
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review & Apply Recommendation Modal */}
      {selectedRec && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedRec(null)}
          title={`Review Rightsizing: ${selectedRec.workloadName}`}
          maxWidth="max-w-xl"
        >
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-1 text-xs font-mono">
              <div className="flex justify-between text-zinc-400">
                <span>Cluster:</span>
                <span className="text-zinc-200">{selectedRec.clusterName}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Namespace:</span>
                <span className="text-zinc-200">{selectedRec.namespace}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Risk Level:</span>
                <span className="text-emerald-400 font-semibold">{selectedRec.risk} RISK</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Confidence Score:</span>
                <span className="text-sky-400 font-semibold">{selectedRec.confidencePercent}%</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono space-y-3">
              <span className="text-[10px] uppercase font-bold text-sky-400 tracking-wider">
                Specification Transformation
              </span>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase">Current Allocated</span>
                  <p className="text-zinc-300 font-semibold mt-1">CPU: {selectedRec.currentCpuRequested}</p>
                  <p className="text-zinc-300 font-semibold">Mem: {selectedRec.currentMemoryRequested}</p>
                  <span className="text-[10px] text-zinc-500 mt-1 block">
                    Actual p95: {selectedRec.averageCpuUsed}, {selectedRec.averageMemoryUsed}
                  </span>
                </div>

                <div className="p-2.5 rounded bg-emerald-950/20 border border-emerald-500/30">
                  <span className="text-[10px] text-emerald-400 uppercase font-semibold">Recommended Target</span>
                  <p className="text-emerald-300 font-bold mt-1">CPU: {selectedRec.recommendedCpu}</p>
                  <p className="text-emerald-300 font-bold">Mem: {selectedRec.recommendedMemory}</p>
                  <span className="text-[10px] text-emerald-400/80 mt-1 block">+50% Burst Headroom</span>
                </div>
              </div>

              <p className="text-[11px] text-zinc-400 leading-relaxed">{selectedRec.reason}</p>
            </div>

            <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/20 flex items-center justify-between text-xs font-mono">
              <span className="text-emerald-300">Estimated Monthly Savings:</span>
              <span className="text-base font-bold text-emerald-400">
                ${selectedRec.estimatedMonthlySavingsUsd}/month
              </span>
            </div>

            {applySuccessMsg && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 font-mono">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>{applySuccessMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
              <Button variant="outline" size="sm" onClick={() => setSelectedRec(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={applyingRec || !canApplyCostOptimization}
                onClick={handleApplyRightsizing}
                icon={applyingRec ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              >
                {applyingRec ? 'Applying Safety Guardrails...' : 'Review & Apply'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
