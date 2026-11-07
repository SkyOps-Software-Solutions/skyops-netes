import { Request, Response, Router } from 'express';
import { aiManager } from './aiManager';
import { AuthenticatedUserRequest, requireOrgMembership, requireRole, requireUserAuth } from '../auth';

export const aiConfigRouter = Router();

/**
 * GET /api/v1/system/ai/config
 * Returns current AI provider configuration, model, consent status, and privacy options.
 * API keys are strictly masked.
 */
aiConfigRouter.get(
  '/ai/config',
  requireUserAuth,
  requireOrgMembership,
  async (req: AuthenticatedUserRequest, res: Response) => {
    try {
      const config = aiManager.getSanitizedConfig();
      res.json(config);
    } catch (err: any) {
      console.error('[AIConfigRouter] Error reading AI config:', err);
      res.status(500).json({ error: 'Failed to retrieve AI configuration' });
    }
  }
);

/**
 * PUT /api/v1/system/ai/config
 * Updates AI provider, model, credentials, data-sharing consent, and privacy options.
 * Restricted to OWNER and ADMIN.
 */
aiConfigRouter.put(
  '/ai/config',
  requireUserAuth,
  requireOrgMembership,
  requireRole(['OWNER', 'ADMIN']),
  async (req: AuthenticatedUserRequest, res: Response) => {
    try {
      const updated = await aiManager.updateConfig(req.body, req.user?.id, req.orgId);
      res.status(200).json({
        success: true,
        message: 'AI Provider configuration updated successfully.',
        config: updated
      });
    } catch (err: any) {
      console.error('[AIConfigRouter] Error updating AI config:', err);
      res.status(400).json({ error: err.message || 'Failed to update AI configuration.' });
    }
  }
);

/**
 * POST /api/v1/system/ai/test
 * Tests connectivity to an AI provider without saving persistent state.
 */
aiConfigRouter.post(
  '/ai/test',
  requireUserAuth,
  requireOrgMembership,
  requireRole(['OWNER', 'ADMIN']),
  async (req: AuthenticatedUserRequest, res: Response) => {
    try {
      const { providerType, apiKey, endpoint, model } = req.body;
      const result = await aiManager.testConnection(providerType, apiKey, endpoint, model);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || 'Connection test failed', latencyMs: 0 });
    }
  }
);
