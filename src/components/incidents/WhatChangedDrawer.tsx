import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  Clock,
  ExternalLink,
  GitBranch,
  GitCommit,
  HelpCircle,
  History,
  Layers,
  Maximize2,
  RefreshCw,
  Sliders,
  Sparkles,
  X
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { ChangeCorrelationLevel, Incident, WhatChangedItem, WhatChangedReport } from '../../types/index';
import { formatIncidentDetectedDateTime } from '../../utils/date';

interface WhatChangedDrawerProps {
  incident: Incident;
  isOpen: boolean;
  onClose: () => void;
  onSelectResource?: (name: string, kind: string) => void;
}

export const WhatChangedDrawer: React.FC<WhatChangedDrawerProps> = ({
  incident,
  isOpen,
  onClose,
  onSelectResource
}) => {
  const [minutesBefore, setMinutesBefore] = useState<number>(15);
  const [minutesAfter, setMinutesAfter] = useState<number>(5);
  const [loading, setLoading] = useState<boolean>(false);
  const [report, setReport] = useState<WhatChangedReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterCorrelation, setFilterCorrelation] = useState<string>('all');

  const fetchReport = async (mBefore: number = minutesBefore, mAfter: number = minutesAfter) => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getWhatChanged(incident.id, {
        minutesBefore: mBefore,
        minutesAfter: mAfter
      });
      setReport(res.report);
    } catch (err: any) {
      console.error('Failed to fetch What Changed report:', err);
      setError(err?.message || 'Failed to analyze environment changes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchReport(minutesBefore, minutesAfter);
    }
  }, [isOpen, incident.id]);

  if (!isOpen) return null;

  const detectedTimeStr = formatIncidentDetectedDateTime(incident.firstSeenAt);

  const getCorrelationBadge = (correlation: ChangeCorrelationLevel) => {
    switch (correlation) {
      case 'Strong correlation':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Strong correlation
          </span>
        );
      case 'Relevant change':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            Relevant change
          </span>
        );
      case 'Possible contributor':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            Possible contributor
          </span>
        );
      case 'No direct correlation found':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
            No direct correlation found
          </span>
        );
    }
  };

  const filteredChanges = (report?.changes || []).filter((ch) => {
    if (filterCorrelation === 'all') return true;
    return ch.correlation === filterCorrelation;
  });

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl bg-zinc-950 border-l border-zinc-800 h-full flex flex-col shadow-2xl relative text-zinc-100"
        role="dialog"
        aria-modal="true"
        aria-label="What Changed Drawer"
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-800/80 bg-zinc-900/60 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Change Correlation Engine
              </span>
              <span className="text-zinc-500 text-xs font-mono">Incident {incident.id}</span>
            </div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <History className="w-5 h-5 text-amber-400" />
              WHAT CHANGED?
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Authoritative cluster diff comparing environment immediately before incident onset ({detectedTimeStr}).
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors"
            title="Close Drawer (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Time Window & Filter Controls */}
        <div className="px-5 py-3 border-b border-zinc-800/60 bg-zinc-900/30 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 flex items-center gap-1 font-medium">
              <Sliders className="w-3.5 h-3.5 text-zinc-500" />
              Window:
            </span>
            <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
              {[
                { label: '15m / 5m', before: 15, after: 5 },
                { label: '30m / 10m', before: 30, after: 10 },
                { label: '60m / 15m', before: 60, after: 15 }
              ].map((w) => (
                <button
                  key={w.label}
                  onClick={() => {
                    setMinutesBefore(w.before);
                    setMinutesAfter(w.after);
                    fetchReport(w.before, w.after);
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    minutesBefore === w.before
                      ? 'bg-amber-500/20 text-amber-300 font-semibold shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchReport(minutesBefore, minutesAfter)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 transition-colors disabled:opacity-50"
              title="Refresh change diffs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Summary Banner */}
          {report && (
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-white tracking-tight">
                    {report.changes.length} {report.changes.length === 1 ? 'change' : 'changes'} detected
                  </span>
                  {report.hasStrongCorrelation && (
                    <span className="text-xs px-2 py-0.5 rounded font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Strong Correlation Detected
                    </span>
                  )}
                </div>
                <span className="text-xs text-zinc-500 font-mono">
                  -{minutesBefore}m / +{minutesAfter}m window
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                {report.summaryText}
              </p>
            </div>
          )}

          {/* SRE Policy Notice: Causation Disclaimer */}
          <div className="p-3 rounded-lg border border-zinc-800/70 bg-zinc-900/20 flex items-start gap-2.5 text-xs text-zinc-400">
            <HelpCircle className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-zinc-300">SRE Anti-Hallucination Discipline:</span>{' '}
              SkyOps displays factual mutations observed around incident onset. Correlation indicates temporal or topological coincidence, not proven root causation, unless confirmed by pod exit codes or runtime logs.
            </div>
          </div>

          {/* Loading state */}
          {loading && !report && (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mb-3" />
              <p className="text-sm font-medium text-zinc-200">Correlating environment timeline...</p>
              <p className="text-xs text-zinc-500 mt-1">Comparing ReplicaSets, ConfigMaps, and images</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-300 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Failed to load change correlation</p>
                <p className="mt-1 text-red-400/90">{error}</p>
                <button
                  onClick={() => fetchReport(minutesBefore, minutesAfter)}
                  className="mt-2 px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 rounded text-red-200 font-medium"
                >
                  Retry Analysis
                </button>
              </div>
            </div>
          )}

          {/* Changes list */}
          {report && filteredChanges.length === 0 && (
            <div className="py-12 text-center border border-dashed border-zinc-800 rounded-xl p-6">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <h4 className="text-sm font-semibold text-white">No changes observed in time window</h4>
              <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
                No Deployment rollouts, ConfigMap revisions, or replica adjustments occurred within {minutesBefore} minutes prior to incident onset.
              </p>
            </div>
          )}

          {report && filteredChanges.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-zinc-400 border-b border-zinc-800 pb-2">
                <span className="font-semibold uppercase tracking-wider text-zinc-300">
                  Detected Modifications ({filteredChanges.length})
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-500">Filter:</span>
                  <select
                    value={filterCorrelation}
                    onChange={(e) => setFilterCorrelation(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5 text-zinc-300 text-xs focus:outline-none"
                  >
                    <option value="all">All levels</option>
                    <option value="Strong correlation">Strong correlation</option>
                    <option value="Relevant change">Relevant change</option>
                    <option value="Possible contributor">Possible contributor</option>
                    <option value="No direct correlation found">No direct correlation</option>
                  </select>
                </div>
              </div>

              {filteredChanges.map((change) => (
                <div
                  key={change.id}
                  className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:border-zinc-700/80 transition-all space-y-3"
                >
                  {/* Top Row: Resource Identity & Correlation Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white font-mono">
                          {change.resourceName}
                        </span>
                        <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                          {change.resourceKind}
                        </span>
                        <span className="text-xs text-zinc-500">
                          in <span className="font-mono text-zinc-400">{change.namespace}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-amber-400 font-medium">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{change.temporalDistance}</span>
                      </div>
                    </div>

                    <div>{getCorrelationBadge(change.correlation)}</div>
                  </div>

                  {/* Diff Block */}
                  <div className="rounded-lg bg-zinc-950 border border-zinc-800/80 p-3 space-y-2">
                    <div className="text-[11px] font-mono text-zinc-400 flex items-center justify-between">
                      <span className="text-zinc-500">Field:</span>
                      <span className="text-zinc-300 font-semibold">{change.field}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t border-zinc-900">
                      {/* Old Value */}
                      <div className="bg-red-500/5 border border-red-500/20 rounded p-2">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-red-400/80 block mb-1">
                          Previous State
                        </span>
                        <div className="text-xs font-mono text-zinc-300 break-all">
                          {String(change.oldValue ?? 'UNKNOWN')}
                        </div>
                      </div>

                      {/* New Value */}
                      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded p-2">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-400/80 block mb-1">
                          Current Mutation
                        </span>
                        <div className="text-xs font-mono text-emerald-300 font-bold break-all">
                          {String(change.newValue ?? 'NONE')}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Grounding Evidence */}
                  <div className="text-xs text-zinc-400 bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-850 flex items-start gap-2">
                    <span className="text-zinc-500 font-bold uppercase text-[10px] tracking-wider shrink-0 mt-0.5">
                      Grounding:
                    </span>
                    <span className="text-zinc-300 leading-normal">{change.evidence}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Deterministic Cluster Correlation</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
