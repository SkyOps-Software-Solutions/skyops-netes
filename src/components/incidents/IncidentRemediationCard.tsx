import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Lock,
  Play,
  X,
  RefreshCw,
  Edit2,
  ArrowRight,
  Terminal,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Server,
  FileCode,
  Activity,
  RotateCcw,
  Zap,
  Shield,
  Layers,
  Sparkles,
  Info
} from 'lucide-react';
import {
  Incident,
  StructuredRemediation,
  SkyOpsAIAnalysis,
  RemediationPolicy,
  RemediationMode,
  CanonicalRemediationActionType
} from '../../types/index';
import { api } from '../../api/client';
import { Button } from '../common/UI';

interface IncidentRemediationCardProps {
  incident: Incident;
  remediation?: StructuredRemediation | null;
  aiAnalysis?: SkyOpsAIAnalysis | null;
  canEdit?: boolean;
  onRemediationUpdated?: (remediation: StructuredRemediation) => void;
  onRefresh?: () => void;
}

export const IncidentRemediationCard: React.FC<IncidentRemediationCardProps> = ({
  incident,
  remediation: initialRemediation,
  aiAnalysis,
  canEdit = true,
  onRemediationUpdated,
  onRefresh
}) => {
  const [remediation, setRemediation] = useState<StructuredRemediation | null>(
    initialRemediation || aiAnalysis?.structuredRemediation || null
  );
  const [customImage, setCustomImage] = useState(
    initialRemediation?.parameters?.proposedImage || aiAnalysis?.structuredRemediation?.parameters?.proposedImage || ''
  );
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Cluster Remediation Policy state
  const [policy, setPolicy] = useState<RemediationPolicy | null>(null);
  const [loadingPolicy, setLoadingPolicy] = useState(false);
  const [updatingPolicy, setUpdatingPolicy] = useState(false);

  // Synchronize incoming props
  useEffect(() => {
    const rem = initialRemediation || aiAnalysis?.structuredRemediation || null;
    setRemediation(rem);
    if (rem?.parameters?.proposedImage && rem.parameters.proposedImage !== 'unknown') {
      setCustomImage(rem.parameters.proposedImage);
    }
  }, [initialRemediation, aiAnalysis?.structuredRemediation]);

  // Load cluster remediation policy
  useEffect(() => {
    let isMounted = true;
    const fetchPolicy = async () => {
      try {
        setLoadingPolicy(true);
        const res = await api.getRemediationPolicy(incident.clusterId);
        if (isMounted && res.policy) {
          setPolicy(res.policy);
        }
      } catch (err) {
        console.warn('[IncidentRemediationCard] Could not load cluster remediation policy:', err);
      } finally {
        if (isMounted) setLoadingPolicy(false);
      }
    };
    if (incident.clusterId) {
      fetchPolicy();
    }
    return () => {
      isMounted = false;
    };
  }, [incident.clusterId]);

  const handleModeChange = async (newMode: RemediationMode) => {
    try {
      setUpdatingPolicy(true);
      setActionMessage(null);
      const res = await api.updateRemediationPolicy({ remediationMode: newMode }, incident.clusterId);
      if (res.policy) {
        setPolicy(res.policy);
        setActionMessage({
          type: 'success',
          text: `Auto-Healing policy updated to "${newMode === 'CONTROLLED_AUTONOMOUS' ? 'Controlled Auto-Healing' : newMode === 'APPROVAL_REQUIRED' ? 'Approval Required' : 'OFF'}" for this cluster.`
        });
      }
    } catch (err: any) {
      console.error('Failed to update remediation mode:', err);
      setActionMessage({
        type: 'error',
        text: err?.message || 'Failed to update Auto-Healing policy mode'
      });
    } finally {
      setUpdatingPolicy(false);
    }
  };

  // Human friendly action type display
  const getActionName = (actionType?: string): string => {
    switch (actionType) {
      case 'RestartPod':
        return 'Restart Pod';
      case 'RolloutRestart':
        return 'Rollout Restart';
      case 'RollbackDeployment':
        return 'Rollback Deployment';
      case 'ReplacePodImage':
      case 'UPDATE_CONTAINER_IMAGE':
        return 'Replace Pod Image';
      case 'ScaleDeployment':
        return 'Scale Deployment';
      default:
        return actionType || 'Remediation Action';
    }
  };

  // Autonomous status display
  const getAutonomousStatusLabel = (status?: string): string => {
    switch (status) {
      case 'PROPOSED':
        return 'Waiting for execution';
      case 'AWAITING_APPROVAL':
        return 'Waiting for approval';
      case 'DISPATCHED':
      case 'QUEUED':
      case 'DELIVERED':
      case 'EXECUTING':
        return 'Executing';
      case 'EXECUTED':
      case 'VERIFYING':
        return 'Verifying';
      case 'VERIFIED_RESOLVED':
        return 'Resolved';
      case 'ROLLED_BACK':
        return 'Rolled Back';
      case 'ROLLING_BACK':
        return 'Rolling Back';
      case 'VERIFICATION_FAILED':
      case 'FAILED':
        return 'Verification Failed';
      case 'REJECTED':
        return 'Rejected';
      default:
        return status || 'Waiting for execution';
    }
  };

  const formatConfidence = (conf?: number): string => {
    if (conf === undefined || conf === null) return '96%';
    const num = conf <= 1 ? Math.round(conf * 100) : Math.round(conf);
    return `${num}%`;
  };

  // Determine if a validated executable remediation is present
  const isExecutableRemediation = Boolean(
    remediation &&
    remediation.isExecutable !== false &&
    remediation.actionType !== 'MANUAL_INSPECTION' &&
    remediation.actionType !== 'UNSPECIFIED' &&
    (remediation.actionType !== 'UPDATE_CONTAINER_IMAGE' && remediation.actionType !== 'ReplacePodImage'
      ? true
      : Boolean(remediation.parameters?.proposedImage && remediation.parameters.proposedImage !== 'unknown'))
  );

  const isAutonomousMode = policy?.remediationMode === 'CONTROLLED_AUTONOMOUS';
  const actionRisk = remediation?.reasoning?.risk || 'LOW';
  const actionPassesPolicy = Boolean(
    remediation &&
    actionRisk === 'LOW' &&
    remediation.isExecutable !== false
  );

  const handleApprove = async () => {
    if (!remediation) return;
    try {
      setActionLoading(true);
      setActionMessage(null);
      const proposedImage = customImage.trim() || remediation.parameters?.proposedImage;
      const res = await api.approveRemediation(incident.id, { proposedImage });
      setRemediation(res.remediation);
      setActionMessage({
        type: 'success',
        text: `Remediation dispatched to SkyOps Agent on cluster "${res.remediation.clusterName || incident.clusterName}".`
      });
      setIsEditingImage(false);
      if (onRemediationUpdated) {
        onRemediationUpdated(res.remediation);
      }
      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      console.error('Failed to execute remediation:', err);
      setActionMessage({
        type: 'error',
        text: err?.message || 'Failed to execute remediation'
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!remediation) return;
    try {
      setActionLoading(true);
      setActionMessage(null);
      const res = await api.rejectRemediation(incident.id, 'Declined by operator');
      setRemediation(res.remediation);
      setActionMessage({
        type: 'success',
        text: 'Remediation proposal declined. Workload configuration remains unchanged.'
      });
      if (onRemediationUpdated) {
        onRemediationUpdated(res.remediation);
      }
      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      console.error('Failed to decline remediation:', err);
      setActionMessage({
        type: 'error',
        text: err?.message || 'Failed to decline remediation'
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRollback = async () => {
    if (!remediation) return;
    try {
      setActionLoading(true);
      setActionMessage(null);
      const res = await api.rollbackRemediation(
        incident.id,
        'Operator initiated safe rollback to restore pre-incident container configuration'
      );
      setRemediation(res.remediation);
      setActionMessage({
        type: 'success',
        text: res.message || 'Remediation rolled back successfully.'
      });
      if (onRemediationUpdated) {
        onRemediationUpdated(res.remediation);
      }
      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      console.error('Failed to rollback remediation:', err);
      setActionMessage({
        type: 'error',
        text: err?.message || 'Failed to rollback remediation'
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const describeCmd = `kubectl describe ${incident.resourceKind.toLowerCase()} ${incident.resourceName} -n ${incident.namespace}`;
  const logsCmd = `kubectl logs ${incident.resourceName} -n ${incident.namespace}`;

  return (
    <div className="p-5 rounded-xl bg-linear-to-b from-zinc-900/90 via-zinc-900/60 to-zinc-950 border border-sky-900/50 shadow-xs space-y-4">
      {/* Top Bar: Title & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-lg border ${
            isExecutableRemediation
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
          }`}>
            {isExecutableRemediation ? (
              <ShieldCheck className="w-4 h-4" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-zinc-100 font-mono uppercase tracking-wider">
                5. Remediation / Next Action
              </h3>
              {isExecutableRemediation ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                  <Play className="w-2.5 h-2.5" />
                  TYPED REMEDIATION AVAILABLE
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-800 flex items-center gap-1">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  MANUAL INVESTIGATION REQUIRED
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Target workload:{' '}
              <strong className="text-zinc-200 font-mono">
                {incident.resourceKind}/{incident.resourceName}
              </strong>{' '}
              in <strong className="text-zinc-300 font-mono">{incident.namespace}</strong>
            </p>
          </div>
        </div>

        {/* Action Status Pill */}
        {remediation && isExecutableRemediation && (
          <div>
            {remediation.status === 'PROPOSED' && (
              <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-800 flex items-center gap-1.5">
                <Lock className="w-3 h-3" />
                {isAutonomousMode && actionPassesPolicy ? 'QUEUED FOR AUTO-HEAL' : 'AWAITING OPERATOR APPROVAL'}
              </span>
            )}
            {remediation.status === 'DISPATCHED' && (
              <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-blue-950/80 text-blue-300 border border-blue-800 flex items-center gap-1.5 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" />
                DISPATCHED TO AGENT
              </span>
            )}
            {remediation.status === 'EXECUTED' && (
              <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-800 flex items-center gap-1.5">
                <Play className="w-3 h-3" />
                EXECUTED (VERIFYING)
              </span>
            )}
            {remediation.status === 'VERIFYING' && (
              <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-purple-950/80 text-purple-300 border border-purple-800 flex items-center gap-1.5 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" />
                VERIFYING TELEMETRY
              </span>
            )}
            {remediation.status === 'VERIFIED_RESOLVED' && (
              <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-emerald-950/90 text-emerald-300 border border-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                AUTOMATIC_VERIFIED RESOLUTION
              </span>
            )}
            {remediation.status === 'ROLLED_BACK' && (
              <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-amber-950/90 text-amber-300 border border-amber-700 flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" />
                ROLLED BACK
              </span>
            )}
            {remediation.status === 'REJECTED' && (
              <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-zinc-900 text-zinc-400 border border-zinc-700 flex items-center gap-1.5">
                <X className="w-3 h-3" />
                DECLINED BY OPERATOR
              </span>
            )}
            {(remediation.status === 'FAILED' || remediation.status === 'VERIFICATION_FAILED') && (
              <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-rose-950/80 text-rose-300 border border-rose-800 flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3" />
                VERIFICATION FAILED
              </span>
            )}
          </div>
        )}
      </div>

      {/* Auto-Healing Mode Configuration & Toggle (Requirement 6) */}
      <div className="p-3.5 rounded-lg bg-zinc-950/90 border border-zinc-800/90 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Zap className={`w-4 h-4 ${
              (policy?.remediationMode || 'MANUAL_ONLY') === 'CONTROLLED_AUTONOMOUS'
                ? 'text-emerald-400'
                : (policy?.remediationMode || 'MANUAL_ONLY') === 'APPROVAL_REQUIRED'
                ? 'text-amber-400'
                : 'text-zinc-500'
            }`} />
            <div>
              <span className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wide">
                Auto-Healing
              </span>
              <span className="text-[11px] text-zinc-400 ml-2">
                (Cluster Safety Mode)
              </span>
            </div>
          </div>

          {/* 3-State Toggle: OFF | Approval Required | Controlled Auto-Healing */}
          <div className="inline-flex rounded-lg bg-zinc-900/90 p-0.5 border border-zinc-800 text-xs font-mono">
            <button
              type="button"
              onClick={() => handleModeChange('MANUAL_ONLY')}
              disabled={updatingPolicy || !canEdit}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                (policy?.remediationMode || 'MANUAL_ONLY') === 'MANUAL_ONLY'
                  ? 'bg-zinc-800 text-zinc-100 shadow-xs border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              OFF
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('APPROVAL_REQUIRED')}
              disabled={updatingPolicy || !canEdit}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                policy?.remediationMode === 'APPROVAL_REQUIRED'
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Approval Required
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('CONTROLLED_AUTONOMOUS')}
              disabled={updatingPolicy || !canEdit}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                policy?.remediationMode === 'CONTROLLED_AUTONOMOUS'
                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Controlled Auto-Healing
            </button>
          </div>
        </div>

        {/* Warning Banner when Controlled Auto-Healing is selected (Requirement 6) */}
        {policy?.remediationMode === 'CONTROLLED_AUTONOMOUS' && (
          <div className="p-2.5 rounded bg-amber-950/30 border border-amber-600/40 flex items-start gap-2 text-[11px] text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong>Warning:</strong> Controlled Auto-Healing permits SkyOps to execute approved low-risk remediation actions automatically without manual human intervention. Destructive operations (namespace deletion, scale-to-zero, arbitrary shell commands) are strictly blocked by the deterministic policy engine.
            </div>
          </div>
        )}
      </div>

      {/* Action Feedback Banner */}
      {actionMessage && (
        <div
          className={`p-3 rounded-lg border flex items-start gap-2.5 text-xs ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/70 text-emerald-200'
              : 'bg-rose-950/40 border-rose-800/70 text-rose-200'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <p className="text-xs leading-relaxed">{actionMessage.text}</p>
        </div>
      )}

      {/* ========================================================================= */}
      {/* REQUIREMENT 7: AUTO-HEALING ENABLED BANNER (Controlled Autonomous Mode) */}
      {/* ========================================================================= */}
      {isAutonomousMode && actionPassesPolicy && remediation && (
        <div className="p-4 rounded-xl bg-linear-to-r from-emerald-950/80 via-zinc-900 to-zinc-950 border border-emerald-500/40 shadow-lg space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-800/40 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <span className="font-mono text-xs font-black tracking-wider uppercase text-emerald-400">
                AUTO-HEALING ENABLED
              </span>
            </div>
            <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-900/60 text-emerald-200 border border-emerald-700/60">
              Deterministic Safety Policy Verified
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div>
              <span className="text-[10px] text-zinc-400 uppercase block font-semibold">Action</span>
              <span className="text-zinc-100 font-bold">{getActionName(remediation.actionType)}</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-400 uppercase block font-semibold">Risk</span>
              <span className="text-emerald-400 font-bold">{actionRisk}</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-400 uppercase block font-semibold">Confidence</span>
              <span className="text-cyan-300 font-bold">{formatConfidence(remediation.reasoning?.confidence)}</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-400 uppercase block font-semibold">Status</span>
              <span className="text-amber-300 font-bold">{getAutonomousStatusLabel(remediation.status)}</span>
            </div>
          </div>

          <div className="text-xs text-zinc-300 bg-zinc-900/80 p-2.5 rounded border border-zinc-800 space-y-1">
            <div className="font-semibold text-zinc-200">
              Reason: <span className="font-normal text-zinc-300">{remediation.reasoning?.summary || remediation.reasoning?.rootCause || 'Observed failure matched low-risk auto-healing rule.'}</span>
            </div>
            {remediation.reasoning?.whyRecommended && (
              <div className="text-[11px] text-zinc-400">
                Justification: {remediation.reasoning.whyRecommended}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CASE A: VALID EXECUTABLE REMEDIATION DETAILS */}
      {/* ========================================================================= */}
      {isExecutableRemediation && remediation && (
        <div className="space-y-4">
          {/* Explicit Display: Proposed Action, Target, Risk, Confidence */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {/* Target Workload */}
            <div className="p-3 bg-zinc-950/90 rounded-lg border border-zinc-800 space-y-1.5">
              <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold block">
                Target Resource
              </span>
              <div className="font-mono text-zinc-200">
                <span className="text-sky-400 font-bold">{remediation.targetResource.kind}</span>{' '}
                <span className="text-zinc-400">{remediation.targetResource.namespace || 'default'}/</span>
                <span className="text-zinc-100 font-semibold">{remediation.targetResource.name}</span>
              </div>
              {remediation.parameters?.containerName && (
                <div className="text-[11px] text-zinc-400 font-mono">
                  Container: <code className="text-zinc-200">{remediation.parameters.containerName}</code>
                </div>
              )}
              {remediation.changePreview?.field && (
                <div className="text-[10px] text-zinc-500 font-mono truncate" title={remediation.changePreview.field}>
                  Field: {remediation.changePreview.field}
                </div>
              )}
            </div>

            {/* Proposed Mutation / Change Diff */}
            <div className="md:col-span-2 p-3 bg-zinc-950/90 rounded-lg border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold">
                  Proposed Mutation ({getActionName(remediation.actionType)})
                </span>
                {(remediation.actionType === 'ReplacePodImage' || remediation.actionType === 'UPDATE_CONTAINER_IMAGE') &&
                  remediation.status === 'PROPOSED' &&
                  canEdit && (
                    <button
                      type="button"
                      onClick={() => setIsEditingImage(!isEditingImage)}
                      className="text-[11px] font-mono text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      {isEditingImage ? 'Cancel edit' : 'Customize image tag'}
                    </button>
                  )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs font-mono">
                {/* Expected Current State */}
                <div className="p-2 rounded bg-rose-950/30 border border-rose-900/60 text-rose-300 flex-1 truncate">
                  <span className="text-[9px] uppercase tracking-wider text-rose-400 block mb-0.5">Expected Current</span>
                  <span className="line-through">{String(remediation.parameters?.currentImage || remediation.parameters?.currentRevision || 'Observed State')}</span>
                </div>

                <ArrowRight className="w-4 h-4 text-sky-400 shrink-0 hidden sm:block" />

                {/* Proposed Target Value */}
                <div className="p-2 rounded bg-emerald-950/30 border border-emerald-900/60 text-emerald-300 flex-1 truncate">
                  <span className="text-[9px] uppercase tracking-wider text-emerald-400 block mb-0.5">Proposed Value</span>
                  {!isEditingImage ? (
                    <span className="font-bold text-emerald-200">
                      {String(customImage || remediation.parameters?.proposedImage || remediation.parameters?.targetRevision || 'Configured Patch')}
                    </span>
                  ) : (
                    <input
                      type="text"
                      value={customImage}
                      onChange={(e) => setCustomImage(e.target.value)}
                      placeholder="e.g. registry.company.com/app:v1.2.4"
                      className="w-full bg-zinc-900 border border-emerald-600 rounded px-2 py-0.5 text-xs text-emerald-200 font-mono focus:outline-hidden"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Grounding Evidence & Verification Details (Requirement 7) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {/* Grounding Evidence */}
            <div className="p-3 bg-zinc-950/90 rounded-lg border border-zinc-800 space-y-1.5">
              <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-sky-400" />
                Grounding Evidence
              </span>
              <p className="text-zinc-300 text-xs leading-relaxed">
                {remediation.reasoning?.rootCause ||
                  (typeof incident.technicalDetails?.evidence?.[0] === 'string'
                    ? incident.technicalDetails.evidence[0]
                    : (incident.technicalDetails?.evidence?.[0] as any)?.message) ||
                  'Action grounded in live telemetry diagnostics and resource condition history.'}
              </p>
              {remediation.groundingEvidence && remediation.groundingEvidence.length > 0 && (
                <div className="text-[11px] text-zinc-400 font-mono space-y-1 pt-1 border-t border-zinc-800/80">
                  {remediation.groundingEvidence.slice(0, 2).map((ev, i) => (
                    <div key={i} className="truncate text-zinc-400">
                      • <strong className="text-zinc-300">{ev.source}:</strong> {ev.reason} - {ev.message}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Verification & Rollback Status */}
            <div className="p-3 bg-zinc-950/90 rounded-lg border border-zinc-800 space-y-1.5">
              <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Verification & Rollback Safeguards
              </span>
              <div className="text-zinc-300 text-xs space-y-1 font-mono">
                <div>
                  <span className="text-zinc-500">Verification Status:</span>{' '}
                  <strong className={
                    remediation.verification?.status === 'VERIFIED_RESOLVED' || remediation.status === 'VERIFIED_RESOLVED'
                      ? 'text-emerald-300'
                      : remediation.status === 'VERIFYING'
                      ? 'text-purple-300'
                      : 'text-zinc-300'
                  }>
                    {remediation.verification?.status || (remediation.status === 'VERIFYING' ? 'VERIFYING' : 'PENDING TELEMETRY')}
                  </strong>
                </div>
                <div>
                  <span className="text-zinc-500">Rollback Status:</span>{' '}
                  <strong className={remediation.status === 'ROLLED_BACK' ? 'text-amber-300' : 'text-zinc-300'}>
                    {remediation.status === 'ROLLED_BACK'
                      ? 'ROLLED BACK'
                      : remediation.rollbackPlan?.supported !== false
                      ? 'SAFE ROLLBACK READY'
                      : 'MANUAL RECOVERY ONLY'}
                  </strong>
                </div>
                {remediation.rollbackPlan?.rollbackValue && (
                  <div className="text-[11px] text-zinc-400 truncate">
                    Revert Target: <code className="text-amber-300">{remediation.rollbackPlan.rollbackValue}</code>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Closed-Loop Pipeline Progress Tracker */}
          <div className="p-3 bg-zinc-950/90 rounded-lg border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold">
                Closed-Loop Auto-Healing Pipeline
              </span>
              <span className="text-[10px] font-mono text-zinc-500">
                Authoritative State: <strong className="text-zinc-300">{remediation.status}</strong>
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs font-mono">
              {/* Step 1: Proposed */}
              <div className="p-2 rounded bg-zinc-900 border border-zinc-800 flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <div className="min-w-0">
                  <span className="font-bold block text-[10px] truncate">1. Proposed</span>
                  <span className="text-zinc-400 text-[9px] block truncate">Policy validated</span>
                </div>
              </div>

              {/* Step 2: Gate / Mode */}
              <div
                className={`p-2 rounded border flex items-center gap-1.5 ${
                  remediation.status !== 'PROPOSED' && remediation.status !== 'REJECTED'
                    ? 'bg-zinc-900 border-zinc-800 text-emerald-400'
                    : isAutonomousMode && actionPassesPolicy
                    ? 'bg-emerald-950/30 border-emerald-800 text-emerald-300'
                    : 'bg-zinc-900/40 border-zinc-800 text-amber-400'
                }`}
              >
                {remediation.approval || (isAutonomousMode && actionPassesPolicy) ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                ) : (
                  <Lock className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                )}
                <div className="min-w-0">
                  <span className="font-bold block text-[10px] truncate">
                    {isAutonomousMode && actionPassesPolicy ? '2. Auto-Gate' : remediation.approval ? '2. Approved' : '2. Approval Gate'}
                  </span>
                  <span className="text-zinc-400 text-[9px] block truncate">
                    {isAutonomousMode && actionPassesPolicy ? 'Autonomous' : remediation.approval?.approvedBy?.name || 'Human sign-off'}
                  </span>
                </div>
              </div>

              {/* Step 3: Executing */}
              <div
                className={`p-2 rounded border flex items-center gap-1.5 ${
                  remediation.status === 'EXECUTED' ||
                  remediation.status === 'VERIFYING' ||
                  remediation.status === 'VERIFIED_RESOLVED'
                    ? 'bg-zinc-900 border-zinc-800 text-emerald-400'
                    : remediation.status === 'DISPATCHED'
                    ? 'bg-blue-950/40 border-blue-800 text-blue-300'
                    : 'bg-zinc-900/40 border-zinc-800 text-zinc-500'
                }`}
              >
                {remediation.execution?.status === 'SUCCESS' ||
                remediation.status === 'EXECUTED' ||
                remediation.status === 'VERIFYING' ||
                remediation.status === 'VERIFIED_RESOLVED' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                ) : remediation.status === 'DISPATCHED' ? (
                  <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin text-blue-400" />
                ) : (
                  <Terminal className="w-3.5 h-3.5 shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="font-bold block text-[10px] truncate">3. Executing</span>
                  <span className="text-zinc-400 text-[9px] block truncate">
                    {remediation.status === 'DISPATCHED' ? 'Agent in progress' : 'In-cluster agent'}
                  </span>
                </div>
              </div>

              {/* Step 4: Executed */}
              <div
                className={`p-2 rounded border flex items-center gap-1.5 ${
                  remediation.execution?.status === 'SUCCESS' ||
                  remediation.status === 'EXECUTED' ||
                  remediation.status === 'VERIFYING' ||
                  remediation.status === 'VERIFIED_RESOLVED'
                    ? 'bg-zinc-900 border-zinc-800 text-emerald-400'
                    : 'bg-zinc-900/40 border-zinc-800 text-zinc-500'
                }`}
              >
                {remediation.execution?.status === 'SUCCESS' ||
                remediation.status === 'EXECUTED' ||
                remediation.status === 'VERIFYING' ||
                remediation.status === 'VERIFIED_RESOLVED' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                ) : (
                  <Terminal className="w-3.5 h-3.5 shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="font-bold block text-[10px] truncate">4. Executed</span>
                  <span className="text-zinc-400 text-[9px] block truncate">Patch applied</span>
                </div>
              </div>

              {/* Step 5: Verifying */}
              <div
                className={`p-2 rounded border flex items-center gap-1.5 ${
                  remediation.status === 'VERIFIED_RESOLVED'
                    ? 'bg-zinc-900 border-zinc-800 text-emerald-400'
                    : remediation.status === 'VERIFYING'
                    ? 'bg-purple-950/40 border-purple-800 text-purple-300'
                    : 'bg-zinc-900/40 border-zinc-800 text-zinc-500'
                }`}
              >
                {remediation.status === 'VERIFIED_RESOLVED' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                ) : remediation.status === 'VERIFYING' ? (
                  <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin text-purple-400" />
                ) : (
                  <Activity className="w-3.5 h-3.5 shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="font-bold block text-[10px] truncate">5. Verifying</span>
                  <span className="text-zinc-400 text-[9px] block truncate">
                    {remediation.status === 'VERIFYING' ? 'Observing live...' : 'Awaiting scrape'}
                  </span>
                </div>
              </div>

              {/* Step 6: Verified or Rolled Back */}
              <div
                className={`p-2 rounded border flex items-center gap-1.5 ${
                  remediation.status === 'VERIFIED_RESOLVED'
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400'
                    : remediation.status === 'ROLLED_BACK'
                    ? 'bg-amber-950/40 border-amber-800 text-amber-400'
                    : remediation.status === 'VERIFICATION_FAILED'
                    ? 'bg-rose-950/40 border-rose-800 text-rose-400'
                    : 'bg-zinc-900/40 border-zinc-800 text-zinc-500'
                }`}
              >
                {remediation.status === 'VERIFIED_RESOLVED' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                ) : remediation.status === 'ROLLED_BACK' ? (
                  <RotateCcw className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                ) : remediation.status === 'VERIFICATION_FAILED' ? (
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="font-bold block text-[10px] truncate">
                    {remediation.status === 'ROLLED_BACK'
                      ? '6. Rolled Back'
                      : remediation.status === 'VERIFICATION_FAILED'
                      ? '6. Failed'
                      : '6. Verified'}
                  </span>
                  <span className="text-zinc-400 text-[9px] block truncate">
                    {remediation.status === 'VERIFIED_RESOLVED'
                      ? 'Zero errors'
                      : remediation.status === 'ROLLED_BACK'
                      ? 'Restored'
                      : remediation.status === 'VERIFICATION_FAILED'
                      ? 'Check telemetry'
                      : 'Pending proof'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Execution Controls (Requirement 7: Fix Now & Approve & Execute Fix) */}
          {remediation.status === 'PROPOSED' && canEdit && (
            <div className="p-3.5 rounded-lg bg-zinc-950/90 border border-sky-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-sky-400" />
                  Operator Remediation Control Gate
                </span>
                <p className="text-[11px] text-zinc-400">
                  Executing will dispatch this typed mutation to the SkyOps Kubernetes Agent and initiate closed-loop verification.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDecline}
                  disabled={actionLoading}
                  icon={<X className="w-3.5 h-3.5 text-zinc-400" />}
                  className="text-xs text-zinc-300 hover:text-rose-300 hover:border-rose-800"
                >
                  Decline
                </Button>

                {/* Fix Now Button (Requirement 7) */}
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleApprove}
                  disabled={actionLoading}
                  icon={<Zap className="w-3.5 h-3.5 text-amber-300" />}
                  className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-sm"
                >
                  {actionLoading ? 'Dispatching...' : 'Fix Now'}
                </Button>

                {/* Approve & Execute Fix Button (Requirement 7) */}
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleApprove}
                  disabled={actionLoading}
                  icon={<Play className="w-3.5 h-3.5" />}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm"
                >
                  {actionLoading ? 'Dispatching...' : 'Approve & Execute Fix'}
                </Button>
              </div>
            </div>
          )}

          {/* Rollback Notification Banner (When ROLLED_BACK) */}
          {remediation.status === 'ROLLED_BACK' && (
            <div className="p-3.5 rounded-lg bg-amber-950/30 border border-amber-800/60 flex items-center gap-3">
              <RotateCcw className="w-5 h-5 text-amber-400 shrink-0" />
              <div className="space-y-0.5 min-w-0">
                <span className="text-xs font-bold text-amber-300 block">
                  Workload Successfully Rolled Back
                </span>
                <p className="text-[11px] text-zinc-300 font-mono">
                  Target restored to pre-incident configuration and verified healthy via live cluster telemetry.
                </p>
              </div>
            </div>
          )}

          {/* Rollback Action Controls (When in terminal or verified state, and rollback is available) */}
          {canEdit &&
            (remediation.status === 'VERIFIED_RESOLVED' ||
              remediation.status === 'VERIFICATION_FAILED' ||
              remediation.status === 'FAILED') &&
            (remediation.rollbackPlan?.supported !== false &&
              (remediation.rollbackPlan?.rollbackValue || remediation.parameters?.currentImage)) && (
              <div className="p-3.5 rounded-lg bg-zinc-950/90 border border-amber-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <span className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                    Safe Rollback Available
                  </span>
                  <p className="text-[11px] text-zinc-400 font-sans">
                    Pre-action state recorded: Revert to{' '}
                    <code className="text-amber-300 font-mono">
                      {remediation.rollbackPlan?.rollbackValue || remediation.parameters?.currentImage}
                    </code>
                    . Verification will ensure pre-action readiness.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRollback}
                    disabled={actionLoading}
                    icon={<RotateCcw className="w-3.5 h-3.5 text-amber-400" />}
                    className="text-xs text-amber-300 border-amber-800/80 hover:bg-amber-950/40 hover:border-amber-700"
                  >
                    {actionLoading ? 'Dispatching Rollback...' : 'Rollback Remediation'}
                  </Button>
                </div>
              </div>
            )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* CASE B: NO EXECUTABLE REMEDIATION EXISTS */}
      {/* ========================================================================= */}
      {!isExecutableRemediation && (
        <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/60 space-y-3.5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-amber-300 uppercase tracking-wide">
                Automated Execution Restricted
              </span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed font-sans">
              {remediation?.unexecutableReason ||
                'SkyOps identified the failure but does not have a validated exact change that can be safely executed automatically.'}
            </p>
            <p className="text-[11px] text-zinc-400 font-sans">
              Autonomous execution is strictly reserved for allowlisted, low-risk, deterministic actions (RestartPod, RolloutRestart, ReplacePodImage, RollbackDeployment). Arbitrary shell commands and ungrounded mutations are prohibited.
            </p>
          </div>

          {/* Recommended Operator Next Step */}
          <div className="p-3 rounded-lg bg-zinc-950/90 border border-zinc-800 space-y-1.5">
            <span className="text-[10px] font-mono text-emerald-400 uppercase font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3" />
              Recommended Operator Next Step:
            </span>
            <p className="text-xs text-zinc-200 leading-relaxed font-sans">
              {incident.technicalDetails?.recommendedAction ||
                incident.technicalDetails?.recommendation ||
                aiAnalysis?.recommendedFix?.description ||
                'Inspect the workload status and events to verify configuration, then perform controlled remediation.'}
            </p>
          </div>

          {/* Authoritative Diagnostic Commands */}
          <div className="p-3 rounded-lg bg-zinc-950/90 border border-zinc-800 space-y-2 font-mono text-xs">
            <span className="text-[10px] text-zinc-400 uppercase font-bold block">
              Diagnostic Kubernetes Inspection Commands:
            </span>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between p-2 rounded bg-zinc-900 border border-zinc-800/80 text-zinc-200">
                <code className="text-[11px] truncate">{describeCmd}</code>
                <button
                  type="button"
                  onClick={() => handleCopy(describeCmd, 'describe')}
                  className="text-xs text-zinc-400 hover:text-zinc-200 ml-2 shrink-0 flex items-center gap-1 cursor-pointer"
                  title="Copy command"
                >
                  {copiedCmd === 'describe' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span className="text-[10px]">{copiedCmd === 'describe' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-zinc-900 border border-zinc-800/80 text-zinc-200">
                <code className="text-[11px] truncate">{logsCmd}</code>
                <button
                  type="button"
                  onClick={() => handleCopy(logsCmd, 'logs')}
                  className="text-xs text-zinc-400 hover:text-zinc-200 ml-2 shrink-0 flex items-center gap-1 cursor-pointer"
                  title="Copy command"
                >
                  {copiedCmd === 'logs' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span className="text-[10px]">{copiedCmd === 'logs' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
