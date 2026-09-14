import {
  ChangeCorrelation,
  CorrelatedSignal,
  DetectedAnomaly,
  HistoricalBaseline,
  ResourceRelationship,
  UnifiedEvidence
} from './types';
import { Incident, KubernetesResource } from '../../src/types/index';

/**
 * Unified Evidence Model & Aggregation Engine
 *
 * Compiles all verified cluster facts, anomalies, changes, and telemetry into
 * a single structured evidence inventory with rigorous provenance, relevance ratings,
 * and explicit tracking of missing or unavailable operational signals.
 */
export class EvidenceEngine {
  /**
   * Builds the comprehensive UnifiedEvidence inventory for an incident investigation.
   */
  public static buildUnifiedEvidence(params: {
    incident: Incident;
    targetResource?: KubernetesResource | null;
    relationships: ResourceRelationship[];
    signals: CorrelatedSignal[];
    anomalies: DetectedAnomaly[];
    changes: ChangeCorrelation[];
    baselines: HistoricalBaseline[];
    metrics?: {
      isUsageAvailable?: boolean;
      unavailableReason?: string;
    };
  }): {
    evidenceList: UnifiedEvidence[];
    missingEvidence: string[];
    unknownFactors: string[];
  } {
    const {
      incident,
      targetResource,
      relationships,
      signals,
      anomalies,
      changes,
      baselines,
      metrics
    } = params;

    const evidenceList: UnifiedEvidence[] = [];
    const missingEvidence: string[] = [];
    const unknownFactors: string[] = [];
    const now = Date.now();
    const tech = incident.technicalDetails || {};

    // 1. Core Resource State Evidence (Container exit codes, state reasons)
    if (targetResource?.containers && targetResource.containers.length > 0) {
      for (const c of targetResource.containers) {
        if (c.exitCode !== undefined) {
          evidenceList.push({
            evidenceId: `ev-exitcode-${c.name}`,
            type: 'resource_state',
            source: 'kubelet-cri',
            timestamp: targetResource.updatedAt || now,
            resourceKind: targetResource.kind,
            resourceName: targetResource.name,
            namespace: targetResource.namespace,
            relevance: c.exitCode !== 0 ? 'SUPPORTING' : 'CONTEXTUAL',
            confidence: 1.0,
            title: `Container "${c.name}" Exit Code: ${c.exitCode}`,
            description: c.exitCode === 137
              ? `Container was terminated with exit code 137 (OOMKilled - out of memory limit).`
              : `Container exited with code ${c.exitCode}.`,
            details: { exitCode: c.exitCode, container: c.name, reason: c.terminationReason }
          });
        }

        if (c.waitingReason) {
          evidenceList.push({
            evidenceId: `ev-waiting-${c.name}`,
            type: 'resource_state',
            source: 'kubelet-cri',
            timestamp: targetResource.updatedAt || now,
            resourceKind: targetResource.kind,
            resourceName: targetResource.name,
            namespace: targetResource.namespace,
            relevance: 'SUPPORTING',
            confidence: 1.0,
            title: `Container "${c.name}" Waiting: ${c.waitingReason}`,
            description: c.waitingMessage || `Container is blocked in waiting state: ${c.waitingReason}`,
            details: { waitingReason: c.waitingReason, message: c.waitingMessage }
          });
        }
      }
    }

    // 2. Kubernetes Events Evidence
    if (targetResource?.events && targetResource.events.length > 0) {
      for (let i = 0; i < targetResource.events.length; i++) {
        const e = targetResource.events[i];
        if (e.type === 'Warning') {
          evidenceList.push({
            evidenceId: `ev-k8s-warning-${i}-${e.reason}`,
            type: 'event',
            source: 'kube-apiserver',
            timestamp: e.timestamp || targetResource.createdAt || now,
            resourceKind: targetResource.kind,
            resourceName: targetResource.name,
            namespace: targetResource.namespace,
            relevance: 'SUPPORTING',
            confidence: 0.95,
            title: `Warning Event: ${e.reason}`,
            description: e.message,
            details: { reason: e.reason, count: e.count || 1 }
          });
        }
      }
    }

    // 3. Detected Anomalies as Evidence
    for (const anom of anomalies) {
      evidenceList.push({
        evidenceId: `ev-anomaly-${anom.id}`,
        type: 'anomaly',
        source: 'anomaly-engine',
        timestamp: anom.firstObservedAt,
        resourceKind: anom.resourceKind,
        resourceName: anom.resourceName,
        namespace: anom.namespace,
        relevance: 'SUPPORTING',
        confidence: anom.confidence,
        title: `Telemetry Anomaly: ${anom.anomalyType}`,
        description: anom.details || `${anom.observedDisplay} (${anom.deviationDisplay})`,
        details: {
          metric: anom.metric,
          observed: anom.observedValue,
          baseline: anom.baselineValue,
          severity: anom.severity
        }
      });
    }

    // 4. Correlated Changes as Evidence
    for (const corr of changes) {
      const chg = corr.change;
      evidenceList.push({
        evidenceId: `ev-change-${chg.id}`,
        type: 'change',
        source: 'change-tracker',
        timestamp: chg.timestamp,
        resourceKind: chg.resourceKind,
        resourceName: chg.resourceName,
        namespace: chg.namespace,
        relevance: corr.correlationStrength === 'STRONG' ? 'SUPPORTING' : 'CONTEXTUAL',
        confidence: corr.confidence,
        title: `Antecedent Change: ${chg.changeType} on ${chg.resourceKind}/${chg.resourceName}`,
        description: corr.explanation,
        details: {
          changeType: chg.changeType,
          attribute: chg.attribute,
          oldValue: chg.oldValue,
          newValue: chg.newValue,
          proximity: corr.temporalProximityDisplay
        }
      });
    }

    // 5. Relationship Topology Evidence
    for (let i = 0; i < relationships.length; i++) {
      const rel = relationships[i];
      if (rel.isImpacted || rel.relation === 'OWNED_BY' || rel.relation === 'SCHEDULED_ON') {
        evidenceList.push({
          evidenceId: `ev-rel-${i}-${rel.relation}`,
          type: 'relationship',
          source: 'topology-graph',
          timestamp: now,
          resourceKind: rel.target.kind,
          resourceName: rel.target.name,
          namespace: rel.target.namespace,
          relevance: rel.isImpacted ? 'SUPPORTING' : 'CONTEXTUAL',
          confidence: 0.90,
          title: `Topology Relation: ${rel.relation}`,
          description: rel.details || `${rel.source.kind}/${rel.source.name} is ${rel.relation} ${rel.target.kind}/${rel.target.name}`,
          details: { relation: rel.relation, source: rel.source, target: rel.target, isImpacted: rel.isImpacted }
        });
      }
    }

    // 6. Historical Baseline Evidence
    for (const base of baselines) {
      if (base.status === 'AVAILABLE') {
        evidenceList.push({
          evidenceId: `ev-base-${base.metric}-${base.timeWindow}`,
          type: 'historical_observation',
          source: 'baseline-engine',
          timestamp: base.calculatedAt,
          resourceKind: base.resourceKind,
          resourceName: base.resourceName,
          namespace: base.namespace,
          relevance: 'CONTEXTUAL',
          confidence: base.quality === 'HIGH' ? 0.95 : 0.80,
          title: `Historical Baseline: ${base.metric} (${base.timeWindow})`,
          description: `Central value: ${base.centralValue} ${base.unit} (normal band: ${base.min} - ${base.max}, P95: ${base.p95}) based on ${base.sampleCount} observations.`,
          details: {
            quality: base.quality,
            mean: base.mean,
            median: base.median,
            stdDev: base.stdDev,
            sampleCount: base.sampleCount
          }
        });
      }
    }

    // 7. Track Explicit Missing / Unknown Signals
    // 7a. Metrics availability
    if (metrics?.isUsageAvailable === false) {
      const reason = metrics.unavailableReason || 'Metrics Server (metrics.k8s.io) is not reporting runtime telemetry.';
      missingEvidence.push(reason);
      unknownFactors.push('Live CPU and memory usage could not be measured because metrics.k8s.io is absent.');
    }

    // 7b. Baseline availability
    const unavailableBaselines = baselines.filter((b) => b.status === 'UNAVAILABLE');
    if (unavailableBaselines.length > 0) {
      missingEvidence.push('Historical baselines have insufficient observations (< 6 samples) to confirm statistical deviation.');
      unknownFactors.push('Statistical deviation cannot be calculated without additional historical telemetry samples.');
    }

    // 7c. Recent changes check
    if (changes.length === 0) {
      unknownFactors.push('No configuration or deployment changes were observed within 1 hour preceding this failure.');
    }

    // 7d. Diagnostic log availability
    const containerHasLogs = targetResource?.containers?.some((c) => !!c.logs);
    if (!containerHasLogs && (incident.incidentType === 'CrashLoopBackOff' || tech.exitCode !== undefined)) {
      missingEvidence.push('Application standard output / error logs were not retained in pod status.');
    }

    return {
      evidenceList,
      missingEvidence,
      unknownFactors
    };
  }
}
