import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  ExternalLink,
  Flame,
  GitCommit,
  GitCompare,
  Info,
  Layers,
  Network,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Terminal,
  Trash2,
  Workflow,
  X,
  Zap,
  Tag,
  KeyRound,
  FileCode,
  HardDrive
} from 'lucide-react';
import { api } from '../../api/client';
import { Cluster, DeploymentRecord, Incident, K8sEvent, KubernetesResource, RemediationAction } from '../../types/index';
import { ClusterStatusBadge, PodPhaseBadge, ResourceHealthBadge, WorkloadKindBadge } from '../common/Badges';
import { Button, CodeBlock, CopyButton, EmptyState } from '../common/UI';
import { PodLogsViewer } from '../logs/PodLogsViewer';
import { OperationActionModal, OperationActionType } from './OperationActionModal';
import { ReleaseDiffModal } from './ReleaseDiffModal';

interface ResourceDetailPanelProps {
  cluster: Cluster;
  resource: KubernetesResource | null;
  onClose: () => void;
  incidents: Incident[];
  onSelectIncident?: (incidentId: string) => void;
  onOperationSuccess: (action: RemediationAction, updatedResource?: KubernetesResource) => void;
  deploymentRecords?: DeploymentRecord[];
}

type DetailTab = 'overview' | 'revisions' | 'relationships' | 'logs' | 'events' | 'diagnosis' | 'yaml';

export const ResourceDetailPanel: React.FC<ResourceDetailPanelProps> = ({
  cluster,
  resource,
  onClose,
  incidents,
  onSelectIncident,
  onOperationSuccess,
  deploymentRecords = []
}) => {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [events, setEvents] = useState<K8sEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [activeActionModal, setActiveActionModal] = useState<OperationActionType | null>(null);
  const [isReleaseDiffOpen, setIsReleaseDiffOpen] = useState(false);

  useEffect(() => {
    setActiveTab('overview');
  }, [resource?.id]);

  useEffect(() => {
    if (!resource || !cluster.id) return;
    const fetchEvents = async () => {
      try {
        setLoadingEvents(true);
        const data = await api.getClusterEvents(cluster.id, {
          namespace: resource.namespace || undefined
        });
        const allEvts = Array.isArray(data) ? data : (data as any)?.events || [];
        const matching = allEvts.filter(
          (e) =>
            e.objectName?.toLowerCase() === resource.name.toLowerCase() ||
            e.message?.toLowerCase().includes(resource.name.toLowerCase())
        );
        setEvents(matching);
      } catch (err) {
        console.warn('Events fetch notice in detail panel:', err);
      } finally {
        setLoadingEvents(false);
      }
    };

    fetchEvents();
  }, [cluster.id, resource?.name, resource?.namespace]);

  if (!resource) return null;

  const associatedIncident = incidents.find(
    (i) =>
      i.clusterId === cluster.id &&
      i.resourceName?.toLowerCase() === resource.name.toLowerCase() &&
      (i.status === 'OPEN' || i.status === 'IN_PROGRESS' || i.status === 'ACKNOWLEDGED')
  );

  const isConnected =
    cluster.agentStatus === 'CONNECTED' ||
    cluster.connectionState === 'connected' ||
    cluster.connectionStatus === 'connected' ||
    (cluster.lastHeartbeat ? Date.now() - cluster.lastHeartbeat < 5 * 60 * 1000 : false) ||
    (cluster.lastSeenAt ? Date.now() - cluster.lastSeenAt < 5 * 60 * 1000 : false) ||
    Boolean(cluster.isSimulated);

  // Plain-language explanation of failure states
  const getFailureDiagnosis = () => {
    const status = (resource.status || '').toLowerCase();
    const health = resource.health;

    if (status.includes('crashloopbackoff')) {
      return {
        title: 'CrashLoopBackOff Detected',
        observed: 'Container initialized, executed, but exited with a failure return code. Kubernetes is delaying restart attempts in exponential backoff.',
        possibleCauses: [
          'Application process crashed during startup due to missing environment variables, configuration syntax errors, or panics.',
          'Database or backend dependency connectivity failed during health probe check.',
          'Missing secrets, certificates, or unmounted ConfigMaps required at startup.'
        ],
        recommendedActions: [
          'Inspect container exit code and standard error output in Live Logs tab.',
          'Verify environment variables, secret mounts, and database credentials.',
          'Perform a Rollout Restart once configuration is verified.'
        ]
      };
    }

    if (status.includes('imagepullbackoff') || status.includes('errimagepull')) {
      return {
        title: 'Image Pull Failure',
        observed: 'The kubelet daemon on the worker node was unable to download the container image tag from the remote registry.',
        possibleCauses: [
          'Image tag does not exist or was mistyped in deployment spec.',
          'Container registry authentication failed or imagePullSecret is missing.',
          'Network route or firewall blocking egress from worker node to container registry.'
        ],
        recommendedActions: [
          'Check image repository URL and tag name in overview tab.',
          'Verify imagePullSecrets in the workload spec.',
          'Rollback deployment to the previous known good image version.'
        ]
      };
    }

    if (status.includes('oomkilled')) {
      return {
        title: 'Out Of Memory (OOMKilled) Detected',
        observed: 'The Linux kernel OOM Killer terminated the container process because memory usage exceeded the spec.resources.limits.memory limit.',
        possibleCauses: [
          'Application memory leak accumulating over time.',
          'Workload traffic spike requiring more memory buffer than provisioned in container spec limits.',
          'JVM / Node.js heap limit configured higher than container cgroup limit.'
        ],
        recommendedActions: [
          'Review peak memory consumption telemetry in Observability tab.',
          'Increase container memory limits in workload specification.',
          'Scale workload to distribute load across more replica pods.'
        ]
      };
    }

    if (health === 'CRITICAL' || health === 'WARNING') {
      return {
        title: `${resource.kind} Degraded`,
        observed: `Resource reported non-healthy state (${resource.status || health}). Replicas or readiness probes are not meeting spec requirements.`,
        possibleCauses: [
          'Readiness or liveness probe failures.',
          'Cluster node resource exhaustion (scheduling starvation).',
          'Pod scheduling constraints (taints, tolerations, or affinity rules) unsatisfied.'
        ],
        recommendedActions: [
          'Inspect Kubernetes events below for scheduling or probe errors.',
          'Check worker node capacity and allocatable CPU/Memory.',
          'Review pod conditions and container states.'
        ]
      };
    }

    return null;
  };

  const failureDiagnosis = getFailureDiagnosis();

  // Determine available actions based on resource kind
  const canRestartWorkload = ['Deployment', 'StatefulSet', 'DaemonSet'].includes(resource.kind);
  const canScale = ['Deployment', 'StatefulSet'].includes(resource.kind);
  const canRollback = resource.kind === 'Deployment';
  const canDeletePod = resource.kind === 'Pod';
  const canCordonNode = resource.kind === 'Node';
  const canDrainNode = resource.kind === 'Node';
  const canManageCronJob = resource.kind === 'CronJob';
  const canRerunJob = resource.kind === 'Job';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer"
        onClick={onClose}
        aria-label="Close detail panel overlay"
      />
      <div className="fixed inset-y-0 right-0 z-40 w-full max-w-2xl bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col font-sans text-zinc-100 animate-in slide-in-from-right duration-200">
        {/* Top Header */}
        <div className="p-5 border-b border-zinc-800 bg-zinc-900/60 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <WorkloadKindBadge kind={resource.kind} />
                <ResourceHealthBadge health={resource.health} />
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                  {resource.namespace ? `${resource.namespace} / ` : ''}{resource.name}
                </span>
              </div>
              <h1 className="text-lg font-bold text-zinc-100 truncate mt-1.5 flex items-center gap-2">
                <span>{resource.name}</span>
                {resource.status && (
                  <span className="text-xs font-normal text-zinc-400 font-mono">
                    ({resource.status})
                  </span>
                )}
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Cluster: <span className="text-zinc-300 font-medium">{cluster.name}</span> · Age: {new Date(resource.createdAt).toLocaleDateString()}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
                title="Close detail panel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Quick Actions Bar */}
          <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center gap-2 flex-wrap">
            {canRestartWorkload && (
              <button
                onClick={() => setActiveActionModal('RolloutRestart')}
                disabled={!isConnected && !cluster.isSimulated}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-medium text-zinc-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Perform rolling restart without downtime"
              >
                <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
                <span>Rollout Restart</span>
              </button>
            )}

            {canScale && (
              <button
                onClick={() => setActiveActionModal('ScaleDeployment')}
                disabled={!isConnected && !cluster.isSimulated}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-medium text-zinc-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Scale replica count"
              >
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                <span>Scale Replicas</span>
              </button>
            )}

            {canRollback && (
              <button
                onClick={() => setIsReleaseDiffOpen(true)}
                disabled={!isConnected && !cluster.isSimulated}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-medium text-zinc-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Compare revisions and plan rollback"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>Compare & Rollback</span>
              </button>
            )}

            {canDeletePod && (
              <button
                onClick={() => setActiveActionModal('DeletePod')}
                disabled={!isConnected && !cluster.isSimulated}
                className="px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800/60 disabled:opacity-50 text-xs font-medium text-rose-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Delete pod and trigger replica controller recreation"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Delete Pod</span>
              </button>
            )}

            {canCordonNode && (
              <button
                onClick={() => setActiveActionModal((resource.specSummary as any)?.unschedulable ? 'UncordonNode' : 'CordonNode')}
                disabled={!isConnected && !cluster.isSimulated}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-medium text-zinc-200 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span>{(resource.specSummary as any)?.unschedulable ? 'Uncordon Node' : 'Cordon Node'}</span>
              </button>
            )}

            {canDrainNode && (
              <button
                onClick={() => setActiveActionModal('DrainNode')}
                disabled={!isConnected && !cluster.isSimulated}
                className="px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800/60 disabled:opacity-50 text-xs font-medium text-rose-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Safely evict workloads and drain node"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>Drain Node</span>
              </button>
            )}

            {canManageCronJob && (
              <>
                <button
                  onClick={() => setActiveActionModal('TriggerCronJob')}
                  disabled={!isConnected && !cluster.isSimulated}
                  className="px-3 py-1.5 rounded-lg bg-sky-950/60 hover:bg-sky-900/60 border border-sky-800/60 disabled:opacity-50 text-xs font-medium text-sky-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Trigger immediate execution of CronJob"
                >
                  <Zap className="w-3.5 h-3.5 text-sky-400" />
                  <span>Trigger Run</span>
                </button>
                <button
                  onClick={() =>
                    setActiveActionModal(
                      (resource.specSummary as any)?.suspend ? 'ResumeCronJob' : 'SuspendCronJob'
                    )
                  }
                  disabled={!isConnected && !cluster.isSimulated}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-medium text-zinc-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                  title={(resource.specSummary as any)?.suspend ? 'Resume schedule' : 'Suspend schedule'}
                >
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>{(resource.specSummary as any)?.suspend ? 'Resume CronJob' : 'Suspend CronJob'}</span>
                </button>
              </>
            )}

            {canRerunJob && (
              <button
                onClick={() => setActiveActionModal('RerunJob')}
                disabled={!isConnected && !cluster.isSimulated}
                className="px-3 py-1.5 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-800/60 disabled:opacity-50 text-xs font-medium text-indigo-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Spawn a fresh instance of this batch Job"
              >
                <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                <span>Rerun Job</span>
              </button>
            )}
          </div>
        </div>

        {/* Incident Alert Banner */}
        {associatedIncident && (
          <div className="bg-rose-950/40 border-b border-rose-800/80 px-5 py-3 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-rose-300">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                Active Incident: <strong className="font-semibold text-white">{associatedIncident.title}</strong> ({associatedIncident.severity})
              </span>
            </div>
            {onSelectIncident && (
              <button
                onClick={() => onSelectIncident(associatedIncident.id)}
                className="px-2.5 py-1 rounded bg-rose-900/80 hover:bg-rose-800 text-rose-100 font-semibold text-xs flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>Investigate</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-5 border-b border-zinc-800 bg-zinc-950 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>

          {resource.kind === 'Deployment' && (
            <button
              onClick={() => setActiveTab('revisions')}
              className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'revisions'
                  ? 'border-sky-500 text-sky-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <GitCommit className="w-3.5 h-3.5" />
              <span>Releases & Revisions</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('relationships')}
            className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'relationships'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Workflow className="w-3.5 h-3.5" />
            <span>Relationships</span>
          </button>

          {(resource.kind === 'Pod' || resource.kind === 'Deployment') && (
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'logs'
                  ? 'border-sky-500 text-sky-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Live Logs</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('events')}
            className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'events'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Events ({events.length})</span>
          </button>

          {failureDiagnosis && (
            <button
              onClick={() => setActiveTab('diagnosis')}
              className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'diagnosis'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-amber-500/80 hover:text-amber-300'
              }`}
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>Failure Diagnosis</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('yaml')}
            className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'yaml'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Resource JSON</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-5 text-xs">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <span className="text-zinc-400 block text-[11px]">Health</span>
                  <span className="font-semibold text-zinc-100 mt-1 block">{resource.health}</span>
                </div>
                <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <span className="text-zinc-400 block text-[11px]">Observed Status</span>
                  <span className="font-semibold font-mono text-zinc-100 mt-1 block truncate" title={resource.status}>
                    {resource.status || 'Active'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <span className="text-zinc-400 block text-[11px]">Namespace</span>
                  <span className="font-semibold text-zinc-100 mt-1 block truncate">{resource.namespace || 'Cluster-Scoped'}</span>
                </div>
                <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <span className="text-zinc-400 block text-[11px]">Restarts</span>
                  <span className="font-semibold text-zinc-100 mt-1 block">{resource.restartCount ?? 0}</span>
                </div>
              </div>

              {/* Containers breakdown */}
              {resource.containers && resource.containers.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Containers ({resource.containers.length})</h3>
                  <div className="space-y-2">
                    {resource.containers.map((c, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-zinc-200">{c.name}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${c.ready ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60' : 'bg-rose-950 text-rose-400 border border-rose-800/60'}`}>
                            {c.ready ? 'Ready' : 'Not Ready'} · Restarts: {c.restartCount ?? 0}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-zinc-400 truncate" title={c.image}>
                          Image: <span className="text-zinc-200">{c.image}</span>
                        </div>
                        {c.waitingReason && (
                          <div className="p-2 rounded bg-rose-950/40 border border-rose-800/60 text-[11px] text-rose-300">
                            <strong>{c.waitingReason}:</strong> {c.waitingMessage}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resource-Specific Safegaurd & Diagnostics */}
              {resource.kind === 'Pod' && (
                <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                  <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                    <span>Controller Management & Lifecycle</span>
                  </h3>
                  {resource.ownerReferences && resource.ownerReferences.length > 0 ? (
                    <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-800/50 text-emerald-300 text-xs flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-emerald-200">Controller Managed: </span>
                        <span>
                          This pod is managed by <strong>{resource.ownerReferences[0].kind}/{resource.ownerReferences[0].name}</strong>. If deleted, the replica controller will immediately reconcile and provision a replacement pod.
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-amber-300">Standalone (Naked) Pod: </span>
                        <span>
                          This pod has no controlling ReplicaSet or Deployment. Deleting this pod will permanently terminate it with NO replacement.
                        </span>
                      </div>
                    </div>
                  )}
                  <p className="text-[11px] text-zinc-400 pt-1">
                    Note: In Kubernetes architecture, pods cannot be arbitrarily stopped and started like virtual machines; workloads are managed declaratively through replica controllers.
                  </p>
                </div>
              )}

              {resource.kind === 'StatefulSet' && (
                <div className="p-3.5 rounded-xl bg-indigo-950/20 border border-indigo-800/40 space-y-2">
                  <h3 className="text-xs font-semibold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-indigo-400" />
                    <span>StatefulSet Workload & Storage Safeguards</span>
                  </h3>
                  <p className="text-zinc-300 leading-relaxed text-xs">
                    StatefulSet provides identity guarantees and ordinal indexing (0 to N-1). Scaling down terminates pods in strict reverse ordinal order.
                  </p>
                  <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span>Data Persistence Guarantee: Associated PersistentVolumeClaims (PVCs) remain preserved across replica scale operations.</span>
                  </div>
                </div>
              )}

              {resource.kind === 'DaemonSet' && (
                <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                  <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-sky-400" />
                    <span>DaemonSet Node Coverage</span>
                  </h3>
                  <p className="text-zinc-300 leading-relaxed text-xs">
                    DaemonSets automatically schedule one pod per cluster node matching node selectors and tolerations. DaemonSets do not support manual replica scaling.
                  </p>
                </div>
              )}

              {resource.kind === 'Service' && (
                <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2.5">
                  <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Network className="w-3.5 h-3.5 text-sky-400" />
                    <span>Networking & Service Routing</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded bg-zinc-950 border border-zinc-800">
                      <span className="text-zinc-500 block text-[10px]">Service Type</span>
                      <span className="font-semibold text-zinc-200">{(resource.specSummary as any)?.type || 'ClusterIP'}</span>
                    </div>
                    <div className="p-2 rounded bg-zinc-950 border border-zinc-800">
                      <span className="text-zinc-500 block text-[10px]">Cluster IP</span>
                      <span className="font-mono text-zinc-200">{(resource.specSummary as any)?.clusterIP || 'Assigned'}</span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800 text-[11px] text-zinc-400">
                    Services provide stable virtual IPs and load balance traffic across matched endpoints. Services do not host processes and do not require restarts.
                  </div>
                </div>
              )}

              {(resource.kind === 'CronJob' || resource.kind === 'Job') && (
                <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                  <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Job Execution & Concurrency Safeguards</span>
                  </h3>
                  <p className="text-zinc-300 leading-relaxed text-xs">
                    {resource.kind === 'CronJob'
                      ? `CronJobs run batch jobs on a schedule. Manual triggers spawn an instant Job execution. Concurrency policies prevent overlapping duplicate runs.`
                      : `Batch Jobs execute run-to-completion tasks. Failed pods are retried up to backoffLimit.`}
                  </p>
                  {(resource.specSummary as any)?.schedule && (
                    <div className="p-2 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between text-xs font-mono">
                      <span className="text-zinc-400">Cron Schedule:</span>
                      <span className="text-sky-300 font-semibold">{(resource.specSummary as any).schedule}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Node Info / Spec Details */}
              {resource.nodeName && (
                <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-1">
                  <span className="text-zinc-400 text-[11px] block">Assigned Worker Node</span>
                  <span className="font-mono font-semibold text-zinc-200">{resource.nodeName}</span>
                </div>
              )}

              {/* ConfigMap / Secret Data Keys */}
              {(resource.kind === 'ConfigMap' || resource.kind === 'Secret') && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    {resource.kind === 'Secret' ? 'Secret Keys (Values Withheld for Security)' : 'ConfigMap Data Keys'}
                  </h3>
                  <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800">
                    {resource.dataKeys && resource.dataKeys.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {resource.dataKeys.map((k, i) => (
                          <span key={i} className="px-2.5 py-1 rounded bg-zinc-800 font-mono text-zinc-200 text-xs">
                            {k}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-zinc-500 italic">No keys recorded</span>
                    )}
                    {resource.kind === 'Secret' && (
                      <p className="mt-2 text-[11px] text-zinc-400 border-t border-zinc-800/80 pt-2">
                        SkyOps strictly adheres to zero-trust security. Secret payload values are never fetched or displayed.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Labels & Annotations */}
              {resource.labels && Object.keys(resource.labels).length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Labels</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(resource.labels).map(([k, v]) => (
                      <span key={k} className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-300">
                        {k}{v ? `=${v}` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* RELEASES & REVISIONS TAB (DEPLOYMENT) */}
          {activeTab === 'revisions' && resource.kind === 'Deployment' && (() => {
            const currentRevStr =
              resource.annotations?.['deployment.kubernetes.io/revision'] ||
              (resource.statusSummary as any)?.revision ||
              '1';
            const currentRevNum = parseInt(currentRevStr, 10) || 1;
            const matchingDeps = deploymentRecords.filter(
              (d) => d.name.toLowerCase() === resource.name.toLowerCase()
            );
            const currentImage =
              (resource.specSummary as any)?.template?.spec?.containers?.[0]?.image ||
              resource.containers?.[0]?.image ||
              matchingDeps[0]?.image ||
              `${resource.name}:${currentRevStr}`;
            const desiredReps = (resource.specSummary as any)?.replicas ?? resource.specReplicas ?? 1;
            const readyReps = (resource.statusSummary as any)?.readyReplicas ?? resource.readyReplicas ?? desiredReps;
            const availableReps = (resource.statusSummary as any)?.availableReplicas ?? resource.availableReplicas ?? desiredReps;
            const updatedReps = (resource.statusSummary as any)?.updatedReplicas ?? resource.updatedReplicas ?? desiredReps;

            return (
              <div className="space-y-4 text-xs">
                {/* 1. Current Live Release Status */}
                <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800 text-[10px] font-semibold uppercase">
                        Active Revision {currentRevStr}
                      </span>
                      <span className="font-semibold text-zinc-100">Live Workload Version</span>
                    </div>
                    <span className="text-[11px] text-zinc-400">
                      Rollout Status: <strong className="text-emerald-400">{readyReps === desiredReps ? 'Rollout Complete' : 'Progressing'}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                    <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                      <span className="text-zinc-500 block text-[10px] uppercase font-sans">Active Image</span>
                      <span className="text-zinc-200 font-semibold truncate block" title={currentImage}>
                        {currentImage}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-sans block mt-1">
                        Digest: Not pinned in spec (tags are mutable OCI references)
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                      <span className="text-zinc-500 block text-[10px] uppercase font-sans">Rollout Convergence</span>
                      <span className="text-zinc-200 font-semibold block">
                        {readyReps}/{desiredReps} ready · {availableReps}/{desiredReps} available
                      </span>
                      <span className="text-[10px] text-zinc-500 font-sans block mt-1">
                        Updated replicas: {updatedReps} of {desiredReps}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60">
                    <span className="text-[11px] text-zinc-400">
                      Strategy: RollingUpdate (maxUnavailable: 25%, maxSurge: 25%)
                    </span>
                    <button
                      onClick={() => setIsReleaseDiffOpen(true)}
                      disabled={!isConnected && !cluster.isSimulated}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <GitCompare className="w-3.5 h-3.5" />
                      <span>Compare & Prepare Rollback</span>
                    </button>
                  </div>
                </div>

                {/* 2. Retained Revision & ReplicaSet History */}
                <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-zinc-200 flex items-center gap-2">
                      <GitCommit className="w-4 h-4 text-sky-400" />
                      <span>Retained Revision History ({Math.max(matchingDeps.length, currentRevNum)} revisions)</span>
                    </h3>
                    <span className="text-[11px] text-zinc-500">Source: Authoritative ReplicaSet History</span>
                  </div>

                  <div className="overflow-x-auto border border-zinc-800 rounded-lg">
                    <table className="w-full text-left text-xs text-zinc-300">
                      <thead className="bg-zinc-950 text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800">
                        <tr>
                          <th className="py-2.5 px-3">Revision</th>
                          <th className="py-2.5 px-3">Image Version</th>
                          <th className="py-2.5 px-3">Replicas</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60 font-sans">
                        {matchingDeps.length > 0 ? (
                          matchingDeps.map((rec) => {
                            const isCurrent = rec.revision === currentRevStr;
                            return (
                              <tr key={rec.id} className="hover:bg-zinc-800/30 transition-colors">
                                <td className="py-2 px-3 font-semibold text-zinc-100 flex items-center gap-1.5">
                                  <span className="font-mono">rev {rec.revision}</span>
                                  {isCurrent && (
                                    <span className="px-1.5 py-0.2 rounded bg-sky-950 text-sky-400 border border-sky-800 text-[9px]">
                                      CURRENT
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 font-mono text-zinc-300 max-w-xs truncate" title={rec.image}>
                                  {rec.image}
                                </td>
                                <td className="py-2 px-3 text-zinc-400 font-mono">
                                  {rec.replicas ?? desiredReps} pods
                                </td>
                                <td className="py-2 px-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                    isCurrent ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60' : 'bg-zinc-800 text-zinc-400'
                                  }`}>
                                    {isCurrent ? 'Active' : 'Archived'}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-right">
                                  {!isCurrent && (
                                    <button
                                      onClick={() => setIsReleaseDiffOpen(true)}
                                      disabled={!isConnected && !cluster.isSimulated}
                                      className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50"
                                    >
                                      Rollback
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          // Fallback showing current and computed previous revision
                          <>
                            <tr className="hover:bg-zinc-800/30">
                              <td className="py-2 px-3 font-semibold text-zinc-100 flex items-center gap-1.5">
                                <span className="font-mono">rev {currentRevStr}</span>
                                <span className="px-1.5 py-0.2 rounded bg-sky-950 text-sky-400 border border-sky-800 text-[9px]">
                                  CURRENT
                                </span>
                              </td>
                              <td className="py-2 px-3 font-mono text-zinc-300 truncate" title={currentImage}>
                                {currentImage}
                              </td>
                              <td className="py-2 px-3 text-zinc-400 font-mono">{desiredReps} pods</td>
                              <td className="py-2 px-3">
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                                  Active
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right text-zinc-500">—</td>
                            </tr>
                            {currentRevNum > 1 && (
                              <tr className="hover:bg-zinc-800/30">
                                <td className="py-2 px-3 font-semibold text-zinc-300 font-mono">
                                  rev {currentRevNum - 1}
                                </td>
                                <td className="py-2 px-3 font-mono text-zinc-400">
                                  {currentImage.replace(new RegExp(`:${currentRevStr}$`), `:${currentRevNum - 1}`)}
                                </td>
                                <td className="py-2 px-3 text-zinc-400 font-mono">{desiredReps} pods</td>
                                <td className="py-2 px-3">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-800 text-zinc-400">
                                    Archived
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <button
                                    onClick={() => setIsReleaseDiffOpen(true)}
                                    disabled={!isConnected && !cluster.isSimulated}
                                    className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50"
                                  >
                                    Rollback
                                  </button>
                                </td>
                              </tr>
                            )}
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3. Safe Rollback Policy & Scope Notice */}
                <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-800/50 space-y-2 text-zinc-300 text-xs">
                  <div className="flex items-center gap-2 font-semibold text-amber-300">
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    <span>Deployment Rollback Scope & Recovery Guarantees</span>
                  </div>
                  <p className="leading-relaxed text-[11px] text-zinc-300">
                    Rolling back a Kubernetes Deployment updates the active Pod template and activates the previous ReplicaSet.
                    <strong> Safety Notice:</strong> Rollbacks do <em>not</em> reverse database migrations, external state, ConfigMaps, Secrets, or persistent volume data. Those resources must be verified and restored separately.
                  </p>
                </div>
              </div>
            );
          })()}

          {/* RELATIONSHIPS TAB */}
          {activeTab === 'relationships' && (
            <div className="space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                <h3 className="font-semibold text-zinc-200 flex items-center gap-2">
                  <Workflow className="w-4 h-4 text-sky-400" />
                  <span>Hierarchy & Ownership</span>
                </h3>
                {resource.ownerReferences && resource.ownerReferences.length > 0 ? (
                  <div className="space-y-1.5">
                    <span className="text-zinc-400 block">Controlled by owner reference:</span>
                    {resource.ownerReferences.map((ref, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-zinc-200">{ref.kind}: </span>
                          <span className="font-mono text-sky-400">{ref.name}</span>
                        </div>
                        {ref.controller && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800">
                            Controller
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-zinc-400">
                    No parent controller ownerReferences recorded. Workload operates at top-level.
                  </p>
                )}
              </div>

              {/* Selectors */}
              {(resource.specSummary as any)?.selector && (
                <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                  <h3 className="font-semibold text-zinc-200">Pod Label Selectors</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries((resource.specSummary as any).selector.matchLabels || (resource.specSummary as any).selector || {}).map(([k, v]) => (
                      <span key={k} className="px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-xs font-mono text-sky-300">
                        {k}={String(v)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* LIVE LOGS TAB */}
          {activeTab === 'logs' && (
            <div className="h-[520px] rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 flex flex-col">
              <PodLogsViewer
                clusterId={cluster.id}
                namespace={resource.namespace || 'default'}
                podName={resource.kind === 'Pod' ? resource.name : (resource.containers?.[0]?.name ? `${resource.name}-pod` : resource.name)}
                containers={resource.containers}
                isEmbedded={true}
              />
            </div>
          )}

          {/* EVENTS TAB */}
          {activeTab === 'events' && (
            <div className="space-y-3 text-xs">
              {loadingEvents ? (
                <div className="p-8 text-center text-zinc-400 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                  <span>Loading Kubernetes cluster events...</span>
                </div>
              ) : events.length === 0 ? (
                <EmptyState
                  title="No Events Found"
                  description={`No recent Warning or Normal events recorded for ${resource.name}.`}
                />
              ) : (
                <div className="space-y-2">
                  {events.map((evt, idx) => (
                    <div
                      key={evt.id || idx}
                      className={`p-3 rounded-xl border ${
                        evt.type === 'Warning'
                          ? 'bg-amber-950/30 border-amber-800/60 text-amber-200'
                          : 'bg-zinc-900/60 border-zinc-800 text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="font-semibold uppercase tracking-wider">{evt.reason || evt.type}</span>
                        <span className="text-zinc-400">{evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : 'Recent'}</span>
                      </div>
                      <p className="font-mono text-xs">{evt.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* FAILURE DIAGNOSIS TAB */}
          {activeTab === 'diagnosis' && failureDiagnosis && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/60 space-y-2">
                <h3 className="font-bold text-sm text-amber-300 flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 text-amber-400" />
                  <span>{failureDiagnosis.title}</span>
                </h3>
                <p className="text-zinc-200 leading-relaxed">
                  <strong className="text-zinc-300">Observed Telemetry: </strong>
                  {failureDiagnosis.observed}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                <h4 className="font-semibold text-zinc-200 uppercase tracking-wider text-[11px]">Possible Root Causes:</h4>
                <ul className="list-disc pl-4 space-y-1.5 text-zinc-300 leading-relaxed">
                  {failureDiagnosis.possibleCauses.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                <h4 className="font-semibold text-zinc-200 uppercase tracking-wider text-[11px]">Recommended SRE Remediations:</h4>
                <ul className="list-disc pl-4 space-y-1.5 text-zinc-300 leading-relaxed">
                  {failureDiagnosis.recommendedActions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* JSON VIEW TAB */}
          {activeTab === 'yaml' && (
            <div className="relative">
              <div className="absolute top-2 right-2 z-10">
                <CopyButton text={JSON.stringify(resource, null, 2)} />
              </div>
              <CodeBlock code={JSON.stringify(resource, null, 2)} language="json" />
            </div>
          )}
        </div>
      </div>

      {/* Action Modal */}
      {activeActionModal && (
        <OperationActionModal
          isOpen={Boolean(activeActionModal)}
          onClose={() => setActiveActionModal(null)}
          cluster={cluster}
          resource={resource}
          actionType={activeActionModal}
          onSuccess={(action, updated) => {
            onOperationSuccess(action, updated);
          }}
        />
      )}

      {/* Release Diff Modal */}
      {isReleaseDiffOpen && (
        <ReleaseDiffModal
          isOpen={isReleaseDiffOpen}
          onClose={() => setIsReleaseDiffOpen(false)}
          cluster={cluster}
          deployment={resource}
          historyRecords={deploymentRecords}
          onRollbackSuccess={(action, updated) => {
            onOperationSuccess(action, updated);
          }}
        />
      )}
    </>
  );
};
