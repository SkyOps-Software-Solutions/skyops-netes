import React, { useEffect, useState, useCallback } from 'react';
import {
  Users,
  CheckCircle2,
  X,
  Building2,
  Shield,
  Loader2,
  Bell,
  ArrowRight
} from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { OrgInvitation } from '../../types/index';
import { Button } from '../common/UI';

export const PendingInvitationsBanner: React.FC = () => {
  const { user, switchOrganization, refreshSession, currentOrg } = useAuth();
  const [invitations, setInvitations] = useState<OrgInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'accept' | 'decline' | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchInvitations = useCallback(async () => {
    if (!user) return;
    try {
      const invs = await api.getMyInvitations();
      // Filter out any invitations for the currently active org that might have already been accepted
      setInvitations(invs.filter((i) => i.status === 'PENDING' && i.orgId !== currentOrg?.id));
    } catch (err) {
      // Gracefully handle if not authenticated or network issue
    }
  }, [user, currentOrg?.id]);

  useEffect(() => {
    fetchInvitations();
    // Poll periodically for new in-app invites every 20 seconds
    const interval = setInterval(fetchInvitations, 20000);
    return () => clearInterval(interval);
  }, [fetchInvitations]);

  const handleAccept = async (inv: OrgInvitation) => {
    try {
      setActionLoadingId(inv.id);
      setActionType('accept');
      const result = await api.acceptMyInvitation(inv.id);
      setToastMessage(`You joined "${result.organization.name}" as ${result.role}! Switching workspace...`);
      setInvitations((prev) => prev.filter((i) => i.id !== inv.id));

      // Refresh user organizations in AuthContext and immediately switch active workspace
      if (typeof refreshSession === 'function') {
        await refreshSession();
      }
      setTimeout(async () => {
        try {
          await switchOrganization(result.organization.id);
        } catch {
          window.location.reload();
        }
      }, 600);
    } catch (err: any) {
      setToastMessage(`Failed to accept invitation: ${err?.message || 'Error occurred'}`);
    } finally {
      setActionLoadingId(null);
      setActionType(null);
    }
  };

  const handleDecline = async (inv: OrgInvitation) => {
    try {
      setActionLoadingId(inv.id);
      setActionType('decline');
      await api.declineMyInvitation(inv.id);
      setToastMessage(`Invitation to "${inv.orgName || 'Workspace'}" declined.`);
      setInvitations((prev) => prev.filter((i) => i.id !== inv.id));
    } catch (err: any) {
      setToastMessage(`Failed to decline invitation: ${err?.message || 'Error occurred'}`);
    } finally {
      setActionLoadingId(null);
      setActionType(null);
    }
  };

  if (invitations.length === 0 && !toastMessage) {
    return null;
  }

  return (
    <div className="w-full shrink-0 z-40 bg-zinc-950 px-4 py-2 space-y-2">
      {toastMessage && (
        <div className="p-2.5 rounded-lg bg-sky-950/60 border border-sky-800 text-sky-200 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-sky-400" />
            <span>{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-zinc-400 hover:text-zinc-200"
          >
            &times;
          </button>
        </div>
      )}

      {invitations.map((inv) => (
        <div
          key={inv.id}
          className="p-3 sm:p-4 rounded-xl bg-gradient-to-r from-sky-950/40 via-zinc-900 to-indigo-950/40 border border-sky-600/50 shadow-lg shadow-sky-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono"
        >
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400 shrink-0 mt-0.5 sm:mt-0">
              <Bell className="w-4 h-4 animate-pulse" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-zinc-100 flex items-center gap-1.5 text-sm">
                  <Building2 className="w-3.5 h-3.5 text-sky-400" />
                  Invitation to join {inv.orgName || 'Workspace'}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-950 text-sky-300 border border-sky-800">
                  Role: {inv.role}
                </span>
              </div>
              <p className="text-zinc-400 text-[11px] truncate">
                Invited by <strong className="text-zinc-200 font-medium">{inv.invitedByName || inv.invitedByEmail}</strong> ({inv.invitedByEmail})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <Button
              variant="outline"
              size="sm"
              disabled={actionLoadingId === inv.id}
              onClick={() => handleDecline(inv)}
              icon={actionLoadingId === inv.id && actionType === 'decline' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              className="border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-xs py-1.5"
            >
              Decline
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={actionLoadingId === inv.id}
              onClick={() => handleAccept(inv)}
              icon={actionLoadingId === inv.id && actionType === 'accept' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs py-1.5 shadow-md shadow-sky-900/40"
            >
              {actionLoadingId === inv.id && actionType === 'accept' ? 'Joining...' : 'Accept & Join Workspace'}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};
