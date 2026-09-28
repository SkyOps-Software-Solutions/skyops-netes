import {
  Activity,
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileText,
  HelpCircle,
  Info,
  Layers,
  MessageSquare,
  Play,
  RefreshCw,
  Send,
  Server,
  Shield,
  ShieldCheck,
  Tag,
  Trash2,
  User,
  UserCheck,
  XCircle
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Incident,
  IncidentNote,
  IncidentSeverity,
  IncidentStatus,
  IntelligenceAnalysis,
  SkyOpsAIAnalysis,
  StructuredRemediation,
  TimelineEvent
} from '../../types/index';
import { formatDuration, formatReportDate, generateIncidentPdf, getPriorityLabel } from '../../utils/incidentPdfGenerator';
import { SeverityBadge, StatusBadge, ProvenanceBadge } from '../common/Badges';
import { Button, CopyButton, EmptyState, LoadingState } from '../common/UI';
import { SkyOpsAIAnalysisCard } from './SkyOpsAIAnalysisCard';
import { IncidentRemediationCard } from './IncidentRemediationCard';
import { IncidentEvidenceSection } from './IncidentEvidenceSection';
import { SkyOpsIntelligenceCard } from './SkyOpsIntelligenceCard';

interface IncidentDetailViewProps {
  incidentId: string;
  onBack: () => void;
  onSelectCluster?: (clusterId: string) => void;
}

export const IncidentDetailView: React.FC<IncidentDetailViewProps> = ({
  incidentId,
  onBack,
  onSelectCluster
}) => {
  const { canEditIncidents, members } = useAuth();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [notes, setNotes] = useState<IncidentNote[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<SkyOpsAIAnalysis | null>(null);
  const [remediation, setRemediation] = useState<StructuredRemediation | null>(null);
  const [intelligence, setIntelligence] = useState<IntelligenceAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [statusUpdateLoading, setStatusUpdateLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfSuccess, setPdfSuccess] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const fetchIncidentData = async () => {
    try {
      setLoading(true);
      const data = await api.getIncident(incidentId);
      setIncident(data.incident);
      setTimeline(data.timeline);
      setNotes(data.notes);
      if (data.aiAnalysis) {
        setAiAnalysis(data.aiAnalysis);
      }
      if (data.remediation) {
        setRemediation(data.remediation);
      }
      if (data.intelligence) {
        setIntelligence(data.intelligence);
      } else if (data.incident?.intelligence) {
        setIntelligence(data.incident.intelligence);
      } else if (data.aiAnalysis?.intelligence) {
        setIntelligence(data.aiAnalysis.intelligence);
      }
    } catch (err) {
      console.error('Failed to fetch incident details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidentData();
  }, [incidentId]);

  const handleDownloadPdf = () => {
    if (!incident) return;
    try {
      setIsGeneratingPdf(true);
      generateIncidentPdf({ incident, timeline, notes });
      setPdfSuccess(true);
      setTimeout(() => setPdfSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to generate incident PDF report:', err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDelete = async () => {
    if (!incident || !canEditIncidents) return;
    if (!window.confirm(`Are you sure you want to delete incident ticket ${incident.id}?`)) return;
    try {
      setIsDeleting(true);
      await api.deleteIncident(incident.id);
      onBack();
    } catch (err) {
      console.error('Failed to delete incident:', err);
      setIsDeleting(false);
    }
  };

  const handleStatusChange = async (newStatus: IncidentStatus) => {
    if (!incident || !canEditIncidents) return;
    try {
      setStatusUpdateLoading(true);
      setStatusError(null);
      let resolutionReason: string | undefined = undefined;
      if (newStatus === 'RESOLVED') {
        const inputReason = window.prompt('Enter an optional resolution note or reason for manually marking this incident resolved:');
        if (inputReason !== null) {
          resolutionReason = inputReason.trim() || undefined;
        }
      }
      const updated = await api.updateIncident(incident.id, { status: newStatus, resolutionReason });
      setIncident(updated);
      const updatedData = await api.getIncident(incident.id);
      setTimeline(updatedData.timeline);
    } catch (err: any) {
      console.error('Failed to update status:', err);
      setStatusError(err?.message || 'Failed to update incident status');
    } finally {
      setStatusUpdateLoading(false);
    }
  };

  const handleAssigneeChange = async (userId: string) => {
    if (!incident || !canEditIncidents) return;
    const member = members.find((m) => m.userId === userId);
    try {
      const assignee = member ? { userId: member.userId, name: member.name, email: member.email } : undefined;
      const updated = await api.updateIncident(incident.id, { assignee });
      setIncident(updated);
      const updatedData = await api.getIncident(incident.id);
      setTimeline(updatedData.timeline);
    } catch (err) {
      console.error('Failed to assign incident:', err);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim() || !incident || !canEditIncidents) return;

    try {
      setIsSubmittingNote(true);
      const note = await api.addIncidentNote(incident.id, newNoteContent.trim());
      setNotes((prev) => [...prev, note]);
      setNewNoteContent('');

      const updatedData = await api.getIncident(incident.id);
      setTimeline(updatedData.timeline);
    } catch (err) {
      console.error('Failed to add note:', err);
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const formatTimeAgo = (ts?: number) => {
    if (!ts) return 'Never';
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    return `${diffHours}h ago`;
  };

  if (loading && !incident) {
    return <LoadingState message="Loading incident ticket..." />;
  }

  if (!incident) {
    return (
      <div className="p-8">
        <EmptyState
          title="Incident Not Found"
          description="The requested incident ticket could not be found."
          action={{ label: 'Return to Incidents', onClick: onBack }}
        />
      </div>
    );
  }

  const tech = incident.technicalDetails || {};
  const priority = getPriorityLabel(incident.severity);

  // 1. Lifecycle Stage Determination
  const isResolved = incident.status === 'RESOLVED' || incident.status === 'CLOSED';
  const isVerifying = remediation?.status === 'VERIFYING' || (!isResolved && incident.resolutionSource === 'AUTOMATIC_VERIFIED');
  const isRemediationActive =
    remediation?.status === 'PROPOSED' ||
    remediation?.status === 'DISPATCHED' ||
    remediation?.status === 'EXECUTED' ||
    (!isResolved && incident.status === 'IN_PROGRESS');
  const isInvestigating = !isResolved && (incident.status === 'OPEN' || incident.status === 'ACKNOWLEDGED') && !isRemediationActive && !isVerifying;

  // 2. What Happened Statement
  const getWhatHappenedStatement = () => {
    if (incident.incidentType === 'ImagePullBackOff') {
      return `${incident.resourceName} cannot start because Kubernetes cannot pull the configured container image.`;
    }
    if (incident.incidentType === 'CrashLoopBackOff') {
      return `${incident.resourceName} is failing to start and crashing repeatedly in container runtime (exit code ${tech.exitCode ?? 'non-zero'}).`;
    }
    if (incident.incidentType === 'DeploymentDegraded') {
      return `${incident.resourceName} is degraded and has not met its target replica availability (${tech.availableReplicas ?? 0}/${tech.desiredReplicas ?? 1} available).`;
    }
    if (aiAnalysis?.summary) return aiAnalysis.summary;
    if (tech.message) return tech.message;
    return `Kubernetes observed failure state '${incident.incidentType}' on ${incident.resourceKind} ${incident.resourceName}.`;
  };

  // 3. Root Cause Provenance Segregation
  const confirmedFact =
    tech.rootCause ||
    aiAnalysis?.evidence?.find((e) => e.category === 'OBSERVED_FACT')?.detail ||
    (tech.evidence && tech.evidence.length > 0 ? tech.evidence[0].message : null) ||
    (tech.reason ? `Kubelet failure state: ${tech.reason}` : null);

  const inferenceHypothesis =
    aiAnalysis?.evidence?.find((e) => e.category === 'AI_INFERENCE')?.detail ||
    (aiAnalysis?.rootCause && aiAnalysis.confidence < 1.0 ? aiAnalysis.rootCause : null) ||
    (incident.incidentType === 'ImagePullBackOff'
      ? 'The image name or tag may be incorrect or registry authentication credentials may be missing.'
      : null);

  const unknownInvestigationNote =
    !confirmedFact && (!aiAnalysis || aiAnalysis.status === 'UNAVAILABLE')
      ? 'Root cause is currently undetermined. Diagnostic telemetry and container status are under active inspection.'
      : aiAnalysis?.additionalEvidenceNeeded && aiAnalysis.additionalEvidenceNeeded.length > 0
      ? `Supplementary evidence needed: ${aiAnalysis.additionalEvidenceNeeded.join(', ')}`
      : null;

  // 4. Impact Data
  const impactSummary =
    tech.impact ||
    (incident.severity === 'CRITICAL' || incident.severity === 'HIGH'
      ? 'Workload is unavailable or degraded, failing readiness checks.'
      : 'Localized component degradation without total cluster outage.');

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto font-sans relative z-10">
      {/* ========================================================================= */}
      {/* 1. INCIDENT HEADER (Deep Space Enterprise Shell) */}
      {/* ========================================================================= */}
      <div className={`p-6 rounded-2xl bg-[#080B12]/85 border backdrop-blur-md space-y-5 transition-all duration-300 ${
        incident.severity === 'CRITICAL'
          ? 'border-rose-500/30 shadow-[0_0_30px_rgba(244,63,94,0.12)]'
          : incident.severity === 'HIGH'
          ? 'border-amber-500/25 shadow-[0_0_20px_rgba(245,158,11,0.08)]'
          : 'border-cyan-500/20 shadow-[0_0_25px_rgba(6,182,212,0.06)]'
      }`}>
        {/* Top Action Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-4">
            <button
              onClick={onBack}
              className="p-2.5 rounded-xl bg-[#05060A]/80 border border-white/10 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/30 hover:bg-[#0B1020] transition-all cursor-pointer shrink-0 mt-0.5 sm:mt-0"
              title="Back to Incidents List"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-mono tracking-wider uppercase text-cyan-400 font-bold px-2 py-0.5 rounded-md bg-cyan-950/60 border border-cyan-800/40">
                  INCIDENT
                </span>
                <span className="text-xl font-bold font-mono text-white tracking-tight">{incident.id}</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-[#0B1020] text-slate-300 border border-white/10">
                  {priority}
                </span>
                <SeverityBadge severity={incident.severity} size="sm" />
                <StatusBadge status={incident.status} size="sm" />
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-950/70 text-amber-300 border border-amber-800/60">
                  {incident.occurrenceCount}x Occurrence{incident.occurrenceCount > 1 ? ` (Recurred ${incident.occurrenceCount - 1}x)` : ''}
                </span>

                {/* Resolution Provenance Badge (if resolved) */}
                {incident.resolvedAt && (
                  incident.resolutionSource === 'AUTOMATIC_VERIFIED' || incident.resolution?.source === 'AUTOMATIC_VERIFIED' ? (
                    <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      VERIFIED BY TELEMETRY
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-[#0B1020] text-slate-300 border border-white/15 flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
                      MANUALLY CLOSED
                    </span>
                  )
                )}
              </div>
              <h1 className="text-lg font-medium text-white mt-2 leading-snug tracking-tight">{incident.title}</h1>
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-400 mt-1.5">
                <span className="flex items-center gap-1.5">
                  <span className="text-slate-500">ENVIRONMENT:</span>
                  <strong className="text-slate-200">{incident.clusterName}</strong>
                </span>
                <span className="text-slate-600">•</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-slate-500">NAMESPACE:</span>
                  <strong className="text-slate-200">{incident.namespace}</strong>
                </span>
                <span className="text-slate-600">•</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-slate-500">AFFECTED RESOURCE:</span>
                  <strong className="text-cyan-300 font-semibold">{incident.resourceKind}/{incident.resourceName}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Ticket Controls */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs shrink-0">
            <Button
              variant="primary"
              size="sm"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              icon={isGeneratingPdf ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              className="bg-cyan-500 hover:bg-cyan-400 text-[#05060A] font-semibold shadow-[0_0_15px_rgba(6,182,212,0.3)] border-none"
            >
              {pdfSuccess ? 'Report Downloaded!' : isGeneratingPdf ? 'Generating PDF...' : 'Download PDF Report'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchIncidentData}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Refresh
            </Button>

            {canEditIncidents && (
              <div className="flex items-center gap-1.5 bg-[#05060A]/80 border border-white/10 rounded-lg px-2.5 py-1">
                <span className="text-slate-400 text-[11px] uppercase">Status:</span>
                <select
                  value={incident.status}
                  disabled={statusUpdateLoading}
                  onChange={(e) => handleStatusChange(e.target.value as IncidentStatus)}
                  className="bg-transparent text-slate-200 focus:outline-none font-semibold cursor-pointer text-xs"
                >
                  <option value="OPEN" className="bg-[#080B12] text-slate-200">OPEN</option>
                  <option value="ACKNOWLEDGED" className="bg-[#080B12] text-slate-200">ACKNOWLEDGED</option>
                  <option value="IN_PROGRESS" className="bg-[#080B12] text-slate-200">IN_PROGRESS</option>
                  <option value="RESOLVED" className="bg-[#080B12] text-slate-200">RESOLVED</option>
                  <option value="CLOSED" className="bg-[#080B12] text-slate-200">CLOSED</option>
                </select>
              </div>
            )}

            {canEditIncidents && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
                icon={<Trash2 className="w-3.5 h-3.5 text-rose-400" />}
                className="hover:border-rose-800 text-rose-300"
              >
                Delete
              </Button>
            )}
          </div>
        </div>

        {/* Compact Incident Lifecycle Bar */}
        <div className="pt-4 border-t border-white/5">
          <div className="flex items-center justify-between text-[11px] font-mono overflow-x-auto pb-1 gap-2 no-scrollbar">
            {/* Stage 1: Detected */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="w-5 h-5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-500/50 flex items-center justify-center font-bold text-[10px]">
                ✓
              </span>
              <div>
                <span className="text-emerald-300 font-bold block">1. Detected</span>
                <span className="text-slate-500 text-[10px]">{formatTimeAgo(incident.firstSeenAt)}</span>
              </div>
            </div>

            <div className="w-6 h-0.5 bg-white/10 shrink-0" />

            {/* Stage 2: Investigating */}
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                  isRemediationActive || isVerifying || isResolved
                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/50'
                    : isInvestigating
                    ? 'bg-cyan-950/80 text-cyan-400 border border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.4)] animate-pulse'
                    : 'bg-[#0B1020] text-slate-600 border border-white/10'
                }`}
              >
                {isRemediationActive || isVerifying || isResolved ? '✓' : '2'}
              </span>
              <div>
                <span
                  className={`font-bold block ${
                    isRemediationActive || isVerifying || isResolved
                      ? 'text-emerald-300'
                      : isInvestigating
                      ? 'text-cyan-300'
                      : 'text-slate-500'
                  }`}
                >
                  2. Investigating
                </span>
                <span className="text-slate-500 text-[10px]">
                  {isInvestigating ? 'Active Triage' : 'Root Cause Analysed'}
                </span>
              </div>
            </div>

            <div className="w-6 h-0.5 bg-white/10 shrink-0" />

            {/* Stage 3: Remediation */}
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                  isVerifying || isResolved
                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/50'
                    : isRemediationActive
                    ? 'bg-amber-950/80 text-amber-400 border border-amber-500/50 animate-pulse'
                    : 'bg-[#0B1020] text-slate-600 border border-white/10'
                }`}
              >
                {isVerifying || isResolved ? '✓' : '3'}
              </span>
              <div>
                <span
                  className={`font-bold block ${
                    isVerifying || isResolved
                      ? 'text-emerald-300'
                      : isRemediationActive
                      ? 'text-amber-300'
                      : 'text-slate-500'
                  }`}
                >
                  3. Remediation
                </span>
                <span className="text-slate-500 text-[10px]">
                  {remediation?.status === 'DISPATCHED'
                    ? 'Dispatched to Agent'
                    : remediation?.status === 'PROPOSED'
                    ? 'Approval Required'
                    : isVerifying || isResolved
                    ? 'Action Executed'
                    : 'Pending Action'}
                </span>
              </div>
            </div>

            <div className="w-6 h-0.5 bg-white/10 shrink-0" />

            {/* Stage 4: Verifying */}
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                  isResolved
                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/50'
                    : isVerifying
                    ? 'bg-purple-950/80 text-purple-400 border border-purple-500/50 animate-pulse'
                    : 'bg-[#0B1020] text-slate-600 border border-white/10'
                }`}
              >
                {isResolved ? '✓' : '4'}
              </span>
              <div>
                <span
                  className={`font-bold block ${
                    isResolved ? 'text-emerald-300' : isVerifying ? 'text-purple-300' : 'text-slate-500'
                  }`}
                >
                  4. Verifying
                </span>
                <span className="text-slate-500 text-[10px]">
                  {isVerifying ? 'Live Telemetry Check' : isResolved ? 'Verified' : 'Awaiting Check'}
                </span>
              </div>
            </div>

            <div className="w-6 h-0.5 bg-white/10 shrink-0" />

            {/* Stage 5: Resolved */}
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                  isResolved
                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/50'
                    : 'bg-[#0B1020] text-slate-600 border border-white/10'
                }`}
              >
                {isResolved ? '✓' : '5'}
              </span>
              <div>
                <span className={`font-bold block ${isResolved ? 'text-emerald-300' : 'text-slate-500'}`}>
                  5. Resolved
                </span>
                <span className="text-slate-500 text-[10px]">
                  {incident.resolvedAt ? formatTimeAgo(incident.resolvedAt) : 'Open Ticket'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status Action Error Banner */}
      {statusError && (
        <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-800/80 text-xs text-rose-200 flex items-center justify-between gap-3 shadow-[0_0_20px_rgba(244,63,94,0.15)] font-mono">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{statusError}</span>
          </div>
          <button
            onClick={() => setStatusError(null)}
            className="text-rose-400 hover:text-rose-200 text-xs font-bold px-2.5 py-1 rounded hover:bg-rose-900/50 cursor-pointer transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TWO-COLUMN SRE INVESTIGATION WORKSPACE */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Workspace Column (8 cols): WHAT HAPPENED, TIMELINE, EVIDENCE, AI INVESTIGATION, ROOT CAUSE, REMEDIATION */}
        <div className="lg:col-span-8 space-y-6">

          {/* ========================================================================= */}
          {/* SECTION: WHAT HAPPENED? */}
          {/* ========================================================================= */}
          <div className="p-6 rounded-2xl bg-[#080B12]/80 border border-white/10 backdrop-blur-md space-y-4 shadow-sm hover:border-cyan-500/20 transition-all">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <AlertOctagon className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                    What Happened?
                  </h2>
                  <span className="text-[11px] text-slate-400">Deterministic incident summary and impact</span>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0B1020] text-cyan-300 border border-cyan-500/20">
                TELEMETRY CAPTURE
              </span>
            </div>

            {/* Human-readable primary statement */}
            <div className="p-4 rounded-xl bg-[#05060A]/85 border border-white/5">
              <p className="text-sm font-medium text-slate-100 leading-relaxed font-sans">
                {getWhatHappenedStatement()}
              </p>
            </div>

            {/* Concise supporting telemetry pills */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
              <div className="p-3 rounded-xl bg-[#05060A]/70 border border-white/5">
                <span className="text-[10px] text-slate-500 uppercase block tracking-wider">Current State</span>
                <span className="text-rose-400 font-semibold truncate block mt-1">
                  {tech.reason || tech.observedState || incident.incidentType}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#05060A]/70 border border-white/5">
                <span className="text-[10px] text-slate-500 uppercase block tracking-wider">Target Resource</span>
                <span className="text-cyan-300 font-semibold truncate block mt-1">
                  {incident.resourceKind}/{incident.resourceName}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#05060A]/70 border border-white/5">
                <span className="text-[10px] text-slate-500 uppercase block tracking-wider">Namespace</span>
                <span className="text-slate-200 truncate block mt-1">{incident.namespace}</span>
              </div>

              <div className="p-3 rounded-xl bg-[#05060A]/70 border border-white/5">
                <span className="text-[10px] text-slate-500 uppercase block tracking-wider">Cluster</span>
                <span className="text-slate-200 truncate block mt-1">{incident.clusterName}</span>
              </div>
            </div>

            {/* Operational Impact breakdown */}
            <div className="p-4 rounded-xl bg-[#05060A]/60 border border-white/5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                <Activity className="w-3.5 h-3.5 text-amber-400" />
                <span className="uppercase tracking-wider text-[10px] font-bold">Operational Impact:</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-sans">{impactSummary}</p>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECTION: EVIDENCE */}
          {/* ========================================================================= */}
          <div className="space-y-4">
            <IncidentEvidenceSection
              technicalDetails={tech}
              aiAnalysis={aiAnalysis}
              incidentType={incident.incidentType}
              incident={incident}
            />

            {/* Diagnostic Telemetry & Observed State */}
            <div className="p-6 rounded-2xl bg-[#080B12]/80 border border-white/10 backdrop-blur-md space-y-4">
              <h3 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wider flex items-center gap-2 border-b border-white/5 pb-3">
                <Layers className="w-4 h-4 text-cyan-400" />
                Diagnostic Telemetry & Observed State
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="p-3 bg-[#05060A]/80 rounded-xl border border-white/5">
                  <span className="text-slate-500 text-[10px] block uppercase">State / Reason</span>
                  <span className="text-rose-400 font-bold truncate block mt-0.5">{tech.reason || incident.incidentType}</span>
                </div>

                <div className="p-3 bg-[#05060A]/80 rounded-xl border border-white/5">
                  <span className="text-slate-500 text-[10px] block uppercase">Observed Status</span>
                  <span className="text-slate-200 font-semibold truncate block mt-0.5">{tech.observedState || incident.status}</span>
                </div>

                <div className="p-3 bg-[#05060A]/80 rounded-xl border border-white/5">
                  <span className="text-slate-500 text-[10px] block uppercase">Exit Code</span>
                  <span className={`font-bold block mt-0.5 ${tech.exitCode !== undefined && tech.exitCode !== 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                    {tech.exitCode !== undefined ? tech.exitCode : 'None (Waiting)'}
                  </span>
                </div>

                <div className="p-3 bg-[#05060A]/80 rounded-xl border border-white/5">
                  <span className="text-slate-500 text-[10px] block uppercase">Restart Count</span>
                  <span className={`font-bold block mt-0.5 ${tech.restartCount && tech.restartCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                    {tech.restartCount !== undefined ? `${tech.restartCount} restarts` : '0 restarts'}
                  </span>
                </div>
              </div>

              {/* Diagnostic Message Callout */}
              {tech.message && (
                <div className="p-4 bg-rose-950/20 border border-rose-900/40 rounded-xl space-y-1.5 font-mono text-xs">
                  <span className="text-rose-300 font-bold block text-[10px] uppercase tracking-wider">
                    Diagnostic Telemetry String:
                  </span>
                  <p className="text-rose-200/90 leading-relaxed font-sans">{tech.message}</p>
                </div>
              )}
            </div>

            {/* Target Kubernetes Infrastructure */}
            <div className="p-6 rounded-2xl bg-[#080B12]/80 border border-white/10 backdrop-blur-md space-y-4">
              <h3 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wider flex items-center gap-2 border-b border-white/5 pb-3">
                <Server className="w-4 h-4 text-cyan-400" />
                Kubernetes Target Infrastructure
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
                <div className="p-3 bg-[#05060A]/80 rounded-xl border border-white/5">
                  <span className="text-slate-500 text-[10px] block uppercase">Cluster Name</span>
                  <span
                    onClick={() => onSelectCluster && onSelectCluster(incident.clusterId)}
                    className="text-cyan-400 font-semibold truncate block hover:underline cursor-pointer mt-0.5"
                  >
                    {incident.clusterName}
                  </span>
                </div>

                <div className="p-3 bg-[#05060A]/80 rounded-xl border border-white/5">
                  <span className="text-slate-500 text-[10px] block uppercase">Cluster ID</span>
                  <span className="text-slate-300 truncate block text-[11px] mt-0.5">{incident.clusterId}</span>
                </div>

                <div className="p-3 bg-[#05060A]/80 rounded-xl border border-white/5">
                  <span className="text-slate-500 text-[10px] block uppercase">Namespace</span>
                  <span className="text-slate-200 font-semibold truncate block mt-0.5">{incident.namespace}</span>
                </div>

                <div className="p-3 bg-[#05060A]/80 rounded-xl border border-white/5">
                  <span className="text-slate-500 text-[10px] block uppercase">Resource Target</span>
                  <span className="text-slate-200 font-semibold truncate block mt-0.5">
                    {incident.resourceKind}/{incident.resourceName}
                  </span>
                </div>

                <div className="p-3 bg-[#05060A]/80 rounded-xl border border-white/5">
                  <span className="text-slate-500 text-[10px] block uppercase">Pod Name</span>
                  <span className="text-slate-200 truncate block mt-0.5">{tech.podName || incident.resourceName}</span>
                </div>

                <div className="p-3 bg-[#05060A]/80 rounded-xl border border-white/5">
                  <span className="text-slate-500 text-[10px] block uppercase">Target Container</span>
                  <span className="text-slate-200 truncate block mt-0.5">{tech.containerName || 'Not available'}</span>
                </div>

                <div className="p-3 bg-[#05060A]/80 rounded-xl border border-white/5">
                  <span className="text-slate-500 text-[10px] block uppercase">Observed Node</span>
                  <span className="text-slate-200 truncate block mt-0.5">{tech.nodeName || 'Not available'}</span>
                </div>

                <div className="p-3 bg-[#05060A]/80 rounded-xl border border-white/5 sm:col-span-2">
                  <span className="text-slate-500 text-[10px] block uppercase">Container Image</span>
                  <span className="text-slate-300 truncate block font-mono text-[11px] mt-0.5">
                    {tech.image || 'Not available'}
                  </span>
                </div>
              </div>

              {/* Deterministic Fingerprint Strip */}
              <div className="p-3.5 bg-[#05060A]/90 rounded-xl border border-white/5 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-500 text-[10px] uppercase">Deterministic Incident Fingerprint:</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-300 bg-[#0B1020] px-2.5 py-1 rounded border border-white/10 text-[11px]">
                    {incident.fingerprint}
                  </span>
                  <CopyButton text={incident.fingerprint} />
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECTION: AI INVESTIGATION & INTELLIGENCE LAYER */}
          {/* Atmospheric blue/violet glow */}
          {/* ========================================================================= */}
          <div className="space-y-4 relative">
            <div className="relative rounded-2xl p-1 bg-gradient-to-r from-cyan-500/20 via-indigo-500/20 to-purple-500/20 shadow-[0_0_35px_rgba(99,102,241,0.08)]">
              <div className="bg-[#080B12] rounded-[14px] p-1 space-y-4">
                {/* Authoritative Kubernetes Grounding */}
                <SkyOpsIntelligenceCard
                  intelligence={intelligence}
                  onRefresh={fetchIncidentData}
                />

                {/* AI Reasoning, Confidence & Evidence Synthesis */}
                <SkyOpsAIAnalysisCard
                  incidentId={incident.id}
                  initialAnalysis={aiAnalysis}
                  initialRemediation={remediation}
                  canEdit={canEditIncidents}
                  onRemediationApplied={fetchIncidentData}
                  onAnalysisUpdated={(analysis, rem) => {
                    setAiAnalysis(analysis);
                    if (rem) setRemediation(rem);
                    if (analysis.intelligence) setIntelligence(analysis.intelligence);
                  }}
                />
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECTION: ROOT CAUSE */}
          {/* ========================================================================= */}
          <div className="p-6 rounded-2xl bg-[#080B12]/80 border border-white/10 backdrop-blur-md space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Shield className="w-4 h-4" />
                </div>
                <h2 className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                  Root Cause Analysis
                </h2>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                Category: <strong className="text-slate-200">{tech.rootCauseCategory || 'CONTAINER_RUNTIME'}</strong>
              </span>
            </div>

            {/* Explicit Distinction: CONFIRMED vs INFERENCE vs UNKNOWN */}
            <div className="space-y-3 text-xs">
              {/* CONFIRMED */}
              {confirmedFact && (
                <div className="p-4 rounded-xl bg-[#05060A]/90 border border-emerald-500/30 space-y-1.5 shadow-[0_0_15px_rgba(16,185,129,0.06)]">
                  <div className="flex items-center gap-2">
                    <ProvenanceBadge type="CONFIRMED" label="CONFIRMED" />
                    <span className="text-[11px] font-mono text-slate-400">Authoritative Observation</span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed font-sans mt-1">
                    {confirmedFact}
                  </p>
                </div>
              )}

              {/* INFERENCE */}
              {inferenceHypothesis && (
                <div className="p-4 rounded-xl bg-[#05060A]/90 border border-cyan-500/25 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <ProvenanceBadge type="INFERENCE" label="INFERENCE" />
                    <span className="text-[11px] font-mono text-slate-400">Plausible Failure Explanation</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-sans mt-1">
                    {inferenceHypothesis}
                  </p>
                </div>
              )}

              {/* UNKNOWN / NEEDS INVESTIGATION */}
              {unknownInvestigationNote && (
                <div className="p-4 rounded-xl bg-[#05060A]/90 border border-amber-500/25 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <ProvenanceBadge type="UNKNOWN" label="UNKNOWN / NEEDS INVESTIGATION" />
                  </div>
                  <p className="text-xs text-amber-200/90 leading-relaxed font-sans mt-1">
                    {unknownInvestigationNote}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECTION: RECOMMENDED ACTION & REMEDIATION */}
          {/* ========================================================================= */}
          <div className="space-y-4">
            <IncidentRemediationCard
              incident={incident}
              remediation={remediation}
              aiAnalysis={aiAnalysis}
              canEdit={canEditIncidents}
              onRemediationUpdated={(rem) => setRemediation(rem)}
              onRefresh={fetchIncidentData}
            />
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION: AUDIT TRAIL & SIDEBAR CONTROLS (4 cols) */}
        {/* ========================================================================= */}
        <div className="lg:col-span-4 space-y-6">
          {/* Assigned SRE Engineer */}
          <div className="p-6 rounded-2xl bg-[#080B12]/80 border border-white/10 backdrop-blur-md space-y-3.5 font-mono text-xs shadow-sm">
            <span className="text-slate-400 font-bold block uppercase text-[10px] tracking-wider">
              Assigned SRE Engineer
            </span>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#0B1020] border border-white/10 flex items-center justify-center text-cyan-300">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-white font-medium text-sm font-sans">{incident.assignee?.name || 'Unassigned'}</div>
                  <div className="text-[11px] text-slate-500">{incident.assignee?.email || 'No owner assigned'}</div>
                </div>
              </div>

              {canEditIncidents && (
                <select
                  value={incident.assignee?.userId || ''}
                  onChange={(e) => handleAssigneeChange(e.target.value)}
                  className="px-2.5 py-1.5 bg-[#05060A] border border-white/15 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500 text-xs font-semibold cursor-pointer"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId} className="bg-[#080B12]">
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Chronological Incident Audit Timeline */}
          <div className="p-6 rounded-2xl bg-[#080B12]/80 border border-white/10 backdrop-blur-md space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                Audit Trail ({timeline.length})
              </h3>
              <span className="text-[10px] font-mono text-slate-500">CHRONOLOGICAL</span>
            </div>

            <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-white/10">
              {timeline.map((evt) => {
                let dotColor = 'bg-slate-600 border-[#080B12]';
                if (evt.type === 'DETECTION') dotColor = 'bg-rose-500 border-[#080B12] shadow-[0_0_8px_rgba(244,63,94,0.4)]';
                else if (evt.type === 'RECOVERY') dotColor = 'bg-emerald-500 border-[#080B12] shadow-[0_0_8px_rgba(16,185,129,0.4)]';
                else if (evt.type === 'OCCURRENCE') dotColor = 'bg-amber-500 border-[#080B12]';
                else if (evt.type === 'STATE_CHANGE') dotColor = 'bg-cyan-500 border-[#080B12] shadow-[0_0_8px_rgba(6,182,212,0.4)]';
                else if (evt.type === 'NOTE_ADDED') dotColor = 'bg-purple-500 border-[#080B12]';
                else if (evt.type === 'REMEDIATION_APPROVED') dotColor = 'bg-emerald-400 border-[#080B12]';
                else if (evt.type === 'REMEDIATION_EXECUTED') dotColor = 'bg-blue-400 border-[#080B12]';

                return (
                  <div key={evt.id} className="relative font-mono text-xs">
                    <span className={`absolute -left-6 top-1 w-2.5 h-2.5 rounded-full border-2 ${dotColor}`} />
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-bold text-slate-200">{evt.type}</span>
                      <span className="text-slate-500">{formatTimeAgo(evt.timestamp)}</span>
                    </div>
                    <div className="text-slate-300 text-xs mt-1 leading-snug font-sans">{evt.description}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">by {evt.actor.name}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Investigation Notes */}
          <div className="p-6 rounded-2xl bg-[#080B12]/80 border border-white/10 backdrop-blur-md space-y-4 shadow-sm">
            <h3 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wider flex items-center gap-2 border-b border-white/5 pb-3">
              <MessageSquare className="w-4 h-4 text-cyan-400" />
              Investigation Notes ({notes.length})
            </h3>

            {notes.length === 0 ? (
              <div className="p-5 text-center text-xs font-mono text-slate-500 border border-dashed border-white/10 rounded-xl">
                No investigation notes recorded yet. Add operational observations or logs below.
              </div>
            ) : (
              <div className="space-y-3">
                {notes.map((note) => (
                  <div key={note.id} className="p-3.5 bg-[#05060A]/80 border border-white/5 rounded-xl space-y-1.5 font-mono text-xs">
                    <div className="flex items-center justify-between text-slate-400 text-[11px]">
                      <span className="font-semibold text-slate-200">{note.authorName}</span>
                      <span className="text-slate-500">{formatTimeAgo(note.createdAt)}</span>
                    </div>
                    <p className="text-slate-300 font-sans text-xs leading-relaxed whitespace-pre-wrap">{note.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Note Authoring Form */}
            {canEditIncidents && (
              <form onSubmit={handleAddNote} className="space-y-2.5 pt-2 border-t border-white/5">
                <label className="block text-xs font-mono text-slate-400">Add Investigation Finding:</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Record diagnostic observations, pod logs, remediation notes..."
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  className="w-full p-3 bg-[#05060A] border border-white/10 rounded-xl text-slate-200 text-xs font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                />
                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    type="submit"
                    disabled={isSubmittingNote || !newNoteContent.trim()}
                    icon={<Send className="w-3.5 h-3.5" />}
                  >
                    Add Note
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
