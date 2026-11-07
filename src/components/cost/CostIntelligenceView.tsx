/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SkyOps Kubernetes Cost Intelligence & FinOps Engine View
 * Production-grade cost allocation, 5-question executive summary, evidence-based rightsizing,
 * budget management & forecasting, and strict savings lifecycle tracking.
 */

import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Cpu,
  DollarSign,
  ExternalLink,
  HardDrive,
  HelpCircle,
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
  Sliders,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  X
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  CostAllocationBreakdown,
  CostAllocationItem,
  CostBudget,
  CostOverview,
  CostSavingsTracking,
  CostWasteItem,
  ResourceRightsizingRecommendation
} from '../../types/enterprise';
import { Cluster } from '../../types/index';
import { Button, Modal } from '../common/UI';

interface CostIntelligenceViewProps {
  clusters?: Cluster[];
  onOpenAddCluster?: () => void;
}

export const CostIntelligenceView: React.FC<CostIntelligenceViewProps> = ({
  clusters = [],
  onOpenAddCluster
}) => {
  const { canApplyCostOptimization, isViewer, user } = useAuth();
  const [overview, setOverview] = useState<CostOverview | null>(null);
  const [allocation, setAllocation] = useState<CostAllocationBreakdown | null>(null);
  const [recommendations, setRecommendations] = useState<ResourceRightsizingRecommendation[]>([]);
  const [wasteItems, setWasteItems] = useState<CostWasteItem[]>([]);
  const [savings, setSavings] = useState<CostSavingsTracking | null>(null);
  const [budget, setBudget] = useState<CostBudget | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Active filter by cluster
  const [selectedClusterFilter, setSelectedClusterFilter] = useState<string>('ALL');

  // Allocation active tab
  const [activeAllocTab, setActiveAllocTab] = useState<'workload' | 'namespace' | 'cluster' | 'team'>('workload');
  const [allocSearch, setAllocSearch] = useState('');

  // Rightsizing modal state
  const [selectedRec, setSelectedRec] = useState<ResourceRightsizingRecommendation | null>(null);
  const [applyingRec, setApplyingRec] = useState(false);
  const [approvingRec, setApprovingRec] = useState(false);
  const [applySuccessMsg, setApplySuccessMsg] = useState<string | null>(null);

  // Workload Detail Inspection Modal
  const [inspectedWorkload, setInspectedWorkload] = useState<CostAllocationItem | null>(null);

  // Budget Configuration Modal
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [budgetInput, setBudgetInput] = useState<string>('');
  const [thresholdInput, setThresholdInput] = useState<string>('70, 85, 100');
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetSaveError, setBudgetSaveError] = useState<string | null>(null);

  const fetchData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    const clusterParam = selectedClusterFilter !== 'ALL' ? selectedClusterFilter : undefined;
    try {
      const [ovData, allocData, recsData, wasteData, savingsData, budgetData] = await Promise.all([
        api.getCostOverview(clusterParam).catch(() => null),
        api.getCostAllocation(clusterParam).catch(() => null),
        api.getRightsizingRecommendations(clusterParam).catch(() => null),
        api.getCostWaste(clusterParam).catch(() => null),
        api.getCostSavings(clusterParam).catch(() => null),
        api.getCostBudget(clusterParam).catch(() => null)
      ]);

      if (ovData?.overview) setOverview(ovData.overview);
      if (allocData?.allocation) setAllocation(allocData.allocation);
      if (recsData?.recommendations) setRecommendations(recsData.recommendations);
      if (wasteData?.wasteItems) setWasteItems(wasteData.wasteItems);
      if (savingsData?.savings) setSavings(savingsData.savings);
      if (budgetData?.budget !== undefined) {
        setBudget(budgetData.budget);
        if (budgetData.budget) {
          setBudgetInput(budgetData.budget.monthlyBudgetUsd.toString());
          if (budgetData.budget.alertThresholds) {
            setThresholdInput(budgetData.budget.alertThresholds.join(', '));
          }
        }
      }
    } catch (err) {
      console.warn('[CostView] Failed to fetch cost intelligence:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedClusterFilter]);

  const handleApplyRightsizing = async () => {
    if (!selectedRec) return;
    setApplyingRec(true);
    try {
      const res = await api.applyRightsizing(selectedRec.id);
      setApplySuccessMsg(res.message);
      setRecommendations((prev) =>
        prev.map((r) =>
          r.id === selectedRec.id
            ? { ...r, status: 'APPLIED', lifecycleStage: 'IMPLEMENTED', appliedAt: Date.now() }
            : r
        )
      );
      fetchData(false);
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

  const handleApproveRightsizing = async (rec: ResourceRightsizingRecommendation) => {
    setApprovingRec(true);
    try {
      await api.approveRightsizing(rec.id);
      setRecommendations((prev) =>
        prev.map((r) =>
          r.id === rec.id
            ? { ...r, status: 'APPROVED', lifecycleStage: 'APPROVED', approvedAt: Date.now() }
            : r
        )
      );
      if (selectedRec?.id === rec.id) {
        setSelectedRec((prev) =>
          prev ? { ...prev, status: 'APPROVED', lifecycleStage: 'APPROVED', approvedAt: Date.now() } : null
        );
      }
      fetchData(false);
    } catch (err: any) {
      alert(err?.message || 'Failed to approve recommendation');
    } finally {
      setApprovingRec(false);
    }
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBudget(true);
    setBudgetSaveError(null);
    try {
      const amount = parseFloat(budgetInput);
      if (isNaN(amount) || amount < 0) {
        throw new Error('Please enter a valid non-negative monthly budget number.');
      }
      const thresholds = thresholdInput
        .split(',')
        .map((t) => parseFloat(t.trim()))
        .filter((t) => !isNaN(t) && t > 0 && t <= 200);

      const clusterParam = selectedClusterFilter !== 'ALL' ? selectedClusterFilter : undefined;
      const res = await api.saveCostBudget({
        monthlyBudgetUsd: amount,
        alertThresholds: thresholds.length > 0 ? thresholds : [70, 85, 100],
        clusterId: clusterParam
      });

      setBudget(res.budget);
      setIsBudgetModalOpen(false);
      fetchData(false);
    } catch (err: any) {
      setBudgetSaveError(err?.message || 'Failed to save budget');
    } finally {
      setSavingBudget(false);
    }
  };

  // Top 5 cost consuming workloads
  const topCostWorkloads = useMemo(() => {
    if (!allocation?.byWorkload) return [];
    return allocation.byWorkload.slice(0, 5);
  }, [allocation]);

  // Filter recommendations by cluster if chosen
  const filteredRecommendations = useMemo(() => {
    if (selectedClusterFilter === 'ALL') return recommendations;
    return recommendations.filter(
      (r) => r.clusterId === selectedClusterFilter || r.clusterName === selectedClusterFilter
    );
  }, [recommendations, selectedClusterFilter]);

  // Filter waste by cluster
  const filteredWasteItems = useMemo(() => {
    if (selectedClusterFilter === 'ALL') return wasteItems;
    return wasteItems.filter(
      (w) => w.clusterId === selectedClusterFilter || w.clusterName === selectedClusterFilter
    );
  }, [wasteItems, selectedClusterFilter]);

  const currentAllocationList: CostAllocationItem[] = allocation
    ? activeAllocTab === 'cluster'
      ? allocation.byCluster
      : activeAllocTab === 'namespace'
      ? allocation.byNamespace
      : activeAllocTab === 'workload'
      ? allocation.byWorkload
      : allocation.byTeam
    : [];

  const filteredAllocationList = currentAllocationList.filter((item) => {
    if (selectedClusterFilter !== 'ALL' && item.clusterName && item.clusterName !== selectedClusterFilter) {
      return false;
    }
    const q = allocSearch.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      (item.clusterName && item.clusterName.toLowerCase().includes(q)) ||
      (item.namespace && item.namespace.toLowerCase().includes(q))
    );
  });

  if (loading && !overview) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-zinc-400 font-mono text-xs">
        <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
        <span>Aggregating Kubernetes Telemetry & Pricing Provenance...</span>
      </div>
    );
  }

  // 0-Clusters clean empty state (strictly non-fabricated)
  if (clusters.length === 0 && (!overview || overview.estimatedMonthlyCostUsd === 0) && recommendations.length === 0) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-100 font-mono">
                Kubernetes Cost Intelligence & FinOps
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Live compute telemetry vs requested allocations to eliminate cloud over-spend.
              </p>
            </div>
          </div>
        </div>

        <div className="p-16 text-center rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-sky-950/60 border border-sky-800/80 flex items-center justify-center text-sky-400 mx-auto">
            <Coins className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="font-mono text-base font-bold text-zinc-100">
              No Kubernetes Clusters Connected
            </h3>
            <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
              Connect a cluster to view actual monthly compute run-rates, CPU/memory waste ratios, and 1-click safe rightsizing recommendations grounded strictly in live telemetry.
            </p>
          </div>
          {onOpenAddCluster && (
            <Button
              variant="primary"
              size="sm"
              onClick={onOpenAddCluster}
              icon={<Plus className="w-3.5 h-3.5" />}
              className="font-mono text-xs px-5 bg-sky-600 hover:bg-sky-500 text-white"
            >
              Connect Cluster
            </Button>
          )}
        </div>
      </div>
    );
  }

  const pBasis = overview?.pricingBasis;

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
                Cost Intelligence & FinOps
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold">
                  EVIDENCE-BASED
                </span>
                {overview?.hasStaleOrMissingMetrics && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    PARTIAL TELEMETRY ({overview.dataCoveragePercent}%)
                  </span>
                )}
              </h1>
              <p className="text-xs font-mono text-zinc-400 mt-0.5">
                Audit Kubernetes compute allocations, eliminate resource waste, manage budgets, and track verified ROI
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {clusters.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1">
              <Server className="w-3.5 h-3.5 text-zinc-500" />
              <select
                value={selectedClusterFilter}
                onChange={(e) => setSelectedClusterFilter(e.target.value)}
                className="bg-transparent text-zinc-200 focus:outline-none text-xs font-mono cursor-pointer pr-1"
              >
                <option value="ALL" className="bg-zinc-900">All Clusters ({clusters.length})</option>
                {clusters.map((c) => (
                  <option key={c.id} value={c.id} className="bg-zinc-900">
                    {c.displayName || c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsBudgetModalOpen(true)}
            icon={<Target className="w-3.5 h-3.5 text-sky-400" />}
          >
            {budget ? 'Edit Budget' : 'Set Budget'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />}
          >
            {refreshing ? 'Auditing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* SECTION 1: EXECUTIVE 5-QUESTION SUMMARY */}
      {overview?.fiveKeyQuestions && (
        <div className="rounded-2xl bg-gradient-to-br from-zinc-900/90 via-zinc-900/50 to-zinc-950/90 border border-zinc-800 p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-400" />
              <h2 className="text-sm font-bold text-zinc-100 font-mono uppercase tracking-wider">
                Executive FinOps Briefing — At A Glance
              </h2>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-400">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-zinc-500" />
                Updated: {new Date(overview.calculatedAt).toLocaleTimeString()}
              </span>
              <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/60">
                Provenance: {pBasis?.source || 'ESTIMATED_BASELINE'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* Q1 */}
            <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
              <span className="text-[10px] uppercase font-mono text-sky-400 font-semibold block">
                1. Monthly Cost Run-Rate
              </span>
              <p className="text-xs text-zinc-200 leading-snug">
                {overview.fiveKeyQuestions.currentCostSummary}
              </p>
            </div>

            {/* Q2 */}
            <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
              <span className="text-[10px] uppercase font-mono text-indigo-400 font-semibold block">
                2. Forecasted Month-End
              </span>
              <p className="text-xs text-zinc-200 leading-snug">
                {overview.fiveKeyQuestions.monthEndForecastSummary}
              </p>
            </div>

            {/* Q3 */}
            <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
              <span className="text-[10px] uppercase font-mono text-emerald-400 font-semibold block">
                3. Budget Tracking
              </span>
              <p className="text-xs text-zinc-200 leading-snug">
                {overview.fiveKeyQuestions.budgetTrackSummary}
              </p>
            </div>

            {/* Q4 */}
            <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
              <span className="text-[10px] uppercase font-mono text-amber-400 font-semibold block">
                4. Waste Identified
              </span>
              <p className="text-xs text-zinc-200 leading-snug">
                {overview.fiveKeyQuestions.wasteSummary}
              </p>
            </div>

            {/* Q5 */}
            <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
              <span className="text-[10px] uppercase font-mono text-emerald-300 font-semibold block">
                5. Next Recommended Step
              </span>
              <p className="text-xs text-zinc-200 leading-snug font-medium">
                {overview.fiveKeyQuestions.recommendedNextAction}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: METRIC CARDS (6 Key Metrics) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-mono font-bold tracking-wider text-zinc-400 uppercase flex items-center gap-2">
            <Coins className="w-3.5 h-3.5 text-sky-400" />
            Financial Run-Rate & Reliability Metrics
          </h2>
          <span className="text-[11px] font-mono text-zinc-500">
            Currency: {overview?.currency || 'USD'} • Unit compute rates: ${overview?.pricingBasis.cpuCoreHourUsd}/vCPU-hr, ${overview?.pricingBasis.memoryGibHourUsd}/GiB-hr
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          {/* 1. Estimated Monthly Cost */}
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-zinc-400">Estimated Monthly Cost</span>
              <div title="Full 730-hour monthly compute allocation derived from container resource requests and limits." className="cursor-help">
                <HelpCircle className="w-3 h-3 text-zinc-600" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-zinc-100">
                ${(overview?.estimatedMonthlyCostUsd ?? 0).toLocaleString()}
              </span>
              <span className="text-[11px] font-mono text-zinc-500">/mo</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-400">
              <Server className="w-3 h-3 text-sky-400" />
              <span>Current run-rate</span>
            </div>
          </div>

          {/* 2. Actual Spend So Far (Month-to-Date) */}
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-zinc-400">Actual Spend So Far</span>
              <div title="Prorated spend calculated from elapsed days in current billing cycle." className="cursor-help">
                <HelpCircle className="w-3 h-3 text-zinc-600" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-zinc-200">
                ${(overview?.monthToDateSpendUsd ?? 0).toLocaleString()}
              </span>
              <span className="text-[11px] font-mono text-zinc-500">MTD</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-400">
              <Calendar className="w-3 h-3 text-indigo-400" />
              <span>Day {new Date().getDate()} of billing month</span>
            </div>
          </div>

          {/* 3. Expected Month-End Spend */}
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-zinc-400">Expected Month-End</span>
              <div title="Projection grounded in current workload allocation and active node counts." className="cursor-help">
                <HelpCircle className="w-3 h-3 text-zinc-600" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-zinc-100">
                ${(overview?.forecastedMonthEndCostUsd ?? 0).toLocaleString()}
              </span>
              <span className="text-[11px] font-mono text-zinc-500">forecast</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-400">
              <TrendingUp className="w-3 h-3 text-sky-400" />
              <span>Projected total</span>
            </div>
          </div>

          {/* 4. Budget & Variance */}
          <div className={`p-4 rounded-xl border flex flex-col justify-between ${
            overview?.budget?.status === 'EXCEEDED'
              ? 'bg-red-950/20 border-red-500/30'
              : overview?.budget?.status === 'WARNING'
              ? 'bg-amber-950/20 border-amber-500/30'
              : 'bg-zinc-900/60 border-zinc-800'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-zinc-400">Configured Budget</span>
              <button
                onClick={() => setIsBudgetModalOpen(true)}
                className="text-[10px] text-sky-400 hover:underline font-mono"
              >
                {overview?.budget ? 'Edit' : 'Set'}
              </button>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-zinc-100">
                {overview?.budget ? `$${overview.budget.monthlyBudgetUsd.toLocaleString()}` : 'None'}
              </span>
            </div>
            <div className="mt-3 text-[11px] font-mono">
              {overview?.budget ? (
                <span className={overview.budget.status === 'EXCEEDED' ? 'text-red-400 font-semibold' : overview.budget.status === 'WARNING' ? 'text-amber-400 font-semibold' : 'text-emerald-400'}>
                  {overview.budget.utilizationPercent}% used (${overview.budget.budgetRemainingUsd >= 0 ? `${overview.budget.budgetRemainingUsd} left` : `${Math.abs(overview.budget.projectedVarianceUsd)} over`})
                </span>
              ) : (
                <span className="text-zinc-500">Click to configure</span>
              )}
            </div>
          </div>

          {/* 5. Potential Monthly Savings */}
          <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-emerald-300 font-semibold">Potential Savings</span>
              <div title="Sum of verified over-provisioned container reductions with 50% burst headroom preserved." className="cursor-help">
                <HelpCircle className="w-3 h-3 text-emerald-500" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-emerald-400">
                ${(overview?.potentialMonthlySavingsUsd ?? 0).toLocaleString()}
              </span>
              <span className="text-[11px] font-mono text-emerald-500">/mo</span>
            </div>
            <div className="mt-3 flex items-center gap-1 text-[11px] text-emerald-300 font-mono">
              <TrendingDown className="w-3 h-3" />
              <span>{recommendations.length} opportunities</span>
            </div>
          </div>

          {/* 6. Telemetry Coverage & Freshness */}
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-zinc-400">Telemetry Coverage</span>
              <div title="Percentage of active workloads reporting live CPU/memory metrics through Kubernetes metrics-server or Prometheus." className="cursor-help">
                <HelpCircle className="w-3 h-3 text-zinc-600" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-sky-400">
                {overview?.dataCoveragePercent ?? 100}%
              </span>
              <span className="text-[11px] font-mono text-zinc-500">reporting</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-400">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>{overview?.activeWorkloadCount ?? 0} of {overview?.totalWorkloadCount ?? 0} workloads</span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: TOP 5 SPENDING WORKLOADS & PROVENANCE INFO */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top 5 Spenders */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono font-bold tracking-wider text-zinc-400 uppercase flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              Top Cost-Consuming Workloads
            </h2>
            <span className="text-[11px] font-mono text-zinc-500">
              Click any workload to inspect detailed allocation
            </span>
          </div>

          {topCostWorkloads.length === 0 ? (
            <div className="p-6 rounded-xl bg-zinc-900/40 border border-zinc-800 text-center text-zinc-400 text-xs font-mono">
              No workload cost items detected.
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800/60 overflow-hidden">
              {topCostWorkloads.map((item, idx) => (
                <div
                  key={item.id}
                  onClick={() => setInspectedWorkload(item)}
                  className="p-3.5 flex items-center justify-between hover:bg-zinc-800/40 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-400 font-mono text-[11px] flex items-center justify-center font-bold">
                      {idx + 1}
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-zinc-100 font-mono">{item.name}</h4>
                      <p className="text-[10px] text-zinc-400 font-mono">
                        {item.clusterName} • ns/{item.namespace}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-xs font-mono">
                    <div className="text-right">
                      <span className="text-[10px] text-zinc-500 block uppercase">Requested / Used</span>
                      <span className="text-zinc-200">{item.cpuRequestedCores}c, {item.memoryRequestedGib}Gi</span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-zinc-500 block uppercase">Waste %</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${item.wastePercent >= 50 ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                        {item.wastePercent}%
                      </span>
                    </div>

                    <div className="text-right min-w-[90px]">
                      <span className="text-[10px] text-zinc-500 block uppercase">Estimated Run-Rate</span>
                      <span className="text-zinc-100 font-bold">${item.monthlyCostUsd}/mo</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pricing Provenance & Methodology */}
        <div className="space-y-3">
          <h2 className="text-xs font-mono font-bold tracking-wider text-zinc-400 uppercase flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-sky-400" />
            Pricing Provenance & Accuracy
          </h2>

          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3 text-xs font-mono">
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block">Pricing Provenance Source</span>
              <span className="text-sky-400 font-bold text-sm mt-0.5 block">
                {pBasis?.source === 'VERIFIED_PROVIDER_RATES'
                  ? 'Verified Provider Rates'
                  : pBasis?.source === 'CLOUD_BILLING_EXPORT'
                  ? 'Cloud Provider Billing Export'
                  : pBasis?.isPricingAvailable
                  ? 'Standard Blended Compute Baseline'
                  : 'Pricing Data Unavailable'}
              </span>
            </div>

            <div className="space-y-1 pt-2 border-t border-zinc-800 text-[11px] text-zinc-400">
              <div className="flex justify-between">
                <span>Provider / Pool:</span>
                <span className="text-zinc-200">{pBasis?.providerName || 'Standard Kubernetes'}</span>
              </div>
              <div className="flex justify-between">
                <span>Region / Zone:</span>
                <span className="text-zinc-200">{pBasis?.region || 'Global'}</span>
              </div>
              <div className="flex justify-between">
                <span>vCPU Pricing Basis:</span>
                <span className="text-zinc-200">${pBasis?.cpuCoreHourUsd ?? 0.04}/core-hr (~$29.20/mo)</span>
              </div>
              <div className="flex justify-between">
                <span>Memory Pricing Basis:</span>
                <span className="text-zinc-200">${pBasis?.memoryGibHourUsd ?? 0.005}/GiB-hr (~$3.65/mo)</span>
              </div>
            </div>

            <div className="p-2.5 rounded bg-zinc-950/80 border border-zinc-800 text-[10px] text-zinc-400 leading-relaxed">
              <span className="text-sky-300 font-semibold block mb-0.5">Methodology:</span>
              {pBasis?.methodology || 'Computed strictly from live container specifications and active Prometheus/metrics.k8s.io usage.'}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 4: SAVINGS TRACKING LIFECYCLE */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-mono font-bold tracking-wider text-zinc-400 uppercase flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            Savings Verification Lifecycle
          </h2>
          <span className="text-[11px] font-mono text-zinc-500">
            Lifecycle: Potential → Approved → Implemented → Verified → Realized
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {/* Potential */}
          <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-zinc-400 uppercase">1. Potential</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                {savings?.lifecycleCounts?.potential ?? 0} recs
              </span>
            </div>
            <p className="text-lg font-bold font-mono text-zinc-200 mt-1">
              ${(savings?.pendingReviewSavingsUsd ?? 0).toLocaleString()}/mo
            </p>
            <span className="text-[10px] text-zinc-500">Engine identified opportunities</span>
          </div>

          {/* Approved */}
          <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-sky-400 uppercase">2. Approved</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-950 text-sky-300">
                {savings?.lifecycleCounts?.approved ?? 0} recs
              </span>
            </div>
            <p className="text-lg font-bold font-mono text-sky-300 mt-1">
              ${(savings?.approvedSavingsUsd ?? 0).toLocaleString()}/mo
            </p>
            <span className="text-[10px] text-zinc-500">Team approved, pending rollout</span>
          </div>

          {/* Implemented */}
          <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-amber-400 uppercase">3. Implemented</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-300">
                {savings?.lifecycleCounts?.implemented ?? 0} recs
              </span>
            </div>
            <p className="text-lg font-bold font-mono text-amber-300 mt-1">
              ${(savings?.implementedSavingsUsd ?? 0).toLocaleString()}/mo
            </p>
            <span className="text-[10px] text-zinc-500">Rolling update deployed</span>
          </div>

          {/* Verified */}
          <div className="p-3.5 rounded-xl bg-indigo-950/20 border border-indigo-500/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-indigo-300 uppercase font-semibold">4. Verified</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300">
                {savings?.lifecycleCounts?.verified ?? 0} recs
              </span>
            </div>
            <p className="text-lg font-bold font-mono text-indigo-300 mt-1">
              ${(savings?.verifiedSavingsUsd ?? 0).toLocaleString()}/mo
            </p>
            <span className="text-[10px] text-indigo-400/80">Fresh telemetry confirms stability</span>
          </div>

          {/* Realized */}
          <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-emerald-300 uppercase font-semibold">5. Realized</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300">
                {savings?.lifecycleCounts?.realized ?? 0} recs
              </span>
            </div>
            <p className="text-lg font-bold font-mono text-emerald-400 mt-1">
              ${(savings?.realizedSavingsUsd ?? 0).toLocaleString()}/mo
            </p>
            <span className="text-[10px] text-emerald-400/80">Sustained telemetry confirmed</span>
          </div>
        </div>
      </div>

      {/* SECTION 5: RESOURCE RIGHTSIZING RECOMMENDATIONS */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-mono font-bold tracking-wider text-zinc-400 uppercase flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-sky-400" />
              Evidence-Based Rightsizing Opportunities
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Workloads where requested resources significantly exceed actual telemetry usage. All actions preserve SkyOps safety guardrails.
            </p>
          </div>
          <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-zinc-800/80 text-zinc-300 border border-zinc-700/60">
            {filteredRecommendations.length} Opportunities Identified
          </span>
        </div>

        {filteredRecommendations.length === 0 ? (
          <div className="p-8 rounded-xl bg-zinc-900/40 border border-zinc-800 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <p className="text-sm font-semibold text-zinc-200">No Over-Provisioned Workloads Detected</p>
            <p className="text-xs text-zinc-400 max-w-lg mx-auto">
              All active workloads are currently sized within safe resource margins, or awaiting live telemetry from connected cluster nodes.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRecommendations.map((rec) => (
              <div
                key={rec.id}
                className={`p-5 rounded-xl border flex flex-col justify-between transition-all ${
                  rec.status === 'APPLIED'
                    ? 'bg-emerald-950/20 border-emerald-500/30'
                    : rec.status === 'APPROVED'
                    ? 'bg-sky-950/20 border-sky-500/30'
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
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold uppercase ${
                          rec.risk === 'LOW'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : rec.risk === 'HIGH'
                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}
                      >
                        {rec.risk} Risk
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                        {rec.confidencePercent}% Conf
                      </span>
                    </div>
                  </div>

                  {/* Evidence Cards */}
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="p-2.5 rounded bg-zinc-950/60 border border-zinc-800">
                      <span className="text-[10px] text-zinc-500 uppercase">CPU Requested</span>
                      <p className="text-zinc-200 font-semibold mt-0.5">{rec.currentCpuRequested}</p>
                      <span className="text-[10px] text-zinc-400 mt-1 block">Peak: {rec.averageCpuUsed}</span>
                    </div>

                    <div className="p-2.5 rounded bg-zinc-950/60 border border-zinc-800">
                      <span className="text-[10px] text-zinc-500 uppercase">Memory Requested</span>
                      <p className="text-zinc-200 font-semibold mt-0.5">{rec.currentMemoryRequested}</p>
                      <span className="text-[10px] text-zinc-400 mt-1 block">Peak: {rec.averageMemoryUsed}</span>
                    </div>
                  </div>

                  {/* Proposed State */}
                  <div className="mt-3 p-2.5 rounded-lg bg-sky-950/20 border border-sky-500/20 text-xs">
                    <span className="text-[10px] font-mono text-sky-400 uppercase font-semibold">
                      Target Recommendation (with +50% burst buffer)
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

                  <div className="flex items-center gap-2">
                    {rec.status === 'APPLIED' ? (
                      <span className="flex items-center gap-1.5 text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Applied
                      </span>
                    ) : rec.status === 'APPROVED' ? (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={isViewer || !canApplyCostOptimization}
                        onClick={() => setSelectedRec(rec)}
                      >
                        Apply Now
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isViewer || approvingRec}
                          onClick={() => handleApproveRightsizing(rec)}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={isViewer}
                          onClick={() => setSelectedRec(rec)}
                        >
                          Review
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 6: COST WASTE DETECTION */}
      <div className="space-y-3">
        <h2 className="text-xs font-mono font-bold tracking-wider text-zinc-400 uppercase flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          Cost Waste Detection & Underutilized Nodes
        </h2>

        {filteredWasteItems.length === 0 ? (
          <div className="p-8 rounded-xl bg-zinc-900/40 border border-zinc-800 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <p className="text-sm font-semibold text-zinc-200">Zero Unutilized Waste Detected</p>
            <p className="text-xs text-zinc-400 max-w-lg mx-auto">
              No unutilized worker nodes, idle workloads, or off-hours compute waste detected across registered clusters.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredWasteItems.map((item) => (
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 7: COST ALLOCATION BREAKDOWN */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-mono font-bold tracking-wider text-zinc-400 uppercase flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              Granular Cost Allocation Drill-Down
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Explore resource costs by cluster, namespace, workload, and team
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
                className="pl-8 pr-3 py-1 text-xs bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-sky-500 font-mono w-48"
              />
            </div>

            <div className="flex rounded-lg bg-zinc-900 p-0.5 border border-zinc-800">
              {(['workload', 'namespace', 'cluster', 'team'] as const).map((tab) => (
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
                <th className="p-3 font-medium uppercase text-[10px]">CPU (Req / Used)</th>
                <th className="p-3 font-medium uppercase text-[10px]">Memory (Req / Used)</th>
                <th className="p-3 font-medium uppercase text-[10px]">Waste %</th>
                <th className="p-3 font-medium uppercase text-[10px]">Estimated Run-Rate</th>
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
                  <tr
                    key={item.id}
                    onClick={() => setInspectedWorkload(item)}
                    className="hover:bg-zinc-800/40 cursor-pointer transition-colors"
                  >
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
                      ${item.monthlyCostUsd?.toLocaleString()}/mo
                    </td>
                    <td className="p-3 text-emerald-400 font-semibold">
                      ${item.potentialSavingsUsd?.toLocaleString()}/mo
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: WORKLOAD DETAIL INSPECTION MODAL */}
      {inspectedWorkload && (
        <Modal
          isOpen={true}
          onClose={() => setInspectedWorkload(null)}
          title={`Workload Cost Profile: ${inspectedWorkload.name}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-4 font-mono text-xs">
            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <span className="text-[10px] text-zinc-500 uppercase block">Cluster</span>
                <span className="text-zinc-200 font-bold">{inspectedWorkload.clusterName || 'Default'}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 uppercase block">Namespace</span>
                <span className="text-zinc-200 font-bold">{inspectedWorkload.namespace || 'default'}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 uppercase block">Monthly Cost</span>
                <span className="text-zinc-100 font-bold">${inspectedWorkload.monthlyCostUsd}/mo</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 uppercase block">Potential Savings</span>
                <span className="text-emerald-400 font-bold">${inspectedWorkload.potentialSavingsUsd}/mo</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                <span className="text-[10px] uppercase text-sky-400 font-bold">CPU Allocation & Telemetry</span>
                <div className="flex justify-between text-zinc-300">
                  <span>Requested:</span>
                  <span className="font-bold">{inspectedWorkload.cpuRequestedCores} cores</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Observed Usage:</span>
                  <span>{inspectedWorkload.cpuUsedCores} cores</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Calculated Waste:</span>
                  <span className="text-amber-400 font-bold">
                    {Math.max(0, Math.round((inspectedWorkload.cpuRequestedCores - inspectedWorkload.cpuUsedCores) * 100) / 100)} cores
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                <span className="text-[10px] uppercase text-indigo-400 font-bold">Memory Allocation & Telemetry</span>
                <div className="flex justify-between text-zinc-300">
                  <span>Requested:</span>
                  <span className="font-bold">{inspectedWorkload.memoryRequestedGib} GiB</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Observed Usage:</span>
                  <span>{inspectedWorkload.memoryUsedGib} GiB</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Calculated Waste:</span>
                  <span className="text-amber-400 font-bold">
                    {Math.max(0, Math.round((inspectedWorkload.memoryRequestedGib - inspectedWorkload.memoryUsedGib) * 100) / 100)} GiB
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 leading-relaxed">
              <p className="font-semibold text-zinc-200 mb-1">FinOps Attribution Notice:</p>
              Pod-level figures represent container resource request cost-allocations using blended provider compute rates. They are estimated engineering allocations to help teams rightsize deployments, distinct from direct cloud provider invoices.
            </div>

            <div className="flex justify-end pt-3 border-t border-zinc-800">
              <Button variant="outline" size="sm" onClick={() => setInspectedWorkload(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 2: BUDGET CONFIGURATION MODAL */}
      {isBudgetModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsBudgetModalOpen(false)}
          title="Configure Monthly Cost Budget & Alert Thresholds"
          maxWidth="max-w-lg"
        >
          <form onSubmit={handleSaveBudget} className="space-y-4 font-mono text-xs">
            <p className="text-zinc-400 text-xs font-sans">
              Set a monthly spending limit to monitor compute allocation run-rates and receive proactive variance alerts before overruns happen.
            </p>

            <div className="space-y-1">
              <label className="text-zinc-300 block">Monthly Budget (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">$</span>
                <input
                  type="number"
                  min="0"
                  step="10"
                  required
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  placeholder="e.g. 500"
                  className="w-full pl-7 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-zinc-300 block">Alert Thresholds (% of budget)</label>
              <input
                type="text"
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
                placeholder="70, 85, 100"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 focus:outline-none focus:border-sky-500"
              />
              <span className="text-[10px] text-zinc-500 block">Comma-separated percentages (e.g. 70, 85, 100).</span>
            </div>

            {budgetSaveError && (
              <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/30 text-red-400 text-xs">
                {budgetSaveError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
              <Button variant="outline" size="sm" type="button" onClick={() => setIsBudgetModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                type="submit"
                disabled={savingBudget || !canApplyCostOptimization}
                icon={savingBudget ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              >
                {savingBudget ? 'Saving Budget...' : 'Save Budget'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 3: EVIDENCE-BASED RIGHTSIZING & REMEDIATION MODAL */}
      {selectedRec && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedRec(null)}
          title={`FinOps Rightsizing Audit: ${selectedRec.workloadName}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-4 font-mono text-xs">
            {/* What we found */}
            <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-sky-400 tracking-wider">
                What We Found
              </span>
              <p className="text-zinc-200 text-xs font-sans leading-relaxed">
                {selectedRec.whatWeFound || selectedRec.reason}
              </p>
            </div>

            {/* Evidence & Metrics */}
            <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                  Observed Telemetry Evidence
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                  {selectedRec.evidence?.telemetryQuality || 'HIGH'} QUALITY
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase">CPU Profile</span>
                  <div className="mt-1 flex justify-between text-zinc-300">
                    <span>Requested:</span>
                    <span className="font-bold">{selectedRec.evidence?.requestedCpu || selectedRec.currentCpuRequested}</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Peak Observed:</span>
                    <span>{selectedRec.evidence?.observedCpu || selectedRec.averageCpuUsed}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase">Memory Profile</span>
                  <div className="mt-1 flex justify-between text-zinc-300">
                    <span>Requested:</span>
                    <span className="font-bold">{selectedRec.evidence?.requestedMemory || selectedRec.currentMemoryRequested}</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Peak Observed:</span>
                    <span>{selectedRec.evidence?.observedMemory || selectedRec.averageMemoryUsed}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between text-[11px] text-zinc-500 pt-1">
                <span>Observation Window: {selectedRec.evidence?.observationPeriodHours || 24} hours</span>
                <span>Sample Count: {selectedRec.evidence?.metricsSampleCount || 48} checkpoints</span>
              </div>
            </div>

            {/* Recommended Change */}
            <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-2">
              <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
                Proposed Configuration (with +50% Headroom Buffer)
              </span>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2 rounded bg-zinc-900/80 border border-zinc-800">
                  <span className="text-[10px] text-zinc-400 uppercase">CPU Target</span>
                  <p className="text-zinc-200 mt-0.5">
                    <span className="line-through text-zinc-500 mr-1.5">{selectedRec.currentCpuRequested}</span>
                    <span className="text-emerald-400 font-bold">{selectedRec.recommendedCpu}</span>
                  </p>
                </div>

                <div className="p-2 rounded bg-zinc-900/80 border border-zinc-800">
                  <span className="text-[10px] text-zinc-400 uppercase">Memory Target</span>
                  <p className="text-zinc-200 mt-0.5">
                    <span className="line-through text-zinc-500 mr-1.5">{selectedRec.currentMemoryRequested}</span>
                    <span className="text-emerald-400 font-bold">{selectedRec.recommendedMemory}</span>
                  </p>
                </div>
              </div>

              <div className="text-[11px] text-emerald-300 flex justify-between pt-1">
                <span>Expected Monthly Benefit:</span>
                <span className="font-bold text-emerald-400 text-sm">
                  ${selectedRec.estimatedMonthlySavingsUsd}/month
                </span>
              </div>
            </div>

            {/* Risk, Validation & Rollback */}
            <div className="space-y-2 text-[11px]">
              <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-300">Risk Assessment:</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    selectedRec.risk === 'LOW' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                  }`}>
                    {selectedRec.risk} RISK
                  </span>
                </div>
                <p className="text-zinc-400 font-sans">
                  {selectedRec.riskAssessment?.details || 'Standard Kubernetes rolling update replaces pods incrementally.'}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-1">
                <span className="font-bold text-zinc-300">SkyOps Post-Rollout Validation:</span>
                <p className="text-zinc-400 font-sans">
                  {selectedRec.validationPlan || 'SkyOps observes the revised deployment for 15 minutes: asserts zero CrashLoopBackOff, verified Ready replicas, and ensures no CPU throttling.'}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-1">
                <span className="font-bold text-zinc-300">Rollback Plan:</span>
                <p className="text-zinc-400 font-sans">
                  {selectedRec.rollbackPlan || 'Instant 1-click manifest rollback to restore previous CPU and memory limits.'}
                </p>
              </div>
            </div>

            {applySuccessMsg && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 font-mono">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>{applySuccessMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
              <span className="text-[11px] text-zinc-500">
                Action executed under SkyOps RBAC & Audit Logging
              </span>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedRec(null)}>
                  Cancel
                </Button>

                {selectedRec.status !== 'APPROVED' && selectedRec.status !== 'APPLIED' && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isViewer || approvingRec}
                    onClick={() => handleApproveRightsizing(selectedRec)}
                  >
                    {approvingRec ? 'Approving...' : 'Approve Only'}
                  </Button>
                )}

                <Button
                  variant="primary"
                  size="sm"
                  disabled={applyingRec || !canApplyCostOptimization}
                  onClick={handleApplyRightsizing}
                  icon={applyingRec ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                >
                  {applyingRec ? 'Applying Safety Guardrails...' : 'Apply via Rolling Update'}
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
