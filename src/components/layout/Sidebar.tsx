import {
  Activity,
  AlertTriangle,
  Award,
  Boxes,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Coins,
  Cpu,
  DollarSign,
  HelpCircle,
  Info,
  Layers,
  LayoutDashboard,
  LogOut,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Radio,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  UserCheck,
  X,
  Zap
} from 'lucide-react';
import React, { useState } from 'react';
import { AGENT_VERSION } from '../../config/version';
import { useAuth } from '../../context/AuthContext';
import { Organization } from '../../types/index';
import { BrandLogo } from '../common/BrandLogo';
import { Button, Modal } from '../common/UI';
import { PWAInstallButton } from '../common/PWAInstallButton';

export type NavigationTab =
  | 'overview'
  | 'operations'
  | 'infrastructure'
  | 'services'
  | 'clusters'
  | 'incidents'
  | 'logs'
  | 'observability'
  | 'cost'
  | 'security'
  | 'audit'
  | 'settings';

interface SidebarProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  openIncidentsCount?: number;
  pendingActionsCount?: number;
  onOpenAddCluster: () => void;
  onSignOut?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  openIncidentsCount = 0,
  pendingActionsCount = 0,
  onOpenAddCluster,
  onSignOut,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const {
    currentOrg,
    organizations,
    switchOrganization,
    createOrganization,
    deleteOrganization,
    leaveOrganization,
    role,
    user,
    signOut,
    pendingInvitations,
    acceptInvitation,
    declineInvitation
  } = useAuth();
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState<Organization | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [isDeletingOrg, setIsDeletingOrg] = useState(false);
  const [deleteOrgError, setDeleteOrgError] = useState<string | null>(null);

  const [orgToLeave, setOrgToLeave] = useState<Organization | null>(null);
  const [isLeavingOrg, setIsLeavingOrg] = useState(false);
  const [leaveOrgError, setLeaveOrgError] = useState<string | null>(null);

  const checkIsCreatedByMe = (org: Organization | null | undefined): boolean => {
    if (!org) return false;
    // 1. Authoritative flags from backend
    if (org.canDelete === true && org.canLeave === false) return true;
    if (org.canLeave === true && org.canDelete === false) return false;

    const normUserEmail = (user?.email || '').trim().toLowerCase();
    const orgOwnerEmail = (org.ownerEmail || (org as any).creatorEmail || '').trim().toLowerCase();
    const creatorUserId = (org as any).creatorUserId || org.ownerUserId;

    // 2. Direct user ownership matches
    if (user?.id && creatorUserId && creatorUserId === user.id) return true;
    if (normUserEmail && orgOwnerEmail && normUserEmail === orgOwnerEmail) return true;

    // 3. If workspace has another distinct owner, current user is an invited member
    if (user?.id && creatorUserId && creatorUserId !== user.id) return false;
    if (normUserEmail && orgOwnerEmail && normUserEmail !== orgOwnerEmail) return false;

    if (org.isCreatedByMe === true) return true;
    return false;
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    await createOrganization(newOrgName.trim());
    setNewOrgName('');
    setIsCreatingOrg(false);
    setIsOrgDropdownOpen(false);
  };

  const openDeleteOrgModal = (org: Organization, e: React.MouseEvent) => {
    e.stopPropagation();
    setOrgToDelete(org);
    setDeleteConfirmName('');
    setDeleteAcknowledged(false);
    setDeleteOrgError(null);
    setIsOrgDropdownOpen(false);
  };

  const openLeaveOrgModal = (org: Organization, e: React.MouseEvent) => {
    e.stopPropagation();
    setOrgToLeave(org);
    setLeaveOrgError(null);
    setIsOrgDropdownOpen(false);
  };

  const handleConfirmLeaveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgToLeave) return;
    try {
      setIsLeavingOrg(true);
      setLeaveOrgError(null);
      await leaveOrganization(orgToLeave.id);
      setOrgToLeave(null);
    } catch (err: any) {
      setLeaveOrgError(err?.message || 'Failed to leave workspace');
    } finally {
      setIsLeavingOrg(false);
    }
  };

  const handleConfirmDeleteOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgToDelete) return;
    const normalizeQuotes = (s: string) =>
      (s || '')
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
        .replace(/[\u0060\u00B4]/g, "'")
        .trim()
        .toLowerCase();

    const confirmInput = normalizeQuotes(deleteConfirmName);
    const targetNorm = normalizeQuotes(orgToDelete.name);
    const matchesName = confirmInput === targetNorm;
    const matchesId = confirmInput === orgToDelete.id.trim().toLowerCase();
    const matchesSlug = Boolean(orgToDelete.slug && confirmInput === orgToDelete.slug.trim().toLowerCase());
    const matchesDelete =
      confirmInput === 'delete' ||
      confirmInput === 'yes' ||
      confirmInput === 'confirm' ||
      confirmInput === 'permanently delete' ||
      confirmInput === 'delete workspace';

    if (!deleteAcknowledged) {
      setDeleteOrgError('Please check the confirmation box below acknowledging that this action is permanent.');
      return;
    }

    if (!matchesName && !matchesId && !matchesSlug && !matchesDelete) {
      setDeleteOrgError(`Please type "${orgToDelete.name}" or "delete" (or click Fill "delete" above) to confirm.`);
      return;
    }

    try {
      setIsDeletingOrg(true);
      setDeleteOrgError(null);
      await deleteOrganization(orgToDelete.id, deleteConfirmName.trim() || 'delete', true);
      setOrgToDelete(null);
      setDeleteConfirmName('');
      setDeleteAcknowledged(false);
    } catch (err: any) {
      setDeleteOrgError(err?.message || 'Failed to delete workspace');
    } finally {
      setIsDeletingOrg(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    if (onSignOut) onSignOut();
  };

  const navItems: Array<{
    id: NavigationTab;
    label: string;
    subtitle: string;
    icon: React.ReactNode;
    badge?: number;
  }> = [
    {
      id: 'overview',
      label: 'Overview',
      subtitle: 'Fleet summary & health',
      icon: <LayoutDashboard className="w-4 h-4" />
    },
    {
      id: 'clusters',
      label: 'Clusters',
      subtitle: 'Connected K8s environments',
      icon: <Server className="w-4 h-4" />
    },
    {
      id: 'operations',
      label: 'Operations',
      subtitle: 'Unified K8s control plane',
      icon: <Terminal className="w-4 h-4" />
    },
    {
      id: 'infrastructure',
      label: 'Infrastructure',
      subtitle: 'Workloads, pods & services',
      icon: <Layers className="w-4 h-4" />
    },
    {
      id: 'incidents',
      label: 'Incidents',
      subtitle: 'Triage & auto-healing',
      icon: <AlertTriangle className="w-4 h-4" />,
      badge: openIncidentsCount
    },
    {
      id: 'observability',
      label: 'Observability',
      subtitle: 'Metrics, events & pod logs',
      icon: <Activity className="w-4 h-4" />
    },
    {
      id: 'audit',
      label: 'Activity Log',
      subtitle: 'Team actions & audit trail',
      icon: <ShieldCheck className="w-4 h-4" />
    },
    {
      id: 'settings',
      label: 'Settings',
      subtitle: 'Workspace, team & billing',
      icon: <Settings className="w-4 h-4" />
    }
  ];

  // Role Capability definitions for Role-Based UI
  const roleCapabilities: Record<string, { can: string[]; cannot: string[] }> = {
    OWNER: {
      can: [
        'Full administrative access across all connected clusters',
        'Auto-heal incidents and approve remediation actions',
        'Configure Auto-Healing rules and workspace governance',
        'Inspect workloads, pods, services, metrics, and live container logs',
        'Manage clusters, team members, roles, and billing subscriptions',
        'Access and export immutable team activity logs'
      ],
      cannot: []
    },
    ADMIN: {
      can: [
        'View and auto-heal all incidents across environments',
        'Approve autonomous and manual remediations',
        'Manage cluster connections and Auto-Healing policies',
        'Inspect workloads, pods, services, metrics, and live logs',
        'Invite team members and manage workspace roles',
        'Inspect and export team activity logs'
      ],
      cannot: ['Delete workspace or transfer organization ownership']
    },
    SRE: {
      can: [
        'View all cluster incidents, metrics, events, and diagnostics',
        'Auto-heal incidents and execute approved remediations',
        'Configure Auto-Healing policies and safety limits',
        'Manage cluster connectivity and agent credentials',
        'Stream live container logs and inspect workloads'
      ],
      cannot: ['Manage organization billing', 'Remove organization administrators']
    },
    DEVELOPER: {
      can: [
        'View incidents and workload health across clusters',
        'Heal staging and development incidents',
        'Stream application container logs and Kubernetes events',
        'Inspect resource metrics, pods, and services'
      ],
      cannot: [
        'Approve production autonomous remediations',
        'Modify organization-wide governance policies',
        'Delete clusters or invite team members'
      ]
    },
    VIEWER: {
      can: [
        'View fleet overview, clusters, and infrastructure topology',
        'Inspect workloads, pods, services, and resource metrics',
        'Read incident timelines and root-cause diagnostics'
      ],
      cannot: [
        'Auto-heal incidents or execute cluster changes',
        'Approve remediation actions',
        'Change Auto-Healing or workspace settings',
        'Connect or delete clusters'
      ]
    },
    AUDITOR: {
      can: [
        'View and verify complete cryptographic activity logs',
        'Inspect incident timelines, postmortems, and verification evidence',
        'Review workspace retention and Auto-Healing governance policies'
      ],
      cannot: [
        'Heal incidents or execute cluster mutations',
        'Approve remediation actions',
        'Modify workspace policies, clusters, or users'
      ]
    }
  };

  const currentRoleInfo = roleCapabilities[role] || roleCapabilities['VIEWER'];

  return (
    <aside
      className={`bg-zinc-950 border-r border-zinc-800/80 flex flex-col shrink-0 h-screen select-none transition-all duration-200 ease-in-out ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      {isCollapsed ? (
        <div className="py-3 px-2 border-b border-zinc-800/80 flex flex-col items-center justify-center gap-2">
          <button
            onClick={onToggleCollapse}
            title="Pull navigation (Expand sidebar)"
            className="w-11 h-11 rounded-xl hover:bg-zinc-800/80 flex items-center justify-center transition-colors cursor-pointer p-0.5"
          >
            <BrandLogo size="md" className="rounded-lg" />
          </button>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              title="Pull navigation (Expand sidebar)"
              className="p-1 text-zinc-400 hover:text-sky-400 hover:bg-zinc-900 rounded-md transition-colors cursor-pointer"
            >
              <PanelLeftOpen className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : (
        <div className="px-4 py-4 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BrandLogo
              size="lg"
              showText
              version={AGENT_VERSION}
              subtitle="K8s Incident Platform"
            />
          </div>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              title="Push navigation (Collapse sidebar)"
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Tenant / Organization Switcher */}
      {isCollapsed ? (
        <div className="px-2 py-3 border-b border-zinc-800/60 flex justify-center">
          <button
            onClick={onToggleCollapse}
            title={`Tenant: ${currentOrg?.name || 'Workspace'} (${role}) - Click to expand`}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-sky-300 transition-colors cursor-pointer"
          >
            <Building2 className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="px-3 py-3 border-b border-zinc-800/60 relative">
          <button
            onClick={() => setIsOrgDropdownOpen(!isOrgDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <Building2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <div className="truncate">
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-200 font-medium truncate">{currentOrg?.name || 'My Organization'}</span>
                  {pendingInvitations && pendingInvitations.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-bold shrink-0">
                      {pendingInvitations.length} invite{pendingInvitations.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="text-[10px] font-mono text-zinc-500 uppercase flex items-center gap-1">
                  <span>{role}</span>
                  <span className="text-zinc-600">•</span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsRoleModalOpen(true);
                    }}
                    className="text-sky-400 hover:text-sky-300 underline lowercase cursor-pointer"
                  >
                    permissions
                  </span>
                </div>
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          </button>

          {/* Dropdown Menu */}
          {isOrgDropdownOpen && (
            <div className="absolute top-full left-3 right-3 mt-1 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1 z-30 font-mono">
              {pendingInvitations && pendingInvitations.length > 0 && (
                <div className="border-b border-zinc-800 pb-2 mb-1">
                  <div className="px-3 py-1 text-[10px] text-amber-400 font-bold uppercase flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    Pending Invitations ({pendingInvitations.length})
                  </div>
                  {pendingInvitations.map((inv) => (
                    <div key={inv.id} className="px-2.5 py-2 bg-zinc-950/70 mx-1.5 rounded border border-amber-900/40 mb-1 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-zinc-100 truncate">{inv.orgName || 'Workspace'}</span>
                        <span className="px-1.5 py-0.2 rounded bg-sky-950 text-sky-400 border border-sky-800 text-[9px] uppercase font-bold shrink-0">{inv.role}</span>
                      </div>
                      <div className="text-[10px] text-zinc-400 truncate">
                        From: {inv.invitedByName || inv.invitedByEmail}
                      </div>
                      <div className="flex items-center gap-1.5 pt-1">
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            await acceptInvitation(inv.id);
                            setIsOrgDropdownOpen(false);
                          }}
                          className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold cursor-pointer"
                        >
                          Accept & Switch
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            await declineInvitation(inv.id);
                          }}
                          className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] cursor-pointer"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="px-3 py-1.5 text-[10px] text-zinc-500 uppercase flex items-center justify-between">
                <span>Tenant Workspaces ({organizations.length})</span>
              </div>
              <div className="max-h-52 overflow-y-auto divide-y divide-zinc-800/40">
                {organizations.map((org) => {
                  const isCurrent = org.id === currentOrg?.id;
                  const isCreatedByMe = checkIsCreatedByMe(org);

                  return (
                    <div
                      key={org.id}
                      className={`w-full px-3 py-1.5 text-xs flex items-center justify-between gap-2 group transition-colors ${
                        isCurrent ? 'bg-sky-950/25 text-zinc-100' : 'hover:bg-zinc-800/80 text-zinc-200'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          switchOrganization(org.id);
                          setIsOrgDropdownOpen(false);
                        }}
                        className="flex-1 min-w-0 text-left flex items-center gap-1.5 cursor-pointer py-0.5"
                      >
                        <span className="truncate font-medium">{org.name}</span>
                        {isCurrent && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        )}
                        {isCreatedByMe ? (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                            Creator
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
                            Invited
                          </span>
                        )}
                      </button>

                      {isCreatedByMe ? (
                        <button
                          type="button"
                          onClick={(e) => openDeleteOrgModal(org, e)}
                          title={`Delete workspace "${org.name}" (Created by you)`}
                          className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => openLeaveOrgModal(org, e)}
                          title={`Leave workspace "${org.name}" (Joined via invitation)`}
                          className="p-1 rounded text-zinc-500 hover:text-amber-400 hover:bg-amber-950/40 transition-colors cursor-pointer shrink-0"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-zinc-800 my-1 pt-1">
                {isCreatingOrg ? (
                  <form onSubmit={handleCreateOrg} className="p-2">
                    <input
                      type="text"
                      placeholder="Organization name..."
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                      className="w-full px-2 py-1 text-xs bg-zinc-950 border border-zinc-700 rounded text-zinc-100 placeholder-zinc-500 mb-1 focus:outline-none focus:border-sky-500"
                      autoFocus
                    />
                    <div className="flex gap-1 justify-end">
                      <button
                        type="button"
                        onClick={() => setIsCreatingOrg(false)}
                        className="px-2 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-200"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-2 py-0.5 text-[10px] bg-sky-600 hover:bg-sky-500 text-white rounded"
                      >
                        Create
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <button
                      onClick={() => setIsCreatingOrg(true)}
                      className="w-full px-3 py-1.5 text-xs text-left text-sky-400 hover:bg-zinc-800 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Create Organization</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsOrgDropdownOpen(false);
                        onSelectTab('settings');
                      }}
                      className="w-full px-3 py-1.5 text-xs text-left text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Settings className="w-3 h-3" />
                      <span>Manage Workspaces</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5">
        {!isCollapsed && (
          <div className="px-3 pb-1 text-[11px] font-medium text-zinc-500">
            Workspace Navigation
          </div>
        )}
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return isCollapsed ? (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              title={`${item.label} — ${item.subtitle}${typeof item.badge === 'number' && item.badge > 0 ? ` (${item.badge})` : ''}`}
              className={`w-10 h-10 mx-auto rounded-lg flex items-center justify-center transition-colors relative cursor-pointer ${
                isActive
                  ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
              }`}
            >
              {item.icon}
              {typeof item.badge === 'number' && item.badge > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-zinc-950" />
              )}
            </button>
          ) : (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer group ${
                isActive
                  ? 'bg-sky-500/12 text-sky-300 border border-sky-500/25 border-l-2 border-l-sky-400 shadow-xs'
                  : 'text-zinc-300 hover:text-white hover:bg-zinc-900/80 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`p-1.5 rounded-md transition-colors shrink-0 ${
                    isActive
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'bg-zinc-900 text-zinc-400 group-hover:text-zinc-200 group-hover:bg-zinc-800'
                  }`}
                >
                  {item.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold leading-tight truncate">{item.label}</div>
                  <div className={`text-[11px] leading-tight truncate mt-0.5 ${isActive ? 'text-sky-300/80' : 'text-zinc-500'}`}>
                    {item.subtitle}
                  </div>
                </div>
              </div>
              {typeof item.badge === 'number' && item.badge > 0 && (
                <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-rose-950 text-rose-300 border border-rose-800/80 shrink-0 tabular-nums">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        {/* Quick Cluster Registration Action */}
        {isCollapsed ? (
          <div className="pt-4 flex flex-col items-center gap-2">
            <button
              onClick={onOpenAddCluster}
              title="Connect Cluster"
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/30 text-sky-300 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
            <PWAInstallButton iconOnly className="w-10 h-10 p-0 justify-center rounded-lg" />
          </div>
        ) : (
          <div className="pt-5 space-y-2">
            <button
              onClick={onOpenAddCluster}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Connect Kubernetes Cluster</span>
            </button>
            <div className="px-0.5">
              <PWAInstallButton variant="sidebar" className="w-full justify-center py-2" />
            </div>
          </div>
        )}
      </div>

      {/* User Footer & Sign Out Action */}
      {isCollapsed ? (
        <div className="py-3 px-2 border-t border-zinc-800/80 bg-zinc-950/80 flex flex-col items-center gap-2.5">
          <div
            title={`${user?.name || 'SkyOps Engineer'} (${user?.email || 'engineer@skyops.internal'})`}
            className="w-8 h-8 rounded-full bg-sky-950 border border-sky-800 flex items-center justify-center text-xs font-mono text-sky-300 font-semibold cursor-default"
          >
            {user?.name?.charAt(0) || 'S'}
          </div>
          <button
            onClick={handleSignOut}
            title="Sign Out of SkyOps"
            className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="px-3 py-3 border-t border-zinc-800/80 bg-zinc-950/80 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
            <div className="w-7 h-7 rounded-full bg-sky-950 border border-sky-800 flex items-center justify-center text-xs font-mono text-sky-300 font-semibold shrink-0">
              {user?.name?.charAt(0) || 'S'}
            </div>
            <div className="truncate">
              <div className="text-xs font-medium text-zinc-200 truncate flex items-center gap-1.5">
                {user?.name || 'SkyOps Engineer'}
              </div>
              <div className="text-[10px] font-mono text-zinc-500 truncate">
                {user?.email || 'engineer@skyops.internal'}
              </div>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            title="Sign Out of SkyOps"
            className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Role Capabilities Modal (Prompt 3, Section 15 & 16: Role-Based UI) */}
      <Modal
        isOpen={isRoleModalOpen}
        onClose={() => setIsRoleModalOpen(false)}
        title={`Enterprise Role Permissions: ${role}`}
        maxWidth="max-w-md"
      >
        <div className="space-y-4 font-mono text-xs">
          <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800 flex items-center justify-between">
            <div>
              <span className="text-zinc-400">Assigned Role:</span>{' '}
              <strong className="text-sky-400 font-bold">{role}</strong>
            </div>
            <div className="text-zinc-500 text-[10px]">
              Tenant: {currentOrg?.name}
            </div>
          </div>

          {/* Can */}
          <div className="space-y-2">
            <div className="text-emerald-400 font-semibold flex items-center gap-1.5 uppercase text-[11px] tracking-wider">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>You Can:</span>
            </div>
            <ul className="space-y-1.5 pl-5 list-disc text-zinc-300">
              {currentRoleInfo.can.map((item, idx) => (
                <li key={idx} className="leading-relaxed">
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Cannot */}
          {currentRoleInfo.cannot.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-zinc-800">
              <div className="text-rose-400 font-semibold flex items-center gap-1.5 uppercase text-[11px] tracking-wider">
                <X className="w-4 h-4 text-rose-400" />
                <span>You Cannot:</span>
              </div>
              <ul className="space-y-1.5 pl-5 list-disc text-zinc-400">
                {currentRoleInfo.cannot.map((item, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-3 border-t border-zinc-800 text-[10px] text-zinc-500">
            Permissions are enforced both in the client interface and verified cryptographically on all backend API requests.
          </div>
        </div>
      </Modal>

      {/* Delete Workspace Confirmation Modal */}
      <Modal
        isOpen={Boolean(orgToDelete)}
        onClose={() => {
          if (!isDeletingOrg) setOrgToDelete(null);
        }}
        title="Delete Organization Workspace"
        maxWidth="max-w-md"
      >
        {orgToDelete && (
          <form onSubmit={handleConfirmDeleteOrg} className="space-y-4 font-sans text-xs">
            <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-800/60 space-y-2">
              <div className="flex items-center gap-2 text-rose-300 font-semibold text-sm">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Permanently delete "{orgToDelete.name}"?</span>
              </div>
              <p className="text-zinc-300 leading-relaxed text-xs">
                This action will permanently delete the workspace <strong className="text-white">{orgToDelete.name}</strong> (<code className="text-rose-300 font-mono">{orgToDelete.id}</code>), including all connected Kubernetes clusters, active agent tokens, incident history, telemetry, and team memberships scoped to this workspace.
              </p>
              {organizations.filter((o) => o.id !== orgToDelete.id).length > 0 ? (
                <p className="text-[11px] text-sky-300 bg-sky-950/40 border border-sky-800/50 rounded-lg px-2.5 py-1.5">
                  {orgToDelete.id === currentOrg?.id
                    ? `After deletion, your session will automatically switch to "${organizations.filter((o) => o.id !== orgToDelete.id)[0].name}".`
                    : `Your active workspace "${currentOrg?.name}" will remain unaffected.`}
                </p>
              ) : (
                <p className="text-[11px] text-amber-300 bg-amber-950/40 border border-amber-800/50 rounded-lg px-2.5 py-1.5">
                  This is your only workspace. After deleting it, you will be prompted to create a fresh workspace.
                </p>
              )}
            </div>

            {deleteOrgError && (
              <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{deleteOrgError}</span>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                <label className="text-zinc-300 font-medium text-xs">
                  Type <span className="font-mono font-bold text-rose-300 select-all">{orgToDelete.name}</span> or <span className="font-mono font-bold text-rose-300">delete</span> to confirm:
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteConfirmName(orgToDelete.name);
                      setDeleteAcknowledged(true);
                      setDeleteOrgError(null);
                    }}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer border border-zinc-700/60"
                  >
                    Fill Name
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteConfirmName('delete');
                      setDeleteAcknowledged(true);
                      setDeleteOrgError(null);
                    }}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer border border-zinc-700/60"
                  >
                    Fill "delete"
                  </button>
                </div>
              </div>
              <input
                type="text"
                required
                value={deleteConfirmName}
                onChange={(e) => {
                  setDeleteConfirmName(e.target.value);
                  if (deleteOrgError) setDeleteOrgError(null);
                }}
                placeholder={`Type "${orgToDelete.name}" or "delete"`}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-rose-500 font-mono text-xs"
                autoFocus
              />
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={deleteAcknowledged}
                onChange={(e) => {
                  setDeleteAcknowledged(e.target.checked);
                  if (deleteOrgError) setDeleteOrgError(null);
                }}
                className="mt-0.5 w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-rose-500 focus:ring-0 cursor-pointer"
              />
              <span className="text-zinc-300 text-xs leading-snug">
                I understand that deleting this workspace and its associated cluster resources is permanent and cannot be undone.
              </span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isDeletingOrg}
                onClick={() => setOrgToDelete(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                size="sm"
                disabled={isDeletingOrg}
                icon={<Trash2 className="w-3.5 h-3.5" />}
              >
                {isDeletingOrg ? 'Deleting Workspace...' : 'Delete Workspace Permanently'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Leave Organization Modal (For Invited Members) */}
      <Modal
        isOpen={Boolean(orgToLeave)}
        onClose={() => !isLeavingOrg && setOrgToLeave(null)}
        title="Leave Workspace"
        maxWidth="max-w-md"
      >
        {orgToLeave && (
          <form onSubmit={handleConfirmLeaveOrg} className="space-y-4 font-sans text-xs">
            <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-800/60 space-y-2">
              <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                <LogOut className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Leave "{orgToLeave.name}"?</span>
              </div>
              <p className="text-zinc-300 leading-relaxed text-xs">
                You joined this workspace via invitation from <strong className="text-white">{orgToLeave.creatorName || (orgToLeave as any).ownerEmail || 'the workspace administrator'}</strong>.
              </p>
              <p className="text-zinc-400 leading-relaxed text-xs">
                As an invited member, you cannot permanently delete this organization, but leaving it will remove it from your workspace list. You can be re-invited by an administrator at any time.
              </p>
            </div>

            {leaveOrgError && (
              <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{leaveOrgError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isLeavingOrg}
                onClick={() => setOrgToLeave(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                size="sm"
                disabled={isLeavingOrg}
                icon={<LogOut className="w-3.5 h-3.5" />}
              >
                {isLeavingOrg ? 'Leaving Workspace...' : 'Leave Workspace'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </aside>
  );
};
