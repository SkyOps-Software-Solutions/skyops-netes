import React, { useState, useRef, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Layers,
  Radio,
  RefreshCw,
  Send,
  Server,
  Shield,
  Sparkles,
  Terminal,
  User,
  Zap
} from 'lucide-react';
import { api } from '../../api/client';
import { Cluster, Incident } from '../../types/index';

interface SkyOpsAICopilotViewProps {
  clusters: Cluster[];
  incidents: Incident[];
  onSelectIncident?: (id: string) => void;
  onSelectCluster?: (id: string) => void;
  initialPrompt?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  suggestedCommands?: string[];
  suggestedActions?: Array<{ label: string; action: string; risk: 'LOW' | 'MEDIUM' | 'HIGH' }>;
  relatedIncidents?: Incident[];
}

export const SkyOpsAICopilotView: React.FC<SkyOpsAICopilotViewProps> = ({
  clusters = [],
  incidents = [],
  onSelectIncident,
  onSelectCluster,
  initialPrompt
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `### Welcome to SkyOps AI Operations Copilot
I am your autonomous Kubernetes Site Reliability Engineering assistant. I have live, grounded context on your **${clusters.length} connected cluster(s)** and **${incidents.filter((i) => i.status === 'OPEN').length} active incident(s)**.

Ask me to diagnose cluster anomalies, explain root causes, recommend exact \`kubectl\` diagnostic commands, or evaluate remediation blast radius.`,
      timestamp: Date.now(),
      suggestedCommands: ['kubectl get pods -A --field-selector=status.phase!=Running', 'kubectl top nodes']
    }
  ]);
  const [inputQuery, setInputQuery] = useState(initialPrompt || '');
  const [selectedClusterId, setSelectedClusterId] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // If initialPrompt is passed, run it automatically once
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      handleSend(initialPrompt);
    }
  }, [initialPrompt]);

  const handleCopyCommand = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText || inputQuery;
    if (!textToSend.trim() || loading) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: textToSend.trim(),
      timestamp: Date.now()
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!queryText) setInputQuery('');
    setLoading(true);

    try {
      const history = messages
        .filter((m) => m.id !== 'welcome')
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await api.askCopilot({
        query: userMessage.content,
        clusterId: selectedClusterId !== 'all' ? selectedClusterId : undefined,
        conversationHistory: history
      });

      const assistantMessage: Message = {
        id: `reply-${Date.now()}`,
        role: 'assistant',
        content: response.reply,
        timestamp: Date.now(),
        suggestedCommands: response.suggestedCommands,
        suggestedActions: response.suggestedActions,
        relatedIncidents: response.relatedIncidents
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      console.warn('Copilot error:', err);
      const errorMessage: Message = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `**Operational Notice**: Unable to reach AI copilot service: ${err?.message || 'Check cluster connection'}. Please retry.`,
        timestamp: Date.now()
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const operationalPrompts = [
    'Assess cluster health & stability across all workloads',
    'Explain root cause for open incidents and blast radius',
    'Find pods in CrashLoopBackOff or high restart count',
    'Evaluate node memory and disk pressure'
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto h-[calc(100vh-5rem)] flex flex-col">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shadow-sm">
            <Sparkles className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              SkyOps AI Operations Copilot
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Gemini 3.8 Flash
              </span>
            </h1>
            <p className="text-xs text-zinc-400">
              Context-aware autonomous SRE grounded in live Kubernetes telemetry
            </p>
          </div>
        </div>

        {/* Cluster Context Picker */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400 font-mono">Context:</span>
          <select
            value={selectedClusterId}
            onChange={(e) => setSelectedClusterId(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
          >
            <option value="all">All Clusters ({clusters.length})</option>
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-lg bg-sky-600/20 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0 mt-1">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-2xl rounded-xl p-4 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-sky-600 text-white shadow-md'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-200 shadow-sm'
              }`}
            >
              {/* Message Body */}
              <div className="whitespace-pre-wrap font-sans space-y-2">
                {msg.content}
              </div>

              {/* Suggested Kubectl Commands Block */}
              {msg.suggestedCommands && msg.suggestedCommands.length > 0 && (
                <div className="mt-3 pt-3 border-t border-zinc-800/80 space-y-2">
                  <div className="text-[10px] font-mono uppercase text-zinc-400 flex items-center gap-1">
                    <Terminal className="w-3 h-3 text-sky-400" />
                    Recommended kubectl Commands
                  </div>
                  {msg.suggestedCommands.map((cmd, i) => (
                    <div
                      key={i}
                      className="bg-zinc-950 p-2 rounded-md border border-zinc-800 font-mono text-[11px] text-zinc-300 flex items-center justify-between gap-2"
                    >
                      <code className="truncate">{cmd}</code>
                      <button
                        onClick={() => handleCopyCommand(cmd, `cmd-${msg.id}-${i}`)}
                        className="text-zinc-500 hover:text-zinc-200 p-1 rounded transition-colors cursor-pointer shrink-0"
                        title="Copy command"
                      >
                        {copiedIndex === `cmd-${msg.id}-${i}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Related Incidents */}
              {msg.relatedIncidents && msg.relatedIncidents.length > 0 && (
                <div className="mt-3 pt-3 border-t border-zinc-800/80 space-y-1.5">
                  <div className="text-[10px] font-mono uppercase text-zinc-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    Related Open Incidents
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {msg.relatedIncidents.map((inc) => (
                      <button
                        key={inc.id}
                        onClick={() => onSelectIncident && onSelectIncident(inc.id)}
                        className="px-2 py-1 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded text-[11px] font-mono text-zinc-300 flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <span className="text-amber-400">[{inc.severity}]</span>
                        <span className="truncate max-w-[150px]">{inc.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 shrink-0 mt-1">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 justify-start items-center">
            <div className="w-7 h-7 rounded-lg bg-sky-600/20 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
              <Sparkles className="w-4 h-4 animate-spin" />
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-400 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
              SkyOps AI is synthesizing live telemetry and diagnosing infrastructure...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Operational Quick Prompts */}
      <div className="py-2 flex flex-wrap gap-1.5 shrink-0">
        {operationalPrompts.map((p, i) => (
          <button
            key={i}
            onClick={() => handleSend(p)}
            className="px-2.5 py-1 text-[11px] rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer truncate max-w-xs"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input Bar */}
      <div className="pt-2 border-t border-zinc-800 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder="Ask SkyOps Copilot (e.g. 'Why is billing-service in CrashLoopBackOff?')..."
            disabled={loading}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-sky-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!inputQuery.trim() || loading}
            className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 shadow-md"
          >
            <Send className="w-3.5 h-3.5" />
            Send
          </button>
        </form>
      </div>
    </div>
  );
};
