import express, { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedUserRequest, requireOrgMembership, requirePermission, requireUserAuth } from '../auth';
import { logManager } from './logManager';

const logRouter = express.Router();

// --- Overview Stats ---
logRouter.get('/stats', requireUserAuth, requireOrgMembership, async (req: AuthenticatedUserRequest, res: Response) => {
  const clusterId = typeof req.query.clusterId === 'string' ? req.query.clusterId : undefined;
  const stats = await logManager.getOverviewStats(req.orgId!, clusterId);
  res.json(stats);
});

// --- Workload Summaries ---
logRouter.get('/workloads', requireUserAuth, requireOrgMembership, async (req: AuthenticatedUserRequest, res: Response) => {
  const clusterId = typeof req.query.clusterId === 'string' ? req.query.clusterId : undefined;
  const namespace = typeof req.query.namespace === 'string' ? req.query.namespace : undefined;
  const workloads = await logManager.getWorkloadSummaries(req.orgId!, clusterId, namespace);
  res.json({ workloads });
});

// --- Log Explorer / Search ---
logRouter.get('/search', requireUserAuth, requireOrgMembership, async (req: AuthenticatedUserRequest, res: Response) => {
  const {
    clusterId,
    namespace,
    workload,
    podName,
    container,
    nodeName,
    severity,
    search,
    sinceSeconds,
    startTimeMs,
    endTimeMs,
    previous,
    limit,
    offset
  } = req.query as Record<string, string | undefined>;

  const filter = {
    clusterId,
    namespace,
    workload,
    podName,
    container,
    nodeName,
    severity: severity as any,
    search,
    sinceSeconds: sinceSeconds ? parseInt(sinceSeconds, 10) : undefined,
    startTimeMs: startTimeMs ? parseInt(startTimeMs, 10) : undefined,
    endTimeMs: endTimeMs ? parseInt(endTimeMs, 10) : undefined,
    previous: previous === 'true' || previous === '1',
    limit: limit ? parseInt(limit, 10) : undefined,
    offset: offset ? parseInt(offset, 10) : undefined
  };

  const results = await logManager.searchLogs(req.orgId!, filter);
  res.json(results);
});

// --- Error Spikes & What Changed ---
logRouter.get('/spikes', requireUserAuth, requireOrgMembership, async (req: AuthenticatedUserRequest, res: Response) => {
  const clusterId = typeof req.query.clusterId === 'string' ? req.query.clusterId : undefined;
  const spikes = await logManager.detectErrorSpikes(req.orgId!, clusterId);
  res.json({ spikes });
});

// --- Deployment Comparison ---
const CompareDeploymentsSchema = z.object({
  workload: z.string().min(1),
  namespace: z.string().optional().default('production')
});

logRouter.post('/deployment-comparison', requireUserAuth, requireOrgMembership, async (req: AuthenticatedUserRequest, res: Response) => {
  const parsed = CompareDeploymentsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid deployment comparison request' });
  }

  const comparison = await logManager.compareDeployments(req.orgId!, parsed.data.workload, parsed.data.namespace);
  res.json(comparison);
});

// --- Log Alert Rules ---
logRouter.get('/alerts', requireUserAuth, requireOrgMembership, (req: AuthenticatedUserRequest, res: Response) => {
  const rules = logManager.getAlertRules(req.orgId!);
  res.json({ rules });
});

const CreateAlertRuleSchema = z.object({
  clusterId: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  namespace: z.string().optional(),
  workload: z.string().optional(),
  pattern: z.string().min(1),
  minSeverity: z.enum(['FATAL', 'ERROR', 'WARN', 'INFO', 'DEBUG']).optional(),
  thresholdOccurrences: z.number().int().min(1),
  windowMinutes: z.number().int().min(1),
  createIncident: z.boolean().optional(),
  incidentSeverity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  notifyEmail: z.boolean().optional(),
  notifyWebhook: z.boolean().optional(),
  webhookUrl: z.string().url().optional(),
  enabled: z.boolean().optional()
});

logRouter.post('/alerts', requireUserAuth, requireOrgMembership, requirePermission('policy.manage'), (req: AuthenticatedUserRequest, res: Response) => {
  const parsed = CreateAlertRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid alert rule payload' });
  }

  const rule = logManager.createAlertRule(req.orgId!, parsed.data, {
    id: req.user!.id,
    name: req.user!.name || req.user!.email
  });
  res.status(201).json({ rule });
});

logRouter.patch('/alerts/:id', requireUserAuth, requireOrgMembership, requirePermission('policy.manage'), (req: AuthenticatedUserRequest, res: Response) => {
  const parsed = CreateAlertRuleSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid alert update payload' });
  }

  try {
    const rule = logManager.updateAlertRule(req.orgId!, req.params.id, parsed.data, {
      id: req.user!.id,
      name: req.user!.name || req.user!.email
    });
    res.json({ rule });
  } catch (err: any) {
    res.status(404).json({ error: err?.message || 'Failed to update alert rule' });
  }
});

logRouter.delete('/alerts/:id', requireUserAuth, requireOrgMembership, requirePermission('policy.manage'), (req: AuthenticatedUserRequest, res: Response) => {
  const success = logManager.deleteAlertRule(req.orgId!, req.params.id, {
    id: req.user!.id,
    name: req.user!.name || req.user!.email
  });
  if (!success) {
    return res.status(404).json({ error: 'Alert rule not found' });
  }
  res.json({ success: true, message: 'Alert rule removed' });
});

logRouter.get('/alerts/events', requireUserAuth, requireOrgMembership, (req: AuthenticatedUserRequest, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const events = logManager.getAlertTriggerEvents(req.orgId!, limit);
  res.json({ events });
});

// --- Log Collection Rules ---
logRouter.get('/collection-rules', requireUserAuth, requireOrgMembership, (req: AuthenticatedUserRequest, res: Response) => {
  const rules = logManager.getCollectionRules(req.orgId!);
  res.json({ rules });
});

const CreateCollectionRuleSchema = z.object({
  clusterId: z.string().min(1),
  clusterName: z.string().optional(),
  name: z.string().min(1),
  namespaces: z.array(z.string()).default(['*']),
  workloadPatterns: z.array(z.string()).default(['*']),
  containers: z.array(z.string()).default(['All']),
  minSeverity: z.enum(['FATAL', 'ERROR', 'WARN', 'INFO', 'DEBUG']).default('INFO'),
  retentionDays: z.number().int().min(3).max(90).default(14),
  enabled: z.boolean().default(true)
});

logRouter.post('/collection-rules', requireUserAuth, requireOrgMembership, requirePermission('cluster.manage'), (req: AuthenticatedUserRequest, res: Response) => {
  const parsed = CreateCollectionRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid collection rule payload' });
  }

  const rule = logManager.createCollectionRule(req.orgId!, parsed.data, {
    id: req.user!.id,
    name: req.user!.name || req.user!.email
  });
  res.status(201).json({ rule });
});

logRouter.patch('/collection-rules/:id', requireUserAuth, requireOrgMembership, requirePermission('cluster.manage'), (req: AuthenticatedUserRequest, res: Response) => {
  const parsed = CreateCollectionRuleSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid collection rule update' });
  }

  try {
    const rule = logManager.updateCollectionRule(req.orgId!, req.params.id, parsed.data, {
      id: req.user!.id,
      name: req.user!.name || req.user!.email
    });
    res.json({ rule });
  } catch (err: any) {
    res.status(404).json({ error: err?.message || 'Failed to update collection rule' });
  }
});

logRouter.delete('/collection-rules/:id', requireUserAuth, requireOrgMembership, requirePermission('cluster.manage'), (req: AuthenticatedUserRequest, res: Response) => {
  const success = logManager.deleteCollectionRule(req.orgId!, req.params.id, {
    id: req.user!.id,
    name: req.user!.name || req.user!.email
  });
  if (!success) {
    return res.status(404).json({ error: 'Collection rule not found' });
  }
  res.json({ success: true, message: 'Collection rule deleted' });
});

// --- Saved Searches ---
logRouter.get('/saved-searches', requireUserAuth, requireOrgMembership, (req: AuthenticatedUserRequest, res: Response) => {
  const searches = logManager.getSavedSearches(req.orgId!);
  res.json({ searches });
});

const CreateSavedSearchSchema = z.object({
  name: z.string().min(1),
  query: z.string().default(''),
  clusterId: z.string().optional(),
  namespace: z.string().optional(),
  workload: z.string().optional(),
  podName: z.string().optional(),
  container: z.string().optional(),
  severity: z.string().optional(),
  timeRange: z.string().optional()
});

logRouter.post('/saved-searches', requireUserAuth, requireOrgMembership, (req: AuthenticatedUserRequest, res: Response) => {
  const parsed = CreateSavedSearchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid saved search payload' });
  }

  const search = logManager.createSavedSearch(req.orgId!, parsed.data, {
    id: req.user!.id,
    name: req.user!.name || req.user!.email
  });
  res.status(201).json({ search });
});

logRouter.delete('/saved-searches/:id', requireUserAuth, requireOrgMembership, (req: AuthenticatedUserRequest, res: Response) => {
  const success = logManager.deleteSavedSearch(req.orgId!, req.params.id, {
    id: req.user!.id,
    name: req.user!.name || req.user!.email
  });
  if (!success) {
    return res.status(404).json({ error: 'Saved search not found' });
  }
  res.json({ success: true, message: 'Saved search deleted' });
});

// --- Create Incident from Log Evidence ---
const CreateIncidentFromLogsSchema = z.object({
  clusterId: z.string().min(1),
  workload: z.string().min(1),
  namespace: z.string().min(1),
  errorPattern: z.string().min(1),
  occurrences: z.number().int().min(1),
  timeWindow: z.string().default('5m'),
  sampleLines: z.array(z.string()).default([])
});

logRouter.post('/incidents/create', requireUserAuth, requireOrgMembership, requirePermission('incident.manage'), async (req: AuthenticatedUserRequest, res: Response) => {
  const parsed = CreateIncidentFromLogsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid incident payload' });
  }

  try {
    const incident = await logManager.createIncidentFromLogs(req.orgId!, parsed.data.clusterId, parsed.data, {
      id: req.user!.id,
      name: req.user!.name || req.user!.email
    });
    res.status(201).json({ success: true, incident });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to create incident from logs' });
  }
});

// --- Export Log Evidence ---
const ExportLogsSchema = z.object({
  format: z.enum(['txt', 'json', 'csv']),
  clusterId: z.string().optional(),
  namespace: z.string().optional(),
  workload: z.string().optional(),
  podName: z.string().optional(),
  container: z.string().optional(),
  severity: z.string().optional(),
  search: z.string().optional(),
  startTimeMs: z.number().optional(),
  endTimeMs: z.number().optional()
});

logRouter.post('/export', requireUserAuth, requireOrgMembership, async (req: AuthenticatedUserRequest, res: Response) => {
  const parsed = ExportLogsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid export payload' });
  }

  const { format, ...filter } = parsed.data;
  const result = await logManager.exportLogs(req.orgId!, format, filter as any, {
    id: req.user!.id,
    name: req.user!.name || req.user!.email
  });

  res.setHeader('Content-Type', result.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.send(result.data);
});

export { logRouter };
