import React, { useEffect, useState } from 'react';
import {
  Shield,
  Key,
  CheckCircle2,
  AlertTriangle,
  Upload,
  RefreshCw,
  Trash2,
  Layers,
  Cpu,
  Clock,
  Sparkles,
  Lock,
  ExternalLink
} from 'lucide-react';
import { api } from '../../api/client';
import { Button, Modal } from '../common/UI';

interface LicenseData {
  valid: boolean;
  status: 'ACTIVE' | 'EXPIRED' | 'INVALID_SIGNATURE' | 'MALFORMED' | 'COMMUNITY_DEFAULT';
  edition: 'COMMUNITY' | 'PRO' | 'ENTERPRISE';
  customerName: string;
  organizationId?: string;
  issuedAt?: string;
  expiresAt?: string | null;
  isPerpetual: boolean;
  daysRemaining?: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
  maxClusters: number;
  maxNodes: number;
  features: string[];
  error?: string;
  consumption?: {
    clusters: { current: number; limit: number; allowed: boolean };
    nodes: { current: number; limit: number; allowed: boolean };
  };
}

export const LicenseManager: React.FC = () => {
  const [license, setLicense] = useState<LicenseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [licenseInput, setLicenseInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchLicense = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await api.get<LicenseData>('/api/v1/system/license');
      setLicense(res);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load license details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLicense();
  }, []);

  const handleImportLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseInput.trim()) return;

    try {
      setImporting(true);
      setErrorMsg(null);
      await api.post('/api/v1/system/license/import', { license: licenseInput.trim() });
      setSuccessMsg('Commercial license verified and activated successfully!');
      setImportModalOpen(false);
      setLicenseInput('');
      fetchLicense();
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to verify license.');
    } finally {
      setImporting(false);
    }
  };

  const handleRemoveLicense = async () => {
    if (!window.confirm('Are you sure you want to remove the commercial license? System will revert to Community Edition.')) {
      return;
    }
    try {
      setLoading(true);
      await api.delete('/api/v1/system/license');
      setSuccessMsg('Reverted to Community Edition.');
      fetchLicense();
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to remove license.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setLicenseInput(content);
      }
    };
    reader.readAsText(file);
  };

  if (loading && !license) {
    return (
      <div className="flex items-center justify-center p-12 text-zinc-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading license and entitlement status...
      </div>
    );
  }

  const isCommunity = license?.edition === 'COMMUNITY' || license?.status === 'COMMUNITY_DEFAULT';
  const isExpired = license?.isExpired === true;

  return (
    <div className="space-y-6">
      {/* Messages */}
      {successMsg && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-800/80 rounded-xl flex items-center gap-3 text-emerald-300 text-sm">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/80 rounded-xl flex items-center gap-3 text-rose-300 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Expired License Warning */}
      {isExpired && (
        <div className="p-4 bg-amber-950/40 border border-amber-800/80 rounded-xl flex items-start gap-3 text-amber-300 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-400 mt-0.5" />
          <div>
            <div className="font-semibold text-amber-200">Commercial License Expired</div>
            <p className="mt-1 text-zinc-300">
              SkyOps is operating under Community Edition limits. <strong>Your existing telemetry, clusters, and incident data remain fully accessible and preserved.</strong> Please import a renewed license to reactivate commercial features and add more clusters.
            </p>
          </div>
        </div>
      )}

      {/* Main License Overview Card */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-zinc-100">SkyOps Platform License</h3>
                <span
                  className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
                    license?.edition === 'ENTERPRISE'
                      ? 'bg-purple-950/60 border-purple-800 text-purple-300'
                      : license?.edition === 'PRO'
                      ? 'bg-sky-950/60 border-sky-800 text-sky-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                  }`}
                >
                  {license?.edition || 'COMMUNITY'} EDITION
                </span>
                <span
                  className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${
                    isExpired
                      ? 'bg-amber-950/60 border border-amber-800 text-amber-400'
                      : license?.valid
                      ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-400'
                      : 'bg-rose-950/60 border border-rose-800 text-rose-400'
                  }`}
                >
                  {isExpired ? 'EXPIRED' : license?.status === 'COMMUNITY_DEFAULT' ? 'COMMUNITY' : 'ACTIVE'}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Licensed to: <strong className="text-zinc-200">{license?.customerName}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchLicense}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
            </Button>
            <Button variant="primary" size="sm" onClick={() => setImportModalOpen(true)}>
              <Upload className="w-3.5 h-3.5 mr-1.5" /> Import License
            </Button>
            {!isCommunity && (
              <Button variant="outline" size="sm" onClick={handleRemoveLicense} className="text-rose-400 hover:text-rose-300">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Quota & Capacity Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
          <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-sky-400" /> Monitored Clusters
              </span>
              <span className="font-semibold text-zinc-200">
                {license?.consumption?.clusters.current || 0} / {license?.maxClusters === -1 ? 'Unlimited' : license?.maxClusters}
              </span>
            </div>
            <div className="w-full bg-zinc-800 h-2 rounded-full mt-3 overflow-hidden">
              <div
                className="bg-sky-500 h-full rounded-full transition-all"
                style={{
                  width: `${
                    license?.maxClusters === -1
                      ? 10
                      : Math.min(100, Math.round(((license?.consumption?.clusters.current || 0) / (license?.maxClusters || 1)) * 100))
                  }%`
                }}
              />
            </div>
          </div>

          <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-indigo-400" /> Monitored Nodes
              </span>
              <span className="font-semibold text-zinc-200">
                {license?.consumption?.nodes.current || 0} / {license?.maxNodes === -1 ? 'Unlimited' : license?.maxNodes}
              </span>
            </div>
            <div className="w-full bg-zinc-800 h-2 rounded-full mt-3 overflow-hidden">
              <div
                className="bg-indigo-500 h-full rounded-full transition-all"
                style={{
                  width: `${
                    license?.maxNodes === -1
                      ? 10
                      : Math.min(100, Math.round(((license?.consumption?.nodes.current || 0) / (license?.maxNodes || 1)) * 100))
                  }%`
                }}
              />
            </div>
          </div>

          <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-400" /> License Term
              </span>
              <span className="font-semibold text-zinc-200">
                {license?.isPerpetual ? 'Perpetual' : license?.daysRemaining !== undefined ? `${license.daysRemaining} days left` : 'Perpetual'}
              </span>
            </div>
            <div className="text-xs text-zinc-400 mt-3">
              {license?.isPerpetual ? (
                <span className="text-emerald-400 font-medium">No expiration date</span>
              ) : license?.expiresAt ? (
                <span>Expires on {new Date(license.expiresAt).toLocaleDateString()}</span>
              ) : (
                'Standard community edition'
              )}
            </div>
          </div>
        </div>

        {/* Feature Entitlements Breakdown */}
        <div className="mt-6 pt-6 border-t border-zinc-800">
          <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Entitled Commercial Capabilities
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { id: 'advanced_cost_intelligence', label: 'FinOps Cost Intelligence' },
              { id: 'advanced_ai_recommendations', label: 'AI Incident Diagnostics' },
              { id: 'advanced_integrations', label: 'Webhooks & Escalations' },
              { id: 'enterprise_rbac', label: 'Custom Enterprise RBAC' },
              { id: 'sso_oidc', label: 'SAML / OIDC Single Sign-On' },
              { id: 'custom_reporting', label: 'PDF Incident Postmortems' },
              { id: 'unlimited_retention', label: 'Unlimited Telemetry History' },
              { id: 'autonomous_remediation', label: 'Autonomous Auto-Healing' }
            ].map((f) => {
              const isIncluded = (license?.features || []).includes(f.id) && !isExpired;
              return (
                <div
                  key={f.id}
                  className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs ${
                    isIncluded
                      ? 'bg-zinc-950/50 border-emerald-900/40 text-zinc-200'
                      : 'bg-zinc-950/20 border-zinc-800/60 text-zinc-500'
                  }`}
                >
                  {isIncluded ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
                  )}
                  <span className={isIncluded ? 'font-medium' : 'line-through'}>{f.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Import License Modal */}
      {importModalOpen && (
        <Modal
          isOpen={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          title="Import Commercial License"
        >
          <form onSubmit={handleImportLicense} className="space-y-4">
            <p className="text-xs text-zinc-400">
              Paste the cryptographic JSON license payload provided by SkyOps, or upload the <code>.json</code> license file. The application verifies the digital signature locally using Ed25519 without external internet access.
            </p>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Upload License File
              </label>
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="w-full text-xs text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700 cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Or Paste JSON License
              </label>
              <textarea
                value={licenseInput}
                onChange={(e) => setLicenseInput(e.target.value)}
                placeholder='{"version": "1.0", "licenseId": "lic-...", "customerName": "...", "signature": "..."}'
                rows={7}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs font-mono text-zinc-200 focus:outline-none focus:border-sky-500"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <Button variant="ghost" size="sm" type="button" onClick={() => setImportModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit" disabled={importing || !licenseInput.trim()}>
                {importing ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
                Verify & Activate
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
