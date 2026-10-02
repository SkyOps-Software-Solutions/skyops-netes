import {
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Cpu,
  Layers,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  X
} from 'lucide-react';
import React, { useState } from 'react';
import { api } from '../../api/client';
import { DeploymentGateEvaluation } from '../../types/index';

interface PreDeploymentGateModalProps {
  clusterId: string;
  clusterName?: string;
  defaultNamespace?: string;
  defaultWorkload?: string;
  defaultImage?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const PreDeploymentGateModal: React.FC<PreDeploymentGateModalProps> = ({
  clusterId,
  clusterName = 'Kubernetes Cluster',
  defaultNamespace = 'production',
  defaultWorkload = 'checkout-api',
  defaultImage = 'checkout-api:v42',
  isOpen,
  onClose
}) => {
  const [workloadName, setWorkloadName] = useState<string>(defaultWorkload);
  const [namespace, setNamespace] = useState<string>(defaultNamespace);
  const [image, setImage] = useState<string>(defaultImage);
  const [replicas, setReplicas] = useState<number>(3);
  const [memoryLimit, setMemoryLimit] = useState<string>('512Mi');
  const [loading, setLoading] = useState<boolean>(false);
  const [evaluation, setEvaluation] = useState<DeploymentGateEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleEvaluate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!image.trim() || !workloadName.trim()) return;

    try {
      setLoading(true);
      setError(null);
      const res = await api.evaluateDeploymentGate(clusterId, {
        name: workloadName.trim(),
        namespace: namespace.trim(),
        image: image.trim(),
        replicas,
        resources: {
          limits: { memory: memoryLimit }
        }
      });
      setEvaluation(res.evaluation);
    } catch (err: any) {
      console.error('Failed to evaluate deployment gate:', err);
      setError(err?.message || 'Deployment gate evaluation failed');
    } finally {
      setLoading(false);
    }
  };

  const getDecisionBadge = (decision: 'PASS' | 'WARN' | 'BLOCK') => {
    switch (decision) {
      case 'BLOCK':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-red-500/20 text-red-300 border border-red-500/40">
            <AlertOctagon className="w-4 h-4 text-red-400" />
            BLOCKED BY CI/CD GATE
          </span>
        );
      case 'WARN':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            WARNING: PROCEED WITH CAUTION
          </span>
        );
      case 'PASS':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            SAFE TO DEPLOY (APPROVED)
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-zinc-100"
        role="dialog"
        aria-modal="true"
        aria-label="Pre-Deployment Health Gate"
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 bg-zinc-900/60 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                Incident Prevention
              </span>
              <span className="text-zinc-500 text-xs font-mono">{clusterName}</span>
            </div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-400" />
              Pre-Deployment Health Gate
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Evaluates rollouts against live cluster health, registry reachability, and capacity limits before deployment.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Close (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <form onSubmit={handleEvaluate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-zinc-400 uppercase text-[10px] font-bold block mb-1">
                  Workload Name
                </label>
                <input
                  type="text"
                  value={workloadName}
                  onChange={(e) => setWorkloadName(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:border-purple-500 focus:outline-none"
                  placeholder="e.g. checkout-api"
                  required
                />
              </div>

              <div>
                <label className="text-zinc-400 uppercase text-[10px] font-bold block mb-1">
                  Namespace
                </label>
                <input
                  type="text"
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:border-purple-500 focus:outline-none"
                  placeholder="production"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-zinc-400 uppercase text-[10px] font-bold block mb-1">
                Proposed Container Image
              </label>
              <input
                type="text"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:border-purple-500 focus:outline-none"
                placeholder="e.g. myregistry.io/checkout:v42 or sha256:..."
                required
              />
              <span className="text-[11px] text-zinc-500 mt-1 block">
                Simulates registry resolution, manifest check, and tag immutability.
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-zinc-400 uppercase text-[10px] font-bold block mb-1">
                  Replicas
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={replicas}
                  onChange={(e) => setReplicas(parseInt(e.target.value, 10) || 1)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-zinc-400 uppercase text-[10px] font-bold block mb-1">
                  Memory Request / Limit
                </label>
                <input
                  type="text"
                  value={memoryLimit}
                  onChange={(e) => setMemoryLimit(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:border-purple-500 focus:outline-none"
                  placeholder="512Mi"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-lg shadow-purple-950/40 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Running Pre-Flight Cluster Checks...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  Run Gate Verification Check
                </>
              )}
            </button>
          </form>

          {/* Evaluation Results */}
          {error && (
            <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-300">
              {error}
            </div>
          )}

          {evaluation && (
            <div className="space-y-4 pt-2 border-t border-zinc-800">
              <div className="flex items-center justify-between p-4 rounded-xl border bg-zinc-900/60">
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">
                    Deployment Decision
                  </span>
                  <div className="text-sm font-semibold text-white">{evaluation.reason}</div>
                </div>
                <div>{getDecisionBadge(evaluation.decision)}</div>
              </div>

              {/* Sub-checks checklist */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block">
                  Detailed Verification Results
                </span>

                {/* Check 1: Image */}
                <div
                  className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                    evaluation.checks.image.status === 'BLOCK'
                      ? 'border-red-500/40 bg-red-500/5 text-red-300'
                      : evaluation.checks.image.status === 'WARN'
                      ? 'border-amber-500/40 bg-amber-500/5 text-amber-300'
                      : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
                  }`}
                >
                  {evaluation.checks.image.status === 'BLOCK' ? (
                    <AlertOctagon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  ) : evaluation.checks.image.status === 'WARN' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <strong className="block font-semibold">Container Image Registry Check</strong>
                    <span className="text-zinc-300">{evaluation.checks.image.message}</span>
                  </div>
                </div>

                {/* Check 2: Capacity */}
                <div
                  className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                    evaluation.checks.capacity.status === 'BLOCK'
                      ? 'border-red-500/40 bg-red-500/5 text-red-300'
                      : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
                  }`}
                >
                  {evaluation.checks.capacity.status === 'BLOCK' ? (
                    <AlertOctagon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <strong className="block font-semibold">Node Capacity & Memory Limits Check</strong>
                    <span className="text-zinc-300">{evaluation.checks.capacity.message}</span>
                  </div>
                </div>

                {/* Check 3: Active Incidents */}
                <div
                  className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                    evaluation.checks.incidents.status === 'BLOCK'
                      ? 'border-red-500/40 bg-red-500/5 text-red-300'
                      : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
                  }`}
                >
                  {evaluation.checks.incidents.status === 'BLOCK' ? (
                    <AlertOctagon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <strong className="block font-semibold">Namespace Incident Stability Check</strong>
                    <span className="text-zinc-300">{evaluation.checks.incidents.message}</span>
                  </div>
                </div>
              </div>

              {/* Evidence Log */}
              {evaluation.evidence && evaluation.evidence.length > 0 && (
                <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg space-y-1">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold block">
                    Observed Cluster Evidence
                  </span>
                  {evaluation.evidence.map((ev, idx) => (
                    <div key={idx} className="text-[11px] font-mono text-zinc-400">
                      • {ev}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
