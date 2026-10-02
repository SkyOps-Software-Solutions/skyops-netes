import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  History,
  Repeat,
  ShieldCheck,
  Sparkles,
  Wrench
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Incident, SimilarIncidentSummary } from '../../types/index';
import { formatTimeAgo } from '../../utils/date';

interface SimilarIncidentsSectionProps {
  incident: Incident;
  onSelectIncident?: (incidentId: string) => void;
}

export const SimilarIncidentsSection: React.FC<SimilarIncidentsSectionProps> = ({
  incident,
  onSelectIncident
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [similar, setSimilar] = useState<SimilarIncidentSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSimilar = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await api.getSimilarIncidents(incident.id);
        setSimilar(res.similarIncidents || []);
      } catch (err: any) {
        console.warn('Failed to fetch similar incidents:', err);
        setError(err?.message || 'Failed to query historical incidents');
      } finally {
        setLoading(false);
      }
    };

    fetchSimilar();
  }, [incident.id]);

  const recurringCount = incident.occurrenceCount || 1;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <History className="w-4 h-4 text-purple-400" />
              Similar Past Incidents & Historical Precedents
            </h3>
            {recurringCount > 1 && (
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1">
                <Repeat className="w-3 h-3" />
                {recurringCount} Occurrences
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Historical pattern matching across cluster fingerprints to surface proven previous resolutions.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-6 flex items-center justify-center text-xs text-zinc-500 gap-2">
          <Clock className="w-4 h-4 animate-spin text-purple-400" />
          <span>Searching incident knowledge graph...</span>
        </div>
      ) : error ? (
        <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300">
          {error}
        </div>
      ) : similar.length === 0 ? (
        <div className="p-4 rounded-xl border border-dashed border-zinc-800/80 bg-zinc-900/20 text-center">
          <Sparkles className="w-5 h-5 text-zinc-500 mx-auto mb-1.5" />
          <h4 className="text-xs font-semibold text-zinc-300">First-Time Observed Outage Pattern</h4>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            No previous incidents with matching fingerprint or error signature found in recent cluster history.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {similar.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:border-zinc-700/80 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-white hover:text-purple-400 transition-colors cursor-pointer"
                    onClick={() => onSelectIncident && onSelectIncident(item.id)}
                  >
                    {item.id}
                  </span>
                  <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                    {item.incidentType}
                  </span>
                  <span className="text-zinc-500">
                    {item.daysAgo === 1 ? '1 day ago' : `${item.daysAgo} days ago`} ({formatTimeAgo(item.firstSeenAt)})
                  </span>
                </div>

                <div className="font-medium text-zinc-300 text-xs">{item.title}</div>

                <div className="text-[11px] text-purple-400/90 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                  <span>Pattern: {item.similarityReason}</span>
                </div>
              </div>

              {/* Previous Resolution */}
              <div className="bg-zinc-950 border border-zinc-800/80 rounded-lg p-2.5 min-w-[240px] space-y-1">
                <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase font-semibold">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    Previous Resolution
                  </span>
                  <span className="font-mono text-zinc-400">{item.status}</span>
                </div>

                <div className="text-xs text-white font-medium flex items-center gap-1.5">
                  <Wrench className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span className="truncate">{item.resolutionSummary || 'Remediated successfully'}</span>
                </div>

                {item.resolutionSource === 'AUTOMATIC_VERIFIED' && (
                  <div className="text-[10px] font-bold text-emerald-400 tracking-wider uppercase">
                    AUTO-HEALED & VERIFIED
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
