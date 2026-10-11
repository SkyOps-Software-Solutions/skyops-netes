import {
  Activity,
  AlertTriangle,
  Bell,
  Building2,
  CheckCircle2,
  Cpu,
  CreditCard,
  FileText,
  Flame,
  HardDrive,
  Headphones,
  HeartPulse,
  Key,
  Layers,
  Lock,
  Mail,
  Play,
  Plus,
  RefreshCw,
  Save,
  Server,
  Shield,
  Trash2,
  Users,
  Webhook,
  Zap
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Cluster, Organization, OrganizationSettings } from '../../types/index';
import { Button, CodeBlock, CopyButton, Modal } from '../common/UI';
import { NotificationsManager } from './NotificationsManager';
import { SupportManager } from './SupportManager';
import { SystemHealthManager } from './SystemHealthManager';
import { TeamManager } from './TeamManager';
import { UsageManager } from './UsageManager';
import { WebhooksManager } from './WebhooksManager';
import { ContactManager } from './ContactManager';
import { InvoicesManager } from './InvoicesManager';
import { IntegrationsHubManager } from './IntegrationsHubManager';
import { AutoHealingManager } from './AutoHealingManager';

interface SettingsViewProps {
  clusters: Cluster[];
  onSelectIncident?: (incidentId: string) => void;
  onRefresh: () => void;
}

export type SettingsTab =
  | 'org'
  | 'team'
  | 'autohealing'
  | 'integrations'
  | 'billing'
  | 'support'
  | 'testbed';

interface TabGroup {
  category: string;
  items: Array<{
    id: SettingsTab;
    label: string;
    icon: React.ReactNode;
  }>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ clusters, onSelectIncident, onRefresh }) => {
  const { currentOrg, organizations, switchOrganization, createOrganization, deleteOrganization, role, user } = useAuth();
  const safeClusters = Array.isArray(clusters) ? clusters : [];
  const [activeTab, setActiveTab] = useState<SettingsTab>('org');
  const [selectedClusterId, setSelectedClusterId] = useState<string>(safeClusters[0]?.id || '');
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<{ success: boolean; message: string; incidentId?: string } | null>(null);

  // Org Settings Form state
  const isOwnerOrAdmin = role === 'OWNER' || role === 'ADMIN';
  const isOwner =
    role === 'OWNER' ||
    currentOrg?.ownerUserId === user?.id ||
    Boolean((currentOrg as any)?.ownerEmail && (currentOrg as any).ownerEmail.toLowerCase() === user?.email?.toLowerCase());
  const [orgName, setOrgName] = useState(currentOrg?.name || '');
  const [timezone, setTimezone] = useState(currentOrg?.settings?.general?.timezone || 'UTC');
  const [enforceMfa, setEnforceMfa] = useState(currentOrg?.settings?.security?.enforceMfa || false);
  const [sessionTimeout, setSessionTimeout] = useState(currentOrg?.settings?.security?.sessionTimeoutMinutes || 1440);
  const [incidentRetention, setIncidentRetention] = useState(currentOrg?.settings?.retention?.incidentRetentionDays || 90);
  const [auditLogsRetention, setAuditLogsRetention] = useState(currentOrg?.settings?.retention?.auditLogsRetentionDays || 365);
  const [telemetryRetention, setTelemetryRetention] = useState(currentOrg?.settings?.retention?.telemetryRetentionDays || 30);
  const [neverDeleteProd, setNeverDeleteProd] = useState(currentOrg?.settings?.retention?.neverDeleteProduction ?? true);
  const [savingOrg, setSavingOrg] = useState(false);
  const [orgSuccessMsg, setOrgSuccessMsg] = useState<string | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);

  // Workspace Directory & Deletion state
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [showCreateWorkspaceForm, setShowCreateWorkspaceForm] = useState(false);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<Organization | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);
  const [deleteWorkspaceError, setDeleteWorkspaceError] = useState<string | null>(null);

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;
    try {
      setCreatingWorkspace(true);
      setOrgError(null);
      const created = await createOrganization(newWorkspaceName.trim());
      setNewWorkspaceName('');
      setShowCreateWorkspaceForm(false);
      setOrgSuccessMsg(`Workspace "${created.name}" created and set as your active workspace.`);
      setTimeout(() => setOrgSuccessMsg(null), 4000);
      onRefresh();
    } catch (err: any) {
      setOrgError(err?.message || 'Failed to create workspace');
    } finally {
      setCreatingWorkspace(false);
    }
  };

  const openDeleteWorkspaceModal = (org: Organization) => {
    setWorkspaceToDelete(org);
    setDeleteConfirmName('');
    setDeleteAcknowledged(false);
    setDeleteWorkspaceError(null);
  };

  const handleDeleteWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceToDelete) return;
    if (deleteConfirmName.trim() !== workspaceToDelete.name.trim()) {
      setDeleteWorkspaceError(`Workspace name does not match. Please type "${workspaceToDelete.name}" exactly.`);
      return;
    }
    if (!deleteAcknowledged) {
      setDeleteWorkspaceError('Please acknowledge that workspace deletion is permanent.');
      return;
    }

    try {
      setDeletingWorkspace(true);
      setDeleteWorkspaceError(null);
      const deletedName = workspaceToDelete.name;
      const res = await deleteOrganization(workspaceToDelete.id, deleteConfirmName.trim(), true);
      setWorkspaceToDelete(null);
      setDeleteConfirmName('');
      setDeleteAcknowledged(false);
      setOrgSuccessMsg(
        res.remainingWorkspaces.length > 0
          ? `Workspace "${deletedName}" was permanently deleted.`
          : `Workspace "${deletedName}" was permanently deleted.`
      );
      setTimeout(() => setOrgSuccessMsg(null), 5000);
      onRefresh();
    } catch (err: any) {
      setDeleteWorkspaceError(err?.message || 'Failed to delete workspace');
    } finally {
      setDeletingWorkspace(false);
    }
  };

  useEffect(() => {
    if (currentOrg) {
      setOrgName(currentOrg.name || '');
      setTimezone(currentOrg.settings?.general?.timezone || 'UTC');
      setEnforceMfa(currentOrg.settings?.security?.enforceMfa || false);
      setSessionTimeout(currentOrg.settings?.security?.sessionTimeoutMinutes || 1440);
      setIncidentRetention(currentOrg.settings?.retention?.incidentRetentionDays || 90);
      setAuditLogsRetention(currentOrg.settings?.retention?.auditLogsRetentionDays || 365);
      setTelemetryRetention(currentOrg.settings?.retention?.telemetryRetentionDays || 30);
      setNeverDeleteProd(currentOrg.settings?.retention?.neverDeleteProduction ?? true);
    }
  }, [currentOrg]);

  useEffect(() => {
    if (!selectedClusterId && safeClusters.length > 0) {
      setSelectedClusterId(safeClusters[0].id);
    }
  }, [safeClusters, selectedClusterId]);

  const handleSaveOrgSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg?.id || !isOwnerOrAdmin) return;

    try {
      setSavingOrg(true);
      setOrgError(null);
      await api.updateOrganization(currentOrg.id, {
        name: orgName.trim(),
        settings: {
          general: { name: orgName.trim(), timezone },
          security: { enforceMfa, sessionTimeoutMinutes: Number(sessionTimeout) },
          retention: {
            incidentRetentionDays: Number(incidentRetention),
            auditLogsRetentionDays: Number(auditLogsRetention),
            telemetryRetentionDays: Number(telemetryRetention),
            neverDeleteProduction: Boolean(neverDeleteProd)
          }
        }
      });
      setOrgSuccessMsg('Organization profile, security policies, and data retention rules saved.');
      setTimeout(() => setOrgSuccessMsg(null), 4000);
      onRefresh();
    } catch (err: any) {
      setOrgError(err.message || 'Failed to update organization settings');
    } finally {
      setSavingOrg(false);
    }
  };

  const handleSimulate = async (
    scenario:
      | 'CrashLoopBackOff'
      | 'ImagePullBackOff'
      | 'OOMKilled'
      | 'NodeNotReady'
      | 'DeploymentDegraded'
      | 'PVCPending'
      | 'HighCPUPayments'
      | 'RecoverAll'
  ) => {
    if (!selectedClusterId) return;
    try {
      setSimulating(true);
      setSimResult(null);
      const res = await api.simulateScenario(selectedClusterId, scenario);
      setSimResult(res);
      onRefresh();
    } catch (err: any) {
      setSimResult({ success: false, message: err.message || 'Simulation failed' });
    } finally {
      setSimulating(false);
    }
  };

  const scenarios: Array<{
    id: 'CrashLoopBackOff' | 'ImagePullBackOff' | 'OOMKilled' | 'NodeNotReady' | 'DeploymentDegraded' | 'PVCPending' | 'HighCPUPayments';
    name: string;
    description: string;
    icon: React.ReactNode;
    severity: string;
  }> = [
    {
      id: 'HighCPUPayments',
      name: 'High CPU on payments-api',
      description: 'Simulates 99% CPU throttling exhaustion on payments-api container triggering incident email alerts.',
      icon: <Cpu className="w-4 h-4 text-amber-400" />,
      severity: 'HIGH'
    },
    {
      id: 'CrashLoopBackOff',
      name: 'Pod CrashLoopBackOff',
      description: 'Simulates container exit code 1 with rapid crash loops in payment-service pod.',
      icon: <Flame className="w-4 h-4 text-rose-400" />,
      severity: 'CRITICAL'
    },
    {
      id: 'ImagePullBackOff',
      name: 'Pod ImagePullBackOff',
      description: 'Simulates invalid image tag with err-image-pull failure in auth-worker.',
      icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
      severity: 'HIGH'
    },
    {
      id: 'OOMKilled',
      name: 'Container OOMKilled',
      description: 'Simulates container exceeding memory limits with Linux SIGKILL 137.',
      icon: <Cpu className="w-4 h-4 text-rose-400" />,
      severity: 'CRITICAL'
    },
    {
      id: 'NodeNotReady',
      name: 'Node NotReady State',
      description: 'Simulates kubelet heartbeat timeout rendering worker node NotReady.',
      icon: <Server className="w-4 h-4 text-rose-400" />,
      severity: 'CRITICAL'
    },
    {
      id: 'DeploymentDegraded',
      name: 'Deployment Degraded',
      description: 'Simulates replica deficit where available replicas fall below spec.',
      icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
      severity: 'HIGH'
    },
    {
      id: 'PVCPending',
      name: 'PersistentVolumeClaim Pending',
      description: 'Simulates volume provisioning failure leaving PVC stuck in Pending.',
      icon: <HardDrive className="w-4 h-4 text-amber-400" />,
      severity: 'HIGH'
    }
  ];

  const tabGroups: TabGroup[] = [
    {
      category: 'WORKSPACE',
      items: [
        { id: 'org', label: 'Workspace & Security', icon: <Building2 className="w-3.5 h-3.5" /> },
        { id: 'team', label: 'Team & Access', icon: <Users className="w-3.5 h-3.5" /> },
        { id: 'autohealing', label: 'Auto-Healing Rules', icon: <Zap className="w-3.5 h-3.5 text-sky-400" /> }
      ]
    },
    {
      category: 'OPERATIONS & BILLING',
      items: [
        { id: 'integrations', label: 'Alerts & Integrations', icon: <Bell className="w-3.5 h-3.5" /> },
        { id: 'billing', label: 'Billing & Usage', icon: <CreditCard className="w-3.5 h-3.5" /> },
        { id: 'support', label: 'Help & System Status', icon: <Headphones className="w-3.5 h-3.5" /> }
      ]
    },
    ...(import.meta.env.DEV
      ? [
          {
            category: 'DEV TOOLS',
            items: [
              { id: 'testbed' as SettingsTab, label: 'Failure Simulator', icon: <Zap className="w-3.5 h-3.5 text-amber-400" /> }
            ]
          }
        ]
      : [])
  ];

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-7xl mx-auto font-sans text-zinc-100">
      {/* Page Header */}
      <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5">
        <h2 className="text-lg font-bold text-white tracking-tight">
          Workspace Settings & Governance
        </h2>
        <p className="text-xs text-zinc-400 mt-1">
          Configure workspace security policies, team access, automated healing rules, alert channels, and billing.
        </p>

        {/* Clean Categorized Tab Navigation */}
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 pt-4 border-t border-zinc-800/80">
          {tabGroups.map((group) => (
            <div key={group.category} className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-medium text-zinc-500 mr-1">
                {group.category}:
              </span>
              <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                      activeTab === item.id
                        ? 'bg-sky-500/15 text-sky-300 font-semibold border border-sky-400/40 shadow-xs'
                        : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tab: Organization Profile & Security Policies */}
      {activeTab === 'org' && (
        <div className="space-y-6">
          {orgSuccessMsg && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800/80 rounded-lg text-emerald-300 text-xs font-mono flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{orgSuccessMsg}</span>
            </div>
          )}

          {orgError && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-lg text-rose-300 text-xs font-mono flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{orgError}</span>
            </div>
          )}

          {/* Tenant Profile Summary */}
          <div className="p-6 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-4">
            <h3 className="text-xs font-bold text-zinc-200 font-mono uppercase tracking-wider flex items-center gap-2">
              <Building2 className="w-4 h-4 text-sky-400" />
              Tenant Organization Profile
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
              <div className="p-3.5 bg-zinc-950 rounded-lg border border-zinc-800/80">
                <span className="text-zinc-500 block uppercase text-[10px]">Organization Name</span>
                <span className="text-zinc-200 font-semibold mt-1 block">{currentOrg?.name}</span>
              </div>

              <div className="p-3.5 bg-zinc-950 rounded-lg border border-zinc-800/80">
                <span className="text-zinc-500 block uppercase text-[10px]">Organization ID</span>
                <span className="text-zinc-200 font-semibold mt-1 block">{currentOrg?.id}</span>
              </div>

              <div className="p-3.5 bg-zinc-950 rounded-lg border border-zinc-800/80">
                <span className="text-zinc-500 block uppercase text-[10px]">Your Access Role</span>
                <span className="text-sky-400 font-bold mt-1 block">{role}</span>
              </div>
            </div>
          </div>

          {/* Organization Settings & Security Policy Form */}
          <div className="p-6 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div>
                <h3 className="text-xs font-bold text-zinc-200 font-mono uppercase tracking-wider flex items-center gap-2">
                  <Lock className="w-4 h-4 text-sky-400" />
                  Enterprise Configuration & Security Controls
                </h3>
                <p className="text-xs text-zinc-400 font-mono mt-1">
                  Adjust workspace metadata, session policies, and authentication requirements.
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveOrgSettings} className="space-y-4 font-mono text-xs max-w-2xl">
              <div>
                <label className="text-zinc-400 block mb-1.5 text-[11px] uppercase">Organization Display Name</label>
                <input
                  type="text"
                  required
                  disabled={!isOwnerOrAdmin}
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-sky-500 disabled:opacity-60"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-zinc-400 block mb-1.5 text-[11px] uppercase">Default Timezone</label>
                  <select
                    disabled={!isOwnerOrAdmin}
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-sky-500 disabled:opacity-60"
                  >
                    <option value="UTC">UTC (Universal Coordinated Time)</option>
                    <option value="America/New_York">America/New_York (EST/EDT)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                    <option value="Europe/London">Europe/London (GMT/BST)</option>
                    <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                    <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  </select>
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1.5 text-[11px] uppercase">Session Timeout (Minutes)</label>
                  <input
                    type="number"
                    min={15}
                    max={10080}
                    disabled={!isOwnerOrAdmin}
                    value={sessionTimeout}
                    onChange={(e) => setSessionTimeout(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-sky-500 disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isOwnerOrAdmin}
                    checked={enforceMfa}
                    onChange={(e) => setEnforceMfa(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-sky-500 focus:ring-0 cursor-pointer disabled:opacity-60"
                  />
                  <span className="text-zinc-300 font-semibold text-xs">
                    Enforce Multi-Factor Authentication (MFA) for all workspace members
                  </span>
                </label>
                <p className="text-[11px] text-zinc-500 mt-1 pl-6">
                  When enabled, all users accessing this organization must satisfy enterprise 2FA verification.
                </p>
              </div>

              {/* Prompt 3, Section 20: Data Retention & Compliance Policies */}
              <div className="pt-4 border-t border-zinc-800/80 space-y-3">
                <div className="flex items-center gap-2 text-zinc-200 font-semibold">
                  <HardDrive className="w-4 h-4 text-sky-400" />
                  <span>Enterprise Data Retention Policies</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Configurable retention controls for compliance and storage governance. Data is safely archived before scheduled expiration. Production telemetry is never purged unexpectedly, and audit logs are cryptographically protected.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  <div>
                    <label className="text-zinc-400 block mb-1 text-[11px] uppercase">Incident Data Retention</label>
                    <select
                      disabled={!isOwnerOrAdmin}
                      value={incidentRetention}
                      onChange={(e) => setIncidentRetention(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-sky-500 disabled:opacity-60 text-xs"
                    >
                      <option value={30}>30 Days</option>
                      <option value={60}>60 Days</option>
                      <option value={90}>90 Days (Recommended)</option>
                      <option value={180}>180 Days (6 Months)</option>
                      <option value={365}>365 Days (1 Year)</option>
                    </select>
                    <span className="text-[10px] text-zinc-500 mt-0.5 block">Incidents & root cause postmortems</span>
                  </div>

                  <div>
                    <label className="text-zinc-400 block mb-1 text-[11px] uppercase">Audit Logs Retention</label>
                    <select
                      disabled={!isOwnerOrAdmin}
                      value={auditLogsRetention}
                      onChange={(e) => setAuditLogsRetention(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-sky-500 disabled:opacity-60 text-xs"
                    >
                      <option value={365}>1 Year / 365 Days (Standard)</option>
                      <option value={730}>2 Years (SOC2 Compliant)</option>
                      <option value={2555}>7 Years (Financial / HIPAA)</option>
                      <option value={36500}>Indefinite / Permanent</option>
                    </select>
                    <span className="text-[10px] text-emerald-400 mt-0.5 block">Cryptographically immutable</span>
                  </div>

                  <div>
                    <label className="text-zinc-400 block mb-1 text-[11px] uppercase">Telemetry Retention</label>
                    <select
                      disabled={!isOwnerOrAdmin}
                      value={telemetryRetention}
                      onChange={(e) => setTelemetryRetention(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-sky-500 disabled:opacity-60 text-xs"
                    >
                      <option value={14}>14 Days</option>
                      <option value={30}>30 Days (Recommended)</option>
                      <option value={60}>60 Days</option>
                      <option value={90}>90 Days</option>
                    </select>
                    <span className="text-[10px] text-zinc-500 mt-0.5 block">High-resolution pod & node metrics</span>
                  </div>
                </div>

                <div className="pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!isOwnerOrAdmin}
                      checked={neverDeleteProd}
                      onChange={(e) => setNeverDeleteProd(e.target.checked)}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-sky-500 focus:ring-0 cursor-pointer disabled:opacity-60"
                    />
                    <span className="text-zinc-300 font-semibold text-xs">
                      Production Safety Guard: Never automatically delete production incident history without explicit confirmation
                    </span>
                  </label>
                </div>
              </div>

              {isOwnerOrAdmin && (
                <div className="pt-3 border-t border-zinc-800/80">
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={savingOrg}
                    icon={<Save className="w-3.5 h-3.5" />}
                  >
                    {savingOrg ? 'Saving Settings...' : 'Save Configuration'}
                  </Button>
                </div>
              )}
            </form>
          </div>

          {/* Tenant Workspaces Directory (Switch, Create, or Delete Any Owned Workspace) */}
          <div className="p-6 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
              <div>
                <h3 className="text-xs font-bold text-zinc-200 font-mono uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-sky-400" />
                  Your Tenant Workspaces ({organizations.length})
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Manage all workspaces created or joined under your account. Switch active context or delete unused workspaces you own.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowCreateWorkspaceForm((prev) => !prev)}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                New Workspace
              </Button>
            </div>

            {showCreateWorkspaceForm && (
              <form
                onSubmit={handleCreateWorkspace}
                className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-end gap-3"
              >
                <div className="flex-1">
                  <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
                    New Organization / Workspace Name
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={60}
                    placeholder="e.g., Staging Platform or Acme FinTech"
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-sky-500"
                    autoFocus
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowCreateWorkspaceForm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={creatingWorkspace || newWorkspaceName.trim().length < 2}
                    icon={<Plus className="w-3.5 h-3.5" />}
                  >
                    {creatingWorkspace ? 'Creating...' : 'Create Workspace'}
                  </Button>
                </div>
              </form>
            )}

            <div className="divide-y divide-zinc-800/80 border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-950/60">
              {organizations.map((org) => {
                const isCurrent = org.id === currentOrg?.id;
                const isOrgOwner =
                  org.ownerUserId === user?.id ||
                  Boolean((org as any).ownerEmail && (org as any).ownerEmail.toLowerCase() === user?.email?.toLowerCase()) ||
                  (isCurrent && role === 'OWNER');

                return (
                  <div
                    key={org.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-900/40 transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-zinc-100 truncate">
                          {org.name}
                        </span>
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[10px] font-mono font-semibold">
                            ACTIVE WORKSPACE
                          </span>
                        )}
                        {isOrgOwner && (
                          <span className="px-2 py-0.5 rounded-md bg-zinc-900 text-zinc-400 border border-zinc-800 text-[10px] font-mono">
                            OWNER
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-zinc-500 flex items-center gap-3 flex-wrap">
                        <span>ID: {org.id}</span>
                        {org.slug && <span>Slug: {org.slug}</span>}
                        {typeof org.membersCount === 'number' && (
                          <span>{org.membersCount} {org.membersCount === 1 ? 'member' : 'members'}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!isCurrent && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => switchOrganization(org.id)}
                        >
                          Switch to Workspace
                        </Button>
                      )}
                      {isOrgOwner && (
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => openDeleteWorkspaceModal(org)}
                          icon={<Trash2 className="w-3.5 h-3.5" />}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Danger Zone: Delete Current Workspace */}
          {currentOrg && isOwner && (
            <div className="p-6 rounded-xl bg-rose-950/15 border border-rose-900/60 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-rose-300 font-mono uppercase tracking-wider flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    Danger Zone — Delete Workspace
                  </h3>
                  <p className="text-xs text-zinc-300 leading-relaxed max-w-2xl">
                    Permanently delete <strong className="text-white">{currentOrg.name}</strong> (<code className="text-rose-300 font-mono">{currentOrg.id}</code>) and all its connected Kubernetes clusters ({safeClusters.length}), active agent credentials, incidents, telemetry, and workspace policies.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => openDeleteWorkspaceModal(currentOrg)}
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                  className="shrink-0"
                >
                  Delete This Workspace
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Team Members & RBAC */}
      {activeTab === 'team' && <TeamManager />}

      {/* Tab: Auto-Healing & Safety Governance */}
      {activeTab === 'autohealing' && (
        <AutoHealingManager clusters={safeClusters} onRefresh={onRefresh} />
      )}

      {/* Tab: Alerts, Notifications, Webhooks & Integrations */}
      {activeTab === 'integrations' && (
        <div className="space-y-8">
          <NotificationsManager />
          <div className="border-t border-zinc-800/80 pt-8">
            <IntegrationsHubManager
              onNavigateToWebhooks={() => {
                const el = document.getElementById('webhooks-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
            />
          </div>
          <div id="webhooks-section" className="border-t border-zinc-800/80 pt-8">
            <WebhooksManager />
          </div>
        </div>
      )}

      {/* Tab: Subscription, Usage Limits & Invoices */}
      {activeTab === 'billing' && (
        <div className="space-y-8">
          <UsageManager />
          <div className="border-t border-zinc-800/80 pt-8">
            <InvoicesManager />
          </div>
        </div>
      )}

      {/* Tab: Support, Contact & System Health */}
      {activeTab === 'support' && (
        <div className="space-y-8">
          <SupportManager clusters={safeClusters} />
          <div className="border-t border-zinc-800/80 pt-8">
            <SystemHealthManager />
          </div>
          <div className="border-t border-zinc-800/80 pt-8">
            <ContactManager />
          </div>
        </div>
      )}

      {/* Tab: QA Scenario Testbed (Dev Only) */}
      {import.meta.env.DEV && activeTab === 'testbed' && (
        <div className="p-6 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
            <div>
              <h3 className="text-xs font-bold text-zinc-200 font-mono uppercase tracking-wider flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                Kubernetes Failure & Recovery QA Testbed
              </h3>
              <p className="text-xs text-zinc-400 font-mono mt-1">
                Simulate realistic Kubernetes operational failure conditions to verify deterministic incident detection, deduplication, and auto-recovery. (Strictly protected in production).
              </p>
            </div>

            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-zinc-400">Target Cluster:</span>
              <select
                value={selectedClusterId}
                onChange={(e) => setSelectedClusterId(e.target.value)}
                className="px-3 py-1 bg-zinc-950 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-sky-500 font-semibold"
              >
                {safeClusters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {simResult && (
            <div
              className={`p-3.5 rounded-lg border text-xs font-mono flex items-center justify-between ${
                simResult.success
                  ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300'
                  : 'bg-rose-950/30 border-rose-800/60 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{simResult.message}</span>
              </div>
              {simResult.incidentId && onSelectIncident && (
                <button
                  onClick={() => onSelectIncident(simResult.incidentId!)}
                  className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-sky-400 rounded border border-zinc-700 cursor-pointer"
                >
                  Inspect Incident {simResult.incidentId} →
                </button>
              )}
            </div>
          )}

          {/* Scenarios Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {scenarios.map((sc) => (
              <div
                key={sc.id}
                className="p-4 bg-zinc-950 border border-zinc-800/80 rounded-xl space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold text-xs text-zinc-200 font-mono">
                      {sc.icon}
                      {sc.name}
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                      {sc.severity}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-snug">{sc.description}</p>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  disabled={simulating || !selectedClusterId}
                  onClick={() => handleSimulate(sc.id)}
                  icon={<Play className="w-3 h-3 text-amber-400" />}
                  className="w-full text-xs font-mono"
                >
                  Trigger Failure
                </Button>
              </div>
            ))}
          </div>

          {/* Auto Recovery Action */}
          <div className="pt-2">
            <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 rounded-xl flex items-center justify-between gap-4">
              <div>
                <h4 className="text-xs font-bold text-emerald-300 font-mono flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Simulate Full Cluster Auto-Recovery
                </h4>
                <p className="text-[11px] text-emerald-400/80 font-mono mt-0.5">
                  Transitions all failing workloads back to Ready/Running state and verifies deterministic incident auto-resolution.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={simulating || !selectedClusterId}
                onClick={() => handleSimulate('RecoverAll')}
                className="text-emerald-300 border-emerald-800 hover:bg-emerald-900/40 font-mono text-xs shrink-0"
              >
                Simulate Auto-Recovery
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Workspace Confirmation Modal */}
      <Modal
        isOpen={Boolean(workspaceToDelete)}
        onClose={() => {
          if (!deletingWorkspace) setWorkspaceToDelete(null);
        }}
        title="Delete Organization Workspace"
        maxWidth="max-w-md"
      >
        {workspaceToDelete && (
          <form onSubmit={handleDeleteWorkspace} className="space-y-4 font-sans text-xs">
            <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-800/60 space-y-2">
              <div className="flex items-center gap-2 text-rose-300 font-semibold text-sm">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Permanently delete "{workspaceToDelete.name}"?</span>
              </div>
              <p className="text-zinc-300 leading-relaxed text-xs">
                This action will permanently remove the workspace <strong className="text-white">{workspaceToDelete.name}</strong> (<code className="text-rose-300 font-mono">{workspaceToDelete.id}</code>) along with all connected Kubernetes clusters, active agent tokens, incidents, telemetry, and member permissions.
              </p>
              {organizations.filter((o) => o.id !== workspaceToDelete.id).length > 0 ? (
                <p className="text-[11px] text-sky-300 bg-sky-950/40 border border-sky-800/50 rounded-lg px-2.5 py-1.5">
                  {workspaceToDelete.id === currentOrg?.id
                    ? `After deletion, you will be automatically switched to "${organizations.filter((o) => o.id !== workspaceToDelete.id)[0].name}".`
                    : `Your current active workspace "${currentOrg?.name}" will remain active.`}
                </p>
              ) : (
                <p className="text-[11px] text-amber-300 bg-amber-950/40 border border-amber-800/50 rounded-lg px-2.5 py-1.5">
                  This is your only workspace. After deleting it, you will be prompted to create a new workspace.
                </p>
              )}
            </div>

            {deleteWorkspaceError && (
              <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{deleteWorkspaceError}</span>
              </div>
            )}

            <div>
              <label className="block text-zinc-300 font-medium mb-1.5">
                Type <span className="font-mono font-bold text-rose-300 select-all">{workspaceToDelete.name}</span> to confirm:
              </label>
              <input
                type="text"
                required
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder={workspaceToDelete.name}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-rose-500 font-mono text-xs"
                autoFocus
              />
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={deleteAcknowledged}
                onChange={(e) => setDeleteAcknowledged(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-rose-500 focus:ring-0 cursor-pointer"
              />
              <span className="text-zinc-300 text-xs leading-snug">
                I understand that deleting this workspace and all its cluster telemetry and incidents is permanent and cannot be undone.
              </span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={deletingWorkspace}
                onClick={() => setWorkspaceToDelete(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                size="sm"
                disabled={
                  deletingWorkspace ||
                  deleteConfirmName.trim() !== workspaceToDelete.name.trim() ||
                  !deleteAcknowledged
                }
                icon={<Trash2 className="w-3.5 h-3.5" />}
              >
                {deletingWorkspace ? 'Deleting Workspace...' : 'Delete Workspace Permanently'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
