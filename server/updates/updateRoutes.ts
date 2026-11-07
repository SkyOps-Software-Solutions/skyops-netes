import { Request, Response, Router } from 'express';
import { updateService } from './updateService';
import { AuthenticatedUserRequest, requireOrgMembership, requireRole, requireUserAuth } from '../auth';

export const updateRouter = Router();

/**
 * GET /api/v1/system/updates/status
 * Returns current installed version, update availability, and release notes.
 */
updateRouter.get(
  '/updates/status',
  requireUserAuth,
  requireOrgMembership,
  async (_req: Request, res: Response) => {
    try {
      const status = await updateService.getStatus();
      res.json(status);
    } catch (err: any) {
      console.error('[UpdateRouter] Error fetching update status:', err);
      res.status(500).json({ error: 'Failed to retrieve update status' });
    }
  }
);

/**
 * POST /api/v1/system/updates/check
 * Refreshes available updates from configured catalog.
 */
updateRouter.post(
  '/updates/check',
  requireUserAuth,
  requireOrgMembership,
  requireRole(['OWNER', 'ADMIN']),
  async (_req: Request, res: Response) => {
    try {
      const status = await updateService.checkForUpdates();
      res.json(status);
    } catch (err: any) {
      console.error('[UpdateRouter] Error checking for updates:', err);
      res.status(500).json({ error: 'Failed to check for updates' });
    }
  }
);

/**
 * POST /api/v1/system/updates/apply
 * Applies approved software update after administrator confirmation.
 * Automatically executes pre-update backup and transactional migrations.
 */
updateRouter.post(
  '/updates/apply',
  requireUserAuth,
  requireOrgMembership,
  requireRole(['OWNER', 'ADMIN']),
  async (req: AuthenticatedUserRequest, res: Response) => {
    try {
      const { confirm, targetVersion } = req.body;
      const result = await updateService.applyUpdate({
        confirm: Boolean(confirm),
        targetVersion,
        userId: req.user?.id || 'admin',
        orgId: req.orgId
      });

      res.status(result.success ? 200 : 500).json(result);
    } catch (err: any) {
      console.error('[UpdateRouter] Error applying update:', err);
      res.status(400).json({ error: err.message || 'Failed to apply software update' });
    }
  }
);
