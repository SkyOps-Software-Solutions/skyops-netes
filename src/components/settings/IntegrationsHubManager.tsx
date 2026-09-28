import React from 'react';
import {
  Webhook,
  MessageSquare,
  Activity,
  Layers,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Terminal,
  ArrowRight
} from 'lucide-react';
import { Button, CodeBlock, CopyButton } from '../common/UI';

interface IntegrationsHubManagerProps {
  onNavigateToWebhooks?: () => void;
}

export const IntegrationsHubManager: React.FC<IntegrationsHubManagerProps> = ({
  onNavigateToWebhooks
}) => {
  return (
    <div className="space-y-6 max-w-5xl font-mono text-xs">
      {/* Header */}
      <div className="p-6 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-2">
        <div className="flex items-center gap-2 text-sky-400 font-semibold uppercase tracking-wider text-[11px]">
          <Layers className="w-4 h-4" /> Ecosystem Connectors
        </div>
        <h3 className="text-sm font-bold text-zinc-100 font-sans">
          Integrations & Outbound Incident Pipelines
        </h3>
        <p className="text-zinc-400 text-xs">
          Connect SkyOps Netes to your team communication tools, telemetry pipelines, and security automation webhooks.
        </p>
      </div>

      {/* Integration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Custom Webhooks */}
        <div className="p-5 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-bold text-zinc-200">
                <Webhook className="w-4 h-4 text-sky-400" />
                Custom HTTP Webhooks
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950/80 text-emerald-400 border border-emerald-800/50">
                Active
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Dispatch cryptographic HMAC-SHA256 event payloads to custom HTTP endpoints on incident creation, remediation, or state recovery.
            </p>
          </div>
          {onNavigateToWebhooks && (
            <Button
              variant="outline"
              size="sm"
              onClick={onNavigateToWebhooks}
              icon={<ArrowRight className="w-3.5 h-3.5" />}
              className="w-full justify-center text-xs font-mono"
            >
              Configure Outbound Webhooks
            </Button>
          )}
        </div>

        {/* 2. Slack Alerting */}
        <div className="p-5 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-bold text-zinc-200">
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                Slack Channel Notification
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700">
                Webhook Compatible
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Post real-time incident warnings and RCA diagnostic summaries directly to team Slack channels using standard Incoming Webhooks.
            </p>
          </div>
          {onNavigateToWebhooks && (
            <Button
              variant="outline"
              size="sm"
              onClick={onNavigateToWebhooks}
              icon={<ArrowRight className="w-3.5 h-3.5" />}
              className="w-full justify-center text-xs font-mono"
            >
              Set Up Slack Webhook
            </Button>
          )}
        </div>

        {/* 3. Kubernetes Helm Agent Registry */}
        <div className="p-5 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-bold text-zinc-200">
              <Terminal className="w-4 h-4 text-amber-400" />
              Official SkyOps Helm Charts
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] bg-sky-950 text-sky-400 border border-sky-800/60">
              v1.5.1
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Standard Helm repository to deploy the lightweight DaemonSet agent across any Kubernetes cluster distribution.
          </p>
          <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 flex items-center justify-between">
            <code>helm repo add skyops https://charts.skyops.io</code>
            <CopyButton text="helm repo add skyops https://charts.skyops.io" label="" />
          </div>
        </div>

        {/* 4. Platform Observability Export */}
        <div className="p-5 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-bold text-zinc-200">
              <Activity className="w-4 h-4 text-purple-400" />
              Prometheus & OpenTelemetry Export
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700">
              Standard API
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Pull Prometheus-formatted cluster telemetry, pod restart counters, and incident metrics from the SkyOps platform API endpoint.
          </p>
          <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 flex items-center justify-between">
            <code>GET /api/v1/system/metrics</code>
            <CopyButton text="GET /api/v1/system/metrics" label="" />
          </div>
        </div>
      </div>
    </div>
  );
};
