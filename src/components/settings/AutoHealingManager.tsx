import React, { useEffect, useState } from 'react';
import {
  Zap,
  ShieldCheck,
  AlertTriangle,
  Lock,
  RefreshCw,
  Save,
  CheckCircle2,
  Server,
  Layers,
  Activity,
  RotateCcw
} from 'lucide-react';
import { api } from '../../api/client';
import { Cluster, RemediationPolicy, RemediationMode, CanonicalRemediationActionType } from '../../types/index';
import { Button } from '../common/UI';

interface AutoHealingManagerProps {
  clusters: Cluster[];
  onRefresh?: () => void;
}

export const AutoHealingManager: React.FC<AutoHealingManagerProps> = ({ clusters, onRefresh }) => {
  const safeClusters = Array.isArray(clusters) ? clusters : [];
  const [selectedClusterId, setSelectedClusterId] = useState<string>(safeClusters[0]?.id || '');
  const [policy, setPolicy] = useState<RemediationPolicy | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!selectedClusterId && safeClusters.length > 0) {
      setSelectedClusterId(safeClusters[0].id);
    }
  }, [safeClusters, selectedClusterId]);

  const loadPolicy = async (clusterId?: string) => {
    try {
      setLoading(true);
      setMessage(null);
      const res = await api.getRemediationPolicy(clusterId);
      if (res.policy) {
        setPolicy(res.policy);
      }
    } catch (err: any) {
      console.error('Failed to load remediation policy:', err);
      setMessage({ type: 'error', text: err?.message || 'Failed to load policy' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPolicy(selectedClusterId || undefined);
  }, [selectedClusterId]);

  const handleModeChange = (mode: RemediationMode) => {
    if (!policy) return;
    setPolicy({
      ...policy,
      remediationMode: mode
    });
  };

  const handleSavePolicy = async () => {
    if (!policy) return;
    try {
      setSaving(true);
      setMessage(null);
      const res = await api.updateRemediationPolicy(
        {
          remediationMode: policy.remediationMode,
          circuitBreakerThreshold: policy.circuitBreakerThreshold,
          maxAttemptsPerIncident: policy.maxAttemptsPerIncident,
          maxActionsPerHourPerCluster: policy.maxActionsPerHourPerCluster,
          autoRollbackEnabled: policy.autoRollbackEnabled !== false
        },
        selectedClusterId || undefined
      );
      if (res.policy) {
        setPolicy(res.policy);
        setMessage({
          type: 'success',
          text: `Auto-Healing policy saved for ${selectedClusterId ? `cluster "${safeClusters.find(c => c.id === selectedClusterId)?.name || selectedClusterId}"` : 'organization'}.`
        });
        if (onRefresh) onRefresh();
      }
    } catch (err: any) {
      console.error('Failed to save policy:', err);
      setMessage({ type: 'error', text: err?.message || 'Failed to save auto-healing policy' });
    } finally {
      setSaving(false);
    }
  };

  const currentMode = policy?.remediationMode || 'MANUAL_ONLY';

  return (
    <div className="space-y-6">
      {/* Cluster Scope Selector */}
      <div className="p-6 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xs font-bold text-zinc-200 font-mono uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4 text-sky-400" />
              Closed-Loop Auto-Healing & Safety Governance
            </h3>
            <p className="text-xs text-zinc-400 font-mono mt-1">
              Configure deterministic safety policies, human approval gates, and autonomous remediation boundaries.
            </p>
          </div>

          {safeClusters.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-zinc-400">Cluster Scope:</span>
              <select
                value={selectedClusterId}
                onChange={(e) => setSelectedClusterId(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-mono focus:outline-hidden focus:border-sky-500"
              >
                {safeClusters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.environment || 'production'})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Message Banner */}
        {message && (
          <div
            className={`p-3 rounded-lg border text-xs font-mono flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                : 'bg-rose-950/40 border-rose-800 text-rose-300'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* 3-State Auto-Healing Mode Toggle (Requirement 6) */}
        <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-mono font-bold text-zinc-100 uppercase tracking-wide flex items-center gap-2">
                Auto-Healing Mode
              </span>
              <span className="text-[11px] text-zinc-400 block mt-0.5">
                Controls whether SkyOps requires human operator sign-off before executing remediation actions.
              </span>
            </div>

            {/* 3-State Toggle */}
            <div className="inline-flex rounded-lg bg-zinc-900 p-1 border border-zinc-800 text-xs font-mono">
              <button
                type="button"
                onClick={() => handleModeChange('MANUAL_ONLY')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                  currentMode === 'MANUAL_ONLY'
                    ? 'bg-zinc-800 text-zinc-100 shadow-xs border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                OFF
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('APPROVAL_REQUIRED')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                  currentMode === 'APPROVAL_REQUIRED'
                    ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Approval Required
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('CONTROLLED_AUTONOMOUS')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                  currentMode === 'CONTROLLED_AUTONOMOUS'
                    ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Controlled Auto-Healing
              </button>
            </div>
          </div>

          {/* Mode Descriptions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className={`p-3 rounded-lg border text-xs font-mono ${
              currentMode === 'MANUAL_ONLY'
                ? 'bg-zinc-900/90 border-zinc-700 text-zinc-200'
                : 'bg-zinc-900/30 border-zinc-800/60 text-zinc-500'
            }`}>
              <div className="font-bold text-zinc-300 mb-1">OFF (Manual Only)</div>
              <p className="text-[11px] leading-relaxed">
                Default safety posture. SkyOps generates deterministic proposals, but no mutation will execute until an engineer clicks Fix / Approve.
              </p>
            </div>

            <div className={`p-3 rounded-lg border text-xs font-mono ${
              currentMode === 'APPROVAL_REQUIRED'
                ? 'bg-amber-950/20 border-amber-800 text-amber-200'
                : 'bg-zinc-900/30 border-zinc-800/60 text-zinc-500'
            }`}>
              <div className="font-bold text-amber-300 mb-1">Approval Required</div>
              <p className="text-[11px] leading-relaxed">
                AI diagnosis builds typed proposals with verification and rollback plans. Authorized operators review diffs and execute with one click.
              </p>
            </div>

            <div className={`p-3 rounded-lg border text-xs font-mono ${
              currentMode === 'CONTROLLED_AUTONOMOUS'
                ? 'bg-emerald-950/30 border-emerald-700 text-emerald-200'
                : 'bg-zinc-900/30 border-zinc-800/60 text-zinc-500'
            }`}>
              <div className="font-bold text-emerald-300 mb-1">Controlled Auto-Healing</div>
              <p className="text-[11px] leading-relaxed">
                Allowlisted low-risk deterministic actions execute automatically if all live preconditions, rate limits, and circuit breakers pass.
              </p>
            </div>
          </div>

          {/* Explicit Warning when Controlled Auto-Healing is selected (Requirement 6) */}
          {currentMode === 'CONTROLLED_AUTONOMOUS' && (
            <div className="p-3.5 rounded-lg bg-amber-950/40 border border-amber-600/60 flex items-start gap-3 text-xs text-amber-200">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold uppercase tracking-wider block">
                  Safety Warning: Autonomous Execution Active
                </span>
                <p className="leading-relaxed">
                  Controlled Auto-Healing permits SkyOps to execute approved low-risk remediation actions automatically.
                  Only allowlisted, deterministic actions (RestartPod, RolloutRestart, ReplacePodImage, RollbackDeployment) are permitted.
                  Destructive commands (node drain, namespace deletion, scaling to zero, arbitrary shell commands) are strictly blocked by the deterministic policy engine.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Safety & Circuit Breaker Guardrails */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="p-3.5 bg-zinc-950 rounded-lg border border-zinc-800 text-xs font-mono space-y-1">
            <span className="text-zinc-500 block uppercase text-[10px]">Circuit Breaker Limit</span>
            <span className="text-zinc-200 font-semibold text-sm">3 consecutive failures</span>
            <p className="text-[11px] text-zinc-400">Trips autonomous remediation lock and forces human takeover.</p>
          </div>

          <div className="p-3.5 bg-zinc-950 rounded-lg border border-zinc-800 text-xs font-mono space-y-1">
            <span className="text-zinc-500 block uppercase text-[10px]">Rate Limit per Cluster</span>
            <span className="text-zinc-200 font-semibold text-sm">10 actions / hour</span>
            <p className="text-[11px] text-zinc-400">Prevents rapid thrashing or cascading remediation loops.</p>
          </div>

          <div className="p-3.5 bg-zinc-950 rounded-lg border border-zinc-800 text-xs font-mono space-y-1">
            <span className="text-zinc-500 block uppercase text-[10px]">Automatic Rollback</span>
            <span className="text-emerald-400 font-semibold text-sm">ENABLED</span>
            <p className="text-[11px] text-zinc-400">Reverts to pre-action state if fresh telemetry reveals failure.</p>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-end pt-3 border-t border-zinc-800">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSavePolicy}
            disabled={saving || loading}
            icon={<Save className="w-3.5 h-3.5" />}
            className="bg-sky-600 hover:bg-sky-500 text-white font-bold"
          >
            {saving ? 'Saving Policy...' : 'Save Auto-Healing Policy'}
          </Button>
        </div>
      </div>
    </div>
  );
};
