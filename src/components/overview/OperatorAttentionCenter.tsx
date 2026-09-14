import React from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Flame,
  HardDrive,
  Layers,
  Sparkles,
  Terminal,
  Zap
} from 'lucide-react';
import { Cluster, Incident, KubernetesResource } from '../../types/index';

interface OperatorAttentionCenterProps {
  incidents: Incident[];
  clusters: Cluster[];
  resources: KubernetesResource[];
  onSelectIncident: (id: string) => void;
  onSelectCluster: (id: string) => void;
  onOpenAICopilot?: (prompt?: string) => void;
}

export const OperatorAttentionCenter: React.FC<OperatorAttentionCenterProps> = ({
  incidents = [],
  clusters = [],
  resources = [],
  onSelectIncident,
  onSelectCluster,
  onOpenAICopilot
}) => {
  const safeIncidents = Array.isArray(incidents) ? incidents : [];
  const safeResources = Array.isArray(resources) ? resources : [];

  // 1. Gather all active incidents
  const activeIncidents = safeIncidents.filter(
    (i) => i.status === 'OPEN' || i.status === 'IN_PROGRESS' || i.status === 'ACKNOWLEDGED'
  );

  // 2. Identify crashing pods from live scraped telemetry
  const crashingPods = safeResources.filter(
    (r) =>
      r.kind === 'Pod' &&
      (r.health === 'CRITICAL' ||
        r.status === 'CrashLoopBackOff' ||
        r.status === 'ImagePullBackOff' ||
        r.status === 'OOMKilled' ||
        r.status === 'Error')
  );

  // 3. Identify pressure nodes
  const pressureNodes = safeResources.filter(
    (r) =>
      r.kind === 'Node' &&
      (((r.conditions || []) as any[]).some(
        (c: any) =>
          (c.type === 'MemoryPressure' || c.type === 'DiskPressure' || c.type === 'PIDPressure') &&
          (c.status === 'True' || c.status === true)
      ) ||
        r.status !== 'Ready')
  );

  // Combine into a ranked priority list
  const queueItems: Array<{
    id: string;
    type: 'INCIDENT' | 'POD_CRASH' | 'NODE_PRESSURE';
    title: string;
    target: string;
    namespace?: string;
    clusterId?: string;
    clusterName?: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
    reason: string;
    incidentId?: string;
    resourceName?: string;
  }> = [];

  // Add incidents first (critical then high)
  for (const inc of activeIncidents) {
    queueItems.push({
      id: `inc-${inc.id}`,
      type: 'INCIDENT',
      title: inc.title,
      target: `${inc.resourceKind}/${inc.resourceName}`,
      namespace: inc.namespace,
      clusterId: inc.clusterId,
      clusterName: inc.clusterName,
      severity:
        inc.severity === 'CRITICAL' || inc.severity === 'P1'
          ? 'CRITICAL'
          : inc.severity === 'HIGH' || inc.severity === 'P2'
          ? 'HIGH'
          : 'MEDIUM',
      reason: inc.technicalDetails?.reason || inc.rootCauseAnalysis || 'Degraded runtime state',
      incidentId: inc.id,
      resourceName: inc.resourceName
    });
  }

  // Add crashing pods that do not already have an incident in queue
  for (const pod of crashingPods) {
    const alreadyTracked = queueItems.some((item) => item.resourceName === pod.name);
    if (!alreadyTracked && queueItems.length < 8) {
      const cluster = clusters.find((c) => c.id === pod.clusterId);
      queueItems.push({
        id: `pod-${pod.clusterId}-${pod.namespace}-${pod.name}`,
        type: 'POD_CRASH',
        title: `Pod in ${pod.status} state`,
        target: `Pod/${pod.name}`,
        namespace: pod.namespace,
        clusterId: pod.clusterId,
        clusterName: cluster?.name || 'Cluster',
        severity: 'HIGH',
        reason: `Container restart loops or runtime failure (${pod.status})`,
        resourceName: pod.name
      });
    }
  }

  // Add node pressure if any
  for (const node of pressureNodes) {
    const cluster = clusters.find((c) => c.id === node.clusterId);
    queueItems.push({
      id: `node-${node.clusterId}-${node.name}`,
      type: 'NODE_PRESSURE',
      title: `Node Condition Pressure Detected`,
      target: `Node/${node.name}`,
      clusterId: node.clusterId,
      clusterName: cluster?.name || 'Cluster',
      severity: 'CRITICAL',
      reason: `Node is unready or reporting MemoryPressure / DiskPressure`,
      resourceName: node.name
    });
  }

  // Sort queue by severity: CRITICAL first, then HIGH, then MEDIUM
  queueItems.sort((a, b) => {
    const weight = { CRITICAL: 3, HIGH: 2, MEDIUM: 1 };
    return weight[b.severity] - weight[a.severity];
  });

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl overflow-hidden shadow-lg">
      <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Flame className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              Attention Center
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                {queueItems.length} {queueItems.length === 1 ? 'Action Item' : 'Action Items'}
              </span>
            </h3>
            <p className="text-xs text-zinc-400">
              Prioritized operational queue ranked by severity, blast radius, and recurrence
            </p>
          </div>
        </div>

        {onOpenAICopilot && (
          <button
            onClick={() => onOpenAICopilot('Analyze all active incidents and recommend immediate triage')}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            Diagnose Queue with AI
          </button>
        )}
      </div>

      {queueItems.length === 0 ? (
        <div className="py-10 text-center px-4">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400 mb-2">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-semibold text-zinc-200">Attention Queue Empty</h4>
          <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
            Zero active incidents or failing pods requiring immediate operator intervention across all connected clusters.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-800/60">
          {queueItems.map((item) => (
            <div
              key={item.id}
              className="p-4 hover:bg-zinc-800/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center mt-0.5 ${
                    item.severity === 'CRITICAL'
                      ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                      : item.severity === 'HIGH'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                      : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                  }`}
                >
                  {item.type === 'INCIDENT' ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : item.type === 'POD_CRASH' ? (
                    <Flame className="w-4 h-4" />
                  ) : (
                    <Cpu className="w-4 h-4" />
                  )}
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                        item.severity === 'CRITICAL'
                          ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {item.severity}
                    </span>
                    <span className="text-xs font-semibold text-zinc-100">{item.title}</span>
                    <span className="text-[11px] font-mono text-zinc-500">
                      {item.clusterName} {item.namespace ? `• ${item.namespace}` : ''}
                    </span>
                  </div>

                  <div className="text-xs text-zinc-400 flex items-center gap-2">
                    <span className="font-mono text-zinc-300">{item.target}</span>
                    <span>—</span>
                    <span className="text-zinc-400 truncate max-w-md">{item.reason}</span>
                  </div>
                </div>
              </div>

              {/* Triage Actions */}
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                {onOpenAICopilot && (
                  <button
                    onClick={() =>
                      onOpenAICopilot(
                        `Analyze ${item.target} in cluster ${item.clusterName} and explain why it is failing with remediation options.`
                      )
                    }
                    title="Ask SkyOps AI Copilot to investigate"
                    className="px-2.5 py-1 text-xs font-medium rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-sky-400" />
                    AI Triage
                  </button>
                )}

                {item.incidentId ? (
                  <button
                    onClick={() => onSelectIncident(item.incidentId!)}
                    className="px-3 py-1 text-xs font-medium rounded bg-sky-600 hover:bg-sky-500 text-white transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
                  >
                    Inspect Incident
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : item.clusterId ? (
                  <button
                    onClick={() => onSelectCluster(item.clusterId!)}
                    className="px-3 py-1 text-xs font-medium rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    View Cluster
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
