import {
  ChangeCorrelation,
  CorrelatedSignal,
  DetectedAnomaly,
  TemporalEvent,
  TimelinePhase
} from './types';
import { Incident, KubernetesResource } from '../../src/types/index';

/**
 * Temporal Intelligence & Phase Partitioning Engine
 *
 * Partitions incident timeline events into three explicit chronological phases:
 *  - BEFORE: Antecedent baseline telemetry, deployment changes, configuration edits
 *  - DURING: Detection, failure signals, anomalies, crash loops, degraded states
 *  - AFTER: Remediation actions, container restarts, recovery verifications
 */
export class TemporalEngine {
  /**
   * Constructs the full partitioned timeline for an incident.
   */
  public static partitionTimeline(params: {
    incident: Incident;
    targetResource?: KubernetesResource | null;
    allResources?: KubernetesResource[];
    signals?: CorrelatedSignal[];
    anomalies?: DetectedAnomaly[];
    changes?: ChangeCorrelation[];
    now?: number;
  }): {
    before: TemporalEvent[];
    during: TemporalEvent[];
    after: TemporalEvent[];
    allChronological: TemporalEvent[];
  } {
    const {
      incident,
      targetResource,
      allResources = [],
      signals = [],
      anomalies = [],
      changes = [],
      now = Date.now()
    } = params;

    const rawEvents: TemporalEvent[] = [];
    const firstSeen = incident.firstSeenAt;
    const resolvedAt = incident.resolvedAt;

    // Helper to determine phase
    const determinePhase = (ts: number): TimelinePhase => {
      if (ts < firstSeen) return 'BEFORE';
      if (resolvedAt && ts > resolvedAt) return 'AFTER';
      return 'DURING';
    };

    // 1. Target Resource Kubernetes Events
    if (targetResource?.events && targetResource.events.length > 0) {
      for (let i = 0; i < targetResource.events.length; i++) {
        const e = targetResource.events[i];
        const ts = e.timestamp || targetResource.createdAt || firstSeen;
        rawEvents.push({
          id: `ev-k8s-${i}-${e.reason}-${ts}`,
          timestamp: ts,
          phase: determinePhase(ts),
          title: `${e.reason} (${e.type || 'Warning'})`,
          category: 'FACT',
          description: e.message,
          source: 'kubelet',
          resourceKind: targetResource.kind,
          resourceName: targetResource.name,
          relevanceScore: e.type === 'Warning' ? 5 : 2
        });
      }
    }

    // 2. Scheduled Node Events (if applicable)
    const nodeName = targetResource?.specSummary?.nodeName || (targetResource as any)?.nodeName;
    if (nodeName) {
      const node = allResources.find((r) => r.kind === 'Node' && r.name.toLowerCase() === String(nodeName).toLowerCase());
      if (node?.events) {
        for (let i = 0; i < node.events.length; i++) {
          const ne = node.events[i];
          const ts = ne.timestamp || firstSeen;
          if (ne.type === 'Warning' || ne.reason === 'NodeNotReady' || ne.reason === 'EvictionThresholdMet') {
            rawEvents.push({
              id: `ev-node-${i}-${ne.reason}-${ts}`,
              timestamp: ts,
              phase: determinePhase(ts),
              title: `Host Node ${nodeName}: ${ne.reason}`,
              category: 'FACT',
              description: ne.message,
              source: 'kubelet-node',
              resourceKind: 'Node',
              resourceName: nodeName,
              relevanceScore: 4
            });
          }
        }
      }
    }

    // 3. Correlated Changes (Antecedent and Concurrent)
    for (const corr of changes) {
      const chg = corr.change;
      rawEvents.push({
        id: `ev-change-${chg.id}`,
        timestamp: chg.timestamp,
        phase: determinePhase(chg.timestamp),
        title: `Change: ${chg.changeType} on ${chg.resourceKind}/${chg.resourceName}`,
        category: 'FACT',
        description: `${chg.description} (${corr.temporalProximityDisplay})`,
        source: 'change-tracker',
        resourceKind: chg.resourceKind,
        resourceName: chg.resourceName,
        relevanceScore: corr.correlationStrength === 'STRONG' ? 5 : 3,
        changeRef: chg.id
      });
    }

    // 4. Detected Anomalies
    for (const anom of anomalies) {
      rawEvents.push({
        id: `ev-anom-${anom.id}`,
        timestamp: anom.firstObservedAt,
        phase: determinePhase(anom.firstObservedAt),
        title: `Anomaly: ${anom.anomalyType} (${anom.severity})`,
        category: 'DERIVED_FACT',
        description: anom.details || `${anom.observedDisplay} - ${anom.deviationDisplay}`,
        source: 'anomaly-detector',
        resourceKind: anom.resourceKind,
        resourceName: anom.resourceName,
        relevanceScore: anom.severity === 'CRITICAL' ? 5 : 4,
        anomalyRef: anom.id
      });
    }

    // 5. Incident Lifecycle Landmarks
    // 5a. Initial Detection
    rawEvents.push({
      id: `ev-incident-detection-${incident.id}`,
      timestamp: firstSeen,
      phase: 'DURING',
      title: `Incident Triggered: ${incident.title}`,
      category: 'FACT',
      description: `Failure detected on ${incident.resourceKind}/${incident.resourceName} in namespace "${incident.namespace}"`,
      source: 'detector',
      resourceKind: incident.resourceKind,
      resourceName: incident.resourceName,
      relevanceScore: 5
    });

    // 5b. Resolution (if resolved)
    if (resolvedAt) {
      rawEvents.push({
        id: `ev-incident-resolved-${incident.id}`,
        timestamp: resolvedAt,
        phase: 'AFTER',
        title: `Incident Resolved (${incident.resolutionSource || 'AUTOMATIC_VERIFIED'})`,
        category: 'VERIFIED_RESULT',
        description: incident.resolution?.reason || 'Failure condition cleared and verified by telemetry',
        source: 'engine',
        resourceKind: incident.resourceKind,
        resourceName: incident.resourceName,
        relevanceScore: 5
      });
    }

    // 6. High-weight Signals
    for (const sig of signals) {
      if (sig.weight && sig.weight >= 4) {
        rawEvents.push({
          id: `ev-sig-${sig.id}`,
          timestamp: sig.timestamp,
          phase: determinePhase(sig.timestamp),
          title: sig.property,
          category: sig.category,
          description: sig.description,
          source: sig.source,
          resourceKind: sig.resourceKind,
          resourceName: sig.resourceName,
          relevanceScore: sig.weight
        });
      }
    }

    // Deduplicate identical events by timestamp and title
    const seen = new Set<string>();
    const deduplicated: TemporalEvent[] = [];
    for (const ev of rawEvents) {
      const key = `${ev.timestamp}-${ev.title}-${ev.resourceName}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(ev);
      }
    }

    // Sort chronologically ascending
    deduplicated.sort((a, b) => a.timestamp - b.timestamp);

    const before = deduplicated.filter((e) => e.phase === 'BEFORE');
    const during = deduplicated.filter((e) => e.phase === 'DURING');
    const after = deduplicated.filter((e) => e.phase === 'AFTER');

    return {
      before,
      during,
      after,
      allChronological: deduplicated
    };
  }
}
