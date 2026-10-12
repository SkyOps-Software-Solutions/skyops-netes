import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Layers,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sliders,
  Terminal,
  Trash2,
  X,
  Zap,
  ShieldAlert
} from 'lucide-react';
import { api } from '../../api/client';
import { Cluster, KubernetesResource, RemediationAction } from '../../types/index';
import { Modal, Button } from '../common/UI';

export type OperationActionType =
  | 'RolloutRestart'
  | 'RestartPod'
  | 'DeletePod'
  | 'ScaleDeployment'
  | 'ScaleWorkload'
  | 'RollbackDeployment'
  | 'CordonNode'
  | 'UncordonNode'
  | 'DrainNode'
  | 'SuspendCronJob'
  | 'ResumeCronJob'
  | 'TriggerCronJob'
  | 'RerunJob';

interface OperationActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  cluster: Cluster;
  resource: KubernetesResource;
  actionType: OperationActionType;
  onSuccess: (action: RemediationAction, updatedResource?: KubernetesResource) => void;
}

export const OperationActionModal: React.FC<OperationActionModalProps> = ({
  isOpen,
  onClose,
  cluster,
  resource,
  actionType,
  onSuccess
}) => {
  const currentReplicas =
    (resource.specSummary as any)?.replicas ?? resource.specReplicas ?? 1;

  const currentRevStr =
    resource.annotations?.['deployment.kubernetes.io/revision'] ||
    (resource.statusSummary as any)?.revision ||
    '1';
  const currentRevisionNum = parseInt(currentRevStr, 10) || 1;
  const suggestedRollbackRev = currentRevisionNum > 1 ? String(currentRevisionNum - 1) : '1';

  const isNakedPod = resource.kind === 'Pod' && (!resource.ownerReferences || resource.ownerReferences.length === 0);

  const [targetReplicas, setTargetReplicas] = useState<number>(currentReplicas);
  const [targetRevision, setTargetRevision] = useState<string>(suggestedRollbackRev);
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{ message: string; action: RemediationAction } | null>(null);

  // Safety confirmation states
  const [confirmScaleToZero, setConfirmScaleToZero] = useState(false);
  const [confirmNakedPodDelete, setConfirmNakedPodDelete] = useState(false);
  const [confirmDrain, setConfirmDrain] = useState(false);
  const [ignoreDaemonSets, setIgnoreDaemonSets] = useState(true);
  const [deleteEmptyDirData, setDeleteEmptyDirData] = useState(false);

  if (!isOpen) return null;

  const isConnected =
    cluster.agentStatus === 'CONNECTED' ||
    cluster.connectionState === 'connected' ||
    cluster.connectionStatus === 'connected' ||
    (cluster.lastHeartbeat ? Date.now() - cluster.lastHeartbeat < 5 * 60 * 1000 : false) ||
    (cluster.lastSeenAt ? Date.now() - cluster.lastSeenAt < 5 * 60 * 1000 : false) ||
    Boolean(cluster.isSimulated);

  const isDisconnectedAndProd = !isConnected && !cluster.isSimulated;

  const getActionConfig = () => {
    switch (actionType) {
      case 'RolloutRestart':
        return {
          title: `Rollout Restart ${resource.kind}`,
          icon: <RefreshCw className="w-5 h-5 text-sky-400" />,
          riskLevel: 'LOW',
          riskColor: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/60',
          description:
            `Initiates an orderly rolling update for "${resource.name}". Existing pods are replaced incrementally without dropping active traffic.`,
          impact: 'Pods are cycled one-by-one according to rolling update strategy. Slight temporary increase in cluster CPU/Memory during pod spin-up.'
        };
      case 'ScaleDeployment':
      case 'ScaleWorkload':
        return {
          title: `Scale Replicas for ${resource.name}`,
          icon: <Sliders className="w-5 h-5 text-indigo-400" />,
          riskLevel: targetReplicas === 0 ? 'HIGH' : 'MEDIUM',
          riskColor: targetReplicas === 0 ? 'text-rose-400 bg-rose-950/40 border-rose-800/60' : 'text-amber-400 bg-amber-950/40 border-amber-800/60',
          description:
            resource.kind === 'StatefulSet'
              ? `Modifies replica count for StatefulSet "${resource.name}". StatefulSets follow strict ordinal scale-down (N-1 down to 0). Note: PVCs are persistent and will NOT be automatically deleted.`
              : `Modifies desired replica count for ${resource.kind} "${resource.name}" in namespace "${resource.namespace}". Allowed range is 0 to 50 replicas.`,
          impact: targetReplicas === 0
            ? 'CRITICAL IMPACT: Scaling to 0 terminates all pods and stops handling active application traffic.'
            : 'Surplus pods will be terminated when scaling down; new pods will be scheduled when scaling up.'
        };
      case 'RollbackDeployment':
        return {
          title: `Rollback Deployment Revisions`,
          icon: <RotateCcw className="w-5 h-5 text-amber-400" />,
          riskLevel: 'MEDIUM',
          riskColor: 'text-amber-400 bg-amber-950/40 border-amber-800/60',
          description:
            `Restores deployment template to a previous ReplicaSet revision. Currently at revision ${currentRevisionNum}.`,
          impact: 'Rolls back container image, environment config, and resource requests to the designated revision snapshot.'
        };
      case 'DeletePod':
      case 'RestartPod':
        return {
          title: `Delete Pod "${resource.name}"`,
          icon: <Trash2 className="w-5 h-5 text-rose-400" />,
          riskLevel: isNakedPod ? 'HIGH' : 'LOW',
          riskColor: isNakedPod ? 'text-rose-400 bg-rose-950/40 border-rose-800/60' : 'text-amber-400 bg-amber-950/40 border-amber-800/60',
          description:
            `Deletes pod "${resource.name}". ` +
            (!isNakedPod
              ? `This pod is controller-managed (${resource.ownerReferences![0].kind}/${resource.ownerReferences![0].name}). A fresh replacement pod will be provisioned automatically.`
              : 'CRITICAL: This is a standalone (naked) pod without a controller owner! It will NOT be recreated after deletion.'),
          impact: 'Active processes inside the pod receive SIGTERM followed by SIGKILL after grace period.'
        };
      case 'CordonNode':
        return {
          title: `Cordon Worker Node "${resource.name}"`,
          icon: <ShieldAlert className="w-5 h-5 text-amber-400" />,
          riskLevel: 'LOW',
          riskColor: 'text-amber-400 bg-amber-950/40 border-amber-800/60',
          description:
            `Marks worker node "${resource.name}" as unschedulable. Existing pods continue running, but no new pods will be scheduled here.`,
          impact: 'Prevents Kubernetes scheduler from placing new workloads on this node during maintenance.'
        };
      case 'UncordonNode':
        return {
          title: `Uncordon Worker Node "${resource.name}"`,
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
          riskLevel: 'LOW',
          riskColor: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/60',
          description:
            `Restores schedulable status on node "${resource.name}". Scheduler will resume placing pods on this worker node.`,
          impact: 'Worker node returns to standard active cluster scheduling.'
        };
      case 'DrainNode':
        return {
          title: `Drain Worker Node "${resource.name}"`,
          icon: <AlertTriangle className="w-5 h-5 text-rose-400" />,
          riskLevel: 'HIGH',
          riskColor: 'text-rose-400 bg-rose-950/40 border-rose-800/60',
          description:
            `Safely evicts non-DaemonSet pods from node "${resource.name}" so node can be taken offline. Node will be cordoned first.`,
          impact: 'Pods are evicted through the Eviction API respecting PodDisruptionBudgets (PDBs). Non-DaemonSet pods will be relocated to other ready nodes.'
        };
      case 'SuspendCronJob':
        return {
          title: `Suspend CronJob "${resource.name}"`,
          icon: <Clock className="w-5 h-5 text-amber-400" />,
          riskLevel: 'LOW',
          riskColor: 'text-amber-400 bg-amber-950/40 border-amber-800/60',
          description:
            `Suspends scheduled job runs for CronJob "${resource.name}". Currently running jobs will run to completion.`,
          impact: 'Prevents automatic cron triggers until resumed.'
        };
      case 'ResumeCronJob':
        return {
          title: `Resume CronJob "${resource.name}"`,
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
          riskLevel: 'LOW',
          riskColor: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/60',
          description:
            `Resumes scheduled executions for CronJob "${resource.name}" according to its configured schedule.`,
          impact: 'CronJob resumes normal periodic execution.'
        };
      case 'TriggerCronJob':
        return {
          title: `Trigger CronJob Run "${resource.name}"`,
          icon: <Zap className="w-5 h-5 text-sky-400" />,
          riskLevel: 'LOW',
          riskColor: 'text-sky-400 bg-sky-950/40 border-sky-800/60',
          description:
            `Manually spawns a new Job execution from CronJob "${resource.name}" immediately without waiting for cron schedule.`,
          impact: 'Spawns an active Job. Note: If ConcurrencyPolicy is Forbid and another run is active, duplicates may be queued or skipped.'
        };
      case 'RerunJob':
        return {
          title: `Rerun Batch Job "${resource.name}"`,
          icon: <RefreshCw className="w-5 h-5 text-indigo-400" />,
          riskLevel: 'LOW',
          riskColor: 'text-indigo-400 bg-indigo-950/40 border-indigo-800/60',
          description:
            `Creates a new Job instance duplicating the specification of Job "${resource.name}".`,
          impact: 'Launches pod batch tasks until completion.'
        };
    }
  };

  const config = getActionConfig();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDisconnectedAndProd) return;

    try {
      setSubmitting(true);
      setError(null);

      const payload: any = {
        actionType,
        targetKind: resource.kind,
        targetName: resource.name,
        targetNamespace: resource.namespace || undefined,
        parameters: {
          reason: reason.trim() || undefined
        }
      };

      if (actionType === 'ScaleDeployment') {
        payload.parameters.targetReplicas = targetReplicas;
      } else if (actionType === 'RollbackDeployment') {
        payload.parameters.targetRevision = targetRevision;
      }

      const res = await api.executeClusterOperation(cluster.id, payload);
      setSuccessResult({ message: res.message, action: res.action });

      setTimeout(() => {
        onSuccess(res.action, res.updatedResource);
        onClose();
      }, 1400);
    } catch (err: any) {
      console.error('Operation execution failure:', err);
      setError(err?.message || 'Failed to dispatch cluster operation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={config.title} size="md">
      <div className="space-y-5 text-zinc-100 font-sans">
        {/* Context Bar */}
        <div className="flex items-center justify-between gap-3 bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
              {config.icon}
            </div>
            <div>
              <p className="text-xs text-zinc-400">
                Cluster: <span className="text-zinc-200 font-medium">{cluster.name}</span>
                {resource.namespace && (
                  <> · Namespace: <span className="text-zinc-200 font-medium">{resource.namespace}</span></>
                )}
              </p>
              <p className="text-xs font-mono text-zinc-300">Target: {resource.kind}/{resource.name}</p>
            </div>
          </div>
          <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${config.riskColor}`}>
            Risk: {config.riskLevel}
          </span>
        </div>

        {/* Offline Warning Banner */}
        {isDisconnectedAndProd && (
          <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-xs text-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-amber-300">Live Agent Disconnected</span>
              <p className="mt-0.5 text-zinc-300">
                Mutations requiring live state are disabled because the SkyOps cluster agent is currently offline. Reconnect the agent to execute operational actions.
              </p>
            </div>
          </div>
        )}

        {/* Description & Impact */}
        <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-2 text-xs">
          <p className="text-zinc-300 leading-relaxed">{config.description}</p>
          <div className="pt-2 border-t border-zinc-800/60 flex items-start gap-2 text-zinc-400">
            <span className="font-medium text-zinc-300 shrink-0">Operational Impact:</span>
            <span>{config.impact}</span>
          </div>
        </div>

        {/* Action Specific Inputs */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {actionType === 'ScaleDeployment' && (
            <div className="space-y-2 p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300 font-medium">Desired Replicas:</span>
                <span className="font-mono font-bold text-sky-400 text-sm">
                  {targetReplicas} <span className="text-zinc-500 font-normal text-xs">(Current: {currentReplicas})</span>
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={20}
                value={targetReplicas}
                onChange={(e) => setTargetReplicas(parseInt(e.target.value, 10))}
                className="w-full accent-sky-500 cursor-pointer"
              />
              <div className="flex items-center justify-between text-[11px] text-zinc-500">
                <span>1 replica (min)</span>
                <span>10</span>
                <span>20 replicas (safety cap)</span>
              </div>
            </div>
          )}

          {actionType === 'RollbackDeployment' && (
            <div className="space-y-2 p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800">
              <label className="text-xs font-medium text-zinc-300 block">
                Target Revision:
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={targetRevision}
                  onChange={(e) => setTargetRevision(e.target.value)}
                  placeholder="e.g. 2"
                  className="px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-xs font-mono text-zinc-100 focus:outline-none focus:border-sky-500 w-32"
                />
                <span className="text-xs text-zinc-400">
                  Current active revision: <strong className="text-zinc-200">rev {currentRevisionNum}</strong>
                </span>
              </div>
              {currentRevisionNum <= 1 && (
                <p className="text-[11px] text-rose-400">
                  Notice: Workload is currently at initial revision 1. No earlier revision history is recorded.
                </p>
              )}
            </div>
          )}

          {/* Optional reason / audit annotation */}
          <div>
            <label className="text-xs font-medium text-zinc-300 block mb-1.5">
              Operational Reason (Logged in immutable audit trail):
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Cleared memory pressure during high traffic window"
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Feedback messages */}
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/80 text-xs text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successResult && (
            <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/80 text-xs text-emerald-300 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">{successResult.message}</span>
                <p className="mt-0.5 text-zinc-300">Action ID: {successResult.action.id} · Status: {successResult.action.status}</p>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3.5 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting || isDisconnectedAndProd || (actionType === 'RollbackDeployment' && currentRevisionNum <= 1)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 text-white transition-all cursor-pointer ${
                actionType === 'DeletePod' || actionType === 'RestartPod'
                  ? 'bg-rose-600 hover:bg-rose-500 disabled:opacity-50'
                  : 'bg-sky-600 hover:bg-sky-500 disabled:opacity-50'
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Dispatching to Cluster...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  <span>Execute {actionType.replace(/([A-Z])/g, ' $1').trim()}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};
