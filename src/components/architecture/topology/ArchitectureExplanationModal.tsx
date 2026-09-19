import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  Globe,
  HardDrive,
  Info,
  Layers,
  Loader2,
  Lock,
  MessageSquare,
  Network,
  RefreshCw,
  Send,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wrench,
  X,
  Zap
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../../api/client';
import { Cluster, Incident, KubernetesResource } from '../../../types/index';
import { ArchitectureAIExplanation, ArchitectureTelemetryState } from '../types';
import { TopologyNode } from './types';

interface ArchitectureExplanationModalProps {
  isOpen: boolean;
  onClose: () => void;
  cluster: Cluster | null;
  resources: KubernetesResource[];
  telemetry: ArchitectureTelemetryState;
  incidents: Incident[];
  selectedNode?: TopologyNode | null;
  onSelectResource?: (resource: KubernetesResource) => void;
}

type ModalTab = 'architecture' | 'resilience' | 'health' | 'diagnostics' | 'ask_ai';

export const ArchitectureExplanationModal: React.FC<ArchitectureExplanationModalProps> = ({
  isOpen,
  onClose,
  cluster,
  resources,
  telemetry,
  incidents,
  selectedNode,
  onSelectResource
}) => {
  const [activeTab, setActiveTab] = useState<ModalTab>('architecture');
  const [explanation, setExplanation] = useState<ArchitectureAIExplanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [userQuestion, setUserQuestion] = useState('');
  const [askingAi, setAskingAi] = useState(false);
  const [customAnswer, setCustomAnswer] = useState<string | null>(null);

  // Determine target info
  const targetInfo = useMemo(() => {
    if (!selectedNode || selectedNode.type === 'cluster') {
      return {
        type: 'cluster' as const,
        id: cluster?.id || 'cluster-root',
        name: cluster?.name || 'Kubernetes Cluster',
        kind: 'Cluster',
        namespace: undefined,
        domainId: undefined,
        resource: undefined,
        health: cluster?.status === 'DEGRADED' ? ('CRITICAL' as const) : ('HEALTHY' as const)
      };
    }

    if (selectedNode.type === 'domain_group') {
      return {
        type: 'domain' as const,
        id: selectedNode.id,
        name: selectedNode.name,
        kind: selectedNode.kind || 'Domain Group',
        namespace: undefined,
        domainId: selectedNode.domainId,
        resource: undefined,
        health: selectedNode.health || ('HEALTHY' as const)
      };
    }

    return {
      type: 'resource' as const,
      id: selectedNode.id,
      name: selectedNode.name,
      kind: selectedNode.kind,
      namespace: selectedNode.namespace || 'default',
      domainId: selectedNode.domainId,
      resource: selectedNode.resource,
      health: selectedNode.health || ('HEALTHY' as const)
    };
  }, [selectedNode, cluster]);

  // Aggregate cluster summary for grounding
  const clusterSummary = useMemo(() => {
    const nodes = resources.filter((r) => r.kind === 'Node');
    const pods = resources.filter((r) => r.kind === 'Pod');
    const services = resources.filter((r) => r.kind === 'Service');
    const ingresses = resources.filter((r) => r.kind === 'Ingress' || r.kind === 'Gateway');
    const workloads = resources.filter((r) =>
      ['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob'].includes(r.kind)
    );
    const pvcs = resources.filter((r) => r.kind === 'PersistentVolumeClaim');

    return {
      totalNodes: nodes.length,
      totalWorkloads: workloads.length,
      totalPods: pods.length,
      totalServices: services.length,
      totalIngresses: ingresses.length,
      totalPvcs: pvcs.length,
      activeIncidentsCount: incidents.length
    };
  }, [resources, incidents]);

  // Fetch or regenerate explanation
  const fetchExplanation = async (prompt?: string) => {
    if (prompt) {
      setAskingAi(true);
    } else {
      setLoading(true);
    }

    try {
      // Find correlated incidents
      const correlatedIncidents = (selectedNode?.incidents || incidents.filter((i) => {
        if (!selectedNode) return true;
        if (selectedNode.type === 'cluster') return true;
        if (selectedNode.type === 'domain_group') {
          return selectedNode.domainId ? i.resourceKind?.toLowerCase().includes(selectedNode.domainId.toLowerCase()) : false;
        }
        return i.resourceName === selectedNode.name || i.resourceId === selectedNode.id;
      })).map((inc) => ({
        id: inc.id,
        title: inc.title,
        severity: inc.severity,
        incidentType: inc.incidentType,
        firstSeenAt: inc.firstSeenAt,
        occurrenceCount: inc.occurrenceCount
      }));

      // Related resources
      const related = selectedNode?.backingPods
        ? selectedNode.backingPods.map((bp) => ({
            kind: 'Pod',
            name: bp.name,
            namespace: bp.namespace,
            relation: 'Backing Pod'
          }))
        : [];

      const payload = {
        clusterId: cluster?.id,
        clusterName: cluster?.name || 'Kubernetes Cluster',
        targetType: targetInfo.type,
        targetId: targetInfo.id,
        targetName: targetInfo.name,
        targetKind: targetInfo.kind,
        namespace: targetInfo.namespace,
        domainId: targetInfo.domainId,
        resourceSpec: targetInfo.resource ? (targetInfo.resource as any).spec || targetInfo.resource.specSummary : undefined,
        resourceStatus: targetInfo.resource ? (targetInfo.resource as any).status : undefined,
        metrics: selectedNode?.metrics,
        replicas: selectedNode?.replicas,
        health: targetInfo.health,
        statusText: selectedNode?.statusText,
        incidents: correlatedIncidents,
        relatedResources: related,
        backingPods: selectedNode?.backingPods?.map((bp) => ({
          name: bp.name,
          status: bp.status,
          health: bp.health,
          restarts: bp.restarts
        })),
        clusterSummary,
        userPrompt: prompt
      };

      const res = await api.explainArchitecture(payload);
      if (res && res.explanation) {
        setExplanation(res.explanation);
        if (prompt && res.explanation.customAnswer) {
          setCustomAnswer(res.explanation.customAnswer);
        }
      }
    } catch (err) {
      console.warn('[ArchitectureExplanationModal] Explain request error:', err);
    } finally {
      setLoading(false);
      setAskingAi(false);
    }
  };

  // Trigger when modal opens or target changes
  useEffect(() => {
    if (isOpen) {
      setActiveTab('architecture');
      setCustomAnswer(null);
      setUserQuestion('');
      fetchExplanation();
    } else {
      setExplanation(null);
    }
  }, [isOpen, selectedNode?.id, cluster?.id]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(text);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const handleAskQuestion = (q?: string) => {
    const query = q || userQuestion;
    if (!query.trim() || askingAi) return;
    setUserQuestion(query);
    setActiveTab('ask_ai');
    fetchExplanation(query);
  };

  if (!isOpen) return null;

  const targetIcon = () => {
    if (targetInfo.type === 'cluster') return <Server className="w-5 h-5 text-sky-400" />;
    if (targetInfo.type === 'domain') return <Layers className="w-5 h-5 text-indigo-400" />;
    const k = targetInfo.kind;
    if (k === 'Node') return <Cpu className="w-5 h-5 text-emerald-400" />;
    if (k === 'Service') return <Network className="w-5 h-5 text-cyan-400" />;
    if (k === 'Ingress' || k === 'Gateway') return <Globe className="w-5 h-5 text-blue-400" />;
    if (k === 'PersistentVolumeClaim') return <HardDrive className="w-5 h-5 text-amber-400" />;
    return <Boxes className="w-5 h-5 text-sky-400" />;
  };

  const healthColor =
    targetInfo.health === 'CRITICAL'
      ? 'text-rose-400 bg-rose-500/15 border-rose-500/30'
      : targetInfo.health === 'WARNING'
      ? 'text-amber-400 bg-amber-500/15 border-amber-500/30'
      : 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30';

  return (
    <div
      id="architecture-ai-explanation-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
    >
      <div
        id="architecture-ai-explanation-modal"
        className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] font-sans border-zinc-800/90"
      >
        {/* ==========================================
            1. MODAL HEADER
            ========================================== */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 shrink-0 shadow-inner">
              {targetIcon()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-400 bg-zinc-800/60 px-2 py-0.5 rounded">
                  {targetInfo.kind}
                </span>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${healthColor}`}>
                  {targetInfo.health}
                </span>
                {explanation?.aiModel && (
                  <span className="text-[10px] font-mono text-sky-300 bg-sky-500/10 border border-sky-500/25 px-2 py-0.5 rounded flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-sky-400" />
                    <span>{explanation.aiModel}</span>
                  </span>
                )}
              </div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100 truncate mt-1">
                {targetInfo.name}
              </h2>
              <p className="text-xs text-zinc-400 font-mono mt-0.5 truncate">
                {targetInfo.namespace ? `Namespace: ${targetInfo.namespace}` : 'Scope: Cluster-wide'}
                {targetInfo.domainId ? ` | Domain: ${targetInfo.domainId}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              id="ai-explain-refresh-btn"
              onClick={() => fetchExplanation()}
              disabled={loading}
              title="Regenerate AI Explanation"
              className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-sky-400' : ''}`} />
            </button>
            <button
              id="ai-explain-close-btn"
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ==========================================
            2. NAVIGATION TABS
            ========================================== */}
        <div className="flex items-center border-b border-zinc-800 bg-zinc-950 px-4 shrink-0 font-mono text-xs overflow-x-auto">
          {[
            { id: 'architecture', label: 'Architecture & Role', icon: Layers },
            { id: 'resilience', label: 'Resilience & Sizing', icon: Zap },
            { id: 'health', label: 'Health & Incidents', icon: Activity },
            { id: 'diagnostics', label: 'CLI Diagnostics', icon: Terminal },
            { id: 'ask_ai', label: 'Ask AI', icon: MessageSquare }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id as ModalTab)}
                className={`py-3 px-3 border-b-2 font-medium flex items-center gap-1.5 whitespace-nowrap transition cursor-pointer ${
                  isActive
                    ? 'border-sky-400 text-sky-400 font-semibold'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.id === 'health' && explanation?.activeIssuesAndDiagnostics.hasIssues && (
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping ml-0.5" />
                )}
              </button>
            );
          })}
        </div>

        {/* ==========================================
            3. TAB CONTENT WORKSPACE
            ========================================== */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-xs text-zinc-300 leading-relaxed font-sans flex-1">
          {loading && !explanation ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
              <div className="text-zinc-200 font-semibold text-sm">
                Generating Grounded AI Architecture Synthesis...
              </div>
              <div className="text-zinc-500 text-xs font-mono text-center max-w-sm">
                Analyzing cluster topology, container specs, active incidents, and live resource metrics
              </div>
            </div>
          ) : (
            <>
              {/* Executive Summary Card (always shown at top) */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-sky-950/30 to-indigo-950/20 border border-sky-500/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-wider font-mono font-bold text-sky-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                    <span>Executive Summary</span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {explanation?.operationalStatus.headline}
                  </span>
                </div>
                <p className="text-zinc-200 text-xs sm:text-sm font-medium leading-relaxed">
                  {explanation?.summary || 'Synthesizing resource architecture...'}
                </p>
              </div>

              {/* TAB 1: ARCHITECTURE & ROLE */}
              {activeTab === 'architecture' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  {/* Detailed Overview */}
                  <div className="space-y-1.5">
                    <h3 className="text-xs font-mono font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-sky-400" />
                      <span>Role in Cluster Architecture</span>
                    </h3>
                    <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-zinc-300 leading-relaxed text-xs">
                      {explanation?.architectureAndRole.overview}
                    </div>
                  </div>

                  {/* Key Responsibilities */}
                  {explanation?.architectureAndRole.keyResponsibilities &&
                    explanation.architectureAndRole.keyResponsibilities.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-mono font-bold text-zinc-200">
                          Key Operational Responsibilities
                        </h4>
                        <div className="grid grid-cols-1 gap-2">
                          {explanation.architectureAndRole.keyResponsibilities.map((resp, i) => (
                            <div
                              key={i}
                              className="p-3 rounded-lg bg-zinc-900/40 border border-zinc-800 flex items-start gap-2.5 text-zinc-300"
                            >
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                              <span>{resp}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Network & Traffic Flow Pathway */}
                  {explanation?.architectureAndRole.networkTrafficPath && (
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-mono font-bold text-cyan-400 flex items-center gap-1.5">
                        <Network className="w-3.5 h-3.5" />
                        <span>Ingress & Traffic Flow Path</span>
                      </h4>
                      <div className="p-3.5 rounded-lg bg-zinc-900/40 border border-zinc-800 text-zinc-300 leading-relaxed">
                        {explanation.architectureAndRole.networkTrafficPath}
                      </div>
                    </div>
                  )}

                  {/* Storage & State */}
                  {explanation?.architectureAndRole.storageAndState && (
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-mono font-bold text-amber-400 flex items-center gap-1.5">
                        <HardDrive className="w-3.5 h-3.5" />
                        <span>Persistent Storage & State</span>
                      </h4>
                      <div className="p-3.5 rounded-lg bg-zinc-900/40 border border-zinc-800 text-zinc-300 leading-relaxed">
                        {explanation.architectureAndRole.storageAndState}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: RESILIENCE & SIZING */}
              {activeTab === 'resilience' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  {/* High Availability Verdict */}
                  <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                    <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5" />
                      <span>High Availability & Redundancy Verdict</span>
                    </div>
                    <p className="text-zinc-200">
                      {explanation?.resilienceAndPerformance.highAvailabilityVerdict}
                    </p>
                    {explanation?.resilienceAndPerformance.replicaAssessment && (
                      <div className="text-[11px] font-mono text-zinc-400 pt-1">
                        Replica status: {explanation.resilienceAndPerformance.replicaAssessment}
                      </div>
                    )}
                  </div>

                  {/* Resource Sizing & Limits */}
                  <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                    <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5" />
                      <span>Compute & Memory Allocation</span>
                    </div>
                    <p className="text-zinc-300">
                      {explanation?.resilienceAndPerformance.resourceAllocationVerdict ||
                        'Telemetry active: resource limits and request sizing monitored.'}
                    </p>
                    {selectedNode?.metrics?.isAvailable && (
                      <div className="flex items-center gap-4 text-xs font-mono pt-1 text-zinc-400">
                        <span>CPU: <strong className="text-zinc-100">{selectedNode.metrics.cpu}</strong></span>
                        <span>Memory: <strong className="text-zinc-100">{selectedNode.metrics.memory}</strong></span>
                      </div>
                    )}
                  </div>

                  {/* Bottlenecks & Capacity Risks */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-mono font-bold text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Potential Bottlenecks & Single Points of Failure</span>
                    </h4>
                    <div className="space-y-1.5">
                      {explanation?.resilienceAndPerformance.bottlenecksOrRisks.map((risk, i) => (
                        <div
                          key={i}
                          className="p-3 rounded-lg bg-zinc-900/40 border border-zinc-800/80 text-zinc-300 flex items-start gap-2"
                        >
                          <span className="text-amber-400 font-bold">•</span>
                          <span>{risk}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Security Posture */}
                  <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                    <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Security Posture & Hardening</span>
                    </div>
                    <p className="text-zinc-300">{explanation?.securityPosture.verdict}</p>
                    <ul className="space-y-1 pt-1">
                      {explanation?.securityPosture.recommendations.map((rec, i) => (
                        <li key={i} className="text-zinc-400 flex items-start gap-2 text-[11px]">
                          <Lock className="w-3 h-3 text-indigo-400 shrink-0 mt-0.5" />
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* TAB 3: HEALTH & INCIDENTS */}
              {activeTab === 'health' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-zinc-200">
                        Operational Status Details
                      </span>
                      <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${healthColor}`}>
                        {explanation?.operationalStatus.health}
                      </span>
                    </div>
                    <p className="text-zinc-300 leading-relaxed">
                      {explanation?.operationalStatus.details}
                    </p>
                  </div>

                  {/* Active Incidents Breakdown */}
                  {explanation?.activeIssuesAndDiagnostics.hasIssues ? (
                    <div className="space-y-2">
                      <h4 className="text-xs font-mono font-bold text-rose-400 flex items-center gap-1.5">
                        <AlertOctagon className="w-3.5 h-3.5" />
                        <span>Active Incidents & Failure Diagnosis</span>
                      </h4>
                      {explanation.activeIssuesAndDiagnostics.incidentSummary && (
                        <div className="p-3 bg-rose-950/20 border border-rose-900/60 rounded-xl text-rose-200">
                          {explanation.activeIssuesAndDiagnostics.incidentSummary}
                        </div>
                      )}
                      {explanation.activeIssuesAndDiagnostics.rootCauseHypothesis && (
                        <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl space-y-1">
                          <span className="text-[10px] uppercase font-mono font-bold text-zinc-500">
                            Root Cause Hypothesis
                          </span>
                          <p className="text-zinc-200">
                            {explanation.activeIssuesAndDiagnostics.rootCauseHypothesis}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-6 rounded-xl bg-emerald-950/20 border border-emerald-900/40 text-center space-y-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                      <div className="text-sm font-bold text-emerald-300">
                        Zero Active Incidents Detected
                      </div>
                      <p className="text-xs text-zinc-400 max-w-md mx-auto">
                        All health probes, conditions, container exit codes, and replica sets are operating cleanly.
                      </p>
                    </div>
                  )}

                  {/* Backing Pods List if present */}
                  {selectedNode?.backingPods && selectedNode.backingPods.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-mono font-bold text-zinc-200">
                        Backing Pod Instances ({selectedNode.backingPods.length})
                      </h4>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {selectedNode.backingPods.map((p) => (
                          <div
                            key={p.name}
                            className="p-2.5 bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-between text-xs font-mono"
                          >
                            <span className="text-zinc-200 truncate">{p.name}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  p.status === 'Running'
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : 'bg-rose-500/10 text-rose-400'
                                }`}
                              >
                                {p.status}
                              </span>
                              {p.restarts !== undefined && p.restarts > 0 && (
                                <span className="text-amber-400 text-[10px]">
                                  {p.restarts} restarts
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: CLI DIAGNOSTICS & RUNBOOKS */}
              {activeTab === 'diagnostics' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-mono font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-sky-400" />
                      <span>Production Kubectl Runbooks</span>
                    </h3>
                    <span className="text-[10px] font-mono text-zinc-500">
                      Click to copy command
                    </span>
                  </div>

                  <div className="space-y-3">
                    {explanation?.recommendedCommands.map((item, i) => {
                      const isCopied = copiedCmd === item.command;
                      const catBadge =
                        item.category === 'remediate'
                          ? 'text-rose-400 bg-rose-500/10 border-rose-500/25'
                          : item.category === 'logs'
                          ? 'text-amber-400 bg-amber-500/10 border-amber-500/25'
                          : item.category === 'metrics'
                          ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/25'
                          : 'text-sky-400 bg-sky-500/10 border-sky-500/25';

                      return (
                        <div
                          key={i}
                          className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2 group hover:border-zinc-700 transition"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-zinc-300 font-medium text-xs">
                              {item.description}
                            </span>
                            <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${catBadge}`}>
                              {item.category}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/80 font-mono text-[11px] text-sky-300">
                            <code className="truncate selection:bg-sky-500/30">
                              {item.command}
                            </code>
                            <button
                              onClick={() => handleCopy(item.command)}
                              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition cursor-pointer shrink-0"
                              title="Copy command"
                            >
                              {isCopied ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Best Practice Tips */}
                  {explanation?.bestPracticeTips && explanation.bestPracticeTips.length > 0 && (
                    <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                      <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-sky-400" />
                        <span>SRE Best Practices</span>
                      </div>
                      <ul className="space-y-1.5">
                        {explanation.bestPracticeTips.map((tip, i) => (
                          <li key={i} className="text-zinc-300 text-xs flex items-start gap-2">
                            <span className="text-sky-400 font-bold">•</span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: ASK AI (INTERACTIVE SRE ASSISTANT) */}
              {activeTab === 'ask_ai' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="p-4 rounded-xl bg-sky-950/20 border border-sky-500/25 space-y-2">
                    <div className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4" />
                      <span>Ask AI about {targetInfo.name}</span>
                    </div>
                    <p className="text-xs text-zinc-400">
                      Query the Gemini SRE engine about architecture, scaling, zero-downtime rollouts, security hardening, or troubleshooting.
                    </p>
                  </div>

                  {/* Quick Prompt Chips */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono uppercase text-zinc-500">
                      Quick Investigations:
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {[
                        'How do I scale this with zero downtime?',
                        'Identify bottleneck risks & resource contention',
                        'Audit security context & RBAC exposure',
                        'Generate an optimal HPA autoscale policy'
                      ].map((promptText) => (
                        <button
                          key={promptText}
                          onClick={() => handleAskQuestion(promptText)}
                          disabled={askingAi}
                          className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-sky-500/40 text-xs text-zinc-300 hover:text-sky-300 transition cursor-pointer font-mono text-[11px] disabled:opacity-50"
                        >
                          ⚡ {promptText}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Input Box */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={userQuestion}
                      onChange={(e) => setUserQuestion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAskQuestion();
                      }}
                      placeholder={`Ask anything about ${targetInfo.name}...`}
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-sky-500"
                    />
                    <button
                      onClick={() => handleAskQuestion()}
                      disabled={!userQuestion.trim() || askingAi}
                      className="px-4 py-2.5 bg-sky-500 hover:bg-sky-400 text-zinc-950 font-bold rounded-xl text-xs font-mono flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {askingAi ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      <span>Ask</span>
                    </button>
                  </div>

                  {/* Custom AI Answer */}
                  {askingAi && (
                    <div className="p-6 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center space-y-2">
                      <Loader2 className="w-6 h-6 text-sky-400 animate-spin mx-auto" />
                      <div className="text-xs font-mono text-zinc-300">
                        Analyzing Kubernetes cluster state and reasoning...
                      </div>
                    </div>
                  )}

                  {customAnswer && !askingAi && (
                    <div className="p-4 rounded-xl bg-zinc-900 border border-sky-500/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-sky-400 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>AI Answer</span>
                        </span>
                        <button
                          onClick={() => handleCopy(customAnswer)}
                          className="text-[10px] font-mono text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Copy Answer</span>
                        </button>
                      </div>
                      <div className="text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed font-mono bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
                        {customAnswer}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ==========================================
            4. MODAL FOOTER
            ========================================== */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-mono">
            <span>SkyOps Architecture Intelligence</span>
            <span>•</span>
            <span>{clusterSummary.totalNodes} Nodes / {clusterSummary.totalWorkloads} Workloads</span>
          </div>

          <div className="flex items-center gap-2">
            {targetInfo.resource && onSelectResource && (
              <button
                onClick={() => {
                  onSelectResource(targetInfo.resource!);
                  onClose();
                }}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-mono text-xs rounded-lg transition cursor-pointer flex items-center gap-1.5"
              >
                <span>Full Details</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-sky-500 hover:bg-sky-400 text-zinc-950 font-bold rounded-lg transition cursor-pointer font-mono text-xs"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
