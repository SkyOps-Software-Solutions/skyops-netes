import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FlaskConical,
  HelpCircle,
  Inbox,
  Info,
  Key,
  Lock,
  Mail,
  RefreshCw,
  Send,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { SKYOPS_CONTACT_EMAIL } from '../../config/contact';

export const NotificationsManager: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [verifyingSmtp, setVerifyingSmtp] = useState(false);
  const [incidentEmailEnabled, setIncidentEmailEnabled] = useState(false);
  const [sender, setSender] = useState(`SkyOps <${SKYOPS_CONTACT_EMAIL}>`);
  const [replyTo, setReplyTo] = useState(SKYOPS_CONTACT_EMAIL);
  const [testingEmail, setTestingEmail] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [testRecipient, setTestRecipient] = useState<string>('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; diagnostics?: any } | null>(null);
  const [smtpResult, setSmtpResult] = useState<{ success: boolean; message: string } | null>(null);

  // Tabs & Expander states
  const [activeGuideTab, setActiveGuideTab] = useState<'gmail' | 'outlook' | 'domain'>('gmail');
  const [showSmtpSettings, setShowSmtpSettings] = useState(false);
  const [showDeliverabilityGuide, setShowDeliverabilityGuide] = useState(true);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // SMTP Form State
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState(465);
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [smtpUser, setSmtpUser] = useState('skyopsnetes2000@gmail.com');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpSenderEmail, setSmtpSenderEmail] = useState('skyopsnetes2000@gmail.com');
  const [smtpSenderName, setSmtpSenderName] = useState('SkyOps Alerts');
  const [smtpReplyTo, setSmtpReplyTo] = useState('skyopsnetes2000@gmail.com');

  const registeredEmail = user?.email || 'user@example.com';

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await api.getNotificationSettings();
      setIncidentEmailEnabled(res.incidentEmailEnabled);
      if (res.sender) setSender(res.sender);
      if (res.replyTo) setReplyTo(res.replyTo);
      if (res.testingEmail) setTestingEmail(res.testingEmail);

      if (res.smtp) {
        if (res.smtp.host) setSmtpHost(res.smtp.host);
        if (res.smtp.port) setSmtpPort(res.smtp.port);
        if (res.smtp.secure !== undefined) setSmtpSecure(res.smtp.secure);
        if (res.smtp.user) setSmtpUser(res.smtp.user);
        if (res.smtp.senderEmail) setSmtpSenderEmail(res.smtp.senderEmail);
        if (res.smtp.senderName) setSmtpSenderName(res.smtp.senderName);
        if (res.smtp.replyTo) setSmtpReplyTo(res.smtp.replyTo);
      }
    } catch (err: any) {
      console.error('Failed to load notification settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (registeredEmail && !testRecipient) {
      setTestRecipient(registeredEmail);
    }
  }, [registeredEmail]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2500);
  };

  const handleSendTestAlert = async (targetEmail?: string) => {
    const recipient = targetEmail || testRecipient || registeredEmail;
    try {
      setSendingTest(true);
      setTestResult(null);
      const res = await api.sendTestNotification(recipient);
      if (res.success) {
        setTestResult({
          success: true,
          message: `Sample incident notification dispatched successfully to ${res.recipient} (Message ID: ${res.messageId || 'delivered'})`,
          diagnostics: res.diagnostics
        });
      } else {
        setTestResult({
          success: false,
          message: res.error || 'Failed to dispatch test notification'
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Error executing test notification delivery'
      });
    } finally {
      setSendingTest(false);
    }
  };

  const handleVerifySmtp = async () => {
    try {
      setVerifyingSmtp(true);
      setSmtpResult(null);
      const res = await api.verifySmtpSettings({
        host: smtpHost,
        port: Number(smtpPort),
        secure: smtpSecure,
        user: smtpUser,
        pass: smtpPass,
        senderEmail: smtpSenderEmail,
        senderName: smtpSenderName,
        replyTo: smtpReplyTo
      });
      if (res.success) {
        setSmtpResult({
          success: true,
          message: 'SMTP handshake & credentials verified successfully! The mail relay is ready.'
        });
      } else {
        setSmtpResult({
          success: false,
          message: res.error || 'SMTP verification failed.'
        });
      }
    } catch (err: any) {
      setSmtpResult({
        success: false,
        message: err?.message || 'Connection test failed.'
      });
    } finally {
      setVerifyingSmtp(false);
    }
  };

  const handleSaveSmtp = async () => {
    try {
      setSaving(true);
      setSmtpResult(null);
      const res = await api.updateSmtpSettings({
        host: smtpHost,
        port: Number(smtpPort),
        secure: smtpSecure,
        user: smtpUser,
        pass: smtpPass,
        senderEmail: smtpSenderEmail,
        senderName: smtpSenderName,
        replyTo: smtpReplyTo
      });
      if (res.success) {
        setSmtpResult({
          success: true,
          message: 'SMTP configuration updated and persisted successfully.'
        });
        if (res.smtp) {
          if (res.smtp.senderEmail) setSmtpSenderEmail(res.smtp.senderEmail);
          if (res.smtp.senderName) setSmtpSenderName(res.smtp.senderName);
        }
        await fetchSettings();
      }
    } catch (err: any) {
      setSmtpResult({
        success: false,
        message: err?.message || 'Failed to save SMTP settings.'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (checked: boolean) => {
    try {
      setSaving(true);
      setFeedbackMessage(null);
      const res = await api.updateNotificationSettings(checked);
      setIncidentEmailEnabled(res.incidentEmailEnabled);
      setFeedbackMessage(
        checked
          ? 'Incident email notifications enabled. You will receive alerts when Kubernetes workloads experience critical issues.'
          : 'Incident email notifications disabled.'
      );
      setTimeout(() => setFeedbackMessage(null), 4000);
    } catch (err: any) {
      setFeedbackMessage(`Error saving preferences: ${err?.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* 1. Main Notifications Toggle Card */}
      <div className="p-6 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              <Mail className="w-5 h-5 text-sky-400" />
              Incident Email Notifications
            </h3>
            <p className="text-xs text-zinc-400">
              Receive real-time, structured operational alert summaries whenever Kubernetes incidents occur.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-center">
            <span
              className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-full border ${
                incidentEmailEnabled
                  ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-400'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400'
              }`}
            >
              {incidentEmailEnabled ? 'ON' : 'OFF'}
            </span>

            {/* Toggle Switch */}
            <button
              id="incident-email-toggle"
              type="button"
              role="switch"
              aria-checked={incidentEmailEnabled}
              disabled={loading || saving}
              onClick={() => handleToggle(!incidentEmailEnabled)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-zinc-900 ${
                incidentEmailEnabled ? 'bg-sky-500' : 'bg-zinc-700'
              } ${loading || saving ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  incidentEmailEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {feedbackMessage && (
          <div className="p-3 rounded-lg bg-sky-950/40 border border-sky-800/70 text-xs font-mono text-sky-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{feedbackMessage}</span>
          </div>
        )}

        {/* Sender & Delivery Metadata Box */}
        <div className="p-4 rounded-lg bg-zinc-950/60 border border-zinc-800/60 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-zinc-300">
            <div>
              <span className="text-zinc-500 block mb-0.5">Alert Dispatcher Sender:</span>
              <span className="font-mono text-sky-300 bg-sky-950/40 px-2 py-0.5 rounded border border-sky-900/50 inline-block">
                {sender}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block mb-0.5">Recipient Address:</span>
              <span className="font-mono text-zinc-100 font-semibold">{registeredEmail}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-800/60 flex items-center gap-2 text-xs text-emerald-400">
            <ShieldCheck className="w-4 h-4 flex-shrink-0 text-emerald-400" />
            <span>
              All notifications include RFC 8058 one-click List-Unsubscribe, Precedence: bulk, and CAN-SPAM compliant footers.
            </span>
          </div>
        </div>
      </div>

      {/* 2. Guaranteed Inbox Placement & Anti-Spam Whitelisting Guide */}
      <div className="p-6 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <Inbox className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                Guaranteed Inbox Delivery & Whitelisting Guide
              </h3>
              <p className="text-xs text-zinc-400">
                Follow these simple steps to ensure alerts land in your Primary Inbox instead of the Spam or Junk folder.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowDeliverabilityGuide(!showDeliverabilityGuide)}
            className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 font-mono transition-colors"
          >
            {showDeliverabilityGuide ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {showDeliverabilityGuide && (
          <div className="space-y-4">
            {/* Tab Selector */}
            <div className="flex border-b border-zinc-800 text-xs font-medium">
              <button
                type="button"
                onClick={() => setActiveGuideTab('gmail')}
                className={`pb-2.5 px-3 border-b-2 font-mono transition-colors ${
                  activeGuideTab === 'gmail'
                    ? 'border-sky-400 text-sky-300'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Gmail & Google Workspace
              </button>
              <button
                type="button"
                onClick={() => setActiveGuideTab('outlook')}
                className={`pb-2.5 px-3 border-b-2 font-mono transition-colors ${
                  activeGuideTab === 'outlook'
                    ? 'border-sky-400 text-sky-300'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Microsoft Outlook & Office 365
              </button>
              <button
                type="button"
                onClick={() => setActiveGuideTab('domain')}
                className={`pb-2.5 px-3 border-b-2 font-mono transition-colors ${
                  activeGuideTab === 'domain'
                    ? 'border-sky-400 text-sky-300'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Custom SMTP & SPF/DKIM
              </button>
            </div>

            {/* Gmail Guide Tab */}
            {activeGuideTab === 'gmail' && (
              <div className="space-y-3 text-xs text-zinc-300 leading-relaxed">
                <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-2.5">
                  <div className="font-semibold text-zinc-100 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-mono text-[11px]">
                      1
                    </span>
                    Mark as &quot;Not Spam&quot; / Move to Inbox (One-Time Train)
                  </div>
                  <p className="text-zinc-400 pl-7">
                    If an alert email lands in your Gmail <strong>Spam</strong> folder, open it and click{' '}
                    <strong className="text-emerald-400 font-mono bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/80">
                      Report not spam
                    </strong>{' '}
                    or drag the email directly to your <strong>Primary Inbox</strong>. This immediately signals Google&apos;s Bayesian spam filter that SkyOps messages are legitimate, ensuring all subsequent alerts go directly to your Inbox.
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-2.5">
                  <div className="font-semibold text-zinc-100 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-mono text-[11px]">
                      2
                    </span>
                    Add Sender to Google Contacts
                  </div>
                  <div className="text-zinc-400 pl-7 space-y-1.5">
                    <p>
                      Adding the sender address to your Google Contacts permanently whitelists it across all Google services.
                    </p>
                    <div className="flex items-center gap-2 font-mono text-zinc-200 bg-zinc-900 px-3 py-1.5 rounded border border-zinc-800">
                      <span>skyopsnetes2000@gmail.com</span>
                      <button
                        type="button"
                        onClick={() => handleCopy('skyopsnetes2000@gmail.com', 'email')}
                        className="ml-auto text-sky-400 hover:text-sky-300 flex items-center gap-1 text-[11px]"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {copiedText === 'email' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-2.5">
                  <div className="font-semibold text-zinc-100 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-mono text-[11px]">
                      3
                    </span>
                    (Recommended) Create a 1-Click Inbox Rule
                  </div>
                  <p className="text-zinc-400 pl-7">
                    In Gmail Search bar, click the filter icon, type <code className="text-sky-300 font-mono">from:skyopsnetes2000@gmail.com</code>, click <strong>Create filter</strong>, and check <strong className="text-zinc-200">Never send it to Spam</strong> and <strong className="text-zinc-200">Always mark as important</strong>.
                  </p>
                </div>
              </div>
            )}

            {/* Outlook Guide Tab */}
            {activeGuideTab === 'outlook' && (
              <div className="space-y-3 text-xs text-zinc-300 leading-relaxed">
                <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-2.5">
                  <div className="font-semibold text-zinc-100 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-mono text-[11px]">
                      1
                    </span>
                    Mark as &quot;Not Junk&quot; in Outlook
                  </div>
                  <p className="text-zinc-400 pl-7">
                    Open your <strong>Junk Email</strong> folder, right-click the SkyOps alert message, and select{' '}
                    <strong className="text-emerald-400 font-mono">Report &rarr; Not Junk</strong> or select the message and click{' '}
                    <strong className="text-emerald-400 font-mono">It&apos;s not junk</strong> on the top ribbon.
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-2.5">
                  <div className="font-semibold text-zinc-100 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-mono text-[11px]">
                      2
                    </span>
                    Add to Safe Senders List
                  </div>
                  <p className="text-zinc-400 pl-7">
                    In Outlook: <strong>Settings &rarr; Mail &rarr; Junk email &rarr; Safe senders and domains</strong>. Click <strong>Add</strong> and paste{' '}
                    <code className="text-sky-300 font-mono">skyopsnetes2000@gmail.com</code> (or your sender address).
                  </p>
                </div>
              </div>
            )}

            {/* Domain & Custom SMTP Guide Tab */}
            {activeGuideTab === 'domain' && (
              <div className="space-y-3 text-xs text-zinc-300 leading-relaxed">
                <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-2.5">
                  <div className="font-semibold text-zinc-100 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    How to Avoid SPF/DMARC Mismatch for @gmail.com Senders
                  </div>
                  <p className="text-zinc-400">
                    If sending emails claiming to be from <code className="text-amber-300 font-mono">@gmail.com</code> through an external cloud server, Google&apos;s SPF/DMARC policy instructs recipient mailboxes to flag them as unverified or send them to Spam.
                  </p>
                  <p className="text-zinc-400">
                    <strong>Solution:</strong> Use a 16-character <strong>Google App Password</strong> below with Google&apos;s official SMTP relay (<code className="text-sky-300 font-mono">smtp.gmail.com</code>:465) or use your own corporate custom domain relay (SendGrid, Amazon SES, Brevo, or Postmark). When sent via Google&apos;s SMTP relay, Google applies its own valid DKIM cryptographic signature, ensuring 100% inbox deliverability.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Custom SMTP Relay & Enterprise Configuration */}
      <div className="p-6 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                Enterprise SMTP Relay Configuration
              </h3>
              <p className="text-xs text-zinc-400">
                Configure authenticated SMTP credentials (Google App Password or custom corporate relay) for 100% DKIM &amp; SPF inbox alignment.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowSmtpSettings(!showSmtpSettings)}
            className="text-xs font-mono px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors flex items-center gap-1.5 self-start sm:self-center"
          >
            {showSmtpSettings ? 'Hide Configuration' : 'Configure SMTP Relay'}
            {showSmtpSettings ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showSmtpSettings && (
          <div className="pt-3 space-y-4 border-t border-zinc-800/80">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-mono text-zinc-400 mb-1">SMTP Host</label>
                <input
                  type="text"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.gmail.com"
                  className="w-full text-xs font-mono bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-zinc-400 mb-1">Port</label>
                <input
                  type="number"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(Number(e.target.value))}
                  placeholder="465"
                  className="w-full text-xs font-mono bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-zinc-400 mb-1">Security</label>
                <select
                  value={smtpSecure ? 'true' : 'false'}
                  onChange={(e) => setSmtpSecure(e.target.value === 'true')}
                  className="w-full text-xs font-mono bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-sky-500"
                >
                  <option value="true">SSL/TLS (Port 465)</option>
                  <option value="false">STARTTLS / Plain (Port 587)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-mono text-zinc-400 mb-1">Username / Account Email</label>
                <input
                  type="text"
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  placeholder="user@gmail.com"
                  className="w-full text-xs font-mono bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-zinc-400 mb-1 flex items-center justify-between">
                  <span>Password / Google App Password</span>
                  <a
                    href="https://myaccount.google.com/apppasswords"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-sky-400 hover:underline flex items-center gap-1 font-sans"
                  >
                    Generate App Password <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </label>
                <input
                  type="password"
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  placeholder="16-character app password (e.g. abcd efgh ijkl mnop)"
                  className="w-full text-xs font-mono bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-mono text-zinc-400 mb-1">Sender Name</label>
                <input
                  type="text"
                  value={smtpSenderName}
                  onChange={(e) => setSmtpSenderName(e.target.value)}
                  placeholder="SkyOps Alerts"
                  className="w-full text-xs font-mono bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-zinc-400 mb-1">Sender Email</label>
                <input
                  type="email"
                  value={smtpSenderEmail}
                  onChange={(e) => setSmtpSenderEmail(e.target.value)}
                  placeholder="skyopsnetes2000@gmail.com"
                  className="w-full text-xs font-mono bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-zinc-400 mb-1">Reply-To Address</label>
                <input
                  type="email"
                  value={smtpReplyTo}
                  onChange={(e) => setSmtpReplyTo(e.target.value)}
                  placeholder="skyopsnetes2000@gmail.com"
                  className="w-full text-xs font-mono bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* Google App Password Callout */}
            <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/40 text-xs text-amber-200 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Google Gmail Users:</strong> Personal account passwords cannot be used for SMTP. Please create a 16-character App Password at{' '}
                <a
                  href="https://myaccount.google.com/apppasswords"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-300 underline font-mono"
                >
                  myaccount.google.com/apppasswords
                </a>{' '}
                with 2-Step Verification enabled.
              </div>
            </div>

            {/* Test and Save Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                disabled={verifyingSmtp || !smtpHost}
                onClick={handleVerifySmtp}
                className="text-xs font-mono px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${verifyingSmtp ? 'animate-spin' : ''}`} />
                {verifyingSmtp ? 'Testing Connection...' : 'Test SMTP Connection'}
              </button>

              <button
                type="button"
                disabled={saving || !smtpHost}
                onClick={handleSaveSmtp}
                className="text-xs font-mono px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-zinc-950 font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>

            {smtpResult && (
              <div
                className={`p-3 rounded-lg text-xs font-mono flex items-center gap-2 ${
                  smtpResult.success
                    ? 'bg-emerald-950/50 border border-emerald-800/60 text-emerald-300'
                    : 'bg-rose-950/50 border border-rose-800/60 text-rose-300'
                }`}
              >
                {smtpResult.success ? (
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                )}
                <span>{smtpResult.message}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Live Deliverability Test Dispatcher */}
      <div className="p-6 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <Send className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-100">
              Live Deliverability Diagnostic Test
            </h3>
            <p className="text-xs text-zinc-400">
              Dispatch a test incident notification to verify end-to-end inbox delivery and inspect anti-spam headers.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <input
            type="email"
            value={testRecipient}
            onChange={(e) => setTestRecipient(e.target.value)}
            placeholder="recipient@example.com"
            className="flex-1 text-xs font-mono bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-sky-500"
          />
          <button
            type="button"
            disabled={sendingTest || !testRecipient}
            onClick={() => handleSendTestAlert(testRecipient)}
            className="inline-flex items-center justify-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-500/40 font-mono transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5" />
            {sendingTest ? 'Sending Test...' : 'Send Test Alert'}
          </button>
        </div>

        {testResult && (
          <div
            className={`p-3.5 rounded-lg text-xs font-mono space-y-2 ${
              testResult.success
                ? 'bg-emerald-950/40 border border-emerald-800/60 text-emerald-300'
                : 'bg-rose-950/40 border border-rose-800/60 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              )}
              <span>{testResult.message}</span>
            </div>

            {testResult.success && (
              <div className="pt-2 border-t border-emerald-900/60 text-[11px] text-emerald-400/90 space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>RFC 8058 One-Click List-Unsubscribe Header: Applied</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Auto-Submitted: auto-generated (Bypasses vacation auto-responders &amp; spam traps)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>CAN-SPAM &amp; GDPR compliant postal address &amp; preferences link embedded</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Development Testing Email (Strictly DEV/TEST Only) */}
      {testingEmail && (
        <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-800/50 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <span className="text-xs font-semibold text-cyan-200 uppercase tracking-wider">
                Development Testing Email
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-900/60 text-cyan-300 border border-cyan-700/60">
                DEV ONLY
              </span>
            </div>

            <button
              type="button"
              disabled={sendingTest}
              onClick={() => handleSendTestAlert(testingEmail)}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 font-mono transition-colors disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {sendingTest ? 'Sending...' : 'Send Dev Test'}
            </button>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            Local testing email <code className="text-cyan-300 font-mono bg-cyan-950/80 px-1.5 py-0.5 rounded">{testingEmail}</code> allows validating notification templates locally without sending real outbound network emails.
          </p>
        </div>
      )}
    </div>
  );
};
