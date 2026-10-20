import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  GitCommit,
  GitCompare,
  Layers,
  Loader2,
  RotateCcw,
  ShieldCheck,
  X,
  Zap
} from 'lucide-react';
import { api } from '../../api/client';
import { Cluster, DeploymentRecord, KubernetesResource, RemediationAction } from '../../types/index';
import { Modal } from '../common/UI';

interface ReleaseDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  cluster: Cluster;
  deployment: KubernetesResource | null;
  historyRecords: DeploymentRecord[];
  onRollbackSuccess: (action: RemediationAction, updatedResource?: KubernetesResource) => void;
}

export const ReleaseDiffModal: React.FC<ReleaseDiffModalProps> = ({
  isOpen,
  onClose,
  cluster,
  deployment,
  historyRecords,
  onRollbackSuccess
}) => {
  if (!isOpen || !deployment) return null;

  const currentRevStr =
    deployment.annotations?.['deployment.kubernetes.io/revision'] ||
    (deployment.statusSummary as any)?.revision ||
    '1';
  const currentRevisionNum = parseInt(currentRevStr, 10) || 1;

  // Filter history records matching this deployment
  const matchingRecords = historyRecords.filter(
    (h) => h.name.toLowerCase() === deployment.name.toLowerCase()
  );

  const [selectedTargetRev, setSelectedTargetRev] = useState<string>(
    matchingRecords.length > 1 ? matchingRecords[1].revision : String(Math.max(1, currentRevisionNum - 1))
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedScope, setConfirmedScope] = useState(false);

  const currentRecord = matchingRecords[0];
  const targetRecord = matchingRecords.find((r) => r.revision === selectedTargetRev) || matchingRecords[1];

  const currentImage =
    (deployment.specSummary as any)?.template?.spec?.containers?.[0]?.image ||
    deployment.containers?.[0]?.image ||
    currentRecord?.image ||
    `${deployment.name}:${currentRevStr}`;

  const targetImage =
    targetRecord?.image ||
    (currentRecord?.previousImage) ||
    `${deployment.name}:${selectedTargetRev}`;

  const currentReps = (deployment.specSummary as any)?.replicas ?? deployment.specReplicas ?? currentRecord?.replicas ?? 1;
  const targetReps = targetRecord?.replicas ?? currentRecord?.previousReplicas ?? currentReps;

  const isConnected =
    cluster.agentStatus === 'CONNECTED' ||
    cluster.connectionState === 'connected' ||
    cluster.connectionStatus === 'connected' ||
    (cluster.lastHeartbeat ? Date.now() - cluster.lastHeartbeat < 5 * 60 * 1000 : false) ||
    (cluster.lastSeenAt ? Date.now() - cluster.lastSeenAt < 5 * 60 * 1000 : false) ||
    Boolean(cluster.isSimulated);

  const hasValidTarget = matchingRecords.length > 1 || currentRevisionNum > 1;

  const handleRollback = async () => {
    if (!isConnected && !cluster.isSimulated) return;

    try {
      setSubmitting(true);
      setError(null);
      const res = await api.executeClusterOperation(cluster.id, {
        actionType: 'RollbackDeployment',
        targetKind: 'Deployment',
        targetName: deployment.name,
        targetNamespace: deployment.namespace,
        targetUid: deployment.uid,
        parameters: {
          targetRevision: selectedTargetRev,
          expectedRevision: currentRevStr,
          reason: `Rollback to revision ${selectedTargetRev} from unified operations workspace`
        }
      });
      onRollbackSuccess(res.action, res.updatedResource);
      onClose();
    } catch (err: any) {
      console.error('Rollback error:', err);
      setError(err?.message || 'Failed to rollback deployment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Deployment Revision Comparison & Rollback" size="lg">
      <div className="space-y-6 text-zinc-100 font-sans">
        {/* Subheader Context */}
        <div className="flex items-center justify-between gap-3 bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/60 text-xs">
          <div className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-amber-400" />
            <span className="font-semibold text-zinc-200">Target Workload:</span>
            <span className="font-mono text-zinc-300">{deployment.namespace}/{deployment.name}</span>
          </div>
          <span className="text-zinc-400">Cluster: <span className="text-zinc-200">{cluster.name}</span></span>
        </div>

        {/* Revision Selector */}
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
          <div>
            <span className="text-zinc-400 block mb-1">Target Revision to Compare / Restore:</span>
            <div className="flex items-center gap-2">
              <select
                value={selectedTargetRev}
                onChange={(e) => setSelectedTargetRev(e.target.value)}
                className="px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-xs font-medium text-zinc-100 focus:outline-none focus:border-sky-500"
              >
                {matchingRecords.length > 0 ? (
                  matchingRecords
                    .filter((r) => r.revision !== (currentRecord?.revision || currentRevStr))
                    .map((r) => (
                      <option key={r.id} value={r.revision}>
                        Revision {r.revision} ({new Date(r.startedAt).toLocaleTimeString()}) - {r.image}
                      </option>
                    ))
                ) : (
                  <>
                    <option value={String(Math.max(1, currentRevisionNum - 1))}>
                      Revision {Math.max(1, currentRevisionNum - 1)} (Previous)
                    </option>
                    {currentRevisionNum > 2 && (
                      <option value="1">Revision 1 (Base)</option>
                    )}
                  </>
                )}
              </select>
              <span className="text-zinc-500 text-xs">
                (Current Live: <strong className="text-sky-400">rev {currentRevStr}</strong>)
              </span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[11px] text-zinc-500 block">Total recorded revisions</span>
            <span className="text-xs font-semibold text-zinc-300">
              {Math.max(matchingRecords.length, currentRevisionNum)} revisions in history
            </span>
          </div>
        </div>

        {/* Side-by-Side Diff Table */}
        <div className="border border-zinc-800 rounded-xl overflow-hidden text-xs">
          <div className="grid grid-cols-3 bg-zinc-900/80 p-3 font-semibold text-zinc-300 border-b border-zinc-800">
            <div>Parameter</div>
            <div className="text-sky-400 flex items-center gap-1.5">
              <span>Current (rev {currentRevStr})</span>
              <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-sky-950/80 text-sky-300 border border-sky-800/60">LIVE</span>
            </div>
            <div className="text-amber-400">Target (rev {selectedTargetRev})</div>
          </div>

          {/* Row 1: Image */}
          <div className="grid grid-cols-3 p-3.5 border-b border-zinc-800/60 items-center bg-zinc-950/40">
            <span className="font-medium text-zinc-400">Container Image</span>
            <span className="font-mono text-zinc-200 truncate pr-2" title={currentImage}>
              {currentImage}
            </span>
            <span className={`font-mono truncate pr-2 ${currentImage !== targetImage ? 'text-amber-300 font-semibold' : 'text-zinc-300'}`} title={targetImage}>
              {targetImage}
            </span>
          </div>

          {/* Row 2: Replicas */}
          <div className="grid grid-cols-3 p-3.5 border-b border-zinc-800/60 items-center bg-zinc-950/20">
            <span className="font-medium text-zinc-400">Desired Replicas</span>
            <span className="font-mono text-zinc-200">{currentReps} pods</span>
            <span className={`font-mono ${currentReps !== targetReps ? 'text-amber-300 font-semibold' : 'text-zinc-300'}`}>
              {targetReps} pods
            </span>
          </div>

          {/* Row 3: Health State */}
          <div className="grid grid-cols-3 p-3.5 border-b border-zinc-800/60 items-center bg-zinc-950/40">
            <span className="font-medium text-zinc-400">Health State</span>
            <span className={`font-medium ${deployment.health === 'HEALTHY' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {deployment.health} ({deployment.status})
            </span>
            <span className="text-emerald-400 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>HEALTHY (Recorded snapshot)</span>
            </span>
          </div>

          {/* Row 4: Rollback Strategy */}
          <div className="grid grid-cols-3 p-3.5 items-center bg-zinc-950/20">
            <span className="font-medium text-zinc-400">Rollout Mechanism</span>
            <span className="text-zinc-400">Standard RollingUpdate</span>
            <span className="text-zinc-300">
              Patch deployment pod template to revision {selectedTargetRev} ReplicaSet
            </span>
          </div>
        </div>

        {/* Rollback Scope & Disruption Notice */}
        <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-800/60 space-y-2 text-xs">
          <div className="flex items-center gap-2 font-semibold text-amber-300">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Rollback Impact & Restoration Scope</span>
          </div>
          <p className="text-zinc-300 leading-relaxed text-[11px]">
            Executing this rollback will trigger a <strong>RollingUpdate</strong> to revision {selectedTargetRev}. Kubernetes will launch pods running <code className="text-amber-300 font-mono px-1 bg-zinc-900 rounded">{targetImage}</code> and progressively terminate current pods. In-flight requests may experience transient retries.
          </p>
          <p className="text-zinc-400 leading-relaxed text-[11px] border-t border-zinc-800/80 pt-1.5">
            <strong>Critical Boundary:</strong> Deployment rollback <em>only</em> restores the Pod template and ReplicaSet container spec. It does <strong>NOT</strong> revert database migrations, external cloud resources, ConfigMaps, Secrets, or persistent volumes.
          </p>
        </div>

        {/* Explicit Confirmation Checkbox */}
        <label className="flex items-start gap-2.5 p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={confirmedScope}
            onChange={(e) => setConfirmedScope(e.target.checked)}
            className="mt-0.5 rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
          />
          <span className="text-xs text-zinc-300">
            I confirm that I want to roll back <strong className="text-zinc-100">{deployment.name}</strong> from rev {currentRevStr} to rev {selectedTargetRev}, and acknowledge external state/databases must be verified separately.
          </span>
        </label>

        {/* Error message */}
        {error && (
          <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/80 text-xs text-rose-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Offline Warning */}
        {!isConnected && !cluster.isSimulated && (
          <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-xs text-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-amber-300">Mutation Disabled (Agent Offline)</span>
              <p className="mt-0.5 text-zinc-300">
                You cannot trigger rollbacks while the cluster agent is disconnected. Reconnect the agent to execute live rollbacks.
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-zinc-800/80">
          <p className="text-[11px] text-zinc-500 max-w-sm">
            Rollbacks execute through authorized Kubernetes mutation and are verified via incoming cluster telemetry.
          </p>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3.5 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleRollback}
              disabled={submitting || (!isConnected && !cluster.isSimulated) || !hasValidTarget || !confirmedScope}
              className="px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white transition-all cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Executing Rollback...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Rollback to Revision {selectedTargetRev}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
