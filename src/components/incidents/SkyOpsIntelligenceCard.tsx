import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  FileCheck,
  FileQuestion,
  Gauge,
  GitBranch,
  GitCommit,
  History,
  Info,
  Layers,
  Lock,
  Network,
  Radio,
  RefreshCw,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  XCircle,
  Zap
} from 'lucide-react';
import {
  ChangeCorrelation,
  CorrelatedSignal,
  DetectedAnomaly,
  HistoricalBaseline,
  IntelligenceAnalysis,
  ResourceRelationship,
  RootCauseHypothesis,
  SignalCategory,
  TemporalEvent,
  TemporalPhaseSummary,
  UnifiedEvidence
} from '../../types';
import { ProvenanceBadge, ProvenanceType } from '../common/Badges';

interface SkyOpsIntelligenceCardProps {
  intelligence?: IntelligenceAnalysis | null;
  loading?: boolean;
  onRefresh?: () => void;
}

export const SkyOpsIntelligenceCard: React.FC<SkyOpsIntelligenceCardProps> = ({
  intelligence,
  loading = false,
  onRefresh
}) => {
  const [activeTab, setActiveTab] = useState<
    'hypotheses' | 'temporal' | 'anomalies' | 'evidence' | 'signals' | 'relationships' | 'explainability'
  >('hypotheses');
  const [selectedSignalCategory, setSelectedSignalCategory] = useState<string>('ALL');
  const [selectedEvidenceRelevance, setSelectedEvidenceRelevance] = useState<string>('ALL');
  const [expandedHypothesis, setExpandedHypothesis] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 shadow-xs space-y-3">
        <div className="flex items-center gap-2.5">
          <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
          <span className="text-xs font-mono font-semibold text-zinc-300">
            Running Deterministic Kubernetes Intelligence Engine...
          </span>
        </div>
      </div>
    );
  }

  if (!intelligence) {
    return null;
  }

  const {
    rootCause,
    confidence,
    confidenceLevel,
    confidenceExplanation,
    primaryHypothesis,
    evaluatedHypotheses = [],
    signals = [],
    relationships = [],
    explainability,
    executableProposal,
    isUnknownOrInconclusive,
    baselines = [],
    anomalies = [],
    correlatedChanges = [],
    temporalPhases = { before: [], during: [], after: [] },
    unifiedEvidence = [],
    unknownFactors = []
  } = intelligence;

  // Filter signals
  const filteredSignals =
    selectedSignalCategory === 'ALL'
      ? signals
      : signals.filter((s) => s.category === selectedSignalCategory);

  // Filter evidence
  const filteredEvidence =
    selectedEvidenceRelevance === 'ALL'
      ? unifiedEvidence
      : unifiedEvidence.filter((e) => e.relevance === selectedEvidenceRelevance);

  const getConfidenceBadgeColor = (level: string) => {
    switch (level) {
      case 'HIGH':
        return 'text-emerald-300 bg-emerald-950/80 border-emerald-700/80';
      case 'MEDIUM':
        return 'text-amber-300 bg-amber-950/80 border-amber-700/80';
      case 'LOW':
      default:
        return 'text-zinc-400 bg-zinc-900 border-zinc-700';
    }
  };

  const getHypothesisStatusBadge = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            CONFIRMED
          </span>
        );
      case 'PLAUSIBLE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-950/80 text-sky-300 border border-sky-700">
            <Info className="w-3 h-3 text-sky-400" />
            PLAUSIBLE
          </span>
        );
      case 'REFUTED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950/80 text-rose-300 border border-rose-800">
            <XCircle className="w-3 h-3 text-rose-400" />
            REFUTED
          </span>
        );
      case 'UNKNOWN':
      case 'INSUFFICIENT_EVIDENCE':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-900 text-zinc-400 border border-zinc-750">
            <Info className="w-3 h-3 text-zinc-400" />
            UNKNOWN
          </span>
        );
    }
  };

  const getBaselineQualityBadge = (quality: string) => {
    switch (quality) {
      case 'HIGH':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-700';
      case 'MEDIUM':
        return 'bg-sky-950/80 text-sky-300 border-sky-700';
      case 'LOW':
        return 'bg-amber-950/80 text-amber-300 border-amber-700';
      case 'INSUFFICIENT':
      default:
        return 'bg-zinc-900 text-zinc-400 border-zinc-700';
    }
  };

  const getCorrelationBadge = (strength: string) => {
    switch (strength) {
      case 'STRONG':
        return 'bg-rose-950/80 text-rose-300 border-rose-700';
      case 'MEDIUM':
        return 'bg-amber-950/80 text-amber-300 border-amber-700';
      case 'WEAK':
      default:
        return 'bg-zinc-900 text-zinc-400 border-zinc-700';
    }
  };

  const totalTemporalEvents =
    (temporalPhases.before?.length || 0) +
    (temporalPhases.during?.length || 0) +
    (temporalPhases.after?.length || 0);

  const signalCategories: Array<{ id: string; label: string; count: number }> = [
    { id: 'ALL', label: 'All Signals', count: signals.length },
    { id: 'FACT', label: 'Facts', count: signals.filter((s) => s.category === 'FACT').length },
    { id: 'DERIVED_FACT', label: 'Derived Facts', count: signals.filter((s) => s.category === 'DERIVED_FACT').length },
    { id: 'INFERENCE', label: 'Inferences', count: signals.filter((s) => s.category === 'INFERENCE').length }
  ];

  return (
    <div className="p-5 rounded-xl bg-linear-to-b from-zinc-900/90 via-zinc-900/60 to-zinc-950 border border-cyan-900/50 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Boxes className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-zinc-100 font-mono uppercase tracking-wider flex items-center gap-1.5">
                Authoritative Kubernetes Intelligence Engine
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-800/80">
                Deterministic
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5 font-mono">
              Signal correlation, relationship topology, and hypothesis scoring
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="px-2.5 py-1 text-xs font-mono font-medium rounded-lg text-zinc-400 hover:text-zinc-200 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Re-correlate
            </button>
          )}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-[10px] font-mono text-zinc-400">
            <Lock className="w-3 h-3 text-cyan-400" />
            <span>Telemetry Authoritative</span>
          </div>
        </div>
      </div>

      {/* Primary Intelligence Banner: Root Cause & Authoritative Confidence */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 text-xs">
        {/* Left: Authoritative Root Cause Assessment (8 cols) */}
        <div className="lg:col-span-8 p-3.5 bg-zinc-950/90 rounded-lg border border-zinc-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase font-bold text-cyan-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              Authoritative Root Cause Verdict
            </span>
            {isUnknownOrInconclusive ? (
              <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800">
                INSUFFICIENT EVIDENCE
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                CONFIRMED BY TELEMETRY
              </span>
            )}
          </div>
          <p className="text-zinc-100 text-xs font-semibold leading-relaxed font-sans bg-zinc-900/60 p-2.5 rounded border border-zinc-800/60">
            {rootCause}
          </p>
          {primaryHypothesis && (
            <div className="text-[11px] text-zinc-400 font-mono flex items-center gap-2">
              <span className="text-zinc-500">Selected Hypothesis:</span>
              <span className="text-zinc-200 font-semibold">{primaryHypothesis.title}</span>
              <span className="text-zinc-500">({primaryHypothesis.category})</span>
            </div>
          )}
        </div>

        {/* Right: Confidence Metric & Safety Boundaries (4 cols) */}
        <div className="lg:col-span-4 p-3.5 bg-zinc-950/90 rounded-lg border border-zinc-800/80 flex flex-col justify-between gap-2.5">
          <div>
            <span className="text-[10px] font-mono uppercase font-bold text-zinc-400 block mb-1">
              Authoritative Confidence
            </span>
            <div className="flex items-center gap-2">
              <div
                className={`px-2.5 py-1 rounded-md border font-mono font-bold text-base ${getConfidenceBadgeColor(
                  confidenceLevel
                )}`}
              >
                {Math.round(confidence * 100)}%
              </div>
              <div className="text-[11px] text-zinc-300 leading-tight">
                <span className="font-semibold block text-zinc-200">{confidenceLevel} CERTAINTY</span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {confidenceExplanation || 'Grounded on live Kubernetes cluster state'}
                </span>
              </div>
            </div>
          </div>

          {/* Safety & Execution Policy Indicator */}
          <div className="p-2 rounded bg-zinc-900 border border-zinc-800 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <div className="text-[10px] font-mono">
              <span className="text-zinc-200 font-bold block">Execution Safety Boundary</span>
              <span className="text-zinc-400 text-[9px]">
                {executableProposal?.isExecutable
                  ? 'Safe mutation candidate (Pod image swap)'
                  : 'Read-only / Controller mutation restricted'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-zinc-800/70 pb-2 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('hypotheses')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'hypotheses'
              ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/40 font-bold'
              : 'text-zinc-400 hover:text-zinc-200 bg-zinc-950 border border-zinc-800'
          }`}
        >
          Hypotheses Matrix ({evaluatedHypotheses.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('temporal')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'temporal'
              ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/40 font-bold'
              : 'text-zinc-400 hover:text-zinc-200 bg-zinc-950 border border-zinc-800'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-cyan-400" />
          Temporal Intelligence ({totalTemporalEvents || correlatedChanges.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('anomalies')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'anomalies'
              ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/40 font-bold'
              : 'text-zinc-400 hover:text-zinc-200 bg-zinc-950 border border-zinc-800'
          }`}
        >
          <Gauge className="w-3.5 h-3.5 text-amber-400" />
          Baselines & Anomalies ({anomalies.length + baselines.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('evidence')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'evidence'
              ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/40 font-bold'
              : 'text-zinc-400 hover:text-zinc-200 bg-zinc-950 border border-zinc-800'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          Unified Evidence ({unifiedEvidence.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('signals')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'signals'
              ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/40 font-bold'
              : 'text-zinc-400 hover:text-zinc-200 bg-zinc-950 border border-zinc-800'
          }`}
        >
          Correlated Signals ({signals.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('relationships')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'relationships'
              ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/40 font-bold'
              : 'text-zinc-400 hover:text-zinc-200 bg-zinc-950 border border-zinc-800'
          }`}
        >
          Topology Graph ({relationships.length})
        </button>

        {explainability && (
          <button
            type="button"
            onClick={() => setActiveTab('explainability')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'explainability'
                ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/40 font-bold'
                : 'text-zinc-400 hover:text-zinc-200 bg-zinc-950 border border-zinc-800'
            }`}
          >
            Explainability Report
          </button>
        )}
      </div>

      {/* TAB 1: HYPOTHESES MATRIX */}
      {activeTab === 'hypotheses' && (
        <div className="space-y-3">
          <div className="space-y-2">
            {evaluatedHypotheses.map((hyp) => {
              const isSelected = hyp.id === primaryHypothesis?.id;
              const isExpanded = expandedHypothesis === hyp.id;

              return (
                <div
                  key={hyp.id}
                  className={`p-3.5 rounded-lg border transition-all ${
                    isSelected
                      ? 'bg-cyan-950/20 border-cyan-800/70 ring-1 ring-cyan-500/30'
                      : 'bg-zinc-950/70 border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getHypothesisStatusBadge(hyp.status)}
                        <span className="font-mono text-xs font-bold text-zinc-200">{hyp.title}</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800">
                          {hyp.category}
                        </span>
                        {isSelected && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-700">
                            PRIMARY
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed font-sans">{hyp.description}</p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <span className="text-[10px] font-mono text-zinc-500 block uppercase">Score</span>
                        <span className="text-sm font-mono font-bold text-cyan-400">{hyp.score}/100</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedHypothesis(isExpanded ? null : hyp.id)}
                        className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                        title={isExpanded ? 'Collapse evidence' : 'Expand evidence'}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Why Selected or Rejected */}
                  {hyp.whySelectedOrRejected && (
                    <div className="mt-2 text-[11px] font-mono text-zinc-400 bg-zinc-900/80 p-2 rounded border border-zinc-800/60">
                      <span className="text-zinc-500 font-bold uppercase mr-1">Verdict rationale:</span>
                      <span className="text-zinc-300">{hyp.whySelectedOrRejected}</span>
                    </div>
                  )}

                  {/* Expandable Evidence Breakdown */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-zinc-800/80 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                      {/* Supporting Evidence */}
                      <div className="p-2.5 rounded bg-zinc-900/60 border border-zinc-800/60 space-y-1.5">
                        <span className="text-[10px] font-bold text-emerald-400 uppercase flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Supporting Evidence ({hyp.supportingEvidence?.length || 0})
                        </span>
                        {hyp.supportingEvidence && hyp.supportingEvidence.length > 0 ? (
                          <ul className="space-y-1 text-[11px] text-zinc-300">
                            {hyp.supportingEvidence.map((ev, idx) => (
                              <li key={idx} className="flex items-start gap-1.5">
                                <span className="text-emerald-400 mt-0.5">•</span>
                                <div>
                                  <span>{ev.description}</span>
                                  <span className="text-zinc-500 text-[10px] ml-1">({ev.source})</span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[10px] text-zinc-500 italic">No direct supporting signals</p>
                        )}
                      </div>

                      {/* Contradicting Evidence */}
                      <div className="p-2.5 rounded bg-zinc-900/60 border border-zinc-800/60 space-y-1.5">
                        <span className="text-[10px] font-bold text-rose-400 uppercase flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          Contradicting Evidence ({hyp.contradictingEvidence?.length || 0})
                        </span>
                        {hyp.contradictingEvidence && hyp.contradictingEvidence.length > 0 ? (
                          <ul className="space-y-1 text-[11px] text-zinc-300">
                            {hyp.contradictingEvidence.map((ev, idx) => (
                              <li key={idx} className="flex items-start gap-1.5">
                                <span className="text-rose-400 mt-0.5">•</span>
                                <div>
                                  <span>{ev.description}</span>
                                  <span className="text-zinc-500 text-[10px] ml-1">({ev.source})</span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[10px] text-zinc-500 italic">No contradicting signals observed</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: CORRELATED SIGNALS WITH PROVENANCE */}
      {activeTab === 'signals' && (
        <div className="space-y-3">
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {signalCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedSignalCategory(cat.id)}
                className={`px-2.5 py-1 rounded text-xs font-mono transition-colors whitespace-nowrap cursor-pointer ${
                  selectedSignalCategory === cat.id
                    ? 'bg-zinc-800 text-cyan-300 font-bold border border-cyan-500/40'
                    : 'text-zinc-400 hover:text-zinc-200 bg-zinc-950 border border-zinc-800'
                }`}
              >
                {cat.label} ({cat.count})
              </button>
            ))}
          </div>

          <div className="divide-y divide-zinc-800/70 border border-zinc-800/80 rounded-lg bg-zinc-950/80 overflow-hidden max-h-96 overflow-y-auto">
            {filteredSignals.length > 0 ? (
              filteredSignals.map((sig) => (
                <div key={sig.id} className="p-3 hover:bg-zinc-900/40 text-xs font-mono space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <ProvenanceBadge type={sig.category as ProvenanceType} />
                      <span className="font-bold text-zinc-200">
                        {sig.resourceKind}/{sig.resourceName}
                      </span>
                      {sig.namespace && (
                        <span className="text-zinc-500 text-[10px]">({sig.namespace})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                      <span className="px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                        src: {sig.source}
                      </span>
                      <span>{new Date(sig.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>

                  <p className="text-zinc-300 text-xs leading-relaxed font-sans">{sig.description}</p>

                  <div className="flex items-center gap-3 text-[10px] text-zinc-400 pt-1">
                    <span className="text-zinc-500">Property: <strong className="text-zinc-300">{sig.property}</strong></span>
                    {sig.value !== undefined && (
                      <span className="text-zinc-500">
                        Observed: <strong className="text-cyan-300">{String(sig.value)}</strong>
                      </span>
                    )}
                    {sig.weight && (
                      <span className="text-zinc-500">Weight: {sig.weight}/5</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-zinc-500 font-mono text-xs">
                No signals found for this filter category.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: KUBERNETES TOPOLOGY & RELATIONSHIPS */}
      {activeTab === 'relationships' && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-400 font-mono">
            Authoritative Kubernetes graph relationships derived from cluster API specs and controller ownership:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {relationships.length > 0 ? (
              relationships.map((rel, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border text-xs font-mono space-y-2 ${
                    rel.isImpacted
                      ? 'bg-amber-950/20 border-amber-800/60'
                      : 'bg-zinc-950/80 border-zinc-800/80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-bold text-zinc-200 truncate">
                      <span>{rel.source.kind}/{rel.source.name}</span>
                      <ArrowRight className="w-3 h-3 text-cyan-400 shrink-0" />
                      <span>{rel.target.kind}/{rel.target.name}</span>
                    </div>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-zinc-900 text-cyan-300 border border-zinc-800 shrink-0">
                      {rel.relation}
                    </span>
                  </div>

                  {rel.details && (
                    <p className="text-zinc-400 text-[11px] font-sans leading-relaxed">
                      {rel.details}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1 border-t border-zinc-800/60">
                    <span>
                      Namespace: {rel.source.namespace || rel.target.namespace || 'cluster-scoped'}
                    </span>
                    {rel.isImpacted ? (
                      <span className="text-amber-400 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Impacted by Incident
                      </span>
                    ) : (
                      <span className="text-emerald-400">Normal State</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-2 p-6 text-center text-zinc-500 font-mono text-xs border border-zinc-800 rounded-lg">
                No cross-resource topology relationships mapped for this incident.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: TEMPORAL INTELLIGENCE & FLOW */}
      {activeTab === 'temporal' && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-lg bg-zinc-950/90 border border-zinc-800/80">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[10px] font-mono uppercase font-bold text-cyan-400">
                Temporal Causal Chain & Timeline Partitioning
              </span>
              <span className="text-[10px] font-mono text-zinc-500">
                Categorized by incident arrival boundaries
              </span>
            </div>
            <p className="text-xs text-zinc-300 font-sans">
              Events and changes are deterministically partitioned into antecedent conditions before the incident, concurrent anomalies during failure propagation, and post-incident stabilization checks.
            </p>
          </div>

          {/* 3-Phase Layout */}
          <div className="space-y-4">
            {/* Phase 1: BEFORE INCIDENT */}
            <div className="p-4 rounded-lg bg-zinc-950/70 border border-zinc-800/80 space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-950/80 text-purple-300 border border-purple-800">
                    PHASE 1: BEFORE INCIDENT
                  </span>
                  <span className="text-xs font-mono text-zinc-300 font-semibold">
                    Antecedent Changes & Deployments ({temporalPhases.before?.length || 0})
                  </span>
                </div>
                <span className="text-[10px] font-mono text-zinc-500">Lookback: Prior 24 hours</span>
              </div>

              {temporalPhases.before && temporalPhases.before.length > 0 ? (
                <div className="space-y-2.5">
                  {temporalPhases.before.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-3 rounded-lg bg-zinc-900/90 border border-zinc-800 text-xs font-mono space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <GitCommit className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          <span className="font-bold text-zinc-200">{ev.summary}</span>
                        </div>
                        {ev.relativeTimeDisplay && (
                          <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
                            {ev.relativeTimeDisplay}
                          </span>
                        )}
                      </div>
                      {ev.details && (
                        <div className="text-[11px] text-zinc-400 font-sans pl-5 space-y-0.5">
                          {ev.details.explanation && (
                            <p className="text-zinc-300">{ev.details.explanation}</p>
                          )}
                          {ev.details.attribute && (
                            <p className="text-[10px] font-mono text-zinc-500">
                              Modified: <code className="text-cyan-400">{ev.details.attribute}</code>
                              {ev.details.oldValue !== undefined && (
                                <span> ({String(ev.details.oldValue)} → {String(ev.details.newValue)})</span>
                              )}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 text-center text-xs font-mono text-zinc-500 bg-zinc-900/40 rounded border border-zinc-850">
                  No antecedent deployment changes or config modifications detected prior to incident.
                </div>
              )}
            </div>

            {/* Phase 2: DURING INCIDENT */}
            <div className="p-4 rounded-lg bg-zinc-950/70 border border-zinc-800/80 space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950/80 text-rose-300 border border-rose-800">
                    PHASE 2: DURING INCIDENT
                  </span>
                  <span className="text-xs font-mono text-zinc-300 font-semibold">
                    Failure Triggers, State Transitions & Anomalies ({temporalPhases.during?.length || 0})
                  </span>
                </div>
                <span className="text-[10px] font-mono text-zinc-500">Active Outage Window</span>
              </div>

              {temporalPhases.during && temporalPhases.during.length > 0 ? (
                <div className="space-y-2.5">
                  {temporalPhases.during.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-3 rounded-lg bg-zinc-900/90 border border-zinc-800 text-xs font-mono space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          {ev.eventType === 'ANOMALY_DETECTED' ? (
                            <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          )}
                          <span className="font-bold text-zinc-200">{ev.summary}</span>
                        </div>
                        {ev.relativeTimeDisplay && (
                          <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
                            {ev.relativeTimeDisplay}
                          </span>
                        )}
                      </div>
                      {ev.details && ev.details.deviation && (
                        <div className="text-[11px] text-amber-300/90 font-sans pl-5">
                          {String(ev.details.deviation)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 text-center text-xs font-mono text-zinc-500 bg-zinc-900/40 rounded border border-zinc-850">
                  No concurrent anomalies recorded during failure window.
                </div>
              )}
            </div>

            {/* Phase 3: AFTER INCIDENT */}
            <div className="p-4 rounded-lg bg-zinc-950/70 border border-zinc-800/80 space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                    PHASE 3: AFTER / RESOLUTION
                  </span>
                  <span className="text-xs font-mono text-zinc-300 font-semibold">
                    Post-Incident Verification & Stabilization ({temporalPhases.after?.length || 0})
                  </span>
                </div>
                <span className="text-[10px] font-mono text-zinc-500">Recovery Lifecycle</span>
              </div>

              {temporalPhases.after && temporalPhases.after.length > 0 ? (
                <div className="space-y-2.5">
                  {temporalPhases.after.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-3 rounded-lg bg-zinc-900/90 border border-zinc-800 text-xs font-mono space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="font-bold text-zinc-200">{ev.summary}</span>
                        </div>
                        {ev.relativeTimeDisplay && (
                          <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
                            {ev.relativeTimeDisplay}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 text-center text-xs font-mono text-zinc-500 bg-zinc-900/40 rounded border border-zinc-850">
                  Incident is currently active or awaiting post-remediation verification telemetry.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: BASELINES & ANOMALIES */}
      {activeTab === 'anomalies' && (
        <div className="space-y-4">
          {/* Section 1: Detected Anomalies */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase font-bold text-zinc-300 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Detected Operational Anomalies ({anomalies.length})
              </span>
              <span className="text-[10px] font-mono text-zinc-500">
                Evaluated against statistical baselines & K8s invariants
              </span>
            </div>

            {anomalies.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {anomalies.map((anom) => (
                  <div
                    key={anom.id}
                    className="p-3.5 rounded-lg bg-zinc-950/80 border border-zinc-800 text-xs font-mono space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-700">
                        {anom.anomalyType}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          anom.severity === 'CRITICAL'
                            ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                            : 'bg-zinc-900 text-zinc-400 border border-zinc-750'
                        }`}
                      >
                        {anom.severity}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-zinc-200 font-bold block">
                        {anom.resourceKind}/{anom.resourceName}
                      </span>
                      <div className="text-[11px] text-zinc-400 font-sans">
                        Observed: <strong className="text-zinc-200">{anom.observedDisplay}</strong>
                      </div>
                      <div className="text-[11px] text-amber-300 font-sans">
                        Deviation: {anom.deviationDisplay}
                      </div>
                    </div>

                    {anom.baselineValue !== undefined && (
                      <div className="pt-1.5 border-t border-zinc-850 flex items-center justify-between text-[10px] text-zinc-500">
                        <span>Baseline: {anom.baselineValue}</span>
                        <span>Confidence: {Math.round(anom.confidence * 100)}%</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-xs font-mono text-zinc-500 bg-zinc-950/60 rounded-lg border border-zinc-800">
                No active statistical anomalies detected on workload or cluster metrics.
              </div>
            )}
          </div>

          {/* Section 2: Historical Baselines */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase font-bold text-zinc-300 flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                Rolling Statistical Baselines ({baselines.length})
              </span>
              <span className="text-[10px] font-mono text-zinc-500">
                Spike-preserving min/max & percentiles
              </span>
            </div>

            {baselines.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {baselines.map((b) => (
                  <div
                    key={b.baselineId}
                    className="p-3.5 rounded-lg bg-zinc-950/80 border border-zinc-800 text-xs font-mono space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-zinc-200 truncate">{b.metric}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-bold border ${getBaselineQualityBadge(
                          b.quality
                        )}`}
                      >
                        {b.quality} QUALITY
                      </span>
                    </div>

                    {b.status === 'AVAILABLE' ? (
                      <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                        <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                          <span className="text-[9px] text-zinc-500 uppercase block">Median</span>
                          <span className="font-bold text-cyan-400">{b.median} {b.unit}</span>
                        </div>
                        <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                          <span className="text-[9px] text-zinc-500 uppercase block">Range</span>
                          <span className="font-bold text-zinc-300">{b.min} - {b.max}</span>
                        </div>
                        <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                          <span className="text-[9px] text-zinc-500 uppercase block">P95 / StdDev</span>
                          <span className="font-bold text-purple-400">{b.p95} (±{b.stdDev})</span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded bg-amber-950/20 border border-amber-900/40 text-amber-300 text-[11px] font-sans">
                        <span className="font-bold block uppercase text-[9px] text-amber-400 font-mono mb-0.5">
                          Baseline Unavailable
                        </span>
                        {b.unavailableReason || 'Insufficient historical samples (< 6 observations)'}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1 border-t border-zinc-850">
                      <span>Window: {b.timeWindow}</span>
                      <span>Observations: {b.sampleCount}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-xs font-mono text-zinc-500 bg-zinc-950/60 rounded-lg border border-zinc-800">
                No rolling baselines computed yet for cluster telemetry window.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: UNIFIED EVIDENCE */}
      {activeTab === 'evidence' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-zinc-300">
                Evidence Inventory ({filteredEvidence.length}/{unifiedEvidence.length})
              </span>
            </div>

            {/* Relevance Filters */}
            <div className="flex items-center gap-1">
              {['ALL', 'SUPPORTING', 'CONTRADICTING', 'CONTEXTUAL'].map((rel) => (
                <button
                  key={rel}
                  type="button"
                  onClick={() => setSelectedEvidenceRelevance(rel)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                    selectedEvidenceRelevance === rel
                      ? 'bg-zinc-800 text-cyan-300 font-bold border border-cyan-500/40'
                      : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                  }`}
                >
                  {rel}
                </button>
              ))}
            </div>
          </div>

          {/* Evidence Cards */}
          <div className="space-y-2.5">
            {filteredEvidence.map((ev) => (
              <div
                key={ev.id}
                className="p-3.5 rounded-lg bg-zinc-950/80 border border-zinc-800 text-xs font-mono space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        ev.relevance === 'SUPPORTING'
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                          : ev.relevance === 'CONTRADICTING'
                          ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                          : 'bg-zinc-900 text-zinc-400 border-zinc-750'
                      }`}
                    >
                      {ev.relevance}
                    </span>
                    <span className="font-bold text-zinc-200">{ev.sourceType}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <ProvenanceBadge
                      type={ev.provenance as ProvenanceType}
                      label={ev.provenance}
                    />
                    <span className="text-[10px] text-cyan-400 font-bold">
                      {Math.round(ev.confidence * 100)}% confidence
                    </span>
                  </div>
                </div>

                <p className="text-xs text-zinc-300 font-sans leading-relaxed">
                  {ev.description}
                </p>

                {ev.details && Object.keys(ev.details).length > 0 && (
                  <div className="p-2 rounded bg-zinc-900/80 border border-zinc-850 text-[11px] text-zinc-400 space-y-0.5">
                    {Object.entries(ev.details).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2">
                        <span className="text-zinc-500">{k}:</span>
                        <span className="text-zinc-300">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Section: Explicit Unknown Factors & Missing Telemetry */}
          {unknownFactors.length > 0 && (
            <div className="p-4 rounded-lg bg-amber-950/20 border border-amber-800/60 space-y-2">
              <div className="flex items-center gap-2 text-amber-400">
                <FileQuestion className="w-4 h-4 shrink-0" />
                <span className="text-xs font-mono font-bold uppercase">
                  Explicit Unknown Factors & Missing Telemetry ({unknownFactors.length})
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 font-sans">
                The following telemetry dimensions are absent or insufficient. SkyOps strictly refuses to fabricate data for missing observability layers:
              </p>
              <ul className="list-disc list-inside text-xs font-mono text-amber-200/90 space-y-1">
                {unknownFactors.map((uf, idx) => (
                  <li key={idx}>{uf}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: EXPLAINABILITY REPORT */}
      {activeTab === 'explainability' && explainability && (
        <div className="space-y-3 text-xs font-mono">
          <div className="p-3.5 rounded-lg bg-zinc-950/90 border border-zinc-800/80 space-y-2">
            <span className="text-[10px] font-mono uppercase font-bold text-cyan-400 block">
              Why Primary Root Cause Was Selected
            </span>
            <p className="text-zinc-200 leading-relaxed font-sans text-xs">
              {explainability.whySelected}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
            <div className="p-3 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
              <span className="text-zinc-500 text-[10px] block uppercase">Confirmed Facts</span>
              <span className="text-base font-bold text-emerald-400 font-mono">
                {explainability.evidenceSummary?.factCount || 0}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
              <span className="text-zinc-500 text-[10px] block uppercase">Derived Facts</span>
              <span className="text-base font-bold text-cyan-400 font-mono">
                {explainability.evidenceSummary?.derivedFactCount || 0}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
              <span className="text-zinc-500 text-[10px] block uppercase">Hypotheses Evaluated</span>
              <span className="text-base font-bold text-purple-400 font-mono">
                {evaluatedHypotheses.length}
              </span>
            </div>
          </div>

          {explainability.rejectedAlternatives && explainability.rejectedAlternatives.length > 0 && (
            <div className="p-3.5 rounded-lg bg-zinc-950/90 border border-zinc-800/80 space-y-2">
              <span className="text-[10px] font-mono uppercase font-bold text-zinc-400 block">
                Rejected Alternatives & Counter-Evidence
              </span>
              <div className="space-y-2">
                {explainability.rejectedAlternatives.map((alt) => (
                  <div key={alt.id} className="p-2 rounded bg-zinc-900 border border-zinc-800 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-zinc-200">{alt.title}</span>
                      <span className="text-[10px] text-zinc-500">Score: {alt.score}/100</span>
                    </div>
                    <p className="text-zinc-400 text-[11px] mt-1 font-sans">{alt.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {explainability.missingEvidence && explainability.missingEvidence.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-800/60 text-xs space-y-1">
              <span className="text-amber-400 font-bold text-[10px] uppercase block">
                Missing Evidence Required For Total Certainty
              </span>
              <ul className="list-disc list-inside text-zinc-300 text-[11px] space-y-0.5">
                {explainability.missingEvidence.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
