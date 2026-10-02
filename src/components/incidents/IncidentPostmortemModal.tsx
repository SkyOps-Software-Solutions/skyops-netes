import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileText,
  Lightbulb,
  Maximize2,
  RefreshCw,
  Shield,
  ShieldAlert,
  Sparkles,
  X
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Incident, IncidentPostmortem } from '../../types/index';
import { formatIncidentDetectedDateTime, formatTimeAgo } from '../../utils/date';

interface IncidentPostmortemModalProps {
  incident: Incident;
  isOpen: boolean;
  onClose: () => void;
  onOpenPreDeploymentGate?: () => void;
}

export const IncidentPostmortemModal: React.FC<IncidentPostmortemModalProps> = ({
  incident,
  isOpen,
  onClose,
  onOpenPreDeploymentGate
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [postmortem, setPostmortem] = useState<IncidentPostmortem | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPostmortem = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getPostmortem(incident.id);
      setPostmortem(res.postmortem);
    } catch (err: any) {
      console.warn('Failed to load postmortem:', err);
      setError(err?.message || 'Failed to load postmortem report');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.generatePostmortem(incident.id);
      setPostmortem(res.postmortem);
    } catch (err: any) {
      console.error('Failed to regenerate postmortem:', err);
      setError(err?.message || 'Failed to regenerate postmortem');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPostmortem();
    }
  }, [isOpen, incident.id]);

  if (!isOpen) return null;

  const copyAsMarkdown = () => {
    if (!postmortem) return;

    const md = `# ${postmortem.title}

**Incident ID:** ${postmortem.incidentId}
**Cluster:** ${postmortem.clusterName} (${postmortem.namespace})
**Target Resource:** ${postmortem.resourceKind}/${postmortem.resourceName}
**Duration:** ${postmortem.durationMinutes} minutes
**Detected At:** ${formatIncidentDetectedDateTime(postmortem.detectionTime)}
**Resolved At:** ${formatIncidentDetectedDateTime(postmortem.resolvedTime)}

---

## 1. Executive Summary
${postmortem.impactSummary}

## 2. Root Cause & Confidence
**Root Cause:** ${postmortem.rootCause}
**Confidence Score:** ${Math.round(postmortem.rootCauseConfidence * 100)}%

## 3. Evidence Breakdown
${postmortem.evidence.map((e) => `- **[${e.category}]** ${e.text}`).join('\n')}

## 4. Chronological Timeline
${postmortem.timeline.map((t) => `- **${t.timeFormatted}** (${t.category}): ${t.label} ${t.details ? `— ${t.details}` : ''}`).join('\n')}

## 5. Resolution & Verification
- **Resolution:** ${postmortem.resolution}
- **Verification:** ${postmortem.verification}
${postmortem.rollbackDetails ? `- **Rollback Details:** ${postmortem.rollbackDetails}` : ''}

## 6. Preventive Actions
${postmortem.preventiveActions.map((a) => `- [ ] **[${a.category}]** ${a.action} (${a.status})`).join('\n')}
`;

    navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div
        className="w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-zinc-100"
        role="dialog"
        aria-modal="true"
        aria-label="Incident Postmortem"
      >
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 bg-zinc-900/60 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Automated Incident Postmortem
              </span>
              <span className="text-zinc-500 text-xs font-mono">{incident.id}</span>
            </div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-400" />
              {postmortem?.title || `Postmortem: ${incident.title}`}
            </h2>
            <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400 mt-2">
              <span>
                Workload: <strong className="text-zinc-200 font-mono">{incident.resourceKind}/{incident.resourceName}</strong>
              </span>
              <span>•</span>
              <span>
                Namespace: <strong className="text-zinc-200 font-mono">{incident.namespace}</strong>
              </span>
              <span>•</span>
              <span>
                Duration: <strong className="text-emerald-400 font-mono">{postmortem?.durationMinutes || 14}m</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyAsMarkdown}
              disabled={!postmortem}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-white transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied Markdown' : 'Copy Postmortem'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Close (ESC)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && !postmortem ? (
            <div className="py-16 flex flex-col items-center justify-center text-center">
              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mb-3" />
              <p className="text-sm font-semibold text-white">Synthesizing incident postmortem...</p>
              <p className="text-xs text-zinc-500 mt-1">Aggregating timeline, evidence, and prevention checklist</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-300">
              {error}
            </div>
          ) : postmortem ? (
            <div className="space-y-6">
              {/* Executive Summary */}
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                  1. Executive Summary & Impact
                </span>
                <p className="text-sm text-zinc-200 leading-relaxed font-sans">
                  {postmortem.impactSummary}
                </p>
              </div>

              {/* Root Cause & Confidence */}
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                    2. Identified Root Cause
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Sparkles className="w-3.5 h-3.5" />
                    {Math.round(postmortem.rootCauseConfidence * 100)}% Confidence
                  </span>
                </div>
                <div className="text-sm font-mono text-emerald-300 bg-zinc-950 p-3 rounded-lg border border-emerald-500/20">
                  {postmortem.rootCause}
                </div>
              </div>

              {/* Grounded Evidence Classification */}
              <div className="space-y-3">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block">
                  3. Grounded Evidence Breakdown (FACT vs INFERENCE vs RECOMMENDATION)
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {postmortem.evidence.map((ev, idx) => {
                    const isFact = ev.category === 'FACT';
                    const isInference = ev.category === 'INFERENCE';
                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl border space-y-1.5 text-xs ${
                          isFact
                            ? 'border-emerald-500/30 bg-emerald-500/5'
                            : isInference
                            ? 'border-purple-500/30 bg-purple-500/5'
                            : 'border-blue-500/30 bg-blue-500/5'
                        }`}
                      >
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider block ${
                            isFact
                              ? 'text-emerald-400'
                              : isInference
                              ? 'text-purple-400'
                              : 'text-blue-400'
                          }`}
                        >
                          {ev.category}
                        </span>
                        <p className="text-zinc-300 leading-normal">{ev.text}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Chronological Timeline */}
              <div className="space-y-3">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block">
                  4. Chronological Incident Sequence
                </span>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 divide-y divide-zinc-800/80">
                  {postmortem.timeline.map((item, idx) => (
                    <div key={idx} className="py-2.5 first:pt-0 last:pb-0 flex items-start gap-3 text-xs">
                      <span className="font-mono text-zinc-500 w-28 shrink-0">{item.timeFormatted}</span>
                      <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 shrink-0">
                        {item.category}
                      </span>
                      <div className="flex-1">
                        <span className="text-white font-medium">{item.label}</span>
                        {item.details && <span className="text-zinc-400 ml-1.5">— {item.details}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Resolution & Post-Action Verification */}
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-2 text-xs">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block">
                  5. Resolution & Verification Proof
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 uppercase block mb-1">Applied Fix</span>
                    <p className="text-zinc-200 font-medium">{postmortem.resolution}</p>
                  </div>
                  <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                    <span className="text-[10px] text-emerald-400 uppercase block mb-1">Health Verification</span>
                    <p className="text-emerald-300 font-medium">{postmortem.verification}</p>
                  </div>
                </div>
              </div>

              {/* Repeat Prevention Actions */}
              <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-950/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-purple-400 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" />
                    6. Repeat Incident Prevention Plan
                  </span>
                  {onOpenPreDeploymentGate && (
                    <button
                      onClick={onOpenPreDeploymentGate}
                      className="px-2.5 py-1 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 text-xs font-semibold flex items-center gap-1"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Test Pre-Deployment Gate
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {postmortem.preventiveActions.map((action) => (
                    <div
                      key={action.id}
                      className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between text-xs gap-3"
                    >
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                        <div>
                          <span className="text-white font-medium">{action.action}</span>
                          <span className="text-[10px] font-mono text-zinc-500 ml-2">[{action.category}]</span>
                        </div>
                      </div>

                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                        {action.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-xs">
          <button
            onClick={handleRegenerate}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            Regenerate Postmortem
          </button>

          <button
            onClick={onClose}
            className="px-5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
