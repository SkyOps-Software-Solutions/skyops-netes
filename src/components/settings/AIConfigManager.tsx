import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  Bot,
  Shield,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Lock,
  Eye,
  EyeOff,
  Server,
  Zap,
  Sliders,
  Send
} from 'lucide-react';
import { api } from '../../api/client';
import { Button } from '../common/UI';

interface AISanitizedConfig {
  enabled: boolean;
  providerType: 'gemini' | 'openai' | 'local_ai' | 'none';
  modelName: string;
  endpoint?: string;
  apiKeyConfigured: boolean;
  apiKeyMasked?: string;
  dataSharingConsent: boolean;
  stripSensitiveLogs: boolean;
  redactEnvironmentVars: boolean;
  maskResourceNames: boolean;
  requestTimeoutMs: number;
  activeProviderName: string;
  activeModel: string;
  isAvailable: boolean;
}

export const AIConfigManager: React.FC = () => {
  const [config, setConfig] = useState<AISanitizedConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latencyMs: number } | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form edit state
  const [enabled, setEnabled] = useState(true);
  const [providerType, setProviderType] = useState<'gemini' | 'openai' | 'local_ai' | 'none'>('gemini');
  const [modelName, setModelName] = useState('gemini-3.8-flash');
  const [endpoint, setEndpoint] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [dataSharingConsent, setDataSharingConsent] = useState(false);
  const [stripSensitiveLogs, setStripSensitiveLogs] = useState(true);
  const [redactEnvironmentVars, setRedactEnvironmentVars] = useState(true);
  const [maskResourceNames, setMaskResourceNames] = useState(false);
  const [requestTimeoutMs, setRequestTimeoutMs] = useState(15000);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await api.get<AISanitizedConfig>('/api/v1/system/ai/config');
      setConfig(res);

      setEnabled(res.enabled);
      setProviderType(res.providerType);
      setModelName(res.modelName || 'gemini-3.8-flash');
      setEndpoint(res.endpoint || '');
      setDataSharingConsent(res.dataSharingConsent);
      setStripSensitiveLogs(res.stripSensitiveLogs);
      setRedactEnvironmentVars(res.redactEnvironmentVars);
      setMaskResourceNames(res.maskResourceNames);
      setRequestTimeoutMs(res.requestTimeoutMs || 15000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load AI configuration.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setErrorMsg(null);
      await api.put('/api/v1/system/ai/config', {
        enabled,
        providerType,
        modelName,
        endpoint: endpoint.trim() || undefined,
        apiKey: newApiKey.trim() || undefined,
        dataSharingConsent,
        stripSensitiveLogs,
        redactEnvironmentVars,
        maskResourceNames,
        requestTimeoutMs
      });

      setSuccessMsg('AI Provider settings saved and active.');
      setNewApiKey('');
      fetchConfig();
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save AI configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      const res = await api.post<{ success: boolean; message: string; latencyMs: number }>('/api/v1/system/ai/test', {
        providerType,
        apiKey: newApiKey.trim() || undefined,
        endpoint: endpoint.trim() || undefined,
        model: modelName
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || 'Test probe failed', latencyMs: 0 });
    } finally {
      setTesting(false);
    }
  };

  if (loading && !config) {
    return (
      <div className="flex items-center justify-center p-12 text-zinc-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading AI provider configuration...
      </div>
    );
  }

  const isExternalProvider = providerType === 'gemini' || providerType === 'openai';

  return (
    <form onSubmit={handleSave} className="space-y-6">
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

      {/* Main Configuration Card */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-100">AI Intelligence Provider</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Configure root-cause reasoning engine and data privacy boundaries.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-zinc-300">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-800 text-purple-500 focus:ring-purple-500 h-4 w-4"
              />
              Enable AI Assistance
            </label>
          </div>
        </div>

        {/* Provider Selection */}
        <div className="pt-6 space-y-6">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-3">
              Select Inference Provider
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {
                  id: 'gemini',
                  title: 'Google Gemini',
                  desc: 'High-speed cloud analysis via official @google/genai SDK'
                },
                {
                  id: 'openai',
                  title: 'OpenAI Compatible',
                  desc: 'Standard REST completions for OpenAI or Azure'
                },
                {
                  id: 'local_ai',
                  title: 'Customer Local AI',
                  desc: 'Air-gapped local inference (Ollama, vLLM, LocalAI)'
                },
                {
                  id: 'none',
                  title: 'No-AI Mode',
                  desc: '100% deterministic heuristic rules with zero external calls'
                }
              ].map((p) => (
                <div
                  key={p.id}
                  onClick={() => setProviderType(p.id as any)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    providerType === p.id
                      ? 'bg-purple-950/40 border-purple-600 text-zinc-100 shadow-lg shadow-purple-950/20'
                      : 'bg-zinc-950/40 border-zinc-800/80 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <div className="font-semibold text-sm mb-1">{p.title}</div>
                  <div className="text-xs opacity-75">{p.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Model and Credentials Settings (if not No-AI) */}
          {providerType !== 'none' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Model Identifier
                </label>
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder={
                    providerType === 'gemini'
                      ? 'gemini-3.8-flash'
                      : providerType === 'openai'
                      ? 'gpt-4o-mini'
                      : 'llama3.2:latest'
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              {(providerType === 'openai' || providerType === 'local_ai') && (
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Endpoint URL
                  </label>
                  <input
                    type="text"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    placeholder={
                      providerType === 'local_ai'
                        ? 'http://localhost:11434/v1'
                        : 'https://api.openai.com/v1'
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-purple-500"
                  />
                </div>
              )}

              {providerType !== 'local_ai' && (
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-zinc-300">
                      API Key
                    </label>
                    {config?.apiKeyConfigured && (
                      <span className="text-[11px] text-emerald-400 font-mono">
                        Key saved: {config.apiKeyMasked}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={newApiKey}
                      onChange={(e) => setNewApiKey(e.target.value)}
                      placeholder={config?.apiKeyConfigured ? 'Leave blank to preserve existing key' : 'Enter API Key'}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 pr-10 text-xs font-mono text-zinc-200 focus:outline-none focus:border-purple-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-200"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Privacy & Customer Consent Section */}
          <div className="pt-4 border-t border-zinc-800/80 space-y-4">
            <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" /> Customer Data Privacy & Telemetry Redaction
            </h4>

            {isExternalProvider && (
              <div className="p-4 bg-zinc-950/60 border border-zinc-800 rounded-xl space-y-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dataSharingConsent}
                    onChange={(e) => setDataSharingConsent(e.target.checked)}
                    className="mt-0.5 rounded border-zinc-700 bg-zinc-800 text-purple-500 focus:ring-purple-500 h-4 w-4"
                  />
                  <div className="text-xs">
                    <div className="font-semibold text-zinc-200">
                      I explicitly consent to transmitting sanitized Kubernetes incident telemetry to the configured external AI provider.
                    </div>
                    <p className="text-zinc-400 mt-0.5">
                      When unchecked, SkyOps automatically operates in localized Deterministic No-AI mode to guarantee zero data egress.
                    </p>
                  </div>
                </label>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="p-3 bg-zinc-950/40 border border-zinc-800 rounded-xl flex items-center gap-2.5 cursor-pointer text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={stripSensitiveLogs}
                  onChange={(e) => setStripSensitiveLogs(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-800 text-purple-500 focus:ring-purple-500 h-4 w-4"
                />
                <span>Redact Bearer tokens & private keys</span>
              </label>

              <label className="p-3 bg-zinc-950/40 border border-zinc-800 rounded-xl flex items-center gap-2.5 cursor-pointer text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={redactEnvironmentVars}
                  onChange={(e) => setRedactEnvironmentVars(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-800 text-purple-500 focus:ring-purple-500 h-4 w-4"
                />
                <span>Redact pod environment variables</span>
              </label>

              <label className="p-3 bg-zinc-950/40 border border-zinc-800 rounded-xl flex items-center gap-2.5 cursor-pointer text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={maskResourceNames}
                  onChange={(e) => setMaskResourceNames(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-800 text-purple-500 focus:ring-purple-500 h-4 w-4"
                />
                <span>Mask cluster & namespace names</span>
              </label>
            </div>
          </div>

          {/* Test Probe Output */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
                testResult.success
                  ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-800 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                )}
                <span>{testResult.message}</span>
              </div>
              {testResult.latencyMs > 0 && (
                <span className="font-mono text-[11px] opacity-80">{testResult.latencyMs}ms</span>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={handleTestConnection}
              disabled={testing || providerType === 'none'}
            >
              {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
              Test Connection
            </Button>

            <Button variant="primary" size="sm" type="submit" disabled={saving}>
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
              Save Configuration
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
};
