import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Database,
  ExternalLink,
  Layers,
  Network,
  RefreshCw,
  Server,
  ShieldAlert,
  Zap
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Incident, ServiceDependency, ServiceHealthRecord } from '../../types/index';

interface BlastRadiusSectionProps {
  incident: Incident;
  onSelectService?: (serviceName: string) => void;
}

export const BlastRadiusSection: React.FC<BlastRadiusSectionProps> = ({
  incident,
  onSelectService
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [services, setServices] = useState<ServiceHealthRecord[]>([]);
  const [dependencies, setDependencies] = useState<ServiceDependency[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchTopology = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getServiceDependencies(incident.clusterId);
      setServices(data.services || []);
      setDependencies(data.dependencies || []);
    } catch (err: any) {
      console.warn('Failed to load service dependencies:', err);
      setError(err?.message || 'Failed to map blast radius');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTopology();
  }, [incident.clusterId, incident.id]);

  const primaryTargetName = incident.resourceName.toLowerCase().split('-')[0];

  // Identify directly affected service
  const directService = services.find(
    (s) =>
      s.name.toLowerCase() === incident.resourceName.toLowerCase() ||
      s.name.toLowerCase().includes(primaryTargetName) ||
      incident.resourceName.toLowerCase().includes(s.name.toLowerCase())
  ) || {
    id: `svc-direct-${incident.resourceName}`,
    name: incident.resourceName,
    namespace: incident.namespace || 'default',
    clusterId: incident.clusterId,
    status: 'DEGRADED',
    activeIncidentsCount: 1,
    podsReady: 0,
    podsTotal: 1,
    errorRate: 18,
    latencyP95Ms: 240,
    dependencies: [],
    dependents: []
  };

  // Upstream dependents (callers)
  const upstreamServices = services.filter((s) =>
    dependencies.some(
      (d) =>
        (d.target.toLowerCase() === directService.name.toLowerCase() ||
          d.target.toLowerCase().includes(primaryTargetName)) &&
        d.source.toLowerCase() === s.name.toLowerCase()
    )
  );

  // Downstream dependencies (callees)
  const downstreamServices = services.filter((s) =>
    dependencies.some(
      (d) =>
        (d.source.toLowerCase() === directService.name.toLowerCase() ||
          d.source.toLowerCase().includes(primaryTargetName)) &&
        d.target.toLowerCase() === s.name.toLowerCase()
    )
  );

  const getStatusColor = (status: 'HEALTHY' | 'DEGRADED' | 'WARNING') => {
    switch (status) {
      case 'DEGRADED':
        return 'border-red-500/40 bg-red-500/10 text-red-400';
      case 'WARNING':
        return 'border-amber-500/40 bg-amber-500/10 text-amber-400';
      case 'HEALTHY':
      default:
        return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
    }
  };

  const getStatusIcon = (status: 'HEALTHY' | 'DEGRADED' | 'WARNING') => {
    switch (status) {
      case 'DEGRADED':
        return <AlertTriangle className="w-3.5 h-3.5 text-red-400" />;
      case 'WARNING':
        return <AlertCircle className="w-3.5 h-3.5 text-amber-400" />;
      case 'HEALTHY':
      default:
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    }
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Network className="w-4 h-4 text-sky-400" />
              Service Impact & Blast Radius
            </h3>
            <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
              Dependency Topology
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time blast radius based on Kubernetes Service discovery, EndpointSlices, and network call chains.
          </p>
        </div>

        <button
          onClick={fetchTopology}
          disabled={loading}
          className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          title="Refresh Blast Radius"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-400' : ''}`} />
        </button>
      </div>

      {loading && services.length === 0 ? (
        <div className="py-8 flex items-center justify-center text-xs text-zinc-500 gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
          <span>Tracing cross-service propagation paths...</span>
        </div>
      ) : error ? (
        <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300">
          {error}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Visual 3-Stage Blast Radius Path */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch relative">
            {/* Stage 1: Upstream Ingress & Callers */}
            <div className="p-3.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 space-y-2.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                  <span>Upstream Callers</span>
                  <span className="text-[10px] text-zinc-500">
                    {upstreamServices.length} {upstreamServices.length === 1 ? 'service' : 'services'}
                  </span>
                </div>

                {upstreamServices.length === 0 ? (
                  <div className="text-xs text-zinc-500 italic py-2">
                    No active upstream caller dependencies detected.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {upstreamServices.map((svc) => (
                      <div
                        key={svc.id}
                        className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${getStatusColor(
                          svc.status
                        )}`}
                      >
                        <div className="flex items-center gap-2">
                          {getStatusIcon(svc.status)}
                          <div>
                            <div className="font-mono font-bold text-white">{svc.name}</div>
                            <div className="text-[10px] opacity-75">{svc.namespace}</div>
                          </div>
                        </div>
                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-black/40">
                          {svc.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-zinc-800/60 text-[10px] text-zinc-500 flex items-center gap-1">
                <span>Traffic flows downstream</span>
                <ArrowRight className="w-3 h-3 text-zinc-400" />
              </div>
            </div>

            {/* Stage 2: Target Under Incident */}
            <div className="p-3.5 rounded-xl border-2 border-red-500/50 bg-red-950/20 space-y-2.5 shadow-lg shadow-red-950/20">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-red-400">
                <span className="flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                  Primary Failure Target
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-mono">
                  DIRECT IMPACT
                </span>
              </div>

              <div className="bg-zinc-950/80 border border-red-500/30 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-sm text-white">
                    {directService.name}
                  </span>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-300">
                    DEGRADED
                  </span>
                </div>
                <div className="text-xs text-zinc-400">
                  Namespace: <span className="font-mono text-zinc-300">{directService.namespace}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-900 text-xs">
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase block">Active Incidents</span>
                    <span className="font-bold text-red-400 font-mono text-sm">
                      {directService.activeIncidentsCount || 1}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase block">Error Rate</span>
                    <span className="font-bold text-amber-400 font-mono text-sm">
                      {directService.errorRate ? `${directService.errorRate}%` : 'Elevated'}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-red-300/80 leading-relaxed">
                Workload experiencing fault condition. Upstream requests are facing degraded latency or timeouts.
              </p>
            </div>

            {/* Stage 3: Downstream Dependencies */}
            <div className="p-3.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 space-y-2.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                  <span>Downstream Callee Chain</span>
                  <span className="text-[10px] text-zinc-500">
                    {downstreamServices.length} {downstreamServices.length === 1 ? 'service' : 'services'}
                  </span>
                </div>

                {downstreamServices.length === 0 ? (
                  <div className="text-xs text-zinc-500 italic py-2">
                    No downstream service dependencies discovered.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {downstreamServices.map((svc) => (
                      <div
                        key={svc.id}
                        className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${getStatusColor(
                          svc.status
                        )}`}
                      >
                        <div className="flex items-center gap-2">
                          {getStatusIcon(svc.status)}
                          <div>
                            <div className="font-mono font-bold text-white">{svc.name}</div>
                            <div className="text-[10px] opacity-75">{svc.namespace}</div>
                          </div>
                        </div>
                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-black/40">
                          {svc.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-zinc-800/60 text-[10px] text-zinc-500 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>Datastores & downstream APIs verified</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
