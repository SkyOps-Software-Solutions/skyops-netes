import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cpu,
  Database,
  FileCode,
  Fingerprint,
  Flame,
  HelpCircle,
  Layers,
  Lock,
  Network,
  Radio,
  RefreshCw,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap
} from 'lucide-react';
import React, { useState } from 'react';
import { Footer } from '../layout/Footer';
import { DocTopic, KnowledgeBaseModal } from '../docs/KnowledgeBaseModal';
import { BrandLogo } from '../common/BrandLogo';
import { PLANS, BILLING_INTERVALS } from '../../config/plans';
import { BillingInterval, PlanId } from '../../types';

interface LandingPageProps {
  onSignIn: () => void;
  onSignUp: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onSignIn, onSignUp }) => {
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [activeDocTopic, setActiveDocTopic] = useState<DocTopic>('quickstart');
  const [selectedInterval, setSelectedInterval] = useState<BillingInterval>('YEARLY');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const handleOpenDoc = (topic: DocTopic) => {
    setActiveDocTopic(topic);
    setIsDocModalOpen(true);
  };

  const handlePricingCta = (planId: PlanId) => {
    if (planId === 'ENTERPRISE') {
      window.location.href = 'mailto:skyopsnetes2000@gmail.com?subject=SkyOps%20Enterprise%20Inquiry';
      return;
    }
    // Route unauthenticated public users safely to signup flow
    onSignUp();
  };

  const faqs = [
    {
      q: 'Does the SkyOps agent require cluster-admin permissions?',
      a: 'No. The SkyOps agent deploys with a strictly read-only Kubernetes ClusterRole (get, list, watch on pods, events, nodes, and namespaces). It cannot delete pods, modify deployments, or alter mutating webhooks. The agent runs as UID 65532 non-root with read-only root filesystems.'
    },
    {
      q: 'How does SkyOps prevent duplicate incident alerts?',
      a: 'SkyOps uses deterministic mathematical fingerprinting. If a Deployment with 50 replicas crashes simultaneously due to an OOMKill or bad image tag, SkyOps correlates the crashing pods to the parent workload controller into exactly 1 actionable incident with aggregated timeline evidence.'
    },
    {
      q: 'How is Auto-Fix governed and controlled?',
      a: 'Auto-Fix is disabled by default and strictly policy-governed. Platform teams define permitted action types, maximum risk levels, protected namespaces (e.g. kube-system, production-db), maximum hourly executions, and require human approval gates before any Kubernetes manifest modification is staged.'
    },
    {
      q: 'What happens to historical telemetry if an agent disconnects?',
      a: 'When an agent disconnects or experiences a network partition, its cluster state marks as DISCONNECTED, never deleted or reset. All historical incident timelines, AI analyses, resource snapshots, and audit records remain preserved in authoritative Firestore storage.'
    },
    {
      q: 'Can I test SkyOps on local minikube or staging clusters?',
      a: 'Yes. Our Permanent Free tier supports 1 cluster up to 5 nodes and 100 workloads with full incident detection and 20 monthly Gemini AI root cause analyses, completely free with no credit card required.'
    }
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-sky-500/30 selection:text-sky-200">
      {/* 1. Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-zinc-950/85 border-b border-zinc-800/80 px-6 lg:px-12 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo
              size="lg"
              showText
              version="v1.5.1"
              subtitle="Kubernetes Incident Platform"
              className="rounded-lg"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              id="landing-header-docs-btn"
              onClick={() => handleOpenDoc('quickstart')}
              className="text-xs font-mono text-zinc-300 hover:text-zinc-100 px-3 py-2 rounded-lg hover:bg-zinc-800/60 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="SkyOps Documentation & Knowledge Base"
            >
              <BookOpen className="w-3.5 h-3.5 text-sky-400" />
              <span>Docs</span>
            </button>
            <a
              href="#pricing"
              className="text-xs font-mono text-zinc-300 hover:text-zinc-100 px-3 py-2 rounded-lg hover:bg-zinc-800/60 transition-colors hidden sm:inline-block"
            >
              Pricing
            </a>
            <div className="h-4 w-px bg-zinc-800 hidden sm:block" />
            <button
              id="landing-signin-btn"
              onClick={onSignIn}
              className="text-xs font-mono text-zinc-300 hover:text-zinc-100 px-3.5 py-2 rounded-lg hover:bg-zinc-800/60 transition-colors cursor-pointer"
            >
              Sign In
            </button>
            <button
              id="landing-signup-btn"
              onClick={onSignUp}
              className="text-xs font-mono font-semibold bg-sky-500 hover:bg-sky-400 text-zinc-950 px-4 py-2 rounded-lg shadow-sm hover:shadow-sky-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              Sign Up
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-20 px-6 lg:px-12 border-b border-zinc-800/60">
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-25 pointer-events-none" />

        <div className="max-w-5xl mx-auto text-center relative z-10 space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900/90 border border-zinc-800 text-xs font-mono text-sky-400">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            Electric Infrastructure Intelligence
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-zinc-100 leading-[1.15]">
            SkyOps detects Kubernetes incidents, <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-sky-400 via-cyan-200 to-indigo-300 bg-clip-text text-transparent">
              understands why they happened,
            </span> <br />
            and helps engineers resolve them.
          </h1>

          <p className="text-base sm:text-lg text-zinc-400 max-w-3xl mx-auto leading-relaxed">
            Eliminate alert fatigue and tribal debugging. Continuous read-only cluster observability,
            deterministic failure deduplication, Gemini-powered root cause analysis, and policy-governed
            remediation designed for high-density production clusters.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              id="hero-get-started-btn"
              onClick={onSignUp}
              className="w-full sm:w-auto px-7 py-3.5 bg-sky-500 hover:bg-sky-400 text-zinc-950 font-bold text-sm rounded-xl transition-all shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              Connect Your First Cluster
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              id="hero-signin-btn"
              onClick={onSignIn}
              className="w-full sm:w-auto px-6 py-3.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 font-mono text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              Sign In to Organization
            </button>
          </div>

          <div className="pt-6 flex flex-wrap items-center justify-center gap-4 text-xs font-mono text-zinc-500">
            <span>Read-Only ClusterRole</span>
            <span aria-hidden="true">·</span>
            <span>Deterministic Deduplication</span>
            <span aria-hidden="true">·</span>
            <span>Policy-Governed Fixes</span>
            <span aria-hidden="true">·</span>
            <span>Sub-3-Minute Agent Pairing</span>
          </div>
        </div>
      </section>

      {/* 3. Problem Section */}
      <section className="py-20 px-6 lg:px-12 max-w-7xl mx-auto border-b border-zinc-800/60">
        <div className="max-w-3xl mx-auto text-center mb-16 space-y-3">
          <p className="text-xs font-mono font-semibold uppercase tracking-wider text-sky-400">
            The SRE Reality
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-100">
            Why Kubernetes Incident Triage Breaks at Scale
          </h2>
          <p className="text-sm text-zinc-400">
            Standard monitoring fires alerts without context, leaving on-call engineers hunting through logs during critical downtime.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 space-y-4">
            <div className="w-10 h-10 rounded-lg bg-rose-950/50 border border-rose-800/50 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-zinc-100">Alert Fatigue & Cascading Noise</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              When a core deployment OOMs, 40 downstream replica pods fail sequentially, triggering 200 noisy Slack alerts that obscure the true root cause.
            </p>
            <div className="text-[11px] font-mono text-rose-400/90 pt-2 border-t border-zinc-800/60">
              Mean Time to Triage: 45+ minutes
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 space-y-4">
            <div className="w-10 h-10 rounded-lg bg-amber-950/50 border border-amber-800/50 flex items-center justify-center text-amber-400">
              <Terminal className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-zinc-100">Tribal Knowledge & kubectl Grunt Work</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Engineers scramble through <code className="text-zinc-300 font-mono">kubectl describe</code>, previous container crash logs, and fragmented Grafana dashboards to piece together what changed.
            </p>
            <div className="text-[11px] font-mono text-amber-400/90 pt-2 border-t border-zinc-800/60">
              High cognitive burden on on-call
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 space-y-4">
            <div className="w-10 h-10 rounded-lg bg-indigo-950/50 border border-indigo-800/50 flex items-center justify-center text-indigo-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-zinc-100">Risky, Unaudited Ad-hoc Hotfixes</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Rushed manual YAML edits in production risk collateral cluster failure. Without formal blast radius verification, quick fixes cause secondary outages.
            </p>
            <div className="text-[11px] font-mono text-indigo-400/90 pt-2 border-t border-zinc-800/60">
              Zero rollback verification
            </div>
          </div>
        </div>
      </section>

      {/* 4. How SkyOps Works (The 8-Step Story) */}
      <section className="py-20 px-6 lg:px-12 max-w-7xl mx-auto border-b border-zinc-800/60">
        <div className="max-w-3xl mx-auto text-center mb-16 space-y-3">
          <p className="text-xs font-mono font-semibold uppercase tracking-wider text-sky-400">
            The Operational Lifecycle
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-100">
            How SkyOps Works: From Telemetry to Verified Resolution
          </h2>
          <p className="text-sm text-zinc-400">
            A continuous, closed-loop pipeline purpose-built for Kubernetes resilience.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              step: '01',
              title: 'Connect Cluster',
              desc: 'Deploy the lightweight, non-privileged agent via Helm in seconds using an outbound TLS pairing token.'
            },
            {
              step: '02',
              title: 'Observe',
              desc: 'Stream live kubelet statuses, pod health, container exit codes, and cluster events with near-zero overhead.'
            },
            {
              step: '03',
              title: 'Detect',
              desc: 'Instant rule-based detection recognizes CrashLoopBackOff, OOMKills, Evictions, and ImagePullBackOff in sub-seconds.'
            },
            {
              step: '04',
              title: 'Investigate',
              desc: 'AI correlates correlated replica failures, container termination logs, and node resource metrics.'
            },
            {
              step: '05',
              title: 'Understand',
              desc: 'Generates structured root-cause analysis explaining the failure mechanism, code/spec triggers, and scope.'
            },
            {
              step: '06',
              title: 'Recommend',
              desc: 'Synthesizes verified remediation manifests with precise before-and-after resource diffs and blast radius analysis.'
            },
            {
              step: '07',
              title: 'Fix',
              desc: 'Apply the solution manually with one click or let policy-governed Auto-Fix execute within bounded safety parameters.'
            },
            {
              step: '08',
              title: 'Verify',
              desc: 'Tracks post-remediation rollout health and confirms pod stabilization to close the incident lifecycle.'
            }
          ].map((item) => (
            <div
              key={item.step}
              className="p-5 rounded-xl bg-zinc-900/30 border border-zinc-800/70 hover:border-zinc-700 transition-colors space-y-2.5"
            >
              <div className="text-xs font-mono font-bold text-sky-400 flex items-center justify-between">
                <span>STAGE {item.step}</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-zinc-600" />
              </div>
              <h3 className="text-sm font-bold text-zinc-100">{item.title}</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Detection & Telemetry */}
      <section className="py-20 px-6 lg:px-12 max-w-7xl mx-auto border-b border-zinc-800/60">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono text-sky-400">
              <Zap className="w-3.5 h-3.5" />
              Deterministic Incident Detection
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-zinc-100">
              Sub-second Detection Without Alert Storms
            </h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              SkyOps inspects raw Kubernetes state changes directly from the apiserver watch stream.
              Mathematical fingerprint hashing collapses 100 identical pod crashes into 1 single incident,
              preventing alert fatigue while capturing full diagnostic history.
            </p>
            <ul className="space-y-3 text-xs text-zinc-300 font-mono">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>OOMKills & Memory Pressure detection with container exit code 137 analysis</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>CrashLoopBackOff & container panic capture via previous-log inspection</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>ImagePullBackOff & registry authentication failure differentiation</span>
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 font-mono text-xs space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800 text-zinc-400">
              <span className="flex items-center gap-2 text-zinc-200 font-bold">
                <Terminal className="w-4 h-4 text-sky-400" />
                Incident Deduplication Engine
              </span>
              <span className="text-[10px] text-emerald-400">100 pods → 1 incident</span>
            </div>
            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80 space-y-2 text-zinc-300">
              <div className="text-sky-400 font-bold">INCIDENT SKY-1049</div>
              <div className="text-zinc-400 text-[11px]">Fingerprint: c8f921ab07e1e69b</div>
              <div className="text-zinc-200">Workload: Deployment / payment-api (12 replicas)</div>
              <div className="text-rose-400">Status: CRITICAL · OOMKilled (Exit Code 137)</div>
              <div className="text-zinc-500 text-[10px] pt-1">
                Trigger: Container memory reached 512Mi limit. Linux cgroup OOM invoked.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. AI Root Cause Investigation */}
      <section className="py-20 px-6 lg:px-12 max-w-7xl mx-auto border-b border-zinc-800/60">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="order-2 lg:order-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-sky-400">
                <Sparkles className="w-4 h-4" />
                Gemini Root Cause Analysis
              </div>
              <span className="text-[10px] font-mono text-zinc-400">Confidence: 94%</span>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <span className="text-zinc-500 font-mono uppercase text-[10px]">What Happened</span>
                <p className="text-zinc-200 mt-1">
                  The payment-api pods encountered repetitive OOMKills during JVM heap spikes when processing bulk checkout batches.
                </p>
              </div>
              <div>
                <span className="text-zinc-500 font-mono uppercase text-[10px]">Root Cause</span>
                <p className="text-zinc-200 mt-1">
                  Pod memory limit set to 512Mi while JVM was initialized with <code className="text-sky-300 font-mono">-XX:MaxRAMPercentage=80.0</code> leaving insufficient headroom for non-heap native buffers.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-[11px] text-zinc-300">
                <span className="text-emerald-400 font-bold">Recommended Solution:</span>
                <div className="mt-1 text-zinc-400">
                  Increase deployment resources.limits.memory to 1Gi and resources.requests.memory to 512Mi.
                </div>
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono text-sky-400">
              <Cpu className="w-3.5 h-3.5" />
              Deep Semantic Analysis
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-zinc-100">
              AI That Understands Kubernetes Architecture
            </h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              SkyOps doesn’t generate generic advice. Our specialized prompt architectures correlate container termination logs, Kubelet event streams, and pod resource specs to isolate the exact constraint or configuration bug that caused the outage.
            </p>
            <div className="flex items-center gap-6 text-xs font-mono text-zinc-400">
              <div>
                <div className="text-xl font-bold text-zinc-100">1.2s</div>
                <div className="text-zinc-500">Average Analysis Speed</div>
              </div>
              <div className="h-8 w-px bg-zinc-800" />
              <div>
                <div className="text-xl font-bold text-sky-400">Zero Hallucinations</div>
                <div className="text-zinc-500">Grounded in Raw Logs</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Remediation & Exact Diffs */}
      <section className="py-20 px-6 lg:px-12 max-w-7xl mx-auto border-b border-zinc-800/60">
        <div className="max-w-3xl mx-auto text-center mb-16 space-y-3">
          <p className="text-xs font-mono font-semibold uppercase tracking-wider text-sky-400">
            Actionable Resolution
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-100">
            Exact Manifest Diffs with Blast Radius Control
          </h2>
          <p className="text-sm text-zinc-400">
            Never guess how to patch a Kubernetes manifest. SkyOps presents explicit before-and-after diffs with documented impact before any change is applied.
          </p>
        </div>

        <div className="max-w-4xl mx-auto p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 font-mono text-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <span className="text-zinc-300 font-bold">Target: Deployment/payment-api (Namespace: default)</span>
            <span className="text-sky-400">Action: Patch Resource Limits</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-zinc-950 border border-rose-900/40 space-y-2">
              <div className="text-rose-400 font-bold uppercase text-[10px]">Current Configuration</div>
              <pre className="text-zinc-400 text-[11px] leading-relaxed">
{`resources:
  requests:
    memory: "256Mi"
  limits:
    memory: "512Mi"  # ❌ Triggers cgroup OOM`}
              </pre>
            </div>

            <div className="p-4 rounded-lg bg-zinc-950 border border-emerald-900/40 space-y-2">
              <div className="text-emerald-400 font-bold uppercase text-[10px]">Proposed Patch</div>
              <pre className="text-zinc-200 text-[11px] leading-relaxed">
{`resources:
  requests:
    memory: "512Mi"
  limits:
    memory: "1Gi"    # ✅ Headroom for heap spikes`}
              </pre>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-zinc-950/80 border border-zinc-800 text-[11px] text-zinc-400 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-zinc-300 font-semibold">Possible Impact:</span> Rolling update will trigger graceful pod replacement. Zero downtime.
            </div>
            <div className="shrink-0 text-sky-400">Post-Fix: Automatic 5-minute health probe</div>
          </div>
        </div>
      </section>

      {/* 8. Auto-Fix: Strictly Governed */}
      <section className="py-20 px-6 lg:px-12 max-w-7xl mx-auto border-b border-zinc-800/60">
        <div className="max-w-3xl mx-auto text-center mb-14 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono text-sky-400">
            <Lock className="w-3.5 h-3.5" />
            Policy-Governed Automation
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-100">
            Controlled Auto-Fix: Safe, Audited, Bounded
          </h2>
          <p className="text-sm text-zinc-400">
            SkyOps never gives AI unrestricted access to your cluster. Every automated execution is locked behind strict organizational policies.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <div className="p-5 rounded-xl bg-zinc-900/30 border border-zinc-800 space-y-3">
            <h3 className="text-sm font-bold text-zinc-100">Protected Namespaces</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Explicit blacklist prevents automated mutations on sensitive infrastructure namespaces such as <code className="text-zinc-300 font-mono">kube-system</code>, <code className="text-zinc-300 font-mono">vault</code>, or stateful database clusters.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-zinc-900/30 border border-zinc-800 space-y-3">
            <h3 className="text-sm font-bold text-zinc-100">Risk Threshold Limits</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Auto-Fix is restricted to Low and Medium risk actions (e.g. resource bumping or restarting crashed standalone pods). High-risk modifications strictly require human sign-off.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-zinc-900/30 border border-zinc-800 space-y-3">
            <h3 className="text-sm font-bold text-zinc-100">Execution Quotas & Audit Trail</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Set hourly maximum execution limits to prevent cascading thrashing. Every automated decision writes an immutable log entry with actor, diff, and verification result.
            </p>
          </div>
        </div>
      </section>

      {/* 9. Architecture & Security Model */}
      <section className="py-20 px-6 lg:px-12 max-w-7xl mx-auto border-b border-zinc-800/60">
        <div className="max-w-3xl mx-auto text-center mb-16 space-y-3">
          <p className="text-xs font-mono font-semibold uppercase tracking-wider text-sky-400">
            Enterprise Architecture
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-100">
            Non-Privileged Agent with Outbound-Only Telemetry
          </h2>
          <p className="text-sm text-zinc-400">
            Engineered to pass strict enterprise infosec reviews with zero incoming network exposure.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center max-w-5xl mx-auto">
          <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-4 font-mono text-xs">
            <div className="text-sky-400 font-bold uppercase text-[10px]">Agent Security Specification</div>
            <div className="space-y-2 text-zinc-300">
              <div className="flex justify-between py-1 border-b border-zinc-800">
                <span className="text-zinc-500">Execution User</span>
                <span>UID 65532 (Non-Root)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-800">
                <span className="text-zinc-500">Filesystem</span>
                <span>Read-Only Root Filesystem</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-800">
                <span className="text-zinc-500">Incoming Ports</span>
                <span>0 (Outbound TLS 1.3 Only)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-800">
                <span className="text-zinc-500">RBAC ClusterRole</span>
                <span>Strictly Read-Only (get, list, watch)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-800">
                <span className="text-zinc-500">Resource Footprint</span>
                <span>&lt; 25MB RAM, 0.02 Core</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-bold text-zinc-100">How Data Travels to SkyOps</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              The SkyOps agent streams anonymized telemetry, Kubernetes events, and container crash logs to our control plane using mutual TLS. No credentials or secret environment variables are ever harvested or logged.
            </p>
            <p className="text-xs text-zinc-400 leading-relaxed">
              If the control plane becomes unreachable, the agent utilizes an in-memory ring buffer to prevent telemetry loss without destabilizing cluster nodes.
            </p>
          </div>
        </div>
      </section>

      {/* 10. Pricing Section */}
      <section id="pricing" className="py-20 px-6 lg:px-12 max-w-7xl mx-auto border-b border-zinc-800/60">
        <div className="max-w-3xl mx-auto text-center mb-12 space-y-3">
          <p className="text-xs font-mono font-semibold uppercase tracking-wider text-sky-400">
            Simple, Transparent Pricing
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-100">
            Predictable Plans for Any Cluster Scale
          </h2>
          <p className="text-sm text-zinc-400">
            Every plan includes our non-privileged agent, incident deduplication, and real-time alerts.
          </p>

          {/* Billing Interval Selector */}
          <div className="pt-4 flex items-center justify-center">
            <div className="inline-flex p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
              {BILLING_INTERVALS.map((int) => (
                <button
                  key={int.id}
                  onClick={() => setSelectedInterval(int.id)}
                  className={`px-3 sm:px-4 py-1.5 text-xs font-mono rounded-lg transition-all cursor-pointer ${
                    selectedInterval === int.id
                      ? 'bg-sky-500 text-zinc-950 font-bold shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {int.label}
                  {int.id === 'YEARLY' && (
                    <span className="ml-1.5 text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full hidden sm:inline">
                      Save 20%
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 4 Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {(['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE'] as PlanId[]).map((planId) => {
            const plan = PLANS[planId];
            const pricing = plan.pricing[selectedInterval];
            const isPopular = plan.recommended;

            return (
              <div
                key={planId}
                className={`p-6 rounded-2xl flex flex-col justify-between transition-all relative ${
                  isPopular
                    ? 'bg-zinc-900/80 border-2 border-sky-500/80 shadow-xl shadow-sky-500/10'
                    : 'bg-zinc-900/30 border border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-sky-500 text-zinc-950 text-[10px] font-mono font-bold tracking-wider uppercase">
                    Most Popular
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-zinc-100">{plan.name}</h3>
                    <p className="text-xs text-zinc-400 mt-1 min-h-[32px]">{plan.tagline}</p>
                  </div>

                  <div className="py-2 border-y border-zinc-800/80">
                    {pricing.totalPrice === 0 ? (
                      <div className="text-3xl font-extrabold font-mono text-zinc-100">
                        ₹0
                        <span className="text-xs text-zinc-500 font-normal ml-1">/ forever</span>
                      </div>
                    ) : (
                      <div>
                        <div className="text-3xl font-extrabold font-mono text-zinc-100">
                          ₹{pricing.monthlyEquivalent.toLocaleString()}
                          <span className="text-xs text-zinc-500 font-normal ml-1">/ mo</span>
                        </div>
                        <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                          Billed ₹{pricing.totalPrice.toLocaleString()} {pricing.label.toLowerCase()}
                          {pricing.savings > 0 && (
                            <span className="text-emerald-400 ml-1.5 font-bold">
                              Save ₹{pricing.savings.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] font-mono uppercase text-zinc-500 font-bold tracking-wider">
                      Included Capabilities
                    </span>
                    <ul className="space-y-2 text-xs text-zinc-300">
                      {plan.highlights.slice(0, 6).map((h, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                          <span className="leading-snug">{h}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-6 mt-6 border-t border-zinc-800">
                  <button
                    onClick={() => handlePricingCta(planId)}
                    className={`w-full py-2.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      isPopular
                        ? 'bg-sky-500 hover:bg-sky-400 text-zinc-950 shadow-md shadow-sky-500/20'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100'
                    }`}
                  >
                    {planId === 'FREE'
                      ? 'Get Started'
                      : planId === 'ENTERPRISE'
                      ? 'Contact Sales'
                      : 'Start / Upgrade'}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 11. FAQ Section */}
      <section className="py-20 px-6 lg:px-12 max-w-4xl mx-auto border-b border-zinc-800/60">
        <div className="text-center mb-12 space-y-3">
          <p className="text-xs font-mono font-semibold uppercase tracking-wider text-sky-400">
            Frequently Asked Questions
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-100">
            Clear Answers for Engineering Teams
          </h2>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, index) => {
            const isOpen = openFaqIndex === index;
            return (
              <div
                key={index}
                className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                  className="w-full p-4 text-left flex items-center justify-between gap-4 cursor-pointer hover:bg-zinc-800/30 transition-colors"
                >
                  <span className="text-sm font-bold text-zinc-100">{faq.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-zinc-400 transition-transform ${
                      isOpen ? 'rotate-180 text-sky-400' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 pt-1 text-xs text-zinc-400 leading-relaxed border-t border-zinc-800/50">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 12. Final CTA */}
      <section className="py-20 px-6 lg:px-12 max-w-5xl mx-auto text-center space-y-6">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-zinc-100 tracking-tight">
          Ready to Make Kubernetes Incident Triage Effortless?
        </h2>
        <p className="text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto">
          Install the read-only agent in under 3 minutes. Zero telemetry lag, sub-second failure deduplication, and deep AI root cause analysis.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            onClick={onSignUp}
            className="w-full sm:w-auto px-8 py-3.5 bg-sky-500 hover:bg-sky-400 text-zinc-950 font-bold text-sm rounded-xl transition-all shadow-lg shadow-sky-500/20 inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            Get Started with Free Tier
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleOpenDoc('quickstart')}
            className="w-full sm:w-auto px-6 py-3.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 font-mono text-sm rounded-xl transition-all inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-sky-400" />
            Read Architecture Docs
          </button>
        </div>
      </section>

      {/* 13. Production Footer */}
      <Footer
        onOpenDoc={handleOpenDoc}
        onGetStarted={onSignUp}
        onOpenAddCluster={onSignUp}
        isAuthenticated={false}
      />

      {/* Technical Knowledge Base Modal */}
      <KnowledgeBaseModal
        isOpen={isDocModalOpen}
        onClose={() => setIsDocModalOpen(false)}
        initialTopic={activeDocTopic}
        onGetStarted={onSignUp}
      />
    </div>
  );
};
