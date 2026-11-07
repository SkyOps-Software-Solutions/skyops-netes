import React, { useEffect, useState } from 'react';
import {
  RefreshCw,
  ArrowUpCircle,
  CheckCircle2,
  AlertTriangle,
  Download,
  ShieldCheck,
  HardDrive,
  FileText,
  Clock,
  Layers,
  ExternalLink
} from 'lucide-react';
import { api } from '../../api/client';
import { Button, Modal } from '../common/UI';

interface UpdateStatus {
  currentVersion: string;
  channel: 'stable' | 'beta';
  latestAvailableVersion: string | null;
  updateAvailable: boolean;
  releaseMetadata: {
    version: string;
    releaseDate: string;
    channel: string;
    minSupportedVersion: string;
    releaseNotes: string;
    images: Array<{ name: string; tag: string; digest: string }>;
    migrationsRequired: string[];
    breakingChanges: boolean;
  } | null;
  canUpgradeDirectly: boolean;
  lastCheckedAt: string;
  inProgress: boolean;
}

export const SoftwareUpdatesManager: React.FC = () => {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [updateResult, setUpdateResult] = useState<{ success: boolean; message: string; backupPath?: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await api.get<UpdateStatus>('/api/v1/system/updates/status');
      setStatus(res);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to fetch update status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleCheckUpdates = async () => {
    try {
      setChecking(true);
      setErrorMsg(null);
      const res = await api.post<UpdateStatus>('/api/v1/system/updates/check', {});
      setStatus(res);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to check for updates.');
    } finally {
      setChecking(false);
    }
  };

  const handleApplyUpdate = async () => {
    if (!status?.releaseMetadata) return;

    try {
      setUpdating(true);
      setErrorMsg(null);
      const res = await api.post<{ success: boolean; message: string; backupPath?: string }>('/api/v1/system/updates/apply', {
        confirm: true,
        targetVersion: status.releaseMetadata.version
      });

      setUpdateResult(res);
      setConfirmModalOpen(false);
      fetchStatus();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Update application failed.');
    } finally {
      setUpdating(false);
    }
  };

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center p-12 text-zinc-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Checking software version and release catalog...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Update Result Banner */}
      {updateResult && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-start gap-3 ${
            updateResult.success
              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800 text-rose-300'
          }`}
        >
          {updateResult.success ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
          )}
          <div>
            <div className="font-semibold">{updateResult.success ? 'Update Applied Successfully' : 'Update Failed'}</div>
            <p className="mt-1 text-zinc-300">{updateResult.message}</p>
            {updateResult.backupPath && (
              <p className="mt-1 text-xs text-zinc-400 font-mono">
                Pre-Update Backup: {updateResult.backupPath}
              </p>
            )}
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/80 rounded-xl flex items-center gap-3 text-rose-300 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Version Overview Card */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <ArrowUpCircle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-zinc-100">SkyOps Software Updates</h3>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">
                  {status?.currentVersion || 'v1.0.0'}
                </span>
                <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-emerald-950/60 border border-emerald-800 text-emerald-400">
                  STABLE CHANNEL
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Installed Control Plane & Ingestion Gateway
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCheckUpdates}
            disabled={checking || updating}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${checking ? 'animate-spin' : ''}`} />
            Check for Updates
          </Button>
        </div>

        {/* Update Availability Card */}
        <div className="pt-6">
          {status?.updateAvailable && status.releaseMetadata ? (
            <div className="bg-zinc-950/60 border border-sky-900/50 rounded-2xl p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-sky-500/20 text-sky-400 border border-sky-500/30">
                      UPDATE AVAILABLE
                    </span>
                    <h4 className="text-base font-bold text-zinc-100">
                      SkyOps {status.releaseMetadata.version}
                    </h4>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    Released on {new Date(status.releaseMetadata.releaseDate).toLocaleDateString()}
                  </p>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setConfirmModalOpen(true)}
                  disabled={updating}
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Review & Install Update
                </Button>
              </div>

              {/* Release Notes */}
              <div className="p-4 bg-zinc-900/70 border border-zinc-800/80 rounded-xl">
                <div className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-sky-400" /> Release Notes & Highlights
                </div>
                <div className="text-xs text-zinc-300 whitespace-pre-line leading-relaxed font-sans">
                  {status.releaseMetadata.releaseNotes}
                </div>
              </div>

              {/* Safety & Migration Notices */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-zinc-900/40 border border-zinc-800/80 rounded-xl flex items-center gap-2 text-zinc-300">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>Automated pre-update snapshot taken prior to schema migrations</span>
                </div>
                <div className="p-3 bg-zinc-900/40 border border-zinc-800/80 rounded-xl flex items-center gap-2 text-zinc-300">
                  <Layers className="w-4 h-4 text-sky-400 flex-shrink-0" />
                  <span>
                    Migrations: {status.releaseMetadata.migrationsRequired.join(', ') || 'None'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 bg-zinc-950/40 border border-zinc-800/80 rounded-xl flex items-center gap-3 text-zinc-300 text-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <div>
                <div className="font-semibold text-zinc-200">SkyOps is Up to Date</div>
                <p className="text-zinc-400 mt-0.5">
                  Your platform is currently running the latest certified stable release ({status?.currentVersion}). Last checked at {status?.lastCheckedAt ? new Date(status.lastCheckedAt).toLocaleTimeString() : 'now'}.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModalOpen && status?.releaseMetadata && (
        <Modal
          isOpen={confirmModalOpen}
          onClose={() => setConfirmModalOpen(false)}
          title={`Confirm Upgrade to SkyOps ${status.releaseMetadata.version}`}
        >
          <div className="space-y-4 text-xs">
            <p className="text-zinc-300">
              Upgrading your SkyOps platform will safely apply container updates and database schema migrations.
            </p>

            <div className="p-3.5 bg-sky-950/40 border border-sky-800/60 rounded-xl space-y-1.5 text-zinc-300">
              <div className="font-semibold text-sky-300 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-sky-400" /> Automated Pre-Update Safety Backup
              </div>
              <p className="text-zinc-400">
                SkyOps will automatically invoke <code>scripts/backup.sh</code> to create a full PostgreSQL binary dump and storage snapshot before running any migrations. If needed, you can restore your platform state at any time using:
              </p>
              <code className="block p-2 bg-zinc-950 rounded text-sky-300 font-mono text-[11px]">
                skyops restore &lt;backup-file.tar.gz&gt;
              </code>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={backupConfirmed}
                onChange={(e) => setBackupConfirmed(e.target.checked)}
                className="mt-0.5 rounded border-zinc-700 bg-zinc-800 text-sky-500 focus:ring-sky-500 h-4 w-4"
              />
              <span className="text-zinc-200">
                I understand that an automated backup will be created and services will apply versioned schema migrations.
              </span>
            </label>

            <div className="flex items-center justify-end gap-3 pt-3">
              <Button variant="ghost" size="sm" onClick={() => setConfirmModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleApplyUpdate}
                disabled={updating || !backupConfirmed}
              >
                {updating ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
                Confirm & Apply Update
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
