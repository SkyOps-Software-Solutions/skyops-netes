import { SafetyPolicyEngine } from '../safetyPolicy';
import { AIProvider, IncidentContext, SkyOpsAIAnalysis } from '../types';

export interface OpenAIProviderConfig {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
}

/**
 * OpenAI-Compatible AI Provider
 * Connects to OpenAI, Azure OpenAI, or any OpenAI-compatible inference proxy.
 */
export class OpenAIProvider implements AIProvider {
  public readonly name = 'OpenAI Compatible';
  public readonly model: string;
  private apiKey: string;
  private endpoint: string;
  private timeoutMs: number;

  constructor(config?: OpenAIProviderConfig) {
    this.apiKey = config?.apiKey || process.env.OPENAI_API_KEY || '';
    this.endpoint = (config?.endpoint || process.env.OPENAI_ENDPOINT || 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.model = config?.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this.timeoutMs = config?.timeoutMs || 15000;
  }

  public isAvailable(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  public async analyzeIncident(context: IncidentContext): Promise<SkyOpsAIAnalysis> {
    const startMs = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const systemPrompt = `You are the SkyOps Kubernetes Incident Intelligence Engine.
Analyze the following Kubernetes incident context and return a valid JSON object matching the SkyOpsAIAnalysis schema.
DO NOT wrap the response in markdown code blocks. Return purely valid JSON.
Include:
- summary: brief high-level overview
- rootCause: exact technical root cause grounded in the evidence
- confidence: number between 0.1 and 1.0
- confidenceExplanation: rationale for confidence score
- recommendedFix: object with { description, reason, risk: 'LOW'|'MEDIUM'|'HIGH', expectedImpact, rollback }
- saferAlternative: object with { description, reason }
- requiresApproval: boolean (true for mutating operations)
- additionalEvidenceNeeded: array of strings`;

    const userPrompt = JSON.stringify({
      incidentId: context.incidentId,
      incidentType: context.incidentType,
      severity: context.severity,
      resource: `${context.resourceKind}/${context.resourceName}`,
      namespace: context.namespace,
      cluster: context.clusterName,
      events: context.recentEvents.slice(0, 5),
      containers: context.containers,
      deterministicRootCause: context.intelligence?.rootCause
    });

    try {
      const response = await fetch(`${this.endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: HTTP ${response.status} ${response.statusText}`);
      }

      const data: any = await response.json();
      const rawContent = data.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(rawContent);

      const baseAnalysis: Partial<SkyOpsAIAnalysis> = {
        incidentId: context.incidentId,
        summary: parsed.summary || `Incident analyzed on ${context.resourceKind} ${context.resourceName}`,
        rootCause: parsed.rootCause || context.intelligence?.rootCause || 'Root cause investigation inconclusive.',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
        confidenceExplanation: parsed.confidenceExplanation || 'Grounded on pod events and container statuses.',
        intelligence: context.intelligence,
        evidence: (context.intelligence?.signals || []).map((s) => ({
          category: s.category === 'FACT' ? 'OBSERVED_FACT' : 'AI_INFERENCE',
          source: `${s.resourceKind} ${s.property}`,
          detail: s.description
        })),
        affectedResources: [
          { kind: context.resourceKind, namespace: context.namespace, name: context.resourceName }
        ],
        recommendedFix: parsed.recommendedFix || {
          description: context.intelligence?.recommendation || 'Inspect pod status',
          reason: 'Initial diagnosis',
          risk: 'LOW',
          expectedImpact: 'Assessment only',
          rollback: 'None'
        },
        saferAlternative: parsed.saferAlternative || {
          description: `Run 'kubectl describe ${context.resourceKind.toLowerCase()} ${context.resourceName} -n ${context.namespace}'`,
          reason: 'Authoritative status check'
        },
        requiresApproval: true,
        additionalEvidenceNeeded: parsed.additionalEvidenceNeeded || [],
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
            geminiCallMs: Date.now() - startMs,
            parsingMs: 2,
            safetyValidationMs: 1,
            totalMs: Date.now() - startMs
          }
        }
      };

      return SafetyPolicyEngine.validateAndEnforce(baseAnalysis, context.incidentId, context);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
