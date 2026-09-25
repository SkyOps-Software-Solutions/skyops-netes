import React, { useState } from 'react';
import {
  Mail,
  Send,
  Building2,
  Clock,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  MessageSquare,
  HelpCircle,
  CreditCard,
  FileText
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../common/UI';
import {
  SKYOPS_CONTACT_EMAIL,
  getEnterpriseMailtoUrl,
  getSupportMailtoUrl
} from '../../config/contact';

export const ContactManager: React.FC = () => {
  const { currentOrg, user, role } = useAuth();
  const [topic, setTopic] = useState<'sales' | 'support' | 'billing' | 'general'>('support');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const handleLaunchEmailClient = (e: React.FormEvent) => {
    e.preventDefault();

    if (topic === 'sales') {
      const url = getEnterpriseMailtoUrl({
        organization: currentOrg?.name,
        currentPlan: 'Current Workspace Tier',
        requestedCapacity: subject ? `${subject} - ${message}` : message
      });
      window.location.href = url;
      return;
    }

    const fullSubject = subject.trim() || `SkyOps ${topic.toUpperCase()} Inquiry - ${currentOrg?.name || 'Workspace'}`;
    const fullBody = `Organization: ${currentOrg?.name || 'N/A'} (ID: ${currentOrg?.id || 'N/A'})\nUser: ${user?.name || 'Engineer'} (${user?.email || 'N/A'})\nTopic: ${topic}\n\nMessage:\n${message}\n`;
    const mailto = getSupportMailtoUrl(fullSubject, fullBody);
    window.location.href = mailto;
  };

  const channels = [
    {
      title: 'Customer Support & Helpdesk',
      email: SKYOPS_CONTACT_EMAIL,
      icon: <HelpCircle className="w-4 h-4 text-sky-400" />,
      description: 'Technical troubleshooting, Kubernetes agent connectivity, telemetry ingestion and RCA diagnostics.',
      actionLabel: 'Email Support',
      onClick: () => {
        window.location.href = getSupportMailtoUrl(`Support Request - ${currentOrg?.name || 'Workspace'}`);
      }
    },
    {
      title: 'Enterprise & Sales Inquiries',
      email: SKYOPS_CONTACT_EMAIL,
      icon: <Sparkles className="w-4 h-4 text-amber-400" />,
      description: 'Custom cluster volumes, private VPC peering, bespoke SLAs, and enterprise procurement terms.',
      actionLabel: 'Contact Sales',
      onClick: () => {
        window.location.href = getEnterpriseMailtoUrl({ organization: currentOrg?.name });
      }
    },
    {
      title: 'Billing & Invoice Enquiries',
      email: SKYOPS_CONTACT_EMAIL,
      icon: <CreditCard className="w-4 h-4 text-emerald-400" />,
      description: 'Tax invoices, GST compliance receipts, Razorpay payment settlements, and subscription adjustments.',
      actionLabel: 'Billing Enquiry',
      onClick: () => {
        window.location.href = getSupportMailtoUrl(`Billing & Invoice Inquiry - ${currentOrg?.name || 'Workspace'}`);
      }
    }
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header Banner */}
      <div className="p-6 rounded-xl bg-gradient-to-r from-zinc-950 via-zinc-900 to-sky-950/20 border border-zinc-800 space-y-3 font-mono">
        <div className="flex items-center gap-2 text-sky-400 text-xs font-semibold uppercase tracking-wider">
          <Mail className="w-4 h-4" /> Official Communication Channel
        </div>
        <h2 className="text-xl font-bold text-white tracking-tight font-sans">
          Contact SkyOps Autonomous Systems
        </h2>
        <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
          The SkyOps reliability and engineering team is directly reachable for product support, billing reviews,
          and enterprise fleet evaluations through our official inbox:
        </p>
        <div className="pt-1 flex items-center gap-3">
          <a
            href={`mailto:${SKYOPS_CONTACT_EMAIL}`}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-sky-950 border border-sky-700/60 text-sky-300 font-bold text-sm hover:bg-sky-900/50 transition-colors"
          >
            <Mail className="w-4 h-4 text-sky-400" />
            <span>{SKYOPS_CONTACT_EMAIL}</span>
          </a>
        </div>
      </div>

      {/* Channel Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
        {channels.map((ch, idx) => (
          <div
            key={idx}
            className="p-5 rounded-xl bg-zinc-950 border border-zinc-800/80 flex flex-col justify-between space-y-4 hover:border-zinc-700 transition-colors"
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-bold text-zinc-200">
                {ch.icon}
                <span>{ch.title}</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">{ch.description}</p>
              <div className="pt-1 text-[11px] text-sky-400 font-semibold">{ch.email}</div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={ch.onClick}
              icon={<ExternalLink className="w-3.5 h-3.5" />}
              className="w-full justify-center text-xs font-mono"
            >
              {ch.actionLabel}
            </Button>
          </div>
        ))}
      </div>

      {/* Direct Compose Form */}
      <div className="p-6 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-4 font-mono text-xs">
        <div className="border-b border-zinc-800/80 pb-3">
          <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-sky-400" />
            Draft Message to SkyOps Team
          </h3>
          <p className="text-[11px] text-zinc-400 mt-1">
            Construct your request with your current workspace context and launch your system email client.
          </p>
        </div>

        <form onSubmit={handleLaunchEmailClient} className="space-y-4 max-w-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-zinc-400 block mb-1 text-[11px] uppercase">Enquiry Topic</label>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value as any)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-sky-500"
              >
                <option value="support">Customer Support & Technical Help</option>
                <option value="sales">Enterprise Inquiry & Custom SLA</option>
                <option value="billing">Billing, Pricing & Invoices</option>
                <option value="general">General Feedback & Inquiries</option>
              </select>
            </div>

            <div>
              <label className="text-zinc-400 block mb-1 text-[11px] uppercase">Organization Context</label>
              <input
                type="text"
                disabled
                value={`${currentOrg?.name || 'Workspace'} (${currentOrg?.id?.substring(0, 12)}...)`}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-zinc-400 opacity-80"
              />
            </div>
          </div>

          <div>
            <label className="text-zinc-400 block mb-1 text-[11px] uppercase">Subject Line</label>
            <input
              type="text"
              required
              placeholder="Brief summary of your question or fleet requirements..."
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="text-zinc-400 block mb-1 text-[11px] uppercase">Message Details</label>
            <textarea
              required
              rows={4}
              placeholder="Provide relevant details such as affected cluster, error output, or requested capacity..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-sky-500 resize-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-zinc-800/80">
            <span className="text-[11px] text-zinc-500">
              Recipient: <strong className="text-zinc-400">{SKYOPS_CONTACT_EMAIL}</strong>
            </span>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              icon={<Send className="w-3.5 h-3.5" />}
              className="bg-sky-600 hover:bg-sky-500 text-xs font-mono"
            >
              Open in Email Client
            </Button>
          </div>
        </form>
      </div>

      {/* Office & Operating Details */}
      <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-mono text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-zinc-500 shrink-0" />
          <span>SkyOps Autonomous Systems • Bengaluru, Karnataka, India</span>
        </div>
        <div className="flex items-center gap-2 text-zinc-400">
          <Clock className="w-4 h-4 text-zinc-500 shrink-0" />
          <span>Support Coverage: Monday – Friday (24x7 for Enterprise SLA)</span>
        </div>
      </div>
    </div>
  );
};
