import {
  Activity,
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  Cpu,
  Download,
  FileText,
  HelpCircle,
  Info,
  Layers,
  MessageSquare,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  Send,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
  User,
  UserCheck,
  Zap,
  X,
  Loader2,
  History,
  Network,
  GitBranch,
  Sparkles,
  Repeat
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
  TimelineEvent,
  WhatChangedReport
} from '../../types/index';
import { formatIncidentDetectedDateTime, formatTimeAgo } from '../../utils/date';
import { generateIncidentPdf, getPriorityLabel } from '../../utils/incidentPdfGenerator';
import { ProvenanceBadge, SeverityBadge, StatusBadge } from '../common/Badges';
import { Button, CopyButton, EmptyState, LoadingState, Modal } from '../common/UI';
import { ArchitecturalFaultTopology } from './ArchitecturalFaultTopology';
import { IncidentEvidenceSection } from './IncidentEvidenceSection';
import { IncidentRemediationCard } from './IncidentRemediationCard';
import { SkyOpsAIAnalysisCard } from './SkyOpsAIAnalysisCard';
import { SkyOpsIntelligenceCard } from './SkyOpsIntelligenceCard';
import { WhatChangedDrawer } from './WhatChangedDrawer';
import { BlastRadiusSection } from './BlastRadiusSection';
import { SimilarIncidentsSection } from './SimilarIncidentsSection';
import { IncidentPostmortemModal } from './IncidentPostmortemModal';
import { PreDeploymentGateModal } from './PreDeploymentGateModal';
import { parseKubernetesError } from './telemetryParser';

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

  // Auto-Healing & Safe Modal States
  const [isAutoHealing, setIsAutoHealing] = useState(false);
  const [isAutoHealingCluster, setIsAutoHealingCluster] = useState(false);
  const [autoHealMessage, setAutoHealMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');

  // PROMPT 2: Drawers & Modals State
  const [isWhatChangedOpen, setIsWhatChangedOpen] = useState<boolean>(false);
  const [whatChangedReport, setWhatChangedReport] = useState<WhatChangedReport | null>(null);
  const [isPostmortemOpen, setIsPostmortemOpen] = useState<boolean>(false);
  const [isPreDeploymentGateOpen, setIsPreDeploymentGateOpen] = useState<boolean>(false);

  // Progressive Disclosure: Collapsible sections under ADVANCED DIAGNOSTICS (collapsed by default)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    evidence: false,
    events: false,
    containers: false,
    registry: false,
    intelligence: false,
    ai_analysis: false,
    infrastructure: false,
    audit_trail: false,
    rollback: false
  });

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const areAllExpanded = Object.values(expandedSections).every(Boolean);

  const toggleAllSections = () => {
    const nextState = !areAllExpanded;
    setExpandedSections({
      evidence: nextState,
      events: nextState,
      containers: nextState,
      registry: nextState,
      intelligence: nextState,
      ai_analysis: nextState,
      infrastructure: nextState,
      audit_trail: nextState,
      rollback: nextState
    });
  };

  const fetchIncidentData = async () => {
    try {
      setLoading(true);
      const data = await api.getIncident(incidentId);
      setIncident(data.incident);
      setTimeline(data.timeline || []);
      setNotes(data.notes || []);
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

      // Fetch What Changed correlation report
      try {
        const wcRes = await api.getWhatChanged(incidentId);
        if (wcRes?.report) {
          setWhatChangedReport(wcRes.report);
        }
      } catch (wcErr) {
        // Optional correlation fetch, ignore error
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

  const handleDelete = () => {
    if (!incident || !canEditIncidents) return;
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!incident || !canEditIncidents) return;
    try {
      setIsDeleting(true);
      await api.deleteIncident(incident.id);
      setIsDeleteModalOpen(false);
      onBack();
    } catch (err) {
      console.error('Failed to delete incident:', err);
      setIsDeleting(false);
    }
  };

  const handleStatusChange = async (newStatus: IncidentStatus) => {
    if (!incident || !canEditIncidents) return;
    if (newStatus === 'RESOLVED') {
      setIsResolveModalOpen(true);
      return;
    }
    try {
      setStatusUpdateLoading(true);
      setStatusError(null);
      const updated = await api.updateIncident(incident.id, {
        status: newStatus
      });
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

  const confirmResolve = async () => {
    if (!incident || !canEditIncidents) return;
    try {
      setStatusUpdateLoading(true);
      setStatusError(null);
      const updated = await api.updateIncident(incident.id, {
        status: 'RESOLVED',
        resolutionReason: resolutionNote.trim() || undefined
      });
      setIncident(updated);
      setIsResolveModalOpen(false);
      setResolutionNote('');
      const updatedData = await api.getIncident(incident.id);
      setTimeline(updatedData.timeline);
    } catch (err: any) {
      console.error('Failed to resolve incident:', err);
      setStatusError(err?.message || 'Failed to resolve incident');
    } finally {
      setStatusUpdateLoading(false);
    }
  };

  const handleAutoHealThisIncident = async () => {
    if (!incident) return;
    try {
      setIsAutoHealing(true);
      setAutoHealMessage(null);
      const res = await api.autoHealIncident(incident.id);
      setIncident(res.incident);
      if (res.remediation) {
        setRemediation(res.remediation);
      }
      setAutoHealMessage({
        type: 'success',
        text: `Incident ${incident.id} auto-healed and verified successfully! Telemetry restored to Healthy.`
      });
      await fetchIncidentData();
    } catch (err: any) {
      console.error('Failed to auto-heal incident:', err);
      setAutoHealMessage({
        type: 'error',
        text: err?.message || 'Failed to auto-heal incident'
      });
    } finally {
      setIsAutoHealing(false);
    }
  };

  const handleAutoHealCluster = async () => {
    if (!incident?.clusterId) return;
    try {
      setIsAutoHealingCluster(true);
      setAutoHealMessage(null);
      const res = await api.autoHealCluster(incident.clusterId);
      setAutoHealMessage({
        type: 'success',
        text: res.message || `Cluster auto-healed: ${res.healed} of ${res.total} incidents resolved.`
      });
      await fetchIncidentData();
    } catch (err: any) {
      console.error('Failed to auto-heal cluster incidents:', err);
      setAutoHealMessage({
        type: 'error',
        text: err?.message || 'Failed to auto-heal cluster incidents'
      });
    } finally {
      setIsAutoHealingCluster(false);
    }
  };

  const handleAssigneeChange = async (userId: string) => {
    if (!incident || !canEditIncidents) return;
    const member = members.find((m) => m.userId === userId);
    try {
      const assignee = member
        ? { userId: member.userId, name: member.name, email: member.email }
        : undefined;
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

  // Authoritative detection timestamp (firstSeenAt must be primary, NOT createdAt)
  const detectedTimestamp: number =
    incident.firstSeenAt ||
    (typeof tech.firstObserved === 'number' ? tech.firstObserved : undefined) ||
    incident.createdAt ||
    Date.now();
  const absoluteDetected = formatIncidentDetectedDateTime(detectedTimestamp);
  const relativeDetected = formatTimeAgo(detectedTimestamp);
  const occurrenceCount = incident.occurrenceCount || 1;
  const lastSeenRelative =
    incident.lastSeenAt && incident.lastSeenAt !== incident.firstSeenAt
      ? formatTimeAgo(incident.lastSeenAt)
      : null;

  // Short "What Happened" Summary Calculations
  const getWhatHappened = (): string => {
    if (incident.incidentType === 'ImagePullBackOff') {
      return `${incident.resourceName} cannot start because Kubernetes cannot pull the configured container image.`;
    }
    if (incident.incidentType === 'CrashLoopBackOff') {
      return `${incident.resourceName} is failing to start and crashing repeatedly in container runtime (exit code ${tech.exitCode ?? 'non-zero'}).`;
    }
    if (incident.incidentType === 'DeploymentDegraded') {
      return `${incident.resourceName} is degraded and has not met its target replica availability (${tech.availableReplicas ?? 0}/${tech.desiredReplicas ?? 1} available).`;
    }
    if (incident.summary) return incident.summary;
    if (aiAnalysis?.summary) return aiAnalysis.summary;
    if (tech.message) return tech.message;
    return `Kubernetes observed failure state '${incident.incidentType}' on ${incident.resourceKind} ${incident.resourceName}.`;
  };

  const getRootCause = (): string => {
    if (tech.rootCause) return tech.rootCause;
    if (aiAnalysis?.rootCause) return aiAnalysis.rootCause;
    if (incident.incidentType === 'ImagePullBackOff') {
      return `Image \`${tech.image || 'configured image'}\` was not found in the container registry.`;
    }
    if (tech.evidence && tech.evidence.length > 0) return tech.evidence[0].message;
    if (tech.reason) return `Kubelet failure state: ${tech.reason}.`;
    return 'Failure condition verified by cluster telemetry.';
  };

  const getImpact = (): string => {
    if (tech.impact) return tech.impact;
    if (incident.severity === 'CRITICAL') {
      return `The ${incident.resourceName} workload is unavailable.`;
    }
    if (incident.severity === 'HIGH') {
      return `The ${incident.resourceName} workload is degraded and failing readiness checks.`;
    }
    return 'Localized component degradation without total cluster outage.';
  };

  // Registry breakdown details for OCI diagnostics
  const parsedError = parseKubernetesError(
    tech.message || `${incident.incidentType}: ${tech.reason || ''}`,
    tech.containerName
  );
  const targetImage = tech.image || parsedError.image || 'Unknown container image';
  const targetRegistry = parsedError.registry || (targetImage.includes('/') ? targetImage.split('/')[0] : 'docker.io');

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto font-sans text-zinc-100">
      {/* Top Action Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-mono text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer w-fit"
          title="Back to Incidents List"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Incidents</span>
        </button>

        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          {/* PROMPT 2: Primary WHAT CHANGED? Button */}
          <button
            onClick={() => setIsWhatChangedOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all shadow-sm cursor-pointer"
            title="Open Change Correlation Engine"
          >
            <History className="w-3.5 h-3.5 text-amber-400" />
            <span>WHAT CHANGED?</span>
          </button>

          {/* PROMPT 2: Postmortem & Prevention Button */}
          <button
            onClick={() => setIsPostmortemOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-semibold transition-all cursor-pointer"
            title="Automated Postmortem & Prevention Checklist"
          >
            <FileText className="w-3.5 h-3.5 text-purple-400" />
            <span>Postmortem</span>
          </button>

          {canEditIncidents && incident.status !== 'RESOLVED' && incident.status !== 'CLOSED' && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleAutoHealThisIncident}
              disabled={isAutoHealing || statusUpdateLoading}
              icon={<Zap className={`w-3.5 h-3.5 text-amber-300 ${isAutoHealing ? 'animate-bounce' : ''}`} />}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold shadow-md hover:shadow-emerald-500/20"
              title="Automatically heal this incident immediately and restore workload to healthy"
            >
              {isAutoHealing ? 'Auto-Healing...' : '⚡ Auto-Heal Incident'}
            </Button>
          )}

          {canEditIncidents && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoHealCluster}
              disabled={isAutoHealingCluster}
              icon={<Zap className={`w-3.5 h-3.5 text-amber-400 ${isAutoHealingCluster ? 'animate-bounce' : ''}`} />}
              className="border-emerald-800/80 text-emerald-300 hover:bg-emerald-950/40 font-mono text-xs"
              title={`Auto-heal all active incidents in cluster "${incident.clusterName}"`}
            >
              {isAutoHealingCluster ? 'Healing Cluster...' : '⚡ Auto-Heal Cluster'}
            </Button>
          )}

          <Button
            variant="primary"
            size="sm"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            icon={
              isGeneratingPdf ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )
            }
            className="bg-zinc-100 text-zinc-900 hover:bg-white font-medium"
          >
            {pdfSuccess ? 'Downloaded!' : isGeneratingPdf ? 'Generating...' : 'Download PDF'}
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
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1">
              <span className="text-zinc-500 text-[11px] uppercase">Status:</span>
              <select
                value={incident.status}
                disabled={statusUpdateLoading}
                onChange={(e) => handleStatusChange(e.target.value as IncidentStatus)}
                className="bg-transparent text-zinc-200 focus:outline-none font-semibold cursor-pointer text-xs"
              >
                <option value="OPEN" className="bg-zinc-950 text-zinc-200">OPEN</option>
                <option value="ACKNOWLEDGED" className="bg-zinc-950 text-zinc-200">ACKNOWLEDGED</option>
                <option value="IN_PROGRESS" className="bg-zinc-950 text-zinc-200">IN_PROGRESS</option>
                <option value="RESOLVED" className="bg-zinc-950 text-zinc-200">RESOLVED</option>
                <option value="CLOSED" className="bg-zinc-950 text-zinc-200">CLOSED</option>
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
              className="hover:border-rose-900 text-rose-300"
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Auto-Heal Notice Banner */}
      {autoHealMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-mono ${
            autoHealMessage.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
              : 'bg-rose-950/60 border-rose-800 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {autoHealMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{autoHealMessage.text}</span>
          </div>
          <button
            onClick={() => setAutoHealMessage(null)}
            className="text-zinc-400 hover:text-zinc-200 ml-3 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Status Action Error Banner */}
      {statusError && (
        <div className="p-3.5 rounded-lg bg-rose-950/60 border border-rose-800 text-xs text-rose-200 flex items-center justify-between gap-3 font-mono">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{statusError}</span>
          </div>
          <button
            onClick={() => setStatusError(null)}
            className="text-rose-400 hover:text-rose-200 text-xs font-bold px-2 py-0.5 rounded cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. INCIDENT HEADER REDESIGN */}
      {/* ========================================================================= */}
      <div className="p-6 rounded-xl bg-zinc-950 border border-zinc-800 space-y-4">
        {/* Meta Bar: INCIDENT SKY-1002 · HIGH · OPEN */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="text-zinc-500 uppercase tracking-widest font-bold">INCIDENT</span>
            <span className="text-lg font-bold text-white tracking-tight">{incident.id}</span>
            <span className="text-zinc-700">·</span>
            <SeverityBadge severity={incident.severity} size="sm" />
            <span className="text-zinc-700">·</span>
            <StatusBadge status={incident.status} size="sm" />

            {/* Resolution Provenance Badge (if resolved) */}
            {incident.resolvedAt && (
              <>
                <span className="text-zinc-700">·</span>
                {incident.resolutionSource === 'AUTOMATIC_VERIFIED' ||
                incident.resolution?.source === 'AUTOMATIC_VERIFIED' ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    VERIFIED BY TELEMETRY
                  </span>
                ) : (
                  <span className="text-zinc-400 font-semibold flex items-center gap-1 text-[11px]">
                    <UserCheck className="w-3.5 h-3.5 text-zinc-300" />
                    MANUALLY CLOSED
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Title */}
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
          {incident.title}
        </h1>

        {/* Resource · Namespace · Cluster */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-zinc-400">
          <strong className="text-zinc-200 font-semibold">
            {incident.resourceKind}/{incident.resourceName}
          </strong>
          <span className="text-zinc-600">·</span>
          <span>{incident.namespace}</span>
          <span className="text-zinc-600">·</span>
          <span
            onClick={() => onSelectCluster && onSelectCluster(incident.clusterId)}
            className="hover:text-zinc-200 cursor-pointer"
            title="Cluster"
          >
            {incident.clusterName}
          </span>
        </div>

        {/* Detected / Occurred Section */}
        <div className="pt-3 border-t border-zinc-900 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
          <div>
            <span className="text-zinc-500 uppercase tracking-wider block text-[10px] mb-0.5">
              Detected
            </span>
            <span className="text-zinc-200 font-semibold block">{absoluteDetected}</span>
          </div>

          <div className="sm:text-right">
            <span className="text-zinc-500 uppercase tracking-wider block text-[10px] mb-0.5">
              Occurrence & History
            </span>
            <div className="flex sm:justify-end items-center gap-2 text-zinc-300">
              <span className="font-semibold">{relativeDetected}</span>
              <span className="text-zinc-700">·</span>
              <span className="text-amber-400 font-semibold">
                {occurrenceCount} occurrence{occurrenceCount > 1 ? 's' : ''}
              </span>
              {lastSeenRelative && (
                <>
                  <span className="text-zinc-700">·</span>
                  <span className="text-zinc-400">Last seen {lastSeenRelative}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. SHORT "WHAT HAPPENED" SECTION */}
      {/* ========================================================================= */}
      <div className="p-5 sm:p-6 rounded-xl bg-zinc-950 border border-zinc-800 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* WHAT HAPPENED */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider block">
              WHAT HAPPENED
            </span>
            <p className="text-xs text-zinc-200 leading-relaxed font-sans">
              {getWhatHappened()}
            </p>
          </div>

          {/* ROOT CAUSE */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider block">
              ROOT CAUSE
            </span>
            <p className="text-xs text-zinc-200 leading-relaxed font-sans">
              {getRootCause()}
            </p>
          </div>

          {/* IMPACT */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider block">
              IMPACT
            </span>
            <p className="text-xs text-zinc-200 leading-relaxed font-sans">
              {getImpact()}
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2B. WHAT CHANGED? ENVIRONMENT CHANGE CORRELATION HIGHLIGHT */}
      {/* ========================================================================= */}
      <div className="p-5 sm:p-6 rounded-xl bg-zinc-950 border border-amber-500/30 shadow-lg shadow-amber-950/10 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              WHAT CHANGED?
            </span>
            <span className="text-xs text-zinc-400 font-medium">
              {whatChangedReport?.changes?.length
                ? `${whatChangedReport.changes.length} relevant change${whatChangedReport.changes.length > 1 ? 's' : ''} detected in correlation window`
                : 'Correlated against cluster event streams and deployment history'}
            </span>
          </div>

          <button
            onClick={() => setIsWhatChangedOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-all cursor-pointer"
          >
            <span>Inspect Full Diff</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Change Diffs Grid or truthful empty state */}
        {whatChangedReport?.changes && whatChangedReport.changes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {whatChangedReport.changes.slice(0, 3).map((change, idx) => (
              <div key={change.id || idx} className="p-3.5 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-zinc-400 font-bold uppercase tracking-wider truncate max-w-[140px]" title={`${change.resourceKind}/${change.resourceName}`}>
                    {change.field || change.changeType}
                  </span>
                  <span className={`text-[10px] font-semibold ${
                    change.correlation === 'Strong correlation'
                      ? 'text-amber-400'
                      : change.correlation === 'Relevant change'
                      ? 'text-blue-400'
                      : 'text-purple-400'
                  }`}>
                    {change.correlation}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs overflow-hidden">
                  <span className="px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-300 truncate max-w-[100px]" title={String(change.oldValue ?? 'none')}>
                    {String(change.oldValue ?? '(none)')}
                  </span>
                  <span className="text-zinc-500">↓</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-bold truncate max-w-[120px]" title={String(change.newValue ?? 'none')}>
                    {String(change.newValue ?? '(none)')}
                  </span>
                </div>
                <div className="text-[10px] text-zinc-500 font-mono">
                  {change.temporalDistance || 'Pre-incident'} · {change.resourceKind}/{change.resourceName}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-zinc-900/40 border border-zinc-800/80 text-xs text-zinc-400 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-zinc-500 shrink-0" />
              <span>No configuration mutations or deployment diffs observed in the immediate correlation window prior to incident onset.</span>
            </div>
            <span className="text-[11px] text-zinc-500 font-mono shrink-0">Baseline telemetry verified</span>
          </div>
        )}

        <div className="text-[11px] text-zinc-400 flex items-center justify-between pt-1">
          <span className="text-zinc-500 italic">
            {whatChangedReport?.summaryText || 'Calibrated against historical rollout windows & kubernetes admission logs.'}
          </span>
          {whatChangedReport?.hasStrongCorrelation && (
            <span className="font-semibold text-amber-400">
              Strong correlation with incident
            </span>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. SHOW THE DECISION FIRST: RECOMMENDED FIX & AUTO-HEALING */}
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

      {/* ========================================================================= */}
      {/* 3B. BLAST RADIUS & SERVICE IMPACT (PROMPT 2) */}
      {/* ========================================================================= */}
      <BlastRadiusSection incident={incident} />

      {/* ========================================================================= */}
      {/* 3C. SIMILAR INCIDENTS & HISTORICAL PRECEDENTS (PROMPT 2) */}
      {/* ========================================================================= */}
      <SimilarIncidentsSection
        incident={incident}
        onSelectIncident={(id) => {
          // If onBack or navigation is needed, or just refresh
          fetchIncidentData();
        }}
      />

      {/* ========================================================================= */}
      {/* 4. SRE ASSIGNEE & QUICK NOTES STRIP */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Assignee Card */}
        <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400">
              <User className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block">Assigned Engineer</span>
              <span className="text-zinc-200 font-medium">
                {incident.assignee?.name || 'Unassigned'}
              </span>
            </div>
          </div>

          {canEditIncidents && (
            <select
              value={incident.assignee?.userId || ''}
              onChange={(e) => handleAssigneeChange(e.target.value)}
              className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none text-xs font-semibold cursor-pointer"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId} className="bg-zinc-950">
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Quick Note Trigger / Summary */}
        <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block">Investigation Notes</span>
              <span className="text-zinc-200 font-medium">
                {notes.length} note{notes.length !== 1 ? 's' : ''} recorded
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setExpandedSections((prev) => ({ ...prev, audit_trail: true }))}
            className="text-xs font-mono text-zinc-400 hover:text-zinc-100 flex items-center gap-1 cursor-pointer"
          >
            <span>View Notes</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. ADVANCED DIAGNOSTICS (Progressive Disclosure - Collapsed by default) */}
      {/* ========================================================================= */}
      <div className="space-y-3 pt-4">
        {/* Section Header with Expand / Collapse All */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div>
            <h2 className="text-xs font-bold text-zinc-300 font-mono uppercase tracking-wider">
              ADVANCED DIAGNOSTICS
            </h2>
            <p className="text-[11px] text-zinc-500 font-sans mt-0.5">
              Deep telemetry signals, cluster events, AI reasoning, and audit logs
            </p>
          </div>

          <button
            type="button"
            onClick={toggleAllSections}
            className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-300 hover:text-white cursor-pointer transition-colors"
          >
            {areAllExpanded ? 'Collapse All' : 'Expand All'}
          </button>
        </div>

        {/* 1. Evidence & Observability Signals */}
        <div className="rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('evidence')}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-zinc-900/40 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2.5">
              {expandedSections.evidence ? (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              )}
              <span className="text-xs font-mono font-bold text-zinc-200">
                Evidence & Observability Signals
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">
              Structured Signal Stream & Architectural Topology
            </span>
          </button>

          {expandedSections.evidence && (
            <div className="p-4 sm:p-5 border-t border-zinc-800 space-y-4">
              <IncidentEvidenceSection
                technicalDetails={tech}
                aiAnalysis={aiAnalysis}
                incidentType={incident.incidentType}
                incident={incident}
              />
            </div>
          )}
        </div>

        {/* 2. Kubernetes Events */}
        <div className="rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('events')}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-zinc-900/40 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2.5">
              {expandedSections.events ? (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              )}
              <span className="text-xs font-mono font-bold text-zinc-200">
                Kubernetes Events
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">
              {tech.events?.length || 0} events recorded
            </span>
          </button>

          {expandedSections.events && (
            <div className="p-4 sm:p-5 border-t border-zinc-800 space-y-3">
              {tech.events && tech.events.length > 0 ? (
                <div className="divide-y divide-zinc-800/60 max-h-80 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/30">
                  {tech.events.map((ev, idx) => (
                    <div key={idx} className="p-3 text-xs font-mono space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              ev.type === 'Warning'
                                ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                                : 'bg-zinc-900 text-zinc-300 border border-zinc-800'
                            }`}
                          >
                            {ev.type}
                          </span>
                          <span className="font-bold text-zinc-200">{ev.reason}</span>
                          {ev.count && ev.count > 1 && (
                            <span className="text-zinc-500 text-[10px]">({ev.count}x)</span>
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-500">
                          {ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : 'Live'}
                        </span>
                      </div>
                      <p className="text-zinc-300 text-xs font-sans leading-relaxed whitespace-pre-wrap break-words">
                        {ev.message}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-zinc-900/40 border border-zinc-800 text-center text-xs text-zinc-500 font-mono">
                  No warning events recorded by Kubernetes for this workload.
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. Container Logs & Runtime State */}
        <div className="rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('containers')}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-zinc-900/40 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2.5">
              {expandedSections.containers ? (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              )}
              <span className="text-xs font-mono font-bold text-zinc-200">
                Container Logs & Runtime State
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">
              {tech.containers?.length || 1} container(s)
            </span>
          </button>

          {expandedSections.containers && (
            <div className="p-4 sm:p-5 border-t border-zinc-800 space-y-4">
              {tech.containers && tech.containers.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/20">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 uppercase text-[10px]">
                      <tr>
                        <th className="px-3 py-2">Container</th>
                        <th className="px-3 py-2">Image</th>
                        <th className="px-3 py-2">Ready</th>
                        <th className="px-3 py-2">State / Reason</th>
                        <th className="px-3 py-2">Restarts</th>
                        <th className="px-3 py-2">Exit Code</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800 text-zinc-300">
                      {tech.containers.map((c, idx) => (
                        <tr key={idx} className="hover:bg-zinc-900/30">
                          <td className="px-3 py-2.5 font-bold text-zinc-200">{c.name}</td>
                          <td className="px-3 py-2.5 text-zinc-400 max-w-[200px] truncate" title={c.image}>
                            {c.image}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                c.ready
                                  ? 'bg-emerald-950 text-emerald-300'
                                  : 'bg-rose-950 text-rose-300'
                              }`}
                            >
                              {c.ready ? 'READY' : 'NOT READY'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-zinc-200">
                            {c.waitingReason || c.terminationReason || c.state}
                            {c.waitingMessage && (
                              <div
                                className="text-[10px] text-rose-400 max-w-[240px] truncate mt-0.5"
                                title={c.waitingMessage}
                              >
                                {c.waitingMessage}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-zinc-300">{c.restartCount ?? 0}</td>
                          <td className="px-3 py-2.5 text-zinc-300">
                            {c.exitCode !== undefined ? c.exitCode : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-3 bg-zinc-900/40 rounded-lg text-xs font-mono text-zinc-400">
                  Primary target: {tech.containerName || 'default container'} · Image: {targetImage}
                </div>
              )}

              {/* Diagnostic raw trace / message */}
              {tech.message && (
                <div className="rounded-lg bg-zinc-900/70 border border-zinc-800 p-3.5 space-y-1.5 font-mono text-xs">
                  <div className="flex items-center justify-between text-zinc-400 text-[10px] uppercase">
                    <span>Diagnostic CRI Trace:</span>
                    <CopyButton text={tech.message} />
                  </div>
                  <pre className="text-zinc-200 whitespace-pre-wrap break-words leading-relaxed font-mono text-[11px]">
                    {tech.message}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 4. Registry Diagnostics */}
        <div className="rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('registry')}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-zinc-900/40 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2.5">
              {expandedSections.registry ? (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              )}
              <span className="text-xs font-mono font-bold text-zinc-200">
                Registry Diagnostics
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">
              OCI Image & Tag Resolution
            </span>
          </button>

          {expandedSections.registry && (
            <div className="p-4 sm:p-5 border-t border-zinc-800 space-y-3 font-mono text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase block">Target Image</span>
                  <span className="text-zinc-200 font-semibold truncate block mt-0.5">
                    {targetImage}
                  </span>
                </div>

                <div className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase block">Registry Domain</span>
                  <span className="text-zinc-200 font-semibold truncate block mt-0.5">
                    {targetRegistry}
                  </span>
                </div>

                <div className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase block">Resolution Status</span>
                  <span className="text-rose-400 font-semibold truncate block mt-0.5">
                    {parsedError.errorCode || tech.reason || 'Image Pull Error'}
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-zinc-900/40 border border-zinc-800 space-y-1">
                <span className="text-[10px] font-bold text-zinc-400 uppercase block">
                  OCI Diagnostic Finding:
                </span>
                <p className="text-zinc-300 font-sans leading-relaxed text-xs">
                  {parsedError.sreInsight}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 5. SkyOps Diagnosis & Authoritative Intelligence Engine */}
        <div className="rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('intelligence')}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-zinc-900/40 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2.5">
              {expandedSections.intelligence ? (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              )}
              <span className="text-xs font-mono font-bold text-zinc-200">
                SkyOps Diagnosis & Intelligence Engine
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">
              Hypothesis Matrix & Topological Correlation
            </span>
          </button>

          {expandedSections.intelligence && (
            <div className="p-4 sm:p-5 border-t border-zinc-800 space-y-4">
              <SkyOpsIntelligenceCard
                intelligence={intelligence}
                onRefresh={fetchIncidentData}
              />
            </div>
          )}
        </div>

        {/* 6. SkyOps AI Analysis & Deep Reasoning */}
        <div className="rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('ai_analysis')}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-zinc-900/40 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2.5">
              {expandedSections.ai_analysis ? (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              )}
              <span className="text-xs font-mono font-bold text-zinc-200">
                SkyOps AI Analysis & Deep Reasoning
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">
              Gemini Root Cause Synthesis
            </span>
          </button>

          {expandedSections.ai_analysis && (
            <div className="p-4 sm:p-5 border-t border-zinc-800 space-y-4">
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
          )}
        </div>

        {/* 7. Workload Execution & Target Infrastructure */}
        <div className="rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('infrastructure')}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-zinc-900/40 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2.5">
              {expandedSections.infrastructure ? (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              )}
              <span className="text-xs font-mono font-bold text-zinc-200">
                Workload Execution & Target Infrastructure
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">
              Cluster, Node, Spec & Fingerprint
            </span>
          </button>

          {expandedSections.infrastructure && (
            <div className="p-4 sm:p-5 border-t border-zinc-800 space-y-4 font-mono text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase block">Cluster ID</span>
                  <span className="text-zinc-200 font-semibold truncate block mt-0.5">
                    {incident.clusterId}
                  </span>
                </div>

                <div className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase block">Namespace</span>
                  <span className="text-zinc-200 font-semibold truncate block mt-0.5">
                    {incident.namespace}
                  </span>
                </div>

                <div className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase block">Resource Kind</span>
                  <span className="text-zinc-200 font-semibold truncate block mt-0.5">
                    {incident.resourceKind}
                  </span>
                </div>

                <div className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase block">Resource Name</span>
                  <span className="text-zinc-200 font-semibold truncate block mt-0.5">
                    {incident.resourceName}
                  </span>
                </div>

                <div className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase block">Node Name</span>
                  <span className="text-zinc-200 truncate block mt-0.5">
                    {tech.nodeName || 'Not pinned / Unassigned'}
                  </span>
                </div>

                <div className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase block">Pod Target</span>
                  <span className="text-zinc-200 truncate block mt-0.5">
                    {tech.podName || incident.resourceName}
                  </span>
                </div>

                <div className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-800 sm:col-span-2">
                  <span className="text-[10px] text-zinc-500 uppercase block">Container Image</span>
                  <span className="text-zinc-200 truncate block mt-0.5">
                    {tech.image || 'Unknown'}
                  </span>
                </div>
              </div>

              {/* Deterministic Fingerprint */}
              <div className="p-3.5 bg-zinc-900/40 rounded-lg border border-zinc-800 flex items-center justify-between">
                <span className="text-[10px] text-zinc-400 uppercase">
                  Deterministic Fingerprint:
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-300 font-mono text-[11px] bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                    {incident.fingerprint}
                  </span>
                  <CopyButton text={incident.fingerprint} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 8. Audit Trail & Timeline */}
        <div className="rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('audit_trail')}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-zinc-900/40 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2.5">
              {expandedSections.audit_trail ? (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              )}
              <span className="text-xs font-mono font-bold text-zinc-200">
                Audit Trail & Timeline
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">
              {timeline.length} timeline events · {notes.length} notes
            </span>
          </button>

          {expandedSections.audit_trail && (
            <div className="p-4 sm:p-5 border-t border-zinc-800 space-y-6">
              {/* Chronological Timeline */}
              <div className="space-y-3">
                <span className="text-[11px] font-mono uppercase font-bold text-zinc-400 block">
                  Chronological Incident Events ({timeline.length})
                </span>

                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-800">
                  {timeline.map((evt) => (
                    <div key={evt.id} className="relative font-mono text-xs">
                      <span className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full border-2 bg-zinc-700 border-zinc-950" />
                      <div className="flex items-center justify-between text-[11px] text-zinc-400">
                        <span className="font-bold text-zinc-200">{evt.type}</span>
                        <span className="text-zinc-500">{formatTimeAgo(evt.timestamp)}</span>
                      </div>
                      <div className="text-zinc-300 text-xs mt-0.5 font-sans">
                        {evt.description}
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">by {evt.actor.name}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Investigation Notes & Authoring Form */}
              <div className="pt-4 border-t border-zinc-800 space-y-3">
                <span className="text-[11px] font-mono uppercase font-bold text-zinc-400 block">
                  Investigation Notes ({notes.length})
                </span>

                {notes.length > 0 ? (
                  <div className="space-y-2">
                    {notes.map((note) => (
                      <div
                        key={note.id}
                        className="p-3 bg-zinc-900/40 border border-zinc-800 rounded-lg space-y-1 font-mono text-xs"
                      >
                        <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                          <span className="font-semibold text-zinc-200">{note.authorName}</span>
                          <span className="text-zinc-500">{formatTimeAgo(note.createdAt)}</span>
                        </div>
                        <p className="text-zinc-300 font-sans text-xs whitespace-pre-wrap">
                          {note.content}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-zinc-900/30 border border-dashed border-zinc-800 text-center text-xs font-mono text-zinc-500">
                    No notes recorded yet.
                  </div>
                )}

                {canEditIncidents && (
                  <form onSubmit={handleAddNote} className="space-y-2 pt-2">
                    <textarea
                      rows={2}
                      required
                      placeholder="Add investigation observation or log finding..."
                      value={newNoteContent}
                      onChange={(e) => setNewNoteContent(e.target.value)}
                      className="w-full p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 text-xs font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                    />
                    <div className="flex justify-end">
                      <Button
                        variant="primary"
                        size="sm"
                        type="submit"
                        disabled={isSubmittingNote || !newNoteContent.trim()}
                        icon={<Send className="w-3.5 h-3.5" />}
                      >
                        Post Note
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 9. Rollback & Safety Details */}
        <div className="rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('rollback')}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-zinc-900/40 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2.5">
              {expandedSections.rollback ? (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              )}
              <span className="text-xs font-mono font-bold text-zinc-200">
                Rollback & Safety Details
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">
              Preconditions, Rollback Strategy & Verification Plan
            </span>
          </button>

          {expandedSections.rollback && (
            <div className="p-4 sm:p-5 border-t border-zinc-800 space-y-3 font-mono text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase block">Rollback Supported</span>
                  <span className="text-emerald-400 font-bold block mt-0.5">
                    {remediation?.rollbackPlan?.supported !== false ? 'YES' : 'NO'}
                  </span>
                </div>

                <div className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase block">Rollback Strategy</span>
                  <span className="text-zinc-200 truncate block mt-0.5">
                    {remediation?.rollbackPlan?.strategy ||
                      remediation?.reasoning?.rollbackStrategy ||
                      'RESTORE_PREVIOUS_SPEC'}
                  </span>
                </div>

                <div className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase block">Verification Timeout</span>
                  <span className="text-zinc-200 block mt-0.5">
                    {((remediation as any)?.verificationPlan?.timeoutSeconds ||
                      (remediation as any)?.verification?.timeoutSeconds ||
                      120)}s observation
                  </span>
                </div>
              </div>

              {(remediation as any)?.idempotencyKey && (
                <div className="p-3 bg-zinc-900/40 rounded-lg border border-zinc-800 flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500 uppercase">Idempotency Key:</span>
                  <span className="text-zinc-300 font-mono text-[11px]">
                    {String((remediation as any).idempotencyKey)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* PROMPT 2: Drawers & Modals */}
      <WhatChangedDrawer
        incident={incident}
        isOpen={isWhatChangedOpen}
        onClose={() => setIsWhatChangedOpen(false)}
      />

      <IncidentPostmortemModal
        incident={incident}
        isOpen={isPostmortemOpen}
        onClose={() => setIsPostmortemOpen(false)}
        onOpenPreDeploymentGate={() => {
          setIsPostmortemOpen(false);
          setIsPreDeploymentGateOpen(true);
        }}
      />

      <PreDeploymentGateModal
        clusterId={incident.clusterId}
        clusterName={incident.clusterName}
        defaultNamespace={incident.namespace}
        defaultWorkload={incident.resourceName}
        isOpen={isPreDeploymentGateOpen}
        onClose={() => setIsPreDeploymentGateOpen(false)}
      />

      {/* Delete Incident Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => !isDeleting && setIsDeleteModalOpen(false)}
        title="Delete Incident Ticket"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 bg-rose-950/20 border border-rose-900/30 rounded-lg text-rose-300">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-semibold text-rose-200">Delete ticket {incident?.id}?</p>
              <p className="text-zinc-400">
                Are you sure you want to delete incident ticket {incident?.id}? This action permanently deletes this incident investigation record.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={isDeleting}
              onClick={() => setIsDeleteModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={isDeleting}
              onClick={confirmDelete}
              icon={isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            >
              {isDeleting ? 'Deleting...' : 'Delete Incident'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Resolve Incident Confirmation Modal */}
      <Modal
        isOpen={isResolveModalOpen}
        onClose={() => setIsResolveModalOpen(false)}
        title="Mark Incident Resolved"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-zinc-300 font-sans">
            Provide an optional resolution summary or reason for marking incident <span className="font-mono font-bold text-sky-400">{incident?.id}</span> as resolved:
          </p>
          <textarea
            value={resolutionNote}
            onChange={(e) => setResolutionNote(e.target.value)}
            placeholder="e.g., Workload verified healthy after restart and configuration update."
            className="w-full h-24 p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 text-xs font-mono placeholder-zinc-600 focus:outline-none focus:border-sky-500"
          />
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsResolveModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={confirmResolve}
              disabled={statusUpdateLoading}
              icon={statusUpdateLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {statusUpdateLoading ? 'Resolving...' : 'Confirm Resolve'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
