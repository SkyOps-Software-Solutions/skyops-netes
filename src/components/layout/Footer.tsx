import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Cpu,
  Database,
  ExternalLink,
  FileText,
  HelpCircle,
  Key,
  Layers,
  Lock,
  Mail,
  Network,
  Radio,
  Server,
  Shield,
  ShieldCheck,
  Terminal,
  Zap,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import React, { useState } from 'react';
import { DocTopic } from '../docs/KnowledgeBaseModal';
import { NavigationTab } from './Sidebar';
import { BrandLogo } from '../common/BrandLogo';

export interface FooterProps {
  /**
   * If provided, allows direct navigation between application console tabs.
   */
  onNavigateTab?: (tab: NavigationTab) => void;
  /**
   * Triggers the "Add Cluster" onboarding workflow.
   */
  onOpenAddCluster?: () => void;
  /**
   * Opens the SkyOps Technical Reference & Knowledge Base to a specific verified article.
   */
  onOpenDoc: (topic: DocTopic) => void;
  /**
   * Authentication / Getting Started callback.
   */
  onGetStarted?: () => void;
  /**
   * Optional custom container class.
   */
  className?: string;
  /**
   * Whether the user is currently authenticated in the app console.
   */
  isAuthenticated?: boolean;
  /**
   * Whether the footer starts minimized in compact mode.
   */
  defaultMinimized?: boolean;
}

export const Footer: React.FC<FooterProps> = ({
  onNavigateTab,
  onOpenAddCluster,
  onOpenDoc,
  onGetStarted,
  className = '',
  isAuthenticated = false,
  defaultMinimized = false
}) => {
  const [isMinimized, setIsMinimized] = useState<boolean>(() => {
    if (defaultMinimized) return true;
    try {
      const saved = localStorage.getItem('skyops_footer_minimized');
      if (saved !== null) return saved === 'true';
    } catch {
      // safe fallback
    }
    return false;
  });

  const toggleMinimized = () => {
    setIsMinimized((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('skyops_footer_minimized', String(next));
      } catch {
        // safe fallback
      }
      return next;
    });
  };

  // Handler for product navigation
  const handleProductClick = (tab: NavigationTab, fallbackTopic?: DocTopic) => {
    if (isAuthenticated && onNavigateTab) {
      onNavigateTab(tab);
    } else if (onGetStarted) {
      onGetStarted();
    } else if (fallbackTopic) {
      onOpenDoc(fallbackTopic);
    }
  };

  const handleConnectClusterClick = () => {
    if (isAuthenticated && onOpenAddCluster) {
      onOpenAddCluster();
    } else {
      onOpenDoc('connect-cluster');
    }
  };

  return (
    <footer
      id="skyops-main-footer"
      className={`border-t border-zinc-800/80 bg-zinc-950 text-zinc-300 font-sans selection:bg-sky-500/30 selection:text-sky-200 relative overflow-hidden shrink-0 ${className}`}
    >
      {/* Ambient Cosmic Diffusion Glow (Drifts gently in background without fading text) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 rounded-full bg-sky-500/10 blur-3xl footer-cosmic-drift"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl footer-cosmic-drift"
      />

      {isMinimized ? (
        /* Compact Minimized Strip - Prevents any footer obstruction */
        <div className="relative z-10 max-w-7xl mx-auto px-6 py-2.5 flex items-center justify-between gap-4 text-xs font-mono">
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo
              size="sm"
              showText
              version="v1.5.1"
              subtitle="Kubernetes Incident Management Platform"
            />
            <span className="text-zinc-600 hidden md:inline">·</span>
            <span className="text-zinc-400 hidden md:inline truncate">
              Built for Kubernetes operations
            </span>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <a
              id="footer-minimized-support-link"
              href="mailto:skyopsnetes2000@gmail.com"
              className="text-zinc-400 hover:text-sky-300 transition-colors text-[11px] hidden sm:inline"
            >
              Support: skyopsnetes2000@gmail.com
            </a>
            <span className="text-zinc-600 hidden sm:inline">© 2026 SkyOps</span>
            <button
              id="footer-collapse-btn"
              type="button"
              onClick={toggleMinimized}
              className="px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 text-sky-400 border border-zinc-800 hover:border-sky-500 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-medium"
              title="Expand full SkyOps directory and documentation"
            >
              <span>Directory</span>
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 pt-8 pb-10">
          {/* Top Directory Header with Minimize Action */}
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4 mb-8">
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              <span className="font-semibold text-zinc-300">SkyOps Operational Platform & Knowledge Directory</span>
            </div>
            <button
              id="footer-collapse-btn"
              type="button"
              onClick={toggleMinimized}
              className="text-xs font-mono text-zinc-400 hover:text-white px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer flex items-center gap-1.5"
              title="Minimize footer to save screen space"
            >
              <span>Minimize Footer</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Main 5-Column Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8 mb-12">
          {/* Column 1: Brand & Identity */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <BrandLogo
                size="lg"
                showText
                version="v1.5.1"
                subtitle="Kubernetes Incident Management Platform"
                className="rounded-lg shadow-sm"
              />
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed max-w-sm">
              Observe, investigate, and safely operate Kubernetes environments with evidence-driven intelligence.
            </p>

            {/* Customer-Oriented Helpful CTA Block */}
            <div className="pt-2">
              <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/80 p-4 space-y-2.5 max-w-sm">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-zinc-200">
                  <Terminal className="w-3.5 h-3.5 text-sky-400" />
                  Need help connecting your cluster?
                </div>
                <p className="text-[11px] text-zinc-400 leading-normal">
                  Follow the quickstart guide or contact SkyOps support.
                </p>
                <div className="pt-1 flex items-center gap-3">
                  <button
                    id="footer-cta-quickstart-btn"
                    onClick={() => {
                      if (isAuthenticated && onOpenAddCluster) {
                        onOpenAddCluster();
                      } else if (onGetStarted) {
                        onGetStarted();
                      } else {
                        onOpenDoc('quickstart');
                      }
                    }}
                    className="text-xs font-mono font-bold text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 transition-colors cursor-pointer group"
                  >
                    <span>Get Started</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                  <span className="text-zinc-700">•</span>
                  <a
                    id="footer-cta-email-link"
                    href="mailto:skyopsnetes2000@gmail.com"
                    className="text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    Ask Support
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Product (7 Core Production Pages) */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
              Platform
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  id="footer-product-command-center"
                  onClick={() => handleProductClick('overview', 'quickstart')}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer text-left"
                >
                  Overview Dashboard
                </button>
              </li>
              <li>
                <button
                  id="footer-product-clusters"
                  onClick={() => handleProductClick('clusters', 'connect-cluster')}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer text-left"
                >
                  Clusters & Fleet
                </button>
              </li>
              <li>
                <button
                  id="footer-product-infrastructure"
                  onClick={() => handleProductClick('infrastructure', 'agent-guide')}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer text-left"
                >
                  Infrastructure Explorer
                </button>
              </li>
              <li>
                <button
                  id="footer-product-incidents"
                  onClick={() => handleProductClick('incidents', 'incidents')}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer text-left"
                >
                  Incidents & Auto-Healing
                </button>
              </li>
              <li>
                <button
                  id="footer-product-observability"
                  onClick={() => handleProductClick('observability', 'metrics')}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer text-left"
                >
                  Observability (Metrics, Logs & Events)
                </button>
              </li>
              <li>
                <button
                  id="footer-product-audit"
                  onClick={() => handleProductClick('audit', 'rbac')}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer text-left"
                >
                  Activity Log
                </button>
              </li>
              <li>
                <button
                  id="footer-product-settings"
                  onClick={() => handleProductClick('settings', 'architecture')}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer text-left"
                >
                  Workspace Settings
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: Learn / Get Started (Answers Questions 2-7, 9) */}
          <div className="space-y-3">
            <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-200">
              Get Started
            </h4>
            <ul className="space-y-2 text-xs font-mono">
              <li>
                <button
                  id="footer-learn-getting-started"
                  onClick={() => onOpenDoc('quickstart')}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer text-left"
                >
                  Getting Started
                </button>
              </li>
              <li>
                <button
                  id="footer-learn-connect-cluster"
                  onClick={handleConnectClusterClick}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer text-left"
                >
                  Connect Cluster
                </button>
              </li>
              <li>
                <button
                  id="footer-learn-agent-guide"
                  onClick={() => onOpenDoc('agent-guide')}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer text-left"
                >
                  Agent Guide
                </button>
              </li>
              <li>
                <button
                  id="footer-learn-metrics"
                  onClick={() => onOpenDoc('metrics')}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer text-left"
                >
                  Metrics
                </button>
              </li>
              <li>
                <button
                  id="footer-learn-logs"
                  onClick={() => onOpenDoc('logs')}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer text-left"
                >
                  Logs
                </button>
              </li>
              <li>
                <button
                  id="footer-learn-events"
                  onClick={() => onOpenDoc('events')}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer text-left"
                >
                  Events
                </button>
              </li>
              <li>
                <button
                  id="footer-learn-incident-intelligence"
                  onClick={() => onOpenDoc('incidents')}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer text-left"
                >
                  Incident Intelligence
                </button>
              </li>
              <li>
                <button
                  id="footer-learn-troubleshooting"
                  onClick={() => onOpenDoc('troubleshooting')}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer text-left"
                >
                  Troubleshooting
                </button>
              </li>
            </ul>
          </div>

          {/* Column 4: Security & Support */}
          <div className="space-y-6">
            {/* Security Sub-group (Real documented architecture only) */}
            <div className="space-y-3">
              <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-200">
                Security
              </h4>
              <ul className="space-y-2 text-xs font-mono">
                <li>
                  <button
                    id="footer-security-model"
                    onClick={() => onOpenDoc('security-model')}
                    className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer text-left"
                  >
                    Security Model
                  </button>
                </li>
                <li>
                  <button
                    id="footer-security-architecture"
                    onClick={() => onOpenDoc('architecture')}
                    className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer text-left"
                  >
                    Architecture
                  </button>
                </li>
                <li>
                  <button
                    id="footer-security-rbac"
                    onClick={() => onOpenDoc('rbac')}
                    className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer text-left"
                  >
                    {'RBAC & Tenant Isolation'}
                  </button>
                </li>
                <li>
                  <button
                    id="footer-security-persistence"
                    onClick={() => onOpenDoc('persistence')}
                    className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer text-left"
                  >
                    {'Data & Persistence'}
                  </button>
                </li>
                <li>
                  <button
                    id="footer-security-api-reference"
                    onClick={() => onOpenDoc('api-reference')}
                    className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer text-left"
                  >
                    API Reference
                  </button>
                </li>
              </ul>
            </div>

            {/* Support Sub-group (Single Official Email) */}
            <div className="space-y-2.5 pt-2 border-t border-zinc-800/80">
              <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-200">
                Support
              </h4>
              <ul className="space-y-2 text-xs font-mono">
                <li>
                  <button
                    id="footer-support-troubleshooting"
                    onClick={() => onOpenDoc('troubleshooting')}
                    className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer text-left"
                  >
                    Troubleshooting
                  </button>
                </li>
                <li>
                  <button
                    id="footer-support-contact"
                    onClick={() => onOpenDoc('support')}
                    className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer text-left"
                  >
                    Contact Support
                  </button>
                </li>
                <li className="pt-1">
                  <a
                    id="footer-support-email-link"
                    href="mailto:skyopsnetes2000@gmail.com"
                    className="text-sky-400 hover:text-sky-300 transition-colors break-all flex items-center gap-1.5"
                  >
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <span>skyopsnetes2000@gmail.com</span>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom Sub-footer */}
        <div className="pt-8 border-t border-zinc-800/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-zinc-500">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-zinc-400">Built for Kubernetes operations</span>
          </div>

          <div className="flex items-center gap-6">
            <button
              onClick={() => onOpenDoc('security-model')}
              className="hover:text-zinc-300 transition-colors cursor-pointer"
            >
              Zero Inbound Ports
            </button>
            <button
              onClick={() => onOpenDoc('api-reference')}
              className="hover:text-zinc-300 transition-colors cursor-pointer"
            >
              REST v1 API
            </button>
            <span className="text-zinc-600">© 2026 SkyOps</span>
          </div>
        </div>
      </div>
      )}
    </footer>
  );
};
