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
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Zap,
  Shield,
  Check,
  FileCode,
  Activity,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Layers,
  Sliders,
  History
} from 'lucide-react';
import {
  Incident,
  StructuredRemediation,
  SkyOpsAIAnalysis,
  RemediationPolicy,
  RemediationMode,
  CanonicalRemediationActionType,
  AvailableAction
} from '../../types/index';
import { api } from '../../api/client';
import { Button } from '../common/UI';
import { formatReportDate } from '../../utils/incidentPdfGenerator';

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
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Cluster Remediation Policy state
  const [policy, setPolicy] = useState<RemediationPolicy | null>(null);
  const [loadingPolicy, setLoadingPolicy] = useState(false);
  const [updatingPolicy, setUpdatingPolicy] = useState(false);

  // Available Workload Actions state
  const [availableActions, setAvailableActions] = useState<AvailableAction[]>([]);
  const [loadingAvailableActions, setLoadingAvailableActions] = useState(false);
  const [showAvailableActions, setShowAvailableActions] = useState(false);
  const [executingActionType, setExecutingActionType] = useState<string | null>(null);
  const [scaleTargetReplicas, setScaleTargetReplicas] = useState<number>(3);

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
    if (!canEdit) return;
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
        return 'Restart pod';
      case 'RolloutRestart':
        return 'Rollout restart';
      case 'RollbackDeployment':
        return 'Rollback deployment';
      case 'ReplacePodImage':
      case 'UPDATE_CONTAINER_IMAGE':
        return 'Replace container image';
      case 'ScaleDeployment':
        return 'Scale deployment';
      default:
        return actionType || 'Remediation Action';
    }
  };

  const formatConfidence = (conf?: number): string => {
    if (conf === undefined || conf === null) return '85%';
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

  const policyMode = policy?.remediationMode || 'MANUAL_ONLY';
  const isAutonomousMode = policyMode === 'CONTROLLED_AUTONOMOUS';
  const actionRisk = remediation?.reasoning?.risk || 'LOW';
  const confidenceStr = formatConfidence(remediation?.reasoning?.confidence);

  // Values
  const currentValue: string =
    String(remediation?.parameters?.currentImage || '') ||
    String(remediation?.parameters?.currentRevision || '') ||
    String((incident.technicalDetails as any)?.image || '') ||
    String((incident.technicalDetails as any)?.observedState || '') ||
    'Current live configuration';

  const proposedValue: string =
    customImage ||
    String(remediation?.parameters?.proposedImage || '') ||
    String(remediation?.parameters?.targetRevision || '') ||
    (remediation?.parameters?.targetReplicas !== undefined ? `${remediation.parameters.targetReplicas} replicas` : '') ||
    'Target verified configuration';

  const targetWorkload = `${remediation?.targetResource?.kind || incident.resourceKind}/${remediation?.targetResource?.name || incident.resourceName}`;
  const targetNamespace = remediation?.targetResource?.namespace || incident.namespace;

  const whyReason =
    remediation?.reasoning?.summary ||
    remediation?.reasoning?.rootCause ||
    remediation?.reasoning?.whyRecommended ||
    incident.summary ||
    incident.technicalDetails?.reason ||
    'Observed Kubernetes failure condition requires authoritative remediation.';

  const isRollbackSupported = remediation?.rollbackPlan?.supported !== false;

  // Single Primary Heal Action Handler
  const handlePrimaryHealAction = async () => {
    if (!remediation) return;
    try {
      setActionLoading(true);
      setActionMessage(null);
      const proposedImage = customImage.trim() || remediation.parameters?.proposedImage;
      const res = await api.approveRemediation(incident.id, { proposedImage });
      setRemediation(res.remediation);
      setActionMessage({
        type: 'success',
        text: `Healing action dispatched to SkyOps Agent on cluster "${res.remediation.clusterName || incident.clusterName}".`
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
        text: err?.message || 'Failed to dispatch remediation'
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRollback = async () => {
    if (!remediation) return;
    try {
      setRollbackLoading(true);
      setActionMessage(null);
      const res = await api.rollbackRemediation(incident.id, 'Operator triggered safe rollback from Incident console.');
      setRemediation(res.remediation);
      setActionMessage({
        type: 'success',
        text: 'Safe rollback dispatched. Restoring previous known good configuration.'
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
        text: err?.message || 'Failed to trigger rollback'
      });
    } finally {
      setRollbackLoading(false);
    }
  };

  const handleReject = async () => {
    if (!remediation) return;
    try {
      setActionLoading(true);
      setActionMessage(null);
      const res = await api.rejectRemediation(incident.id, 'Operator rejected remediation proposal.');
      setRemediation(res.remediation);
      setActionMessage({
        type: 'success',
        text: 'Remediation proposal declined. Manual operator investigation required.'
      });
      if (onRemediationUpdated) {
        onRemediationUpdated(res.remediation);
      }
      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      console.error('Failed to reject remediation:', err);
      setActionMessage({
        type: 'error',
        text: err?.message || 'Failed to reject remediation'
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Load available alternative actions for this incident/workload
  useEffect(() => {
    let isMounted = true;
    const fetchAvailableActions = async () => {
      try {
        setLoadingAvailableActions(true);
        const res = await api.getAvailableRemediationActions(incident.id);
        if (isMounted && res.availableActions) {
          setAvailableActions(res.availableActions);
          const scaleAction = res.availableActions.find((a) => a.type === 'ScaleDeployment');
          if (scaleAction?.parameters?.targetReplicas) {
            setScaleTargetReplicas(Number(scaleAction.parameters.targetReplicas));
          }
        }
      } catch (err) {
        console.warn('[IncidentRemediationCard] Could not load available actions:', err);
      } finally {
        if (isMounted) setLoadingAvailableActions(false);
      }
    };
    if (incident.id) {
      fetchAvailableActions();
    }
    return () => {
      isMounted = false;
    };
  }, [incident.id, incident.status]);

  const handleExecuteSpecificAction = async (act: AvailableAction) => {
    if (!canEdit) return;
    try {
      setExecutingActionType(act.type);
      setActionMessage(null);
      const res = await api.executeIncidentAction(incident.id, {
        actionType: act.type,
        targetReplicas: act.type === 'ScaleDeployment' ? scaleTargetReplicas : undefined,
        replicas: act.type === 'ScaleDeployment' ? scaleTargetReplicas : undefined,
        targetRevision: act.type === 'RollbackDeployment' ? (act.parameters?.targetRevision as string) : undefined
      });
      setRemediation(res.remediation);
      setActionMessage({
        type: 'success',
        text: `Action "${getActionName(act.type)}" dispatched to SkyOps Agent on cluster "${res.remediation.clusterName || incident.clusterName}".`
      });
      if (onRemediationUpdated) onRemediationUpdated(res.remediation);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error('Failed to execute action:', err);
      setActionMessage({
        type: 'error',
        text: err?.message || `Failed to execute ${act.type}`
      });
    } finally {
      setExecutingActionType(null);
    }
  };

  // Determine Current Backend State
  const remStatus = (remediation?.status as string) || 'PROPOSED';
  const isHealed = remStatus === 'VERIFIED_RESOLVED' || incident.status === 'RESOLVED' || incident.status === 'CLOSED';
  const isVerifying = remStatus === 'VERIFYING';
  const isExecuting = remStatus === 'EXECUTING' || remStatus === 'DISPATCHED' || remStatus === 'ACKNOWLEDGED';
  const isQueued = remStatus === 'QUEUED' || remStatus === 'APPROVED' || remStatus === 'DELIVERED';
  const isFailed = remStatus === 'FAILED' || remStatus === 'VERIFICATION_FAILED';
  const isRollingBack = remStatus === 'ROLLING_BACK';
  const isRolledBack = remStatus === 'ROLLED_BACK';

  return (
    <div className="space-y-4">
      {/* ========================================================================= */}
      {/* 1. AUTO-HEALING STATUS CARD (Directly inside Incident Page - Requirement 9 & 10) */}
      {/* ========================================================================= */}
      <div className="p-4 rounded-xl bg-zinc-950/90 border border-zinc-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <Zap className={`w-4 h-4 ${
                policyMode === 'CONTROLLED_AUTONOMOUS'
                  ? 'text-emerald-400'
                  : policyMode === 'APPROVAL_REQUIRED'
                  ? 'text-amber-400'
                  : 'text-zinc-500'
              }`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-zinc-100 uppercase tracking-wide">
                  ⚡ AUTO-HEALING
                </span>
                <span className="text-zinc-600 font-mono text-xs">·</span>
                {policyMode === 'CONTROLLED_AUTONOMOUS' ? (
                  <span className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
                    ON · AUTONOMOUS
                  </span>
                ) : policyMode === 'APPROVAL_REQUIRED' ? (
                  <span className="text-xs font-mono font-bold text-amber-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                    ON · APPROVAL REQUIRED
                  </span>
                ) : (
                  <span className="text-xs font-mono font-bold text-zinc-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-zinc-500 inline-block" />
                    OFF
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                {policyMode === 'CONTROLLED_AUTONOMOUS'
                  ? 'SkyOps can automatically apply approved low-risk fixes.'
                  : policyMode === 'APPROVAL_REQUIRED'
                  ? 'SkyOps can prepare the fix but requires operator approval.'
                  : 'Automatic healing is disabled. This incident can still be healed manually.'}
              </p>
            </div>
          </div>

          {/* Policy controls / indicator */}
          <div className="flex items-center gap-2 shrink-0">
            {canEdit ? (
              <div className="inline-flex rounded-lg bg-zinc-900/90 p-1 border border-zinc-800 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => handleModeChange('MANUAL_ONLY')}
                  disabled={updatingPolicy}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                    policyMode === 'MANUAL_ONLY'
                      ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="Manual healing only (Auto-Healing OFF)"
                >
                  OFF
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('APPROVAL_REQUIRED')}
                  disabled={updatingPolicy}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                    policyMode === 'APPROVAL_REQUIRED'
                      ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="Approval Required"
                >
                  Approval Required
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('CONTROLLED_AUTONOMOUS')}
                  disabled={updatingPolicy}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                    policyMode === 'CONTROLLED_AUTONOMOUS'
                      ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="Controlled Auto-Healing"
                >
                  Autonomous
                </button>
              </div>
            ) : (
              <span className="text-[11px] font-mono text-zinc-500 bg-zinc-900/80 px-2.5 py-1 rounded border border-zinc-800">
                Managed by cluster policy
              </span>
            )}
          </div>
        </div>

        {/* Policy Thresholds Strip */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-zinc-400 pt-2 border-t border-zinc-900">
          <div>
            <span className="text-zinc-500">Risk limit:</span>{' '}
            <strong className="text-emerald-400">LOW</strong>
          </div>
          <span className="text-zinc-700">·</span>
          <div>
            <span className="text-zinc-500">Confidence threshold:</span>{' '}
            <strong className="text-zinc-200">{Math.round((policy?.minConfidenceThreshold ?? 0.85) * 100)}%</strong>
          </div>
          <span className="text-zinc-700">·</span>
          <div>
            <span className="text-zinc-500">Circuit breaker:</span>{' '}
            <strong className="text-zinc-200">{policy?.maxAttemptsPerIncident ?? 3} attempts</strong>
          </div>
          <span className="text-zinc-700">·</span>
          <div>
            <span className="text-zinc-500">Auto-Rollback:</span>{' '}
            <strong className="text-emerald-400">ENABLED</strong>
          </div>
        </div>
      </div>

      {/* Action Message Feedback */}
      {actionMessage && (
        <div
          className={`p-3 rounded-lg border text-xs font-mono flex items-center justify-between gap-2 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SUCCESSFUL HEAL STATE (Requirement 17) */}
      {/* ========================================================================= */}
      {isHealed && (
        <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-600/40 space-y-2">
          <div className="flex items-center gap-2 text-emerald-300">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="text-xs font-mono font-bold uppercase tracking-wider">
              ✓ INCIDENT HEALED
            </span>
          </div>
          <p className="text-xs text-zinc-300">
            The remediation was applied and the workload is healthy.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-zinc-400 pt-1">
            <span className="text-emerald-300 font-semibold">{proposedValue} deployed</span>
            <span className="text-zinc-600">·</span>
            <span className="text-emerald-300 font-semibold">Pod ready</span>
            <span className="text-zinc-600">·</span>
            <span className="text-emerald-300 font-semibold">Verification passed</span>
            <span className="text-zinc-600">·</span>
            <span>Healed {formatReportDate(incident.resolvedAt || remediation?.verification?.verifiedAt)}</span>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. FAILED HEAL STATE (Requirement 18) */}
      {/* ========================================================================= */}
      {isFailed && !isHealed && (
        <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-600/40 space-y-2">
          <div className="flex items-center gap-2 text-rose-300">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <span className="text-xs font-mono font-bold uppercase tracking-wider">
              ⚠ HEALING FAILED
            </span>
          </div>
          <p className="text-xs text-zinc-300">
            SkyOps could not verify the remediation.
          </p>
          <div className="text-xs font-mono text-zinc-400 space-y-1 bg-zinc-950/60 p-2.5 rounded border border-rose-950">
            <div>
              <span className="text-zinc-500">Reason:</span>{' '}
              <strong className="text-rose-300">
                {remediation?.verification?.observedState || 'Persistent failure condition detected during observation window.'}
              </strong>
            </div>
            <div>
              <span className="text-zinc-500">Rollback:</span>{' '}
              <strong className={isRolledBack ? 'text-amber-300' : isRollbackSupported ? 'text-zinc-300' : 'text-zinc-500'}>
                {isRolledBack ? 'Restored previous configuration' : isRollbackSupported ? 'Available' : 'None'}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. RECOMMENDED FIX CARD (Requirement 6, 7, 8, 11, 12) */}
      {/* ========================================================================= */}
      {isExecutableRemediation && remediation ? (
        <div className="p-5 rounded-xl bg-zinc-950/90 border border-zinc-800 space-y-4">
          {/* Card Header & Action Title */}
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-zinc-100 uppercase tracking-wide flex items-center gap-1.5">
                ⚡ RECOMMENDED FIX
              </span>
              <span className="text-zinc-600">·</span>
              <span className="text-xs font-mono font-bold text-sky-400">
                {getActionName(remediation.actionType)}
              </span>
            </div>
            {isAutonomousMode && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
                AUTO-HEAL ELIGIBLE
              </span>
            )}
          </div>

          {/* Diff Block: Current ↓ Proposed */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-1">
              <span className="text-[10px] text-zinc-500 uppercase font-bold block">Current</span>
              <div className="text-rose-400 font-semibold truncate line-through">
                {currentValue}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-400 uppercase font-bold block">Proposed</span>
                {remStatus === 'PROPOSED' && canEdit && (
                  <button
                    type="button"
                    onClick={() => setIsEditingImage(!isEditingImage)}
                    className="text-[10px] font-mono text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Edit2 className="w-2.5 h-2.5" />
                    {isEditingImage ? 'Cancel' : 'Customize tag'}
                  </button>
                )}
              </div>
              {!isEditingImage ? (
                <div className="text-emerald-300 font-bold truncate">
                  {proposedValue}
                </div>
              ) : (
                <input
                  type="text"
                  value={customImage}
                  onChange={(e) => setCustomImage(e.target.value)}
                  placeholder="e.g. nginx:1.27.0"
                  className="w-full bg-zinc-950 border border-sky-600 rounded px-2 py-1 text-xs font-mono text-emerald-300 focus:outline-none"
                />
              )}
            </div>
          </div>

          {/* Target & Reason */}
          <div className="space-y-2 text-xs">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-zinc-400">
              <span className="text-zinc-500">Target:</span>
              <strong className="text-zinc-200">{targetWorkload}</strong>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-500">Namespace:</span>
              <strong className="text-zinc-200">{targetNamespace}</strong>
            </div>

            <div className="p-3 rounded-lg bg-zinc-900/40 border border-zinc-800/80 text-xs text-zinc-300 space-y-1">
              <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase block">Why</span>
              <p className="leading-relaxed font-sans">{whyReason}</p>
            </div>
          </div>

          {/* Key Attributes & Safety Checks (Requirement 6 & 16) */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 text-xs font-mono border-t border-b border-zinc-900 py-3">
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block">Confidence</span>
              <strong className="text-cyan-300 font-bold">{confidenceStr}</strong>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block">Risk</span>
              <strong className="text-emerald-400 font-bold">{actionRisk}</strong>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block">Rollback</span>
              <strong className={isRollbackSupported ? 'text-zinc-200 font-bold' : 'text-zinc-500 font-bold'}>
                {isRollbackSupported ? 'Available' : 'None'}
              </strong>
            </div>
            <div className="hidden sm:block">
              <span className="text-[10px] text-zinc-500 uppercase block">Execution</span>
              <strong className="text-sky-300 font-bold">Deterministic</strong>
            </div>
          </div>

          {/* Safety Checks Confirmation (Requirement 16) */}
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-zinc-400">
            <span className="text-emerald-400 flex items-center gap-1 font-semibold">
              <Check className="w-3.5 h-3.5" /> Target verified
            </span>
            <span className="text-emerald-400 flex items-center gap-1 font-semibold">
              <Check className="w-3.5 h-3.5" /> Current state confirmed
            </span>
            <span className="text-emerald-400 flex items-center gap-1 font-semibold">
              <Check className="w-3.5 h-3.5" /> Remediation allowed
            </span>
            <span className={isRollbackSupported ? 'text-emerald-400 flex items-center gap-1 font-semibold' : 'text-zinc-600 flex items-center gap-1'}>
              <Check className="w-3.5 h-3.5" /> Rollback {isRollbackSupported ? 'available' : 'n/a'}
            </span>
          </div>

          {/* PRIMARY ACTION BUTTON BAR (Requirement 7, 8, 11, 12) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="text-xs text-zinc-400 font-mono">
              {remStatus === 'PROPOSED' && (
                <span>
                  {policyMode === 'APPROVAL_REQUIRED'
                    ? 'Operator approval required to dispatch mutation to agent.'
                    : 'Ready to execute. Dispatches typed mutation and starts verification.'}
                </span>
              )}
              {isExecuting && <span>Mutation dispatched to agent. Awaiting live cluster execution.</span>}
              {isVerifying && <span>Workload updated. Observing live telemetry to verify resolution.</span>}
              {isHealed && <span>Fix successfully applied and verified by live cluster telemetry.</span>}
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {/* Decline Button (Only when PROPOSED and canEdit) */}
              {remStatus === 'PROPOSED' && canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReject}
                  disabled={actionLoading}
                  className="text-zinc-400 hover:text-zinc-200 text-xs font-mono"
                >
                  Decline
                </Button>
              )}

              {/* Safe Rollback Button (Requirement 19) */}
              {isRollbackSupported && (isFailed || isRollingBack || isRolledBack) && canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRollback}
                  disabled={rollbackLoading || isRollingBack || isRolledBack}
                  icon={<RotateCcw className={`w-3.5 h-3.5 ${isRollingBack ? 'animate-spin' : ''}`} />}
                  className="border-amber-800 text-amber-300 hover:bg-amber-950/40 text-xs font-mono font-bold"
                >
                  {isRollingBack
                    ? 'ROLLBACK IN PROGRESS'
                    : isRolledBack
                    ? 'ROLLBACK VERIFIED'
                    : 'Roll Back'}
                </Button>
              )}

              {/* SINGLE PRIMARY HEAL ACTION (Requirement 11 & 12) */}
              {isHealed ? (
                <div className="px-4 py-2 rounded-lg bg-emerald-950/80 border border-emerald-600 text-emerald-300 font-mono font-bold text-xs flex items-center gap-1.5 shadow-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ✓ HEALED
                </div>
              ) : isVerifying ? (
                <Button
                  variant="primary"
                  size="sm"
                  disabled
                  icon={<RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-300" />}
                  className="bg-purple-900/60 text-purple-200 border border-purple-700/60 font-mono font-bold text-xs cursor-not-allowed"
                >
                  VERIFYING FIX
                </Button>
              ) : isExecuting ? (
                <Button
                  variant="primary"
                  size="sm"
                  disabled
                  icon={<RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-300" />}
                  className="bg-cyan-900/60 text-cyan-200 border border-cyan-700/60 font-mono font-bold text-xs cursor-not-allowed"
                >
                  ⚡ HEALING IN PROGRESS
                </Button>
              ) : isQueued ? (
                <Button
                  variant="primary"
                  size="sm"
                  disabled
                  className="bg-zinc-800 text-zinc-300 font-mono font-bold text-xs cursor-not-allowed"
                >
                  HEALING QUEUED
                </Button>
              ) : isAutonomousMode && remStatus === 'PROPOSED' && actionRisk === 'LOW' ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handlePrimaryHealAction}
                  disabled={actionLoading || !canEdit}
                  icon={<Zap className="w-3.5 h-3.5 text-emerald-300" />}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs shadow-md"
                >
                  {actionLoading ? 'Dispatching...' : '⚡ HEAL THIS INCIDENT'}
                </Button>
              ) : isFailed ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handlePrimaryHealAction}
                  disabled={actionLoading || !canEdit}
                  icon={<RotateCcw className="w-3.5 h-3.5" />}
                  className="bg-amber-600 hover:bg-amber-500 text-white font-mono font-bold text-xs shadow-md"
                >
                  {actionLoading ? 'Dispatching...' : '⚡ RETRY HEAL'}
                </Button>
              ) : policyMode === 'APPROVAL_REQUIRED' ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handlePrimaryHealAction}
                  disabled={actionLoading || !canEdit}
                  icon={<Play className="w-3.5 h-3.5" />}
                  className="bg-amber-600 hover:bg-amber-500 text-white font-mono font-bold text-xs shadow-md"
                >
                  {actionLoading ? 'Approving...' : '⚡ APPROVE & HEAL'}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handlePrimaryHealAction}
                  disabled={actionLoading || !canEdit}
                  icon={<Zap className="w-3.5 h-3.5 text-amber-300" />}
                  className="bg-sky-600 hover:bg-sky-500 text-white font-mono font-bold text-xs shadow-md"
                >
                  {actionLoading ? 'Dispatching...' : '⚡ HEAL THIS INCIDENT'}
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Manual inspection required state */
        <div className="p-5 rounded-xl bg-zinc-950/90 border border-zinc-800 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-zinc-100 uppercase tracking-wide">
              MANUAL INVESTIGATION RECOMMENDED
            </span>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed font-sans">
            {remediation?.unexecutableReason ||
              'SkyOps detected this incident but does not have an allowlisted deterministic mutation that is safe to apply autonomously.'}
          </p>
          <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs font-mono text-zinc-400">
            <span className="text-zinc-500 block uppercase text-[10px] mb-1">Recommended Operator Action:</span>
            <p className="text-zinc-200">
              {incident.technicalDetails?.recommendedAction ||
                incident.technicalDetails?.recommendation ||
                'Inspect the resource spec and events via kubectl to verify workload configuration.'}
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4.5 AVAILABLE WORKLOAD REMEDIATION ACTIONS (Phase 2 Workload Actions) */}
      {/* ========================================================================= */}
      {availableActions.length > 0 && !isHealed && (
        <div className="p-4 rounded-xl bg-zinc-950/90 border border-zinc-800 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-mono font-bold text-zinc-100 uppercase tracking-wide">
                Available Safe Actions ({availableActions.length})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowAvailableActions(!showAvailableActions)}
              className="text-xs font-mono text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
            >
              <span>{showAvailableActions ? 'Hide options' : 'View all actions'}</span>
              {showAvailableActions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {showAvailableActions && (
            <div className="space-y-3 pt-1">
              {availableActions.map((act) => {
                const isCurrentAction = remediation?.actionType === act.type;
                const isExecutingThis = executingActionType === act.type;

                return (
                  <div
                    key={`${act.type}-${act.targetName}`}
                    className={`p-3 rounded-lg border text-xs font-mono space-y-2.5 transition-colors ${
                      isCurrentAction
                        ? 'bg-sky-950/20 border-sky-800/60'
                        : 'bg-zinc-900/60 border-zinc-800/80'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {act.type === 'RolloutRestart' ? (
                          <RefreshCw className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        ) : act.type === 'RollbackDeployment' ? (
                          <History className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        ) : act.type === 'ScaleDeployment' ? (
                          <Sliders className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        ) : (
                          <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        )}
                        <strong className="text-zinc-100 font-bold">{getActionName(act.type)}</strong>
                        <span className="text-zinc-600">·</span>
                        <span className="text-zinc-400">
                          {act.targetKind}/{act.targetName} ({act.targetNamespace})
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          act.risk === 'LOW'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : act.risk === 'MEDIUM'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}>
                          {act.risk} RISK
                        </span>
                      </div>

                      {/* Execution Button */}
                      <div className="flex items-center gap-2 shrink-0">
                        {act.type === 'ScaleDeployment' && act.allowed && (
                          <div className="flex items-center gap-1.5 mr-2">
                            <span className="text-[11px] text-zinc-400">Target replicas:</span>
                            <input
                              type="number"
                              min={1}
                              max={20}
                              value={scaleTargetReplicas}
                              onChange={(e) => setScaleTargetReplicas(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))}
                              className="w-14 px-2 py-0.5 bg-zinc-950 border border-zinc-700 rounded text-center text-xs text-zinc-100 font-mono"
                            />
                          </div>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!act.allowed || isExecutingThis || actionLoading || !canEdit}
                          onClick={() => handleExecuteSpecificAction(act)}
                          icon={
                            isExecutingThis ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-sky-400" />
                            ) : (
                              <Play className="w-3 h-3 text-sky-400" />
                            )
                          }
                          className="text-xs font-mono border-zinc-700 hover:border-sky-500 hover:bg-sky-950/30"
                        >
                          {isExecutingThis ? 'Dispatching...' : act.allowed ? `Execute ${getActionName(act.type)}` : 'Unavailable'}
                        </Button>
                      </div>
                    </div>

                    <p className="text-zinc-400 text-[11px] leading-relaxed font-sans">
                      {act.reason}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. HEALING PROGRESS LIFECYCLE (Requirement 13 & 14) */}
      {/* ========================================================================= */}
      <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="text-zinc-400 font-bold uppercase">Healing Lifecycle</span>
          <span className="text-zinc-500">
            State: <strong className="text-zinc-200">{remStatus}</strong>
          </span>
        </div>

        <div className="grid grid-cols-5 gap-1.5 text-xs font-mono">
          {/* Step 1: Diagnosed */}
          <div className="p-2 rounded bg-emerald-950/30 border border-emerald-800/60 text-emerald-300 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
            <span className="truncate text-[11px] font-semibold">1. Diagnosed</span>
          </div>

          {/* Step 2: Safety checked */}
          <div className={`p-2 rounded border flex items-center gap-1.5 ${
            isExecutableRemediation
              ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300'
              : 'bg-zinc-900 border-zinc-800 text-zinc-500'
          }`}>
            {isExecutableRemediation ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
            ) : (
              <span className="w-3.5 h-3.5 rounded-full border border-zinc-600 flex items-center justify-center text-[9px]">2</span>
            )}
            <span className="truncate text-[11px] font-semibold">2. Safety check</span>
          </div>

          {/* Step 3: Healing */}
          <div className={`p-2 rounded border flex items-center gap-1.5 ${
            isHealed || isVerifying
              ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300'
              : isExecuting || isQueued
              ? 'bg-sky-950/40 border-sky-700 text-sky-200 animate-pulse'
              : 'bg-zinc-900 border-zinc-800 text-zinc-500'
          }`}>
            {isHealed || isVerifying ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
            ) : isExecuting || isQueued ? (
              <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin text-sky-400" />
            ) : (
              <span className="w-3.5 h-3.5 rounded-full border border-zinc-600 flex items-center justify-center text-[9px]">3</span>
            )}
            <span className="truncate text-[11px] font-semibold">3. Healing</span>
          </div>

          {/* Step 4: Verifying */}
          <div className={`p-2 rounded border flex items-center gap-1.5 ${
            isHealed
              ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300'
              : isVerifying
              ? 'bg-purple-950/40 border-purple-700 text-purple-200 animate-pulse'
              : isFailed
              ? 'bg-rose-950/30 border-rose-800 text-rose-300'
              : 'bg-zinc-900 border-zinc-800 text-zinc-500'
          }`}>
            {isHealed ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
            ) : isVerifying ? (
              <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin text-purple-400" />
            ) : isFailed ? (
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
            ) : (
              <span className="w-3.5 h-3.5 rounded-full border border-zinc-600 flex items-center justify-center text-[9px]">4</span>
            )}
            <span className="truncate text-[11px] font-semibold">4. Verifying</span>
          </div>

          {/* Step 5: Healed */}
          <div className={`p-2 rounded border flex items-center gap-1.5 ${
            isHealed
              ? 'bg-emerald-950/40 border-emerald-600 text-emerald-300 font-bold'
              : 'bg-zinc-900 border-zinc-800 text-zinc-500'
          }`}>
            {isHealed ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
            ) : (
              <span className="w-3.5 h-3.5 rounded-full border border-zinc-600 flex items-center justify-center text-[9px]">5</span>
            )}
            <span className="truncate text-[11px] font-semibold">5. Healed</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 6. VERIFICATION HEALTH CHECKS (Requirement 20) */}
      {/* ========================================================================= */}
      <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="text-zinc-400 font-bold uppercase flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Verification Telemetry Signals
          </span>
          <span className="text-[10px] text-zinc-500">AUTHORITATIVE KUBERNETES</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
          <div className="p-2 rounded bg-zinc-900/60 border border-zinc-800/80 flex items-center gap-1.5">
            <Check className={`w-3.5 h-3.5 ${isHealed ? 'text-emerald-400' : 'text-zinc-600'}`} />
            <span className={isHealed ? 'text-zinc-200' : 'text-zinc-500'}>Pod scheduled</span>
          </div>
          <div className="p-2 rounded bg-zinc-900/60 border border-zinc-800/80 flex items-center gap-1.5">
            <Check className={`w-3.5 h-3.5 ${isHealed ? 'text-emerald-400' : 'text-zinc-600'}`} />
            <span className={isHealed ? 'text-zinc-200' : 'text-zinc-500'}>Container running</span>
          </div>
          <div className="p-2 rounded bg-zinc-900/60 border border-zinc-800/80 flex items-center gap-1.5">
            <Check className={`w-3.5 h-3.5 ${isHealed ? 'text-emerald-400' : 'text-zinc-600'}`} />
            <span className={isHealed ? 'text-zinc-200' : 'text-zinc-500'}>Readiness passed</span>
          </div>
          <div className="p-2 rounded bg-zinc-900/60 border border-zinc-800/80 flex items-center gap-1.5">
            <Check className={`w-3.5 h-3.5 ${isHealed ? 'text-emerald-400' : 'text-zinc-600'}`} />
            <span className={isHealed ? 'text-zinc-200' : 'text-zinc-500'}>Condition cleared</span>
          </div>
        </div>
      </div>
    </div>
  );
};
