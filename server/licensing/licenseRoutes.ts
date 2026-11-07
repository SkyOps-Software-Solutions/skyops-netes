import { Request, Response, Router } from 'express';
import { licenseService } from './licenseService';
import { AuthenticatedUserRequest, requireOrgMembership, requireRole, requireUserAuth } from '../auth';
import { store } from '../store';

export const licenseRouter = Router();

/**
 * GET /api/v1/system/license
 * Returns current license status, edition, entitlements, and cluster/node utilization.
 */
licenseRouter.get(
  '/license',
  requireUserAuth,
  requireOrgMembership,
  async (req: AuthenticatedUserRequest, res: Response) => {
    try {
      const orgId = req.orgId || 'default';
      const verification = licenseService.getVerificationResult();

      // Calculate current cluster and node consumption
      const clusters = store.getClusters(orgId);
      const currentClusters = clusters.length;
      let currentNodes = 0;
      for (const c of clusters) {
        currentNodes += c.nodeCount || 0;
      }

      const clusterEntitlement = licenseService.checkClusterEntitlement(currentClusters);
      const nodeEntitlement = licenseService.checkNodeEntitlement(currentNodes, 0);

      res.json({
        ...verification,
        consumption: {
          clusters: {
            current: currentClusters,
            limit: verification.maxClusters,
            allowed: clusterEntitlement.allowed
          },
          nodes: {
            current: currentNodes,
            limit: verification.maxNodes,
            allowed: nodeEntitlement.allowed
          }
        }
      });
    } catch (err: any) {
      console.error('[LicenseRouter] Error fetching license status:', err);
      res.status(500).json({ error: 'Failed to retrieve license status' });
    }
  }
);

/**
 * POST /api/v1/system/license/import
 * Imports a signed commercial license file. Restricted to OWNER and ADMIN.
 */
licenseRouter.post(
  '/license/import',
  requireUserAuth,
  requireOrgMembership,
  requireRole(['OWNER', 'ADMIN']),
  async (req: AuthenticatedUserRequest, res: Response) => {
    try {
      const { license } = req.body;
      if (!license) {
        return res.status(400).json({ error: 'License data is required (JSON string or object).' });
      }

      const result = await licenseService.importLicense(license, req.user?.id, req.orgId);
      res.status(200).json({
        success: true,
        message: `Successfully activated ${result.edition} license for ${result.customerName}.`,
        license: result
      });
    } catch (err: any) {
      console.error('[LicenseRouter] Error importing license:', err);
      res.status(400).json({ error: err.message || 'Failed to import license.' });
    }
  }
);

/**
 * DELETE /api/v1/system/license
 * Reverts installation back to Community Edition. Restricted to OWNER.
 */
licenseRouter.delete(
  '/license',
  requireUserAuth,
  requireOrgMembership,
  requireRole(['OWNER']),
  async (req: AuthenticatedUserRequest, res: Response) => {
    try {
      const result = await licenseService.removeLicense(req.user?.id, req.orgId);
      res.status(200).json({
        success: true,
        message: 'Commercial license removed. System returned to Community Edition.',
        license: result
      });
    } catch (err: any) {
      console.error('[LicenseRouter] Error removing license:', err);
      res.status(500).json({ error: 'Failed to remove license.' });
    }
  }
);
