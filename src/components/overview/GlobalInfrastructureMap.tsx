import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Globe,
  HardDrive,
  Layers,
  Radio,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { Cluster, Incident, KubernetesResource } from '../../types/index';

interface GlobalInfrastructureMapProps {
  clusters: Cluster[];
  resources: KubernetesResource[];
  incidents: Incident[];
  onSelectCluster: (id: string) => void;
  onSelectIncident?: (id: string) => void;
  onOpenAddCluster?: () => void;
}

export const GlobalInfrastructureMap: React.FC<GlobalInfrastructureMapProps> = ({
  clusters = [],
  resources = [],
  incidents = [],
  onSelectCluster,
  onSelectIncident,
  onOpenAddCluster
}) => {
  const [activeMode, setActiveMode] = useState<'topology' | 'regions' | 'matrix'>('topology');
  const [selectedNodeClusterId, setSelectedNodeClusterId] = useState<string | null>(
    clusters[0]?.id || null
  );

  const safeClusters = Array.isArray(clusters) ? clusters : [];
  const safeIncidents = Array.isArray(incidents) ? incidents : [];
  const safeResources = Array.isArray(resources) ? resources : [];

  // Group nodes and pods by cluster
  const clusterData = safeClusters.map((cluster) => {
    const clusterResources = safeResources.filter((r) => r.clusterId === cluster.id);
    const nodes = clusterResources.filter((r) => r.kind === 'Node');
    const pods = clusterResources.filter((r) => r.kind === 'Pod');
    const clusterIncidents = safeIncidents.filter(
      (i) => i.clusterId === cluster.id && (i.status === 'OPEN' || i.status === 'IN_PROGRESS')
    );

    const crashingPods = pods.filter(
      (p) =>
        p.health === 'CRITICAL' ||
        p.status === 'CrashLoopBackOff' ||
        p.status === 'ImagePullBackOff' ||
        p.status === 'OOMKilled'
    );

    const hasCriticalIncidents = clusterIncidents.some((i) => i.severity === 'CRITICAL' || i.severity === 'P1');
    const isDegraded = clusterIncidents.length > 0 || crashingPods.length > 0 || cluster.status === 'DEGRADED';
    const isCritical = hasCriticalIncidents || cluster.status === 'CRITICAL' || cluster.status === 'OFFLINE';

    // Mock realistic region if not set
    const region = cluster.region || (cluster.name.includes('prod') ? 'us-east-1' : cluster.name.includes('eu') ? 'eu-west-1' : 'us-west-2');
    const latency = cluster.agentStatus === 'CONNECTED' ? 14 + (cluster.name.length % 15) : null;

    return {
      cluster,
      nodes,
      pods,
      clusterIncidents,
      crashingPods,
      isDegraded,
      isCritical,
      region,
      latency,
      status: isCritical ? 'CRITICAL' : isDegraded ? 'DEGRADED' : 'HEALTHY'
    };
  });

  const activeClusterInfo = clusterData.find((c) => c.cluster.id === selectedNodeClusterId) || clusterData[0];

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl overflow-hidden shadow-lg">
      {/* Top Header & View Controls */}
      <div className="px-5 py-3.5 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3 bg-zinc-950/60">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              Global Fleet Topology & Infrastructure Visualizer
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                {safeClusters.length} {safeClusters.length === 1 ? 'Cluster' : 'Clusters'}
              </span>
            </h3>
            <p className="text-xs text-zinc-400">
              Interactive multi-cluster mesh, telemetry links, and real-time node distribution
            </p>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="flex items-center bg-zinc-950 p-1 rounded-lg border border-zinc-800">
          <button
            onClick={() => setActiveMode('topology')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeMode === 'topology'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Topology Graph
          </button>
          <button
            onClick={() => setActiveMode('regions')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeMode === 'regions'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            Regions & Latency
          </button>
          <button
            onClick={() => setActiveMode('matrix')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeMode === 'matrix'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            Cluster Matrix
          </button>
        </div>
      </div>

      {/* Main Visualizer Stage */}
      {safeClusters.length === 0 ? (
        <div className="py-16 text-center px-4">
          <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mx-auto text-zinc-400 mb-3">
            <Server className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-semibold text-zinc-200 mb-1">No Kubernetes Clusters Connected</h4>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto mb-4">
            Connect your first cluster using the SkyOps agent Helm chart or manifest to visualize topology and live telemetry.
          </p>
          {onOpenAddCluster && (
            <button
              onClick={onOpenAddCluster}
              className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer shadow-md"
            >
              + Connect Cluster
            </button>
          )}
        </div>
      ) : activeMode === 'topology' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 min-h-[380px]">
          {/* SVG Interactive Topology Canvas */}
          <div className="lg:col-span-2 relative bg-zinc-950 p-6 flex items-center justify-center overflow-hidden border-b lg:border-b-0 lg:border-r border-zinc-800">
            {/* Background grid pattern */}
            <div
              className="absolute inset-0 opacity-15 pointer-events-none"
              style={{
                backgroundImage: 'radial-gradient(circle at 1px 1px, #38bdf8 1px, transparent 0)',
                backgroundSize: '24px 24px'
              }}
            />

            <svg className="w-full h-[320px] max-w-lg select-none" viewBox="0 0 500 320">
              <defs>
                <linearGradient id="skyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#0284c7" stopOpacity="0.4" />
                </linearGradient>
                <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Central Hub Glow */}
              <circle cx="250" cy="160" r="70" fill="url(#hubGlow)" />

              {/* Connecting Telemetry Beams to Clusters */}
              {clusterData.map((item, idx) => {
                const total = clusterData.length;
                const angle = (idx / total) * 2 * Math.PI - Math.PI / 2;
                const distance = total === 1 ? 0 : 120;
                const cx = 250 + Math.cos(angle) * distance;
                const cy = 160 + Math.sin(angle) * distance;

                const isSelected = item.cluster.id === selectedNodeClusterId;
                const strokeColor =
                  item.status === 'CRITICAL'
                    ? '#ef4444'
                    : item.status === 'DEGRADED'
                    ? '#f59e0b'
                    : '#10b981';

                return (
                  <g key={`beam-${item.cluster.id}`}>
                    {total > 1 && (
                      <line
                        x1="250"
                        y1="160"
                        x2={cx}
                        y2={cy}
                        stroke={strokeColor}
                        strokeWidth={isSelected ? '2.5' : '1.5'}
                        strokeDasharray={isSelected ? 'none' : '4 4'}
                        opacity={isSelected ? 0.9 : 0.4}
                      />
                    )}

                    {/* Outer Status Ring */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isSelected ? 28 : 22}
                      fill={
                        item.status === 'CRITICAL'
                          ? '#450a0a'
                          : item.status === 'DEGRADED'
                          ? '#451a03'
                          : '#064e3b'
                      }
                      stroke={strokeColor}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                      className="cursor-pointer transition-all duration-200 hover:opacity-80"
                      onClick={() => setSelectedNodeClusterId(item.cluster.id)}
                    />

                    {/* Pulsing ring for critical/degraded */}
                    {item.status !== 'HEALTHY' && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isSelected ? 34 : 28}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth="1"
                        opacity="0.6"
                        className="animate-ping"
                        style={{ transformOrigin: `${cx}px ${cy}px`, animationDuration: '3s' }}
                      />
                    )}

                    {/* Cluster Icon / Text */}
                    <text
                      x={cx}
                      y={cy + 4}
                      textAnchor="middle"
                      fill="#f4f4f5"
                      fontSize={isSelected ? '11' : '9'}
                      fontWeight="bold"
                      fontFamily="monospace"
                      className="pointer-events-none"
                    >
                      {item.cluster.name.substring(0, 3).toUpperCase()}
                    </text>

                    {/* Cluster Label below */}
                    <text
                      x={cx}
                      y={cy + (isSelected ? 42 : 36)}
                      textAnchor="middle"
                      fill={isSelected ? '#38bdf8' : '#a1a1aa'}
                      fontSize="10"
                      fontWeight={isSelected ? 'bold' : 'normal'}
                      fontFamily="system-ui"
                      className="pointer-events-none"
                    >
                      {item.cluster.name.length > 12 ? `${item.cluster.name.substring(0, 10)}...` : item.cluster.name}
                    </text>
                  </g>
                );
              })}

              {/* Central SkyOps Control Hub (when multiple clusters) */}
              {clusterData.length > 1 && (
                <g>
                  <circle cx="250" cy="160" r="18" fill="#0369a1" stroke="#38bdf8" strokeWidth="2" />
                  <text
                    x="250"
                    y="164"
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="9"
                    fontWeight="bold"
                    fontFamily="monospace"
                    className="pointer-events-none"
                  >
                    HUB
                  </text>
                </g>
              )}
            </svg>

            <div className="absolute bottom-3 left-4 flex items-center gap-4 text-[11px] font-mono text-zinc-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Healthy
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> Degraded
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500" /> Critical / Alert
              </span>
            </div>
          </div>

          {/* Right Inspector Drawer for Selected Cluster */}
          {activeClusterInfo ? (
            <div className="p-5 bg-zinc-900/60 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        activeClusterInfo.status === 'CRITICAL'
                          ? 'bg-red-500 animate-pulse'
                          : activeClusterInfo.status === 'DEGRADED'
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                    />
                    <h4 className="text-sm font-bold text-zinc-100">{activeClusterInfo.cluster.name}</h4>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-medium ${
                      activeClusterInfo.status === 'CRITICAL'
                        ? 'bg-red-500/10 text-red-400 border-red-500/30'
                        : activeClusterInfo.status === 'DEGRADED'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    }`}
                  >
                    {activeClusterInfo.status}
                  </span>
                </div>

                {/* Telemetry Stats Grid */}
                <div className="grid grid-cols-2 gap-2.5 my-4">
                  <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800">
                    <div className="text-[10px] font-mono text-zinc-500 uppercase">Kubernetes</div>
                    <div className="text-xs font-semibold text-zinc-200 mt-0.5">
                      {activeClusterInfo.cluster.k8sVersion || 'v1.29'}
                    </div>
                  </div>
                  <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800">
                    <div className="text-[10px] font-mono text-zinc-500 uppercase">Region / Cloud</div>
                    <div className="text-xs font-semibold text-zinc-200 mt-0.5">
                      {activeClusterInfo.region}
                    </div>
                  </div>
                  <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800">
                    <div className="text-[10px] font-mono text-zinc-500 uppercase">Nodes Ready</div>
                    <div className="text-xs font-semibold text-zinc-200 mt-0.5">
                      {activeClusterInfo.cluster.nodeCount || activeClusterInfo.nodes.length || 0} Nodes
                    </div>
                  </div>
                  <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800">
                    <div className="text-[10px] font-mono text-zinc-500 uppercase">Workload Pods</div>
                    <div className="text-xs font-semibold text-zinc-200 mt-0.5">
                      {activeClusterInfo.cluster.podCount || activeClusterInfo.pods.length || 0} Pods
                    </div>
                  </div>
                </div>

                {/* Active Incidents or Clean Health */}
                {activeClusterInfo.clusterIncidents.length > 0 ? (
                  <div className="mb-4">
                    <div className="text-xs font-medium text-amber-400 mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Active Incidents ({activeClusterInfo.clusterIncidents.length})
                    </div>
                    <div className="space-y-1.5">
                      {activeClusterInfo.clusterIncidents.slice(0, 3).map((inc) => (
                        <div
                          key={inc.id}
                          onClick={() => onSelectIncident && onSelectIncident(inc.id)}
                          className="p-2 bg-zinc-950 rounded border border-zinc-800 hover:border-zinc-700 cursor-pointer text-xs transition-colors flex items-center justify-between"
                        >
                          <div className="truncate mr-2">
                            <span className="font-mono text-[10px] text-zinc-500 mr-1.5">[{inc.severity}]</span>
                            <span className="text-zinc-200 font-medium truncate">{inc.title}</span>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-950/20 border border-emerald-900/40 rounded-lg mb-4 text-xs text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Cluster telemetry streaming stably with 0 active incidents.</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-zinc-800 flex items-center gap-2">
                <button
                  onClick={() => onSelectCluster(activeClusterInfo.cluster.id)}
                  className="w-full py-2 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Server className="w-3.5 h-3.5" />
                  Inspect Cluster Infrastructure
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : activeMode === 'regions' ? (
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clusterData.map((item) => (
              <div
                key={item.cluster.id}
                onClick={() => onSelectCluster(item.cluster.id)}
                className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300">
                      <Radio className="w-4 h-4 text-sky-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-zinc-100 group-hover:text-sky-400 transition-colors">
                        {item.cluster.name}
                      </h4>
                      <span className="text-[10px] font-mono text-zinc-500">{item.region}</span>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-medium ${
                      item.status === 'CRITICAL'
                        ? 'bg-red-500/10 text-red-400 border-red-500/30'
                        : item.status === 'DEGRADED'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    }`}
                  >
                    {item.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center py-2 bg-zinc-900/60 rounded-lg border border-zinc-800/80 mb-3">
                  <div>
                    <div className="text-[10px] font-mono text-zinc-500">Latency</div>
                    <div className="text-xs font-semibold text-zinc-200 mt-0.5">
                      {item.latency ? `${item.latency}ms` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-zinc-500">Nodes</div>
                    <div className="text-xs font-semibold text-zinc-200 mt-0.5">
                      {item.cluster.nodeCount || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-zinc-500">Pods</div>
                    <div className="text-xs font-semibold text-zinc-200 mt-0.5">
                      {item.cluster.podCount || 0}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-zinc-400 pt-2 border-t border-zinc-800/80">
                  <span className="font-mono text-[11px]">
                    Agent: {item.cluster.agentStatus === 'CONNECTED' ? 'Linked (Live)' : 'Disconnected'}
                  </span>
                  <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-zinc-200 transition-colors" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Matrix View */
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/80 text-[11px] font-mono text-zinc-400">
                <th className="py-3 px-4">Cluster Name</th>
                <th className="py-3 px-4">Health</th>
                <th className="py-3 px-4">Kubernetes</th>
                <th className="py-3 px-4">Region</th>
                <th className="py-3 px-4">Nodes</th>
                <th className="py-3 px-4">Pods</th>
                <th className="py-3 px-4">Agent Link</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-sans">
              {clusterData.map((item) => (
                <tr
                  key={item.cluster.id}
                  onClick={() => onSelectCluster(item.cluster.id)}
                  className="hover:bg-zinc-800/40 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4 font-semibold text-zinc-100 flex items-center gap-2">
                    <Server className="w-3.5 h-3.5 text-zinc-500" />
                    {item.cluster.name}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-medium ${
                        item.status === 'CRITICAL'
                          ? 'bg-red-500/10 text-red-400 border-red-500/30'
                          : item.status === 'DEGRADED'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-zinc-300">
                    {item.cluster.k8sVersion || 'v1.29'}
                  </td>
                  <td className="py-3 px-4 text-zinc-400">{item.region}</td>
                  <td className="py-3 px-4 font-mono text-zinc-200">{item.cluster.nodeCount || 0}</td>
                  <td className="py-3 px-4 font-mono text-zinc-200">{item.cluster.podCount || 0}</td>
                  <td className="py-3 px-4 font-mono">
                    <span
                      className={`inline-flex items-center gap-1.5 ${
                        item.cluster.agentStatus === 'CONNECTED' ? 'text-emerald-400' : 'text-zinc-500'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          item.cluster.agentStatus === 'CONNECTED' ? 'bg-emerald-400' : 'bg-zinc-600'
                        }`}
                      />
                      {item.cluster.agentStatus}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-sky-400 hover:text-sky-300 font-medium">Inspect →</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
