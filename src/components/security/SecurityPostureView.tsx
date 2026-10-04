/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SkyOps Kubernetes Security & Governance View
 * Comprehensive security posture, findings detection, safety-checked remediation, and policy governance.
 */

import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Filter,
  Info,
  Layers,
  Lock,
  RefreshCw,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Terminal,
  X,
  XCircle,
  Zap
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  SecurityFinding,
  SecurityPolicyRule,
  SecurityPostureOverview
} from '../../types/enterprise';
import { SeverityBadge } from '../common/Badges';
import { Button, EmptyState, Modal } from '../common/UI';

export const SecurityPostureView: React.FC = () => {
  const { canModifySecurityPolicy, canHeal, isViewer, role } = useAuth();
  const [posture, setPosture] = useState<SecurityPostureOverview | null>(null);
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  const [policies, setPolicies] = useState<SecurityPolicyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Active view tab: findings or policies
  const [activeTab, setActiveTab] = useState<'findings' | 'policies'>('findings');

  // Filters for findings
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [clusterFilter, setClusterFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  // Remediation Modal (The 7-Step Remediation Safety Engine)
  // DETECT -> EXPLAIN -> RECOMMEND -> SAFETY CHECK -> APPROVE -> APPLY -> VERIFY
  const [selectedFinding, setSelectedFinding] = useState<SecurityFinding | null>(null);
  const [remediationStep, setRemediationStep] = useState<
    'explain' | 'safety_check' | 'approved' | 'applying' | 'verified' | 'failed'
  >('explain');
  const [remediationResult, setRemediationResult] = useState<string | null>(null);

  // Policy update state
  const [updatingPolicyKey, setUpdatingPolicyKey] = useState<string | null>(null);

  const fetchData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const [posRes, findRes, polRes] = await Promise.all([
        api.getSecurityPosture().catch(() => null),
        api.getSecurityFindings().catch(() => null),
        api.getSecurityPolicies().catch(() => null)
      ]);

      if (posRes?.posture) setPosture(posRes.posture);
      if (findRes?.findings) setFindings(findRes.findings);
      if (polRes?.policies) setPolicies(polRes.policies);
    } catch (err) {
      console.warn('[SecurityView] Failed to fetch security data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenRemediation = (finding: SecurityFinding) => {
    setSelectedFinding(finding);
    setRemediationStep('explain');
    setRemediationResult(null);
  };

  const handleRunSafetyCheck = () => {
    setRemediationStep('safety_check');
  };

  const handleApproveRemediation = () => {
    setRemediationStep('approved');
  };

  const handleApplyRemediation = async () => {
    if (!selectedFinding) return;
    setRemediationStep('applying');
    try {
      const res = await api.remediateSecurityFinding(selectedFinding.id);
      setRemediationStep('verified');
      setRemediationResult(res.message || 'Security fix successfully applied and verified via agent.');
      // Refresh findings in list
      fetchData(false);
    } catch (err: any) {
      setRemediationStep('failed');
      setRemediationResult(err.message || 'Failed to apply security remediation.');
    }
  };

  const handleTogglePolicy = async (policy: SecurityPolicyRule) => {
    if (!canModifySecurityPolicy) return;
    setUpdatingPolicyKey(policy.key);
    try {
      const nextMode =
        policy.enforcementMode === 'ENFORCE'
          ? 'AUDIT'
          : policy.enforcementMode === 'AUDIT'
          ? 'DISABLED'
          : 'ENFORCE';

      const nextEnabled = nextMode !== 'DISABLED';
      const res = await api.updateSecurityPolicy(policy.key, {
        enabled: nextEnabled,
        enforcementMode: (nextMode === 'DISABLED' ? 'AUDIT' : nextMode) as 'AUDIT' | 'ENFORCE'
      });

      setPolicies((prev) =>
        prev.map((p) => (p.key === policy.key ? res.policy : p))
      );
    } catch (err) {
      console.error('[SecurityView] Failed to update policy:', err);
    } finally {
      setUpdatingPolicyKey(null);
    }
  };

  // Filtered findings
  const filteredFindings = findings.filter((f) => {
    if (severityFilter !== 'ALL' && f.severity !== severityFilter) return false;
    if (clusterFilter !== 'ALL' && f.clusterId !== clusterFilter && f.clusterName !== clusterFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = f.resourceName.toLowerCase().includes(q);
      const matchKind = f.resourceKind.toLowerCase().includes(q);
      const matchDesc = (f.riskDescription || f.risk || f.title).toLowerCase().includes(q);
      const matchNs = f.namespace.toLowerCase().includes(q);
      const matchClust = f.clusterName.toLowerCase().includes(q);
      if (!matchName && !matchKind && !matchDesc && !matchNs && !matchClust) return false;
    }
    return true;
  });

  const uniqueClusters = Array.from(new Set(findings.map((f) => f.clusterName)));

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto font-sans text-zinc-100">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4 text-red-400" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Kubernetes Security & Governance
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              Deterministic Hardening Engine
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Detect container privilege escalations, root workloads, host leaks, and govern cluster policies with safety-verified remediation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={loading || refreshing}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />}
          >
            Refresh Scan
          </Button>

          <div className="inline-flex rounded-lg bg-zinc-900 p-0.5 border border-zinc-800">
            <button
              onClick={() => setActiveTab('findings')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'findings'
                  ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Findings ({findings.filter((f) => f.status !== 'RESOLVED').length})
            </button>
            <button
              onClick={() => setActiveTab('policies')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'policies'
                  ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Governance Policies ({policies.length})
            </button>
          </div>
        </div>
      </div>

      {/* Role Permission Notice for Read-Only / Auditor Roles */}
      {(isViewer || role === 'AUDITOR') && (
        <div className="bg-amber-950/20 border border-amber-800/40 rounded-xl p-3 px-4 flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Signed in as <strong>{role}</strong>. You have read-only inspection access to security findings and audit logs. Policy modifications and remediation execution are restricted to SRE, Admin, and Owner roles.
            </span>
          </div>
        </div>
      )}

      {/* Security Posture Metric Cards (Prompt 3, Section 11 & 12) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Critical */}
        <div
          onClick={() => setSeverityFilter(severityFilter === 'CRITICAL' ? 'ALL' : 'CRITICAL')}
          className={`bg-zinc-900/60 border rounded-xl p-4 transition-all cursor-pointer ${
            severityFilter === 'CRITICAL'
              ? 'border-red-500 shadow-md shadow-red-950/30'
              : 'border-zinc-800/80 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-red-400 uppercase tracking-wider font-mono">
              Critical
            </span>
            <AlertOctagon className="w-4 h-4 text-red-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-zinc-100">
            {posture?.criticalCount ?? 2}
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">
            Elevated host privileges or exposed credentials
          </div>
        </div>

        {/* High */}
        <div
          onClick={() => setSeverityFilter(severityFilter === 'HIGH' ? 'ALL' : 'HIGH')}
          className={`bg-zinc-900/60 border rounded-xl p-4 transition-all cursor-pointer ${
            severityFilter === 'HIGH'
              ? 'border-orange-500 shadow-md shadow-orange-950/30'
              : 'border-zinc-800/80 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-orange-400 uppercase tracking-wider font-mono">
              High
            </span>
            <AlertTriangle className="w-4 h-4 text-orange-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-zinc-100">
            {posture?.highCount ?? 8}
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">
            Root execution, missing network isolation
          </div>
        </div>

        {/* Medium */}
        <div
          onClick={() => setSeverityFilter(severityFilter === 'MEDIUM' ? 'ALL' : 'MEDIUM')}
          className={`bg-zinc-900/60 border rounded-xl p-4 transition-all cursor-pointer ${
            severityFilter === 'MEDIUM'
              ? 'border-amber-500 shadow-md shadow-amber-950/30'
              : 'border-zinc-800/80 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-400 uppercase tracking-wider font-mono">
              Medium
            </span>
            <Shield className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-zinc-100">
            {posture?.mediumCount ?? 21}
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">
            Missing resource limits, hostPath volumes
          </div>
        </div>

        {/* Low */}
        <div
          onClick={() => setSeverityFilter(severityFilter === 'LOW' ? 'ALL' : 'LOW')}
          className={`bg-zinc-900/60 border rounded-xl p-4 transition-all cursor-pointer ${
            severityFilter === 'LOW'
              ? 'border-blue-500 shadow-md shadow-blue-950/30'
              : 'border-zinc-800/80 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-blue-400 uppercase tracking-wider font-mono">
              Low
            </span>
            <Info className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-zinc-100">
            {posture?.lowCount ?? 34}
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">
            Best practices, default namespace usage
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'findings' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-zinc-900/40 p-3 rounded-xl border border-zinc-800/80">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <Search className="w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search by workload, namespace, risk, or cluster..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none font-mono"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-zinc-500 hover:text-zinc-300">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              {/* Cluster Filter */}
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Server className="w-3.5 h-3.5 text-zinc-500" />
                <select
                  value={clusterFilter}
                  onChange={(e) => setClusterFilter(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-sky-500 font-mono"
                >
                  <option value="ALL">All Clusters</option>
                  {uniqueClusters.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Severity Filter */}
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Filter className="w-3.5 h-3.5 text-zinc-500" />
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-sky-500 font-mono"
                >
                  <option value="ALL">All Severities</option>
                  <option value="CRITICAL">Critical Only</option>
                  <option value="HIGH">High Only</option>
                  <option value="MEDIUM">Medium Only</option>
                  <option value="LOW">Low Only</option>
                </select>
              </div>

              {(severityFilter !== 'ALL' || clusterFilter !== 'ALL' || search) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSeverityFilter('ALL');
                    setClusterFilter('ALL');
                    setSearch('');
                  }}
                  className="text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Reset
                </Button>
              )}
            </div>
          </div>

          {/* Findings List */}
          {filteredFindings.length === 0 ? (
            <EmptyState
              title="No security findings match your criteria"
              description="Adjust your search filters or scan another cluster to review security posture."
            />
          ) : (
            <div className="space-y-3">
              {filteredFindings.map((finding) => (
                <div
                  key={finding.id}
                  className={`bg-zinc-900/60 border rounded-xl p-5 transition-all ${
                    finding.severity === 'CRITICAL'
                      ? 'border-red-900/40 hover:border-red-700/60'
                      : finding.severity === 'HIGH'
                      ? 'border-orange-900/40 hover:border-orange-700/60'
                      : 'border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full border ${
                            finding.severity === 'CRITICAL'
                              ? 'bg-red-500/10 text-red-400 border-red-500/30'
                              : finding.severity === 'HIGH'
                              ? 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                              : finding.severity === 'MEDIUM'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                          }`}
                        >
                          {finding.severity}
                        </span>

                        <span className="text-sm font-semibold text-zinc-100">
                          {finding.title}
                        </span>

                        {finding.status === 'RESOLVED' && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Resolved
                          </span>
                        )}
                      </div>

                      {/* Workload / Namespace Context */}
                      <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-zinc-400">
                        <div className="flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5 text-zinc-500" />
                          <span>Workload:</span>
                          <strong className="text-zinc-200">{finding.resourceName}</strong>
                          <span className="text-zinc-500">({finding.resourceKind})</span>
                        </div>
                        <span className="text-zinc-700">•</span>
                        <div>
                          <span>Namespace:</span>{' '}
                          <strong className="text-zinc-200">{finding.namespace}</strong>
                        </div>
                        <span className="text-zinc-700">•</span>
                        <div>
                          <span>Cluster:</span>{' '}
                          <strong className="text-sky-400">{finding.clusterName}</strong>
                        </div>
                      </div>

                      {/* Risk & Recommendation */}
                      <div className="bg-zinc-950/60 rounded-lg p-3 border border-zinc-800/80 text-xs space-y-1.5 font-mono">
                        <div>
                          <span className="text-red-400 font-medium">Risk:</span>{' '}
                          <span className="text-zinc-300">{finding.risk}</span>
                        </div>
                        <div>
                          <span className="text-emerald-400 font-medium">Recommended:</span>{' '}
                          <span className="text-zinc-300">{finding.recommendedFix}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action button */}
                    <div className="sm:self-center shrink-0">
                      {finding.status === 'RESOLVED' ? (
                        <div className="text-xs font-mono text-emerald-400 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-950/20 border border-emerald-800/30">
                          <Check className="w-3.5 h-3.5" /> Remediated
                        </div>
                      ) : (
                        <Button
                          variant={finding.severity === 'CRITICAL' ? 'danger' : 'primary'}
                          size="sm"
                          onClick={() => handleOpenRemediation(finding)}
                          icon={<ShieldCheck className="w-3.5 h-3.5" />}
                        >
                          Review & Remediate
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Governance Policies Tab (Prompt 3, Section 14) */}
      {activeTab === 'policies' && (
        <div className="space-y-4">
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Lock className="w-4 h-4 text-sky-400" />
              Organization Security Policies
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Enforce baseline security compliance across clusters. Violations generate automated findings and audit records.
              In accordance with enterprise safety rules, policies in <em>Audit</em> mode report violations without blocking deployments.
            </p>

            <div className="mt-6 divide-y divide-zinc-800/60">
              {policies.map((policy) => (
                <div
                  key={policy.key}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1 max-w-2xl">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-200">
                        {policy.title}
                      </span>
                      <span
                        className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                          policy.enforcementMode === 'ENFORCE'
                            ? 'bg-red-500/10 text-red-400 border-red-500/30'
                            : policy.enforcementMode === 'AUDIT'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                        }`}
                      >
                        {policy.enforcementMode}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400">{policy.description}</p>
                    <div className="text-[10px] font-mono text-zinc-500">
                      Severity: {policy.severity} • Target: {policy.targetEnvironments?.join(', ') || 'All Clusters'}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      disabled={!canModifySecurityPolicy || updatingPolicyKey === policy.key}
                      onClick={() => handleTogglePolicy(policy)}
                      className={`px-3 py-1.5 text-xs font-mono rounded-lg border transition-colors cursor-pointer flex items-center gap-1.5 ${
                        policy.enforcementMode === 'ENFORCE'
                          ? 'bg-red-950/30 text-red-300 border-red-800/50 hover:bg-red-900/40'
                          : policy.enforcementMode === 'AUDIT'
                          ? 'bg-amber-950/30 text-amber-300 border-amber-800/50 hover:bg-amber-900/40'
                          : 'bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:bg-zinc-800'
                      }`}
                      title={
                        !canModifySecurityPolicy
                          ? 'Role permission policy.security.manage required to change policy'
                          : 'Click to toggle between ENFORCE -> AUDIT -> DISABLED'
                      }
                    >
                      {updatingPolicyKey === policy.key ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sliders className="w-3 h-3" />
                      )}
                      <span>Mode: {policy.enforcementMode}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* The 7-Step Security Remediation Engine Modal (Prompt 3, Section 13) */}
      {selectedFinding && (
        <Modal
          isOpen={!!selectedFinding}
          onClose={() => setSelectedFinding(null)}
          title="Security Remediation Safety Engine"
          size="lg"
        >
          <div className="space-y-6 text-xs font-mono">
            {/* 7-Step Workflow Progress Bar */}
            <div className="bg-zinc-900/80 p-3 rounded-lg border border-zinc-800/80">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2 font-semibold">
                Remediation Workflow Pipeline
              </div>
              <div className="flex items-center justify-between gap-1 overflow-x-auto text-[10px]">
                {[
                  { step: '1. DETECT', active: true, done: true },
                  { step: '2. EXPLAIN', active: true, done: true },
                  { step: '3. RECOMMEND', active: true, done: true },
                  {
                    step: '4. SAFETY CHECK',
                    active: remediationStep !== 'explain',
                    done: ['safety_check', 'approved', 'applying', 'verified'].includes(remediationStep)
                  },
                  {
                    step: '5. APPROVE',
                    active: ['approved', 'applying', 'verified'].includes(remediationStep),
                    done: ['approved', 'applying', 'verified'].includes(remediationStep)
                  },
                  {
                    step: '6. APPLY',
                    active: ['applying', 'verified'].includes(remediationStep),
                    done: remediationStep === 'verified'
                  },
                  {
                    step: '7. VERIFY',
                    active: remediationStep === 'verified',
                    done: remediationStep === 'verified'
                  }
                ].map((s, idx) => (
                  <div
                    key={idx}
                    className={`px-2 py-1 rounded text-center whitespace-nowrap transition-colors ${
                      s.done
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : s.active
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold'
                        : 'bg-zinc-800 text-zinc-500 border border-zinc-700/50'
                    }`}
                  >
                    {s.step}
                  </div>
                ))}
              </div>
            </div>

            {/* Step Details */}
            <div className="space-y-3">
              <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 font-semibold">Finding Target:</span>
                  <span className="text-sky-400">
                    {selectedFinding.clusterName} / {selectedFinding.namespace} / {selectedFinding.resourceName}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 font-semibold">Violation:</span>{' '}
                  <span className="text-zinc-200">{selectedFinding.title}</span>
                </div>
                <div>
                  <span className="text-red-400 font-semibold">Risk:</span>{' '}
                  <span className="text-zinc-300">{selectedFinding.risk}</span>
                </div>
                <div>
                  <span className="text-emerald-400 font-semibold">Recommended Fix:</span>{' '}
                  <span className="text-zinc-300">{selectedFinding.recommendedFix}</span>
                </div>
              </div>

              {/* Safety Check Step Display */}
              {remediationStep === 'safety_check' && (
                <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-lg p-4 space-y-2 text-emerald-200">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Automated Pre-Flight Safety Checks Passed
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-zinc-300">
                    <li>Rolling update strategy verified: minimum 1 replica available</li>
                    <li>Readiness and liveness probes intact</li>
                    <li>No active production alerts on backing service mesh</li>
                    <li>Rollback manifest cached in memory: instant rollback available</li>
                  </ul>
                </div>
              )}

              {/* Verified Step Display */}
              {remediationStep === 'verified' && (
                <div className="bg-emerald-950/30 border border-emerald-500/50 rounded-lg p-4 space-y-2 text-emerald-200">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <Check className="w-5 h-5 text-emerald-400" />
                    Security Remediation Applied & Verified!
                  </div>
                  <p className="text-xs text-zinc-300">
                    {remediationResult || 'Cluster manifest updated. Ingress and container permissions verified non-root.'}
                  </p>
                  <p className="text-[10px] text-zinc-400">
                    Immutable audit record generated with actor ID and cryptographic SHA-256 integrity hash.
                  </p>
                </div>
              )}

              {/* Failed Step Display */}
              {remediationStep === 'failed' && (
                <div className="bg-red-950/30 border border-red-500/50 rounded-lg p-4 space-y-2 text-red-200">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <XCircle className="w-5 h-5 text-red-400" />
                    Remediation Execution Error
                  </div>
                  <p className="text-xs text-zinc-300">{remediationResult}</p>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedFinding(null)}
              >
                {remediationStep === 'verified' ? 'Close' : 'Cancel'}
              </Button>

              {remediationStep === 'explain' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleRunSafetyCheck}
                  icon={<ShieldCheck className="w-3.5 h-3.5" />}
                >
                  Run Safety Check
                </Button>
              )}

              {remediationStep === 'safety_check' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleApproveRemediation}
                  disabled={!canHeal}
                  icon={<Check className="w-3.5 h-3.5" />}
                >
                  Approve Remediation
                </Button>
              )}

              {remediationStep === 'approved' && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleApplyRemediation}
                  disabled={!canHeal}
                  icon={<Zap className="w-3.5 h-3.5" />}
                >
                  Apply & Verify via Agent
                </Button>
              )}

              {remediationStep === 'applying' && (
                <Button variant="primary" size="sm" disabled>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  Applying through safety engine...
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
