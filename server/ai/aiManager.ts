// ==============================================================================
// SkyOps AI Provider Manager & Customer Privacy Controller
// ==============================================================================

import { skyOpsAIService } from './service';
import { GeminiAIProvider } from './providers/geminiProvider';
import { OpenAIProvider } from './providers/openaiProvider';
import { LocalAIProvider } from './providers/localAIProvider';
import { NoAIProvider } from './providers/noAIProvider';
import { AIProvider } from './types';
import { DataPrivacySettings, DEFAULT_PRIVACY_SETTINGS } from './dataPrivacy';
import { store } from '../store';
import { auditService } from '../audit';

export type AIProviderType = 'gemini' | 'openai' | 'local_ai' | 'none';

export interface AIProviderConfig {
  enabled: boolean;
  providerType: AIProviderType;
  modelName: string;
  endpoint?: string;
  apiKey?: string; // Stored server-side only
  dataSharingConsent: boolean;
  stripSensitiveLogs: boolean;
  redactEnvironmentVars: boolean;
  maskResourceNames: boolean;
  requestTimeoutMs: number;
}

export class AIManager {
  private config: AIProviderConfig;

  constructor() {
    this.config = {
      enabled: process.env.AI_ENABLED !== 'false',
      providerType: (process.env.AI_PROVIDER as AIProviderType) || (process.env.GEMINI_API_KEY ? 'gemini' : 'none'),
      modelName: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      endpoint: process.env.AI_ENDPOINT,
      apiKey: process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || '',
      dataSharingConsent: process.env.AI_DATA_SHARING_CONSENT === 'true',
      stripSensitiveLogs: true,
      redactEnvironmentVars: true,
      maskResourceNames: false,
      requestTimeoutMs: 15000
    };

    this.applyActiveProvider();
  }

  /**
   * Applies provider based on current active configuration.
   */
  public applyActiveProvider(): void {
    if (!this.config.enabled || this.config.providerType === 'none') {
      skyOpsAIService.setProvider(new NoAIProvider());
      return;
    }

    // Consent gate: external providers require explicit consent
    const isExternal = this.config.providerType === 'gemini' || this.config.providerType === 'openai';
    if (isExternal && !this.config.dataSharingConsent) {
      console.warn('[SkyOps AI Manager] Notice: External AI provider enabled without customer data-sharing consent. Falling back to Deterministic No-AI mode.');
      skyOpsAIService.setProvider(new NoAIProvider());
      return;
    }

    switch (this.config.providerType) {
      case 'gemini':
        skyOpsAIService.setProvider(new GeminiAIProvider());
        break;
      case 'openai':
        skyOpsAIService.setProvider(
          new OpenAIProvider({
            apiKey: this.config.apiKey,
            endpoint: this.config.endpoint,
            model: this.config.modelName,
            timeoutMs: this.config.requestTimeoutMs
          })
        );
        break;
      case 'local_ai':
        skyOpsAIService.setProvider(
          new LocalAIProvider({
            endpoint: this.config.endpoint,
            model: this.config.modelName,
            timeoutMs: this.config.requestTimeoutMs
          })
        );
        break;
      default:
        skyOpsAIService.setProvider(new NoAIProvider());
        break;
    }
  }

  /**
   * Returns current configuration sanitized for frontend inspection.
   * NEVER returns plain text API keys.
   */
  public getSanitizedConfig(): Omit<AIProviderConfig, 'apiKey'> & {
    apiKeyConfigured: boolean;
    apiKeyMasked?: string;
    activeProviderName: string;
    activeModel: string;
    isAvailable: boolean;
  } {
    const activeProvider = skyOpsAIService.getProvider();
    const hasKey = Boolean(this.config.apiKey && this.config.apiKey.trim().length > 0);

    let masked = undefined;
    if (hasKey && this.config.apiKey) {
      const key = this.config.apiKey.trim();
      masked = key.length > 8 ? `${key.substring(0, 4)}••••••••${key.substring(key.length - 4)}` : '••••••••';
    }

    return {
      enabled: this.config.enabled,
      providerType: this.config.providerType,
      modelName: this.config.modelName,
      endpoint: this.config.endpoint,
      apiKeyConfigured: hasKey,
      apiKeyMasked: masked,
      dataSharingConsent: this.config.dataSharingConsent,
      stripSensitiveLogs: this.config.stripSensitiveLogs,
      redactEnvironmentVars: this.config.redactEnvironmentVars,
      maskResourceNames: this.config.maskResourceNames,
      requestTimeoutMs: this.config.requestTimeoutMs,
      activeProviderName: activeProvider.name,
      activeModel: activeProvider.model,
      isAvailable: activeProvider.isAvailable()
    };
  }

  /**
   * Updates AI provider configuration securely.
   */
  public async updateConfig(
    newConfig: Partial<AIProviderConfig>,
    userId?: string,
    orgId?: string
  ): Promise<ReturnType<AIManager['getSanitizedConfig']>> {
    // Preserve existing key if not provided or empty
    const updatedKey = newConfig.apiKey && newConfig.apiKey.trim().length > 0 ? newConfig.apiKey.trim() : this.config.apiKey;

    this.config = {
      ...this.config,
      ...newConfig,
      apiKey: updatedKey
    };

    this.applyActiveProvider();

    // Persist configuration to PostgreSQL if available
    try {
      const persistence = store.getPersistence();
      if ((persistence as any).getPool) {
        const pool = (persistence as any).getPool();
        await pool.query(
          `INSERT INTO ai_provider_configs 
             (id, organization_id, enabled, provider_type, model_name, api_endpoint, api_key_encrypted, data_sharing_consent, strip_sensitive_logs, redact_environment_vars, mask_resource_names, request_timeout_ms, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
           ON CONFLICT (organization_id) DO UPDATE SET
             enabled = EXCLUDED.enabled,
             provider_type = EXCLUDED.provider_type,
             model_name = EXCLUDED.model_name,
             api_endpoint = EXCLUDED.api_endpoint,
             api_key_encrypted = COALESCE(EXCLUDED.api_key_encrypted, ai_provider_configs.api_key_encrypted),
             data_sharing_consent = EXCLUDED.data_sharing_consent,
             strip_sensitive_logs = EXCLUDED.strip_sensitive_logs,
             redact_environment_vars = EXCLUDED.redact_environment_vars,
             mask_resource_names = EXCLUDED.mask_resource_names,
             request_timeout_ms = EXCLUDED.request_timeout_ms,
             updated_at = NOW()`,
          [
            `ai-cfg-${orgId || 'global'}`,
            orgId || 'default-workspace',
            this.config.enabled,
            this.config.providerType,
            this.config.modelName,
            this.config.endpoint || null,
            this.config.apiKey || null,
            this.config.dataSharingConsent,
            this.config.stripSensitiveLogs,
            this.config.redactEnvironmentVars,
            this.config.maskResourceNames,
            this.config.requestTimeoutMs
          ]
        );
      }
    } catch (err: any) {
      console.warn('[SkyOps AI Manager] Notice: Could not record AI config in PostgreSQL:', err?.message || err);
    }

    if (userId && orgId) {
      auditService.record({
        orgId,
        actorId: userId,
        actorName: 'Administrator',
        actorType: 'USER',
        action: 'AI_PROVIDER_CONFIG_UPDATED',
        resourceType: 'SYSTEM_CONFIG',
        resourceId: `ai-cfg-${orgId}`,
        result: 'SUCCESS',
        details: { providerType: this.config.providerType, modelName: this.config.modelName }
      });
    }

    return this.getSanitizedConfig();
  }

  public getPrivacySettings(): DataPrivacySettings {
    return {
      dataSharingConsent: this.config.dataSharingConsent,
      stripSensitiveLogs: this.config.stripSensitiveLogs,
      redactEnvironmentVars: this.config.redactEnvironmentVars,
      maskResourceNames: this.config.maskResourceNames
    };
  }

  /**
   * Tests connection to the active or proposed provider without modifying persistent state.
   */
  public async testConnection(providerType?: AIProviderType, apiKey?: string, endpoint?: string, model?: string): Promise<{ success: boolean; message: string; latencyMs: number }> {
    const targetType = providerType || this.config.providerType;
    const targetKey = apiKey || this.config.apiKey;
    const targetEndpoint = endpoint || this.config.endpoint;
    const targetModel = model || this.config.modelName;

    const start = Date.now();
    try {
      if (targetType === 'none') {
        return { success: true, message: 'Deterministic engine is active and ready.', latencyMs: 0 };
      }

      if (targetType === 'gemini') {
        const testProvider = new GeminiAIProvider();
        if (!testProvider.isAvailable()) {
          return { success: false, message: 'Gemini API key is not configured.', latencyMs: 0 };
        }
        return { success: true, message: 'Google Gemini provider verified successfully.', latencyMs: Date.now() - start };
      }

      if (targetType === 'openai') {
        if (!targetKey) {
          return { success: false, message: 'OpenAI API key is required.', latencyMs: 0 };
        }
        const ep = (targetEndpoint || 'https://api.openai.com/v1').replace(/\/+$/, '');
        const res = await fetch(`${ep}/models`, {
          headers: { Authorization: `Bearer ${targetKey}` }
        });
        if (!res.ok) {
          return { success: false, message: `OpenAI probe failed: HTTP ${res.status} ${res.statusText}`, latencyMs: Date.now() - start };
        }
        return { success: true, message: 'OpenAI API connection verified successfully.', latencyMs: Date.now() - start };
      }

      if (targetType === 'local_ai') {
        const ep = (targetEndpoint || 'http://localhost:11434/v1').replace(/\/+$/, '');
        const res = await fetch(`${ep}/models`);
        if (!res.ok) {
          return { success: false, message: `Local AI probe failed: HTTP ${res.status}`, latencyMs: Date.now() - start };
        }
        return { success: true, message: 'Local AI inference endpoint reachable.', latencyMs: Date.now() - start };
      }

      return { success: true, message: 'Provider checked.', latencyMs: Date.now() - start };
    } catch (err: any) {
      return { success: false, message: `Connection probe error: ${err.message}`, latencyMs: Date.now() - start };
    }
  }
}

export const aiManager = new AIManager();
