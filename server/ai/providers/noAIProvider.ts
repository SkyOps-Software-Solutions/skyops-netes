import { SkyOpsIntelligenceEngine } from '../../engine/intelligence';
import { SafetyPolicyEngine } from '../safetyPolicy';
import { AIProvider, IncidentContext, SkyOpsAIAnalysis } from '../types';

/**
 * No-AI / Deterministic-Only Provider
 * Operates completely offline with zero external network calls.
 * Uses SkyOps deterministic heuristic rule engine to deliver grounded root-cause analysis.
 */
export class NoAIProvider implements AIProvider {
  public readonly name = 'Deterministic Engine';
  public readonly model = 'skyops-heuristic-engine';

  public isAvailable(): boolean {
    return true;
  }

  public async analyzeIncident(context: IncidentContext): Promise<SkyOpsAIAnalysis> {
    const startMs = Date.now();

    // Reconstruct or extract deterministic intelligence
    const intel =
      context.intelligence ||
      SkyOpsIntelligenceEngine.analyzeIncident(
        {
          id: context.incidentId,
          fingerprint: context.fingerprint,
          orgId: context.orgId || 'default',
          clusterId: context.clusterId,
          clusterName: context.clusterName,
          namespace: context.namespace,
          resourceKind: context.resourceKind,
          resourceName: context.resourceName,
          incidentType: context.incidentType,
          severity: context.severity,
          status: 'OPEN',
          summary: `Incident on ${context.resourceKind} ${context.resourceName}`,
          firstSeenAt: context.firstSeenAt,
          lastSeenAt: context.lastSeenAt,
          occurrenceCount: context.occurrenceCount,
          createdAt: Date.parse(context.firstSeenAt) || Date.now(),
          updatedAt: Date.parse(context.lastSeenAt) || Date.now()
        } as any,
        null,
        [],
        null
      );

    const baseAnalysis: Partial<SkyOpsAIAnalysis> = {
      incidentId: context.incidentId,
      summary: `[Deterministic Intelligence] ${intel.rootCause}`,
      rootCause: intel.rootCause,
      confidence: intel.confidence,
      confidenceExplanation: intel.confidenceExplanation,
      intelligence: intel,
      evidence: intel.signals.map((s) => ({
        category: 'OBSERVED_FACT',
        source: `${s.resourceKind} ${s.property}`,
        detail: s.description
      })),
      affectedResources: [
        { kind: context.resourceKind, namespace: context.namespace, name: context.resourceName }
      ],
      recommendedFix: {
        description: intel.recommendation,
        reason: intel.explainability.whySelected,
        risk: 'LOW',
        expectedImpact: 'Deterministic rule evaluation based on Kubernetes API telemetry.',
        rollback: 'None required.'
      },
      saferAlternative: {
        description: `Run 'kubectl describe ${context.resourceKind.toLowerCase()} ${context.resourceName} -n ${context.namespace}'`,
        reason: 'Validates live state directly against the cluster control plane.'
      },
      requiresApproval: true,
      additionalEvidenceNeeded: intel.explainability.missingEvidence || [],
      analyzedAt: Date.now(),
      provider: this.name,
      model: this.model,
      status: 'SUCCESS',
      executionSafe: true,
      timing: {
        requestReceivedAt: startMs,
        contextConstructedAt: startMs,
        geminiRequestStartedAt: startMs,
        geminiResponseReceivedAt: Date.now(),
        structuredParsedAt: Date.now(),
        safetyValidatedAt: Date.now(),
        responseReturnedAt: Date.now(),
        durations: {
          contextConstructionMs: 0,
          geminiCallMs: 0,
          parsingMs: 0,
          safetyValidationMs: 1,
          totalMs: Date.now() - startMs
        }
      }
    };

    return SafetyPolicyEngine.validateAndEnforce(baseAnalysis, context.incidentId, context);
  }
}
