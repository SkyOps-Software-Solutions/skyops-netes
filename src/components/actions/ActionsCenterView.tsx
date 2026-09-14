import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  History,
  Lock,
  RefreshCw,
  RotateCcw,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  XCircle,
  Zap
} from 'lucide-react';
import { api } from '../../api/client';
import { Incident, StructuredRemediation } from '../../types/index';

interface ActionsCenterViewProps {
  incidents: Incident[];
  onSelectIncident: (id: string) => void;
  onRefresh: () => void;
}

export const ActionsCenterView: React.FC<ActionsCenterViewProps> = ({
  incidents = [],
  onSelectIncident,
  onRefresh
}) => {
  const [remediations, setRemediations] = useState<StructuredRemediation[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [policy, setPolicy] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchActionsData = async () => {
    try {
      setLoading(true);
      const data = await api.getActionsHub();
      setRemediations(data.remediations || []);
      setActions(data.actions || []);
      setPolicy(data.policy || null);
    } catch (err) {
      console.warn('ActionsCenter fetch notice:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActionsData();
  }, []);

  const handleApprove = async (incidentId: string) => {
    try {
      setProcessingId(incidentId);
      await api.approveRemediation(incidentId);
      await fetchActionsData();
      onRefresh();
    } catch (err: any) {
      alert(`Approval error: ${err?.message || 'Failed to approve remediation'}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (incidentId: string) => {
    const reason = prompt('Reason for declining this remediation:');
    if (reason === null) return;

    try {
      setProcessingId(incidentId);
      await api.rejectRemediation(incidentId, reason);
      await fetchActionsData();
      onRefresh();
    } catch (err: any) {
      alert(`Decline error: ${err?.message || 'Failed to decline remediation'}`);
    } finally {
      setProcessingId(null);
    }
  };

  const pendingRemediations = remediations.filter(
    (r) => r.status === 'PROPOSED' || r.status === 'AWAITING_APPROVAL'
  );
  const activeOrExecuted = remediations.filter(
    (r) => r.status === 'APPROVED' || r.status === 'DISPATCHED' || r.status === 'EXECUTED' || r.status === 'VERIFIED'
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-zinc-100">Remediation & Actions Center</h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30">
              Safety Guardrails Active
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Supervised remediation queue, two-person safety approval, dry-run evaluation, and agent dispatch history
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchActionsData}
            disabled={loading}
            className="p-2 text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Refresh Action Queue"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Safety Policy Status Banner */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
              Remediation Policy:
              <span className="font-mono text-emerald-400 font-bold">
                {policy?.remediationMode || 'APPROVAL_REQUIRED'}
              </span>
            </div>
            <div className="text-[11px] text-zinc-400">
              All automated mutations require human operator verification before being dispatched to cluster agents.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-zinc-400">
          <span>
            Pending Approvals: <strong className="text-amber-400">{pendingRemediations.length}</strong>
          </span>
          <span>•</span>
          <span>
            Total Dispatched: <strong className="text-zinc-200">{actions.length}</strong>
          </span>
        </div>
      </div>

      {/* Section 1: Pending Approvals Queue */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            Remediations Awaiting Approval
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {pendingRemediations.length}
            </span>
          </h2>
        </div>

        {pendingRemediations.length === 0 ? (
          <div className="py-10 text-center text-xs text-zinc-500">
            <CheckCircle2 className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            No pending remediations awaiting approval.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/60">
            {pendingRemediations.map((rem) => {
              const incident = incidents.find((i) => i.id === rem.incidentId);

              return (
                <div key={rem.id || rem.incidentId} className="p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold">
                          {rem.actionType}
                        </span>
                        <h3 className="text-sm font-bold text-zinc-100">
                          {incident?.title || `Remediation for ${rem.incidentId}`}
                        </h3>
                        <span className="text-xs font-mono text-zinc-500">
                          ({incident?.resourceKind}/{incident?.resourceName})
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400">
                        {rem.reasoning?.summary || 'AI-recommended remediation to restore workload availability.'}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => onSelectIncident(rem.incidentId)}
                        className="px-3 py-1.5 text-xs font-medium rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors cursor-pointer"
                      >
                        Inspect Incident
                      </button>
                      <button
                        onClick={() => handleReject(rem.incidentId)}
                        disabled={processingId === rem.incidentId}
                        className="px-3 py-1.5 text-xs font-medium rounded bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/60 transition-colors cursor-pointer"
                      >
                        Decline
                      </button>
                      <button
                        onClick={() => handleApprove(rem.incidentId)}
                        disabled={processingId === rem.incidentId}
                        className="px-3.5 py-1.5 text-xs font-bold rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer shadow-md flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve & Dispatch
                      </button>
                    </div>
                  </div>

                  {/* Dry Run & Rollback Specs */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                    {rem.dryRun && (
                      <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 text-xs">
                        <div className="text-[10px] font-mono text-zinc-500 uppercase mb-1">
                          Dry-Run Safety Evaluation
                        </div>
                        <div className="font-mono text-zinc-300 text-[11px]">
                          Risk: <span className="text-emerald-400 font-bold">{rem.dryRun.estimatedRisk || 'LOW'}</span>{' '}
                          • Blast Radius: <span className="text-zinc-300">{rem.dryRun.blastRadius || 'Isolated Pod'}</span>
                        </div>
                      </div>
                    )}

                    {rem.rollbackInstructions && (
                      <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 text-xs">
                        <div className="text-[10px] font-mono text-zinc-500 uppercase mb-1">
                          Rollback Instruction
                        </div>
                        <div className="font-mono text-zinc-300 text-[11px] truncate">
                          {rem.rollbackInstructions}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2: Executed Actions & Audit Trail */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <History className="w-4 h-4 text-sky-400" />
            Dispatched Actions & Verification Audit
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
              {actions.length} Executed
            </span>
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/80 text-[11px] font-mono text-zinc-400">
                <th className="py-3 px-4">Action ID</th>
                <th className="py-3 px-4">Action Type</th>
                <th className="py-3 px-4">Target Incident</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Dispatched By</th>
                <th className="py-3 px-4">Telemetry Verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-sans">
              {actions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-500">
                    No actions have been dispatched yet.
                  </td>
                </tr>
              ) : (
                actions.map((act) => (
                  <tr key={act.id} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono text-zinc-300">{act.id}</td>
                    <td className="py-3 px-4 font-mono font-bold text-sky-400">{act.actionType}</td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => onSelectIncident(act.incidentId)}
                        className="font-mono text-sky-400 hover:underline cursor-pointer"
                      >
                        {act.incidentId}
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-medium ${
                          act.status === 'VERIFIED'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : act.status === 'EXECUTED'
                            ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                            : act.status === 'FAILED'
                            ? 'bg-red-500/10 text-red-400 border-red-500/30'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}
                      >
                        {act.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-zinc-400 font-mono text-[11px]">
                      {act.approvedBy?.name || 'Operator'}
                    </td>
                    <td className="py-3 px-4">
                      {act.status === 'VERIFIED' ? (
                        <span className="text-emerald-400 text-xs flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Passed
                        </span>
                      ) : act.status === 'EXECUTED' ? (
                        <span className="text-zinc-400 text-xs flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> Awaiting Scrape
                        </span>
                      ) : (
                        <span className="text-zinc-500 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
