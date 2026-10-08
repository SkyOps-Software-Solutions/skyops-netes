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
  UserCheck,
  X,
  Zap
} from 'lucide-react';
import React, { useState } from 'react';
import { AGENT_VERSION } from '../../config/version';
import { useAuth } from '../../context/AuthContext';
import { BrandLogo } from '../common/BrandLogo';
import { Modal } from '../common/UI';
import { PWAInstallButton } from '../common/PWAInstallButton';

export type NavigationTab =
  | 'overview'
  | 'infrastructure'
  | 'services'
  | 'clusters'
  | 'incidents'
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
  const { currentOrg, organizations, switchOrganization, createOrganization, role, user, signOut } = useAuth();
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    await createOrganization(newOrgName.trim());
    setNewOrgName('');
    setIsCreatingOrg(false);
    setIsOrgDropdownOpen(false);
  };

  const handleSignOut = async () => {
    await signOut();
    if (onSignOut) onSignOut();
  };

  const navItems: Array<{
    id: NavigationTab;
    label: string;
    icon: React.ReactNode;
    badge?: number;
    badgeColor?: string;
  }> = [
    {
      id: 'overview',
      label: 'Command Center',
      icon: <LayoutDashboard className="w-4 h-4" />
    },
    {
      id: 'infrastructure',
      label: 'Infrastructure',
      icon: <Server className="w-4 h-4" />
    },
    {
      id: 'services',
      label: 'Services',
      icon: <Network className="w-4 h-4" />
    },
    {
      id: 'incidents',
      label: 'Incidents',
      icon: <AlertTriangle className="w-4 h-4" />,
      badge: openIncidentsCount,
      badgeColor: 'bg-red-500/20 text-red-300 border-red-500/30'
    },
    {
      id: 'observability',
      label: 'Observability',
      icon: <Radio className="w-4 h-4" />
    },
    {
      id: 'cost',
      label: 'Cost Intelligence',
      icon: <Coins className="w-4 h-4" />
    },
    {
      id: 'security',
      label: 'Security Health',
      icon: <ShieldCheck className="w-4 h-4" />
    },
    {
      id: 'audit',
      label: 'Activity & Audit Log',
      icon: <Activity className="w-4 h-4" />
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings className="w-4 h-4" />
    }
  ];

  // Role Capability definitions for Role-Based UI (Prompt 3, Section 15 & 16)
  const roleCapabilities: Record<string, { can: string[]; cannot: string[] }> = {
    OWNER: {
      can: [
        'Full administrative access across all clusters',
        'Heal incidents & approve autonomous remediations',
        'Modify Auto-Healing and global security policies',
        'View cost intelligence & apply resource rightsizing',
        'Manage clusters, team roles, and billing subscriptions',
        'Access and export immutable audit logs'
      ],
      cannot: []
    },
    ADMIN: {
      can: [
        'View and heal all incidents across environments',
        'Approve autonomous and manual remediations',
        'Manage cluster configurations and security policies',
        'View cost intelligence and apply rightsizing',
        'Invite team members and manage organization roles',
        'Inspect immutable audit logs'
      ],
      cannot: ['Transfer organization ownership']
    },
    SRE: {
      can: [
        'View all cluster incidents, telemetry, and diagnostics',
        'Heal incidents and execute approved remediations',
        'Modify Auto-Healing policies and security rules',
        'View cost intelligence and apply resource rightsizing',
        'Manage cluster connectivity and agent tokens',
        'Inspect container logs and Prometheus metrics'
      ],
      cannot: ['Manage organization billing', 'Remove organization administrators']
    },
    DEVELOPER: {
      can: [
        'View incidents and workload health across clusters',
        'Heal staging and development incidents',
        'Inspect application container logs and events',
        'View telemetry and cost allocation breakdowns'
      ],
      cannot: [
        'Approve production autonomous remediations',
        'Modify global security policies',
        'Manage clusters or invite team members'
      ]
    },
    VIEWER: {
      can: [
        'View incidents and cluster topologies',
        'View health metrics and service mesh',
        'View telemetry snapshots and diagnostics',
        'View cost allocation breakdown'
      ],
      cannot: [
        'Heal incidents',
        'Approve remediation actions',
        'Change Auto-Healing policies',
        'Modify security policies',
        'Manage clusters or modify resources'
      ]
    },
    AUDITOR: {
      can: [
        'View complete cryptographic audit logs',
        'Inspect security posture and policy compliance',
        'View incident timelines, postmortems, and verification evidence',
        'Inspect cost allocation and resource baselines'
      ],
      cannot: [
        'Heal incidents or execute cluster mutations',
        'Approve remediation actions',
        'Modify security or auto-healing policies',
        'Manage clusters or users'
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
            className="w-9 h-9 rounded-lg hover:bg-zinc-800/80 flex items-center justify-center transition-colors cursor-pointer p-0.5"
          >
            <BrandLogo size="md" className="rounded-md" />
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
        <div className="px-5 py-4 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BrandLogo
              size="md"
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
                <div className="text-zinc-200 font-medium truncate">{currentOrg?.name || 'My Organization'}</div>
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
              <div className="px-3 py-1.5 text-[10px] text-zinc-500 uppercase">Tenant Organizations</div>
              {organizations.map((org) => (
                <button
                  key={org.id}
                  onClick={() => {
                    switchOrganization(org.id);
                    setIsOrgDropdownOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-xs text-left hover:bg-zinc-800 text-zinc-200 flex items-center justify-between cursor-pointer"
                >
                  <span className="truncate">{org.name}</span>
                  {org.id === currentOrg?.id && <CheckCircle2 className="w-3 h-3 text-sky-400" />}
                </button>
              ))}

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
                  <button
                    onClick={() => setIsCreatingOrg(true)}
                    className="w-full px-3 py-1.5 text-xs text-left text-sky-400 hover:bg-zinc-800 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Create Organization</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return isCollapsed ? (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              title={`${item.label}${typeof item.badge === 'number' && item.badge > 0 ? ` (${item.badge})` : ''}`}
              className={`w-10 h-10 mx-auto rounded-lg flex items-center justify-center transition-colors relative cursor-pointer ${
                isActive
                  ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30 border-l-2 border-l-sky-400'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
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
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                isActive
                  ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30 border-l-2 border-l-sky-400'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {item.icon}
                <span>{item.label}</span>
              </div>
              {typeof item.badge === 'number' && item.badge > 0 && (
                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-900/80 text-rose-300 border border-rose-700/60">
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
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-sky-400 hover:text-sky-300 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
            <PWAInstallButton className="w-10 h-10 p-0 justify-center" />
          </div>
        ) : (
          <div className="pt-6 space-y-2">
            <div className="px-3 py-1 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Quick Actions</div>
            <button
              onClick={onOpenAddCluster}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800/90 border border-zinc-800 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-sky-400" />
              <span>Connect Cluster</span>
            </button>
            <div className="px-1">
              <PWAInstallButton className="w-full justify-center py-2" />
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
    </aside>
  );
};
