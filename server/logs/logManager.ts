import crypto from 'crypto';
import {
  DeploymentLogComparison,
  ErrorSpike,
  LogAlertRule,
  LogAlertTriggerEvent,
  LogCollectionRule,
  LogOverviewStats,
  LogQueryFilter,
  LogRecord,
  LogSearchResult,
  LogSeverity,
  SavedLogSearch,
  WorkloadLogSummary
} from '../../src/types/logs';
import { auditService } from '../audit';
import { parseLogLines, redactSensitiveLogData } from '../logs';
import { store } from '../store';
import { webhookService } from '../integrations/webhooks';

export class LogManager {
  private collectionRules: Map<string, LogCollectionRule> = new Map();
  private alertRules: Map<string, LogAlertRule> = new Map();
  private alertEvents: Map<string, LogAlertTriggerEvent[]> = new Map(); // orgId -> events
  private savedSearches: Map<string, SavedLogSearch> = new Map();
  private collectedLogs: Map<string, LogRecord[]> = new Map(); // orgId -> records

  constructor() {
    this.seedDefaultRules();
  }

  private seedDefaultRules() {
    // Default collection rules and alert rules will be populated on first demand
  }

  // --- Collection Rules Management ---

  public getCollectionRules(orgId: string): LogCollectionRule[] {
    const list: LogCollectionRule[] = [];
    for (const rule of this.collectionRules.values()) {
      if (rule.orgId === orgId) {
        list.push(rule);
      }
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  public createCollectionRule(
    orgId: string,
    data: Omit<LogCollectionRule, 'id' | 'orgId' | 'createdAt' | 'updatedAt' | 'ingestedBytesToday'>,
    actor: { id: string; name: string }
  ): LogCollectionRule {
    const rule: LogCollectionRule = {
      id: `col-rule-${crypto.randomBytes(6).toString('hex')}`,
      orgId,
      name: data.name.trim(),
      clusterId: data.clusterId,
      clusterName: data.clusterName,
      namespaces: data.namespaces.length ? data.namespaces : ['*'],
      workloadPatterns: data.workloadPatterns.length ? data.workloadPatterns : ['*'],
      containers: data.containers.length ? data.containers : ['All'],
      minSeverity: data.minSeverity || 'INFO',
      retentionDays: Math.min(90, Math.max(3, data.retentionDays || 14)),
      enabled: data.enabled !== false,
      ingestedBytesToday: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.collectionRules.set(rule.id, rule);

    auditService.record({
      orgId,
      actorId: actor.id,
      actorName: actor.name,
      actorType: 'USER',
      action: 'log_collection_rule.create',
      resourceType: 'POLICY',
      resourceId: rule.id,
      result: 'SUCCESS',
      details: { name: rule.name, clusterId: rule.clusterId, retentionDays: rule.retentionDays }
    });

    return rule;
  }

  public updateCollectionRule(
    orgId: string,
    ruleId: string,
    data: Partial<Omit<LogCollectionRule, 'id' | 'orgId' | 'createdAt'>>,
    actor: { id: string; name: string }
  ): LogCollectionRule {
    const rule = this.collectionRules.get(ruleId);
    if (!rule || rule.orgId !== orgId) {
      throw new Error('Collection rule not found or access denied');
    }

    if (data.name !== undefined) rule.name = data.name.trim();
    if (data.namespaces !== undefined) rule.namespaces = data.namespaces;
    if (data.workloadPatterns !== undefined) rule.workloadPatterns = data.workloadPatterns;
    if (data.containers !== undefined) rule.containers = data.containers;
    if (data.minSeverity !== undefined) rule.minSeverity = data.minSeverity;
    if (data.retentionDays !== undefined) rule.retentionDays = data.retentionDays;
    if (data.enabled !== undefined) rule.enabled = data.enabled;
    rule.updatedAt = Date.now();

    auditService.record({
      orgId,
      actorId: actor.id,
      actorName: actor.name,
      actorType: 'USER',
      action: 'log_collection_rule.update',
      resourceType: 'POLICY',
      resourceId: rule.id,
      result: 'SUCCESS',
      details: { name: rule.name, enabled: rule.enabled }
    });

    return rule;
  }

  public deleteCollectionRule(orgId: string, ruleId: string, actor: { id: string; name: string }): boolean {
    const rule = this.collectionRules.get(ruleId);
    if (!rule || rule.orgId !== orgId) {
      return false;
    }

    this.collectionRules.delete(ruleId);

    auditService.record({
      orgId,
      actorId: actor.id,
      actorName: actor.name,
      actorType: 'USER',
      action: 'log_collection_rule.delete',
      resourceType: 'POLICY',
      resourceId: ruleId,
      result: 'SUCCESS',
      details: { name: rule.name }
    });

    return true;
  }

  // --- Alert Rules Management ---

  public getAlertRules(orgId: string): LogAlertRule[] {
    const list: LogAlertRule[] = [];
    for (const rule of this.alertRules.values()) {
      if (rule.orgId === orgId) {
        list.push(rule);
      }
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  public createAlertRule(
    orgId: string,
    data: Omit<LogAlertRule, 'id' | 'orgId' | 'createdAt' | 'updatedAt' | 'triggerCount' | 'lastTriggeredAt'>,
    actor: { id: string; name: string }
  ): LogAlertRule {
    const rule: LogAlertRule = {
      id: `alert-rule-${crypto.randomBytes(6).toString('hex')}`,
      orgId,
      clusterId: data.clusterId,
      name: data.name.trim(),
      description: data.description,
      namespace: data.namespace,
      workload: data.workload,
      pattern: data.pattern.trim(),
      minSeverity: data.minSeverity || 'ERROR',
      thresholdOccurrences: Math.max(1, data.thresholdOccurrences || 10),
      windowMinutes: Math.max(1, data.windowMinutes || 5),
      createIncident: data.createIncident ?? true,
      incidentSeverity: data.incidentSeverity || 'HIGH',
      notifyEmail: data.notifyEmail ?? true,
      notifyWebhook: data.notifyWebhook ?? false,
      webhookUrl: data.webhookUrl,
      enabled: data.enabled !== false,
      triggerCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.alertRules.set(rule.id, rule);

    auditService.record({
      orgId,
      actorId: actor.id,
      actorName: actor.name,
      actorType: 'USER',
      action: 'log_alert.create',
      resourceType: 'POLICY',
      resourceId: rule.id,
      result: 'SUCCESS',
      details: { name: rule.name, pattern: rule.pattern, threshold: rule.thresholdOccurrences }
    });

    return rule;
  }

  public updateAlertRule(
    orgId: string,
    ruleId: string,
    data: Partial<Omit<LogAlertRule, 'id' | 'orgId' | 'createdAt'>>,
    actor: { id: string; name: string }
  ): LogAlertRule {
    const rule = this.alertRules.get(ruleId);
    if (!rule || rule.orgId !== orgId) {
      throw new Error('Alert rule not found or access denied');
    }

    if (data.name !== undefined) rule.name = data.name.trim();
    if (data.description !== undefined) rule.description = data.description;
    if (data.namespace !== undefined) rule.namespace = data.namespace;
    if (data.workload !== undefined) rule.workload = data.workload;
    if (data.pattern !== undefined) rule.pattern = data.pattern.trim();
    if (data.minSeverity !== undefined) rule.minSeverity = data.minSeverity;
    if (data.thresholdOccurrences !== undefined) rule.thresholdOccurrences = data.thresholdOccurrences;
    if (data.windowMinutes !== undefined) rule.windowMinutes = data.windowMinutes;
    if (data.createIncident !== undefined) rule.createIncident = data.createIncident;
    if (data.incidentSeverity !== undefined) rule.incidentSeverity = data.incidentSeverity;
    if (data.notifyEmail !== undefined) rule.notifyEmail = data.notifyEmail;
    if (data.notifyWebhook !== undefined) rule.notifyWebhook = data.notifyWebhook;
    if (data.webhookUrl !== undefined) rule.webhookUrl = data.webhookUrl;
    if (data.enabled !== undefined) rule.enabled = data.enabled;
    rule.updatedAt = Date.now();

    auditService.record({
      orgId,
      actorId: actor.id,
      actorName: actor.name,
      actorType: 'USER',
      action: 'log_alert.update',
      resourceType: 'POLICY',
      resourceId: rule.id,
      result: 'SUCCESS',
      details: { name: rule.name, enabled: rule.enabled }
    });

    return rule;
  }

  public deleteAlertRule(orgId: string, ruleId: string, actor: { id: string; name: string }): boolean {
    const rule = this.alertRules.get(ruleId);
    if (!rule || rule.orgId !== orgId) {
      return false;
    }

    this.alertRules.delete(ruleId);

    auditService.record({
      orgId,
      actorId: actor.id,
      actorName: actor.name,
      actorType: 'USER',
      action: 'log_alert.delete',
      resourceType: 'POLICY',
      resourceId: ruleId,
      result: 'SUCCESS',
      details: { name: rule.name }
    });

    return true;
  }

  public getAlertTriggerEvents(orgId: string, limit = 50): LogAlertTriggerEvent[] {
    const events = this.alertEvents.get(orgId) || [];
    return events.slice(0, limit);
  }

  // --- Saved Searches Management ---

  public getSavedSearches(orgId: string): SavedLogSearch[] {
    const list: SavedLogSearch[] = [];
    for (const search of this.savedSearches.values()) {
      if (search.orgId === orgId) {
        list.push(search);
      }
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  public createSavedSearch(
    orgId: string,
    data: Omit<SavedLogSearch, 'id' | 'orgId' | 'createdAt'>,
    actor: { id: string; name: string }
  ): SavedLogSearch {
    const search: SavedLogSearch = {
      id: `saved-search-${crypto.randomBytes(6).toString('hex')}`,
      orgId,
      name: data.name.trim(),
      query: data.query || '',
      clusterId: data.clusterId,
      namespace: data.namespace,
      workload: data.workload,
      podName: data.podName,
      container: data.container,
      severity: data.severity,
      timeRange: data.timeRange,
      createdAt: Date.now(),
      createdBy: actor.name || actor.id
    };

    this.savedSearches.set(search.id, search);

    auditService.record({
      orgId,
      actorId: actor.id,
      actorName: actor.name,
      actorType: 'USER',
      action: 'log_saved_search.create',
      resourceType: 'SEARCH' as any,
      resourceId: search.id,
      result: 'SUCCESS',
      details: { name: search.name, query: search.query }
    });

    return search;
  }

  public deleteSavedSearch(orgId: string, searchId: string, actor: { id: string; name: string }): boolean {
    const search = this.savedSearches.get(searchId);
    if (!search || search.orgId !== orgId) {
      return false;
    }

    this.savedSearches.delete(searchId);

    auditService.record({
      orgId,
      actorId: actor.id,
      actorName: actor.name,
      actorType: 'USER',
      action: 'log_saved_search.delete',
      resourceType: 'SEARCH' as any,
      resourceId: searchId,
      result: 'SUCCESS',
      details: { name: search.name }
    });

    return true;
  }

  // --- Real Kubernetes Workload & Operational Log Engine ---

  public ingestLogRecords(orgId: string, records: LogRecord[]) {
    if (!records || !records.length) return;
    let current = this.collectedLogs.get(orgId) || [];
    current.push(...records);
    // Sort chronologically (newest first)
    current.sort((a, b) => b.timestampMs - a.timestampMs);
    // Keep reasonable bounded buffer (e.g. 10000 records per org)
    if (current.length > 10000) {
      current = current.slice(0, 10000);
    }
    this.collectedLogs.set(orgId, current);
  }

  public inferSeverity(msg: string): LogSeverity {
    if (!msg) return 'INFO';
    const lower = msg.toLowerCase();
    if (lower.includes('fatal') || lower.includes('panic:') || lower.includes('oomkilled') || lower.includes('exitcode=137')) {
      return 'FATAL';
    }
    if (
      lower.includes('error') ||
      lower.includes('exception') ||
      lower.includes('failed') ||
      lower.includes('failure') ||
      lower.includes('connection refused') ||
      lower.includes('timed out') ||
      lower.includes('timeout') ||
      lower.includes('crashloop') ||
      lower.includes('err ') ||
      lower.includes('[err]') ||
      lower.includes('level=error') ||
      lower.includes('"level":"error"')
    ) {
      return 'ERROR';
    }
    if (lower.includes('warn') || lower.includes('warning') || lower.includes('level=warn') || lower.includes('"level":"warn"')) {
      return 'WARN';
    }
    if (lower.includes('debug') || lower.includes('trace') || lower.includes('level=debug') || lower.includes('"level":"debug"')) {
      return 'DEBUG';
    }
    return 'INFO';
  }

  public resolveWorkloadNameForPod(
    pod: any,
    deployments: any[] = [],
    statefulSets: any[] = [],
    daemonSets: any[] = []
  ): string {
    // 1. OwnerReferences
    if (pod.ownerReferences && pod.ownerReferences.length > 0) {
      const owner = pod.ownerReferences[0];
      if (owner.kind === 'ReplicaSet') {
        const rsName = owner.name;
        const matchingDep = deployments.find((d) => d.namespace === pod.namespace && rsName.startsWith(d.name));
        if (matchingDep) return matchingDep.name;
        return rsName.replace(/-[a-f0-9]{8,10}$/, '');
      }
      if (owner.kind === 'StatefulSet' || owner.kind === 'DaemonSet' || owner.kind === 'Job') {
        return owner.name;
      }
    }

    // 2. Labels
    if (pod.labels) {
      if (pod.labels['app.kubernetes.io/name']) return pod.labels['app.kubernetes.io/name'];
      if (pod.labels['app']) return pod.labels['app'];
      if (pod.labels['k8s-app']) return pod.labels['k8s-app'];
    }

    // 3. Clean pod name
    return pod.name.replace(/-[a-f0-9]{8,10}-[a-z0-9]{5}$/, '').replace(/-[a-z0-9]{5}$/, '');
  }

  public resolveWorkloadKindForPod(
    pod: any,
    deployments: any[] = [],
    statefulSets: any[] = [],
    daemonSets: any[] = []
  ): string {
    if (pod.ownerReferences && pod.ownerReferences.length > 0) {
      const owner = pod.ownerReferences[0];
      if (owner.kind === 'ReplicaSet') return 'Deployment';
      if (owner.kind === 'StatefulSet') return 'StatefulSet';
      if (owner.kind === 'DaemonSet') return 'DaemonSet';
      if (owner.kind === 'Job') return 'Job';
    }
    return 'Deployment';
  }

  /**
   * Synchronizes actual Kubernetes logs from cached on-demand requests and Pod container buffers.
   * Real clusters receive ONLY real logs without synthetic generation.
   */
  public syncClusterPodLogs(orgId: string, clusterId: string): void {
    const cachedLogs = store.getCachedPodLogsForCluster(clusterId);
    const resources = store.getClusterResources(clusterId, orgId);
    const pods = resources.filter((r) => r.kind === 'Pod');
    const deployments = resources.filter((r) => r.kind === 'Deployment');
    const statefulSets = resources.filter((r) => r.kind === 'StatefulSet');
    const daemonSets = resources.filter((r) => r.kind === 'DaemonSet');

    const newRecords: LogRecord[] = [];
    const existing = this.collectedLogs.get(orgId) || [];
    const existingIds = new Set(existing.map((r) => r.id));

    // Ingest cached on-demand logs from agent / API
    for (const item of cachedLogs) {
      const matchingPod = pods.find((p) => p.name === item.podName && p.namespace === item.namespace);
      const workload = matchingPod ? this.resolveWorkloadNameForPod(matchingPod, deployments, statefulSets, daemonSets) : item.podName;
      const nodeName = matchingPod?.nodeName || 'unknown-node';

      const parsedLines = parseLogLines(item.logs);
      for (let i = 0; i < parsedLines.length; i++) {
        const line = parsedLines[i];
        const recordId = `log-${clusterId.slice(0, 8)}-${item.namespace}-${item.podName}-${item.container}-${item.previous ? 'prev' : 'curr'}-${i}`;
        if (existingIds.has(recordId)) continue;

        let timestampMs = item.updatedAt;
        if (line.timestamp) {
          const parsedMs = Date.parse(line.timestamp);
          if (!isNaN(parsedMs)) timestampMs = parsedMs;
        }

        const sev = this.inferSeverity(line.message);
        newRecords.push({
          id: recordId,
          clusterId,
          clusterName: matchingPod?.clusterName || 'Kubernetes Cluster',
          namespace: item.namespace,
          workload,
          podName: item.podName,
          container: item.container,
          nodeName,
          severity: sev,
          timestamp: new Date(timestampMs).toISOString(),
          timestampMs,
          message: line.message,
          raw: line.raw,
          isRedacted: line.raw.includes('[REDACTED'),
          isPrevious: item.previous
        });
      }
    }

    // Ingest diagnostic logs attached to Pod container objects
    for (const pod of pods) {
      const workload = this.resolveWorkloadNameForPod(pod, deployments, statefulSets, daemonSets);
      for (const container of pod.containers || []) {
        if (container.logs && typeof container.logs === 'string' && container.logs.trim().length > 0) {
          const parsedLines = parseLogLines(container.logs);
          for (let i = 0; i < parsedLines.length; i++) {
            const line = parsedLines[i];
            const recordId = `diag-${clusterId.slice(0, 8)}-${pod.namespace}-${pod.name}-${container.name}-${i}`;
            if (existingIds.has(recordId)) continue;

            let timestampMs = pod.createdAt || Date.now();
            if (line.timestamp) {
              const parsedMs = Date.parse(line.timestamp);
              if (!isNaN(parsedMs)) timestampMs = parsedMs;
            }

            const sev = this.inferSeverity(line.message);
            newRecords.push({
              id: recordId,
              clusterId,
              clusterName: pod.clusterName || 'Kubernetes Cluster',
              namespace: pod.namespace,
              workload,
              podName: pod.name,
              container: container.name,
              nodeName: pod.nodeName || 'unknown-node',
              severity: sev,
              timestamp: new Date(timestampMs).toISOString(),
              timestampMs,
              message: line.message,
              raw: line.raw,
              isRedacted: line.raw.includes('[REDACTED'),
              isPrevious: false
            });
          }
        }
      }
    }

    if (newRecords.length > 0) {
      this.ingestLogRecords(orgId, newRecords);
    }
  }

  /**
   * Generates demo fixture logs ONLY when explicitly requested for isolated demo sandboxes or tests.
   * Real clusters NEVER execute this.
   */
  public seedDemoLogs(orgId: string, clusterId: string, options: { workload?: string; isSpike?: boolean } = {}): LogRecord[] {
    const cluster = store.getCluster(clusterId, orgId) || { id: clusterId, name: 'Demo Cluster' };
    const workload = options.workload || 'demo-service';
    const now = Date.now();
    const records: LogRecord[] = [];
    const count = options.isSpike ? 30 : 15;

    for (let i = 0; i < count; i++) {
      const timeMs = now - (count - i) * 60000;
      const isErr = options.isSpike && i >= count - 10;
      const severity: LogSeverity = isErr ? 'ERROR' : 'INFO';
      const msg = isErr
        ? 'Connection timed out connecting to database backend'
        : `Service health check probe status 200 OK`;
      records.push({
        id: `demo-${clusterId.slice(0, 4)}-${i}`,
        clusterId,
        clusterName: cluster.name,
        namespace: 'demo',
        workload,
        podName: `${workload}-pod-${i % 3}`,
        container: 'main',
        nodeName: 'demo-node-01',
        severity,
        timestamp: new Date(timeMs).toISOString(),
        timestampMs: timeMs,
        message: msg,
        raw: `${new Date(timeMs).toISOString()} ${severity} [${workload}-pod-${i % 3}:main] ${msg}`,
        isRedacted: false,
        isPrevious: false
      });
    }

    this.ingestLogRecords(orgId, records);
    return records;
  }

  /**
   * Retrieves operational logs for a given cluster & org.
   * In production mode, returns strictly observed and ingested Kubernetes logs.
   * Never fabricates synthetic workloads or error spikes.
   */
  public async getOrGenerateClusterLogs(orgId: string, clusterId?: string): Promise<LogRecord[]> {
    if (clusterId) {
      this.syncClusterPodLogs(orgId, clusterId);
    } else {
      const clusters = store.getClusters(orgId);
      for (const cl of clusters) {
        this.syncClusterPodLogs(orgId, cl.id);
      }
    }

    let records = this.collectedLogs.get(orgId) || [];
    if (clusterId) {
      records = records.filter((r) => r.clusterId === clusterId);
    }

    // Check if cluster is explicitly flagged as a demo sandbox
    if (!records.length && clusterId) {
      const cluster = store.getCluster(clusterId, orgId);
      if (cluster && (cluster as any).isDemo) {
        records = this.seedDemoLogs(orgId, clusterId);
      }
    }

    return records;
  }

  // --- Search and Querying ---

  public async searchLogs(orgId: string, filter: LogQueryFilter): Promise<LogSearchResult> {
    const startExecution = Date.now();
    const allRecords = await this.getOrGenerateClusterLogs(orgId, filter.clusterId);

    const now = Date.now();
    let startTime = filter.startTimeMs;
    let endTime = filter.endTimeMs || now;

    if (!startTime && filter.sinceSeconds) {
      startTime = now - filter.sinceSeconds * 1000;
    }

    // Parse structured search tokens like "severity:error", "namespace:payments", "workload:checkout-api"
    let rawSearchTerm = (filter.search || '').trim();
    let parsedSeverity: string | null = null;
    let parsedNamespace: string | null = null;
    let parsedWorkload: string | null = null;
    let parsedPod: string | null = null;
    let parsedContainer: string | null = null;
    let parsedNode: string | null = null;

    if (rawSearchTerm) {
      const sevMatch = rawSearchTerm.match(/severity:(\w+)/i);
      if (sevMatch) {
        parsedSeverity = sevMatch[1].toUpperCase();
        rawSearchTerm = rawSearchTerm.replace(sevMatch[0], '').trim();
      }
      const nsMatch = rawSearchTerm.match(/namespace:([\w-]+)/i);
      if (nsMatch) {
        parsedNamespace = nsMatch[1].toLowerCase();
        rawSearchTerm = rawSearchTerm.replace(nsMatch[0], '').trim();
      }
      const wlMatch = rawSearchTerm.match(/workload:([\w-]+)/i);
      if (wlMatch) {
        parsedWorkload = wlMatch[1].toLowerCase();
        rawSearchTerm = rawSearchTerm.replace(wlMatch[0], '').trim();
      }
      const podMatch = rawSearchTerm.match(/pod:([\w-]+)/i);
      if (podMatch) {
        parsedPod = podMatch[1].toLowerCase();
        rawSearchTerm = rawSearchTerm.replace(podMatch[0], '').trim();
      }
      const containerMatch = rawSearchTerm.match(/container:([\w-]+)/i);
      if (containerMatch) {
        parsedContainer = containerMatch[1].toLowerCase();
        rawSearchTerm = rawSearchTerm.replace(containerMatch[0], '').trim();
      }
      const nodeMatch = rawSearchTerm.match(/node:([\w-]+)/i);
      if (nodeMatch) {
        parsedNode = nodeMatch[1].toLowerCase();
        rawSearchTerm = rawSearchTerm.replace(nodeMatch[0], '').trim();
      }
    }

    const searchLower = rawSearchTerm.toLowerCase();

    const filtered = allRecords.filter((r) => {
      // Cluster filter
      if (filter.clusterId && r.clusterId !== filter.clusterId) return false;

      // Namespace filter
      const targetNs = parsedNamespace || filter.namespace;
      if (targetNs && targetNs !== 'all' && r.namespace.toLowerCase() !== targetNs.toLowerCase()) return false;

      // Workload filter
      const targetWl = parsedWorkload || filter.workload;
      if (targetWl && targetWl !== 'all' && r.workload.toLowerCase() !== targetWl.toLowerCase()) return false;

      // Pod filter
      const targetPod = parsedPod || filter.podName;
      if (targetPod && targetPod !== 'all' && r.podName.toLowerCase() !== targetPod.toLowerCase()) return false;

      // Container filter
      const targetContainer = parsedContainer || filter.container;
      if (targetContainer && targetContainer !== 'all' && r.container.toLowerCase() !== targetContainer.toLowerCase()) return false;

      // Node filter
      const targetNode = parsedNode || filter.nodeName;
      if (targetNode && targetNode !== 'all' && r.nodeName && r.nodeName.toLowerCase() !== targetNode.toLowerCase()) return false;

      // Previous container logs filter
      if (filter.previous !== undefined && r.isPrevious !== filter.previous) return false;

      // Time range filter
      if (startTime && r.timestampMs < startTime) return false;
      if (endTime && r.timestampMs > endTime) return false;

      // Severity filter
      const targetSev = parsedSeverity || filter.severity;
      if (targetSev && targetSev !== 'ALL') {
        if (targetSev === 'ERRORS_ONLY') {
          if (r.severity !== 'ERROR' && r.severity !== 'FATAL') return false;
        } else if (targetSev === 'WARNINGS_AND_ERRORS') {
          if (r.severity !== 'ERROR' && r.severity !== 'FATAL' && r.severity !== 'WARN') return false;
        } else if (r.severity !== targetSev) {
          return false;
        }
      }

      // Substring search
      if (searchLower) {
        const matchesMsg = r.message.toLowerCase().includes(searchLower);
        const matchesRaw = r.raw.toLowerCase().includes(searchLower);
        const matchesPod = r.podName.toLowerCase().includes(searchLower);
        const matchesWl = r.workload.toLowerCase().includes(searchLower);
        if (!matchesMsg && !matchesRaw && !matchesPod && !matchesWl) return false;
      }

      return true;
    });

    const totalMatches = filtered.length;
    const limit = Math.min(1000, Math.max(10, filter.limit || 250));
    const offset = Math.max(0, filter.offset || 0);

    const paginated = filtered.slice(offset, offset + limit);

    return {
      records: paginated,
      totalMatches,
      limit,
      offset,
      hasMore: offset + limit < totalMatches,
      timeRangeMs: {
        start: startTime || (filtered.length ? filtered[filtered.length - 1].timestampMs : now - 3600000),
        end: endTime
      },
      queryDurationMs: Date.now() - startExecution
    };
  }

  // --- Workload-First Investigation Summaries ---

  public async getWorkloadSummaries(orgId: string, clusterId?: string, namespace?: string): Promise<WorkloadLogSummary[]> {
    const logs = await this.getOrGenerateClusterLogs(orgId, clusterId);
    
    // Find target clusters
    const clusters = store.getClusters(orgId).filter((c) => !clusterId || c.id === clusterId);
    if (!clusters.length) return [];

    const workloadsMap = new Map<string, {
      workload: string;
      namespace: string;
      kind: string;
      pods: Map<string, { name: string; errors: number; warnings: number; restarts: number; status: string; node?: string }>;
      totalLogs: number;
      errors: number;
      warnings: number;
    }>();

    // 1. Populate real workloads and pods from actual synchronized Kubernetes resources
    for (const cluster of clusters) {
      const resources = store.getClusterResources(cluster.id, orgId);
      const pods = resources.filter((r) => r.kind === 'Pod');
      const deployments = resources.filter((r) => r.kind === 'Deployment');
      const daemonSets = resources.filter((r) => r.kind === 'DaemonSet');
      const statefulSets = resources.filter((r) => r.kind === 'StatefulSet');

      for (const pod of pods) {
        if (namespace && namespace !== 'all' && pod.namespace.toLowerCase() !== namespace.toLowerCase()) {
          continue;
        }

        const wlName = this.resolveWorkloadNameForPod(pod, deployments, statefulSets, daemonSets);
        const wlKind = this.resolveWorkloadKindForPod(pod, deployments, statefulSets, daemonSets);
        const key = `${pod.namespace}/${wlName}`;

        let item = workloadsMap.get(key);
        if (!item) {
          item = {
            workload: wlName,
            namespace: pod.namespace,
            kind: wlKind,
            pods: new Map(),
            totalLogs: 0,
            errors: 0,
            warnings: 0
          };
          workloadsMap.set(key, item);
        }

        const restarts = pod.containers?.reduce((acc: number, c: any) => acc + (c.restartCount || 0), 0) || 0;
        item.pods.set(pod.name, {
          name: pod.name,
          errors: 0,
          warnings: 0,
          restarts,
          status: pod.status || 'Running',
          node: pod.nodeName
        });
      }
    }

    // 2. Cross-reference real collected logs
    for (const log of logs) {
      if (clusterId && log.clusterId !== clusterId) continue;
      if (namespace && namespace !== 'all' && log.namespace.toLowerCase() !== namespace.toLowerCase()) continue;

      const key = `${log.namespace}/${log.workload}`;
      let item = workloadsMap.get(key);
      if (!item) {
        item = {
          workload: log.workload,
          namespace: log.namespace,
          kind: 'Deployment',
          pods: new Map(),
          totalLogs: 0,
          errors: 0,
          warnings: 0
        };
        workloadsMap.set(key, item);
      }

      item.totalLogs++;
      const isError = log.severity === 'ERROR' || log.severity === 'FATAL';
      const isWarn = log.severity === 'WARN';
      if (isError) item.errors++;
      if (isWarn) item.warnings++;

      let podItem = item.pods.get(log.podName);
      if (!podItem) {
        podItem = {
          name: log.podName,
          errors: 0,
          warnings: 0,
          restarts: log.isPrevious ? 1 : 0,
          status: 'Running',
          node: log.nodeName
        };
        item.pods.set(log.podName, podItem);
      }

      if (isError) podItem.errors++;
      if (isWarn) podItem.warnings++;
    }

    const summaries: WorkloadLogSummary[] = [];
    for (const item of workloadsMap.values()) {
      const podList = Array.from(item.pods.values()).sort((a, b) => b.errors - a.errors || b.restarts - a.restarts);
      summaries.push({
        workload: item.workload,
        namespace: item.namespace,
        kind: item.kind,
        podCount: podList.length,
        logsPerMinute: item.totalLogs > 0 ? Math.max(1, Math.round(item.totalLogs / 15)) : 0,
        errorCount: item.errors,
        warningCount: item.warnings,
        pods: podList
      });
    }

    return summaries.sort((a, b) => b.errorCount - a.errorCount || b.warningCount - a.warningCount);
  }

  // --- Operational Overview Stats ---

  public async getOverviewStats(orgId: string, clusterId?: string): Promise<LogOverviewStats> {
    const logs = await this.getOrGenerateClusterLogs(orgId, clusterId);
    let totalLines = 0;
    let errors = 0;
    let warnings = 0;
    let bytes = 0;

    const now = Date.now();
    const currentWindowStart = now - 60 * 60 * 1000; // past 1 hour
    const previousWindowStart = now - 2 * 60 * 60 * 1000; // 1 to 2 hours ago

    let currentErrors = 0;
    let previousErrors = 0;
    let currentWarnings = 0;
    let previousWarnings = 0;

    for (const l of logs) {
      totalLines++;
      bytes += l.raw ? l.raw.length : (l.message?.length || 0);
      const isErr = l.severity === 'ERROR' || l.severity === 'FATAL';
      const isWarn = l.severity === 'WARN';

      if (isErr) {
        errors++;
        if (l.timestampMs >= currentWindowStart) currentErrors++;
        else if (l.timestampMs >= previousWindowStart && l.timestampMs < currentWindowStart) previousErrors++;
      }
      if (isWarn) {
        warnings++;
        if (l.timestampMs >= currentWindowStart) currentWarnings++;
        else if (l.timestampMs >= previousWindowStart && l.timestampMs < currentWindowStart) previousWarnings++;
      }
    }

    const alerts = this.getAlertRules(orgId).filter((r) => r.enabled && (!r.clusterId || r.clusterId === clusterId));
    const volumeMb = Math.round((bytes / (1024 * 1024)) * 10) / 10;
    const todayGb = Math.round((volumeMb / 1024) * 100) / 100;
    const projectedGb = Math.round(todayGb * 30 * 10) / 10;

    let errorChangePercent = 0;
    if (previousErrors > 0) {
      errorChangePercent = Math.round(((currentErrors - previousErrors) / previousErrors) * 100);
    } else if (currentErrors > 0) {
      errorChangePercent = 100;
    }

    let warningChangePercent = 0;
    if (previousWarnings > 0) {
      warningChangePercent = Math.round(((currentWarnings - previousWarnings) / previousWarnings) * 100);
    } else if (currentWarnings > 0) {
      warningChangePercent = 100;
    }

    return {
      totalVolumeMb: volumeMb,
      totalLogLines: totalLines,
      errorCount: errors,
      errorChangePercent,
      warningCount: warnings,
      warningChangePercent,
      activeAlertsCount: alerts.length,
      todayIngestionGb: todayGb,
      projectedMonthlyGb: projectedGb,
      storageUsedGb: Math.round(todayGb * 7 * 10) / 10,
      storageLimitGb: 50.0,
      retentionDays: 14,
      storageDaysRemaining: todayGb > 0 ? Math.max(1, Math.round((50.0 - todayGb) / todayGb)) : 30,
      costOptimizationRecommendation: totalLines > 0
        ? 'Filter or sample high-volume non-prod namespaces to minimize ingestion cost.'
        : 'Connect cluster agent to begin live operational log collection.'
    };
  }

  // --- Evidence-Based Error Spike Detection ---

  public normalizeErrorPattern(msg: string): string {
    if (!msg) return 'Unknown error';
    return msg
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
      .replace(/\b0x[0-9a-f]+\b/gi, '<HEX>')
      .replace(/\b[0-9a-f]{16,}\b/gi, '<HASH>')
      .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?\b/g, '<IP>')
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, '<TIME>')
      .trim();
  }

  public async detectErrorSpikes(orgId: string, clusterId?: string): Promise<ErrorSpike[]> {
    const logs = await this.getOrGenerateClusterLogs(orgId, clusterId);
    if (!logs.length) {
      return [];
    }

    const now = Date.now();
    // Current detection window: past 20 minutes
    const currentWindowDurationMs = 20 * 60 * 1000;
    const currentWindowStart = now - currentWindowDurationMs;
    // Comparable baseline window: preceding 60 minutes
    const baselineWindowDurationMs = 60 * 60 * 1000;
    const baselineWindowStart = currentWindowStart - baselineWindowDurationMs;

    const errorLogs = logs.filter((l) => l.severity === 'ERROR' || l.severity === 'FATAL');
    if (!errorLogs.length) {
      return [];
    }

    // Group error observations by cluster, namespace, and workload
    const workloadErrors = new Map<string, {
      clusterId: string;
      namespace: string;
      workload: string;
      currentRecords: LogRecord[];
      baselineRecords: LogRecord[];
    }>();

    for (const log of errorLogs) {
      if (log.timestampMs < baselineWindowStart) continue;

      const key = `${log.clusterId}:${log.namespace}:${log.workload}`;
      let entry = workloadErrors.get(key);
      if (!entry) {
        entry = {
          clusterId: log.clusterId,
          namespace: log.namespace,
          workload: log.workload,
          currentRecords: [],
          baselineRecords: []
        };
        workloadErrors.set(key, entry);
      }

      if (log.timestampMs >= currentWindowStart) {
        entry.currentRecords.push(log);
      } else {
        entry.baselineRecords.push(log);
      }
    }

    const spikes: ErrorSpike[] = [];
    const minSampleSize = 5; // Minimum observed errors in current window to constitute a spike
    const spikeThresholdMultiplier = 2.5; // Minimum 2.5x rate increase

    const existingIncidents = store.getIncidents(orgId);
    const clusterResources = clusterId ? store.getClusterResources(clusterId, orgId) : [];

    for (const entry of workloadErrors.values()) {
      const currentCount = entry.currentRecords.length;
      if (currentCount < minSampleSize) {
        continue;
      }

      const baselineCount = entry.baselineRecords.length;
      const currentRatePerHour = Math.round((currentCount / (currentWindowDurationMs / 3600000)));
      const baselineRatePerHour = Math.round((baselineCount / (baselineWindowDurationMs / 3600000)));

      let multiplier = 1;
      let isSpike = false;

      if (baselineRatePerHour > 0) {
        multiplier = Math.round((currentRatePerHour / baselineRatePerHour) * 10) / 10;
        if (multiplier >= spikeThresholdMultiplier) {
          isSpike = true;
        }
      } else {
        multiplier = Math.max(5, currentCount);
        isSpike = true;
      }

      if (!isSpike) {
        continue;
      }

      // Identify repeated error patterns using actual messages
      const patternCounts = new Map<string, { pattern: string; count: number; sample: string }>();
      for (const rec of entry.currentRecords) {
        const normalized = this.normalizeErrorPattern(rec.message);
        const existing = patternCounts.get(normalized);
        if (existing) {
          existing.count++;
        } else {
          patternCounts.set(normalized, { pattern: normalized, count: 1, sample: rec.message });
        }
      }

      const sortedPatterns = Array.from(patternCounts.values()).sort((a, b) => b.count - a.count);
      const topPattern = sortedPatterns[0]?.sample || entry.currentRecords[0].message;

      // Real start timestamp = earliest error record in current window
      const earliestTimestamp = entry.currentRecords.reduce(
        (min, r) => Math.min(min, r.timestampMs),
        entry.currentRecords[0].timestampMs
      );

      // Associated affected pods
      const affectedPods = new Set(entry.currentRecords.map((r) => r.podName));

      // Deduplication: link to existing incident if already tracked
      const relatedIncident = existingIncidents.find(
        (inc) =>
          inc.clusterId === entry.clusterId &&
          inc.namespace === entry.namespace &&
          (inc.resourceName === entry.workload || (inc as any).workload === entry.workload) &&
          (inc.status === 'OPEN' || inc.status === 'IN_PROGRESS' || inc.status === 'ACKNOWLEDGED')
      );

      // Correlate with real Deployments/ReplicaSets in the cluster if available
      let relatedDeployment: ErrorSpike['relatedDeployment'] | undefined;
      const targetClusterResources = store.getClusterResources(entry.clusterId, orgId);
      const matchingDep = targetClusterResources.find(
        (r) => r.kind === 'Deployment' && r.name === entry.workload && r.namespace === entry.namespace
      );
      if (matchingDep) {
        const image = matchingDep.containers?.[0]?.image;
        const rev = (matchingDep.annotations && matchingDep.annotations['deployment.kubernetes.io/revision']) || '1';
        relatedDeployment = {
          workload: entry.workload,
          revision: `v${rev}`,
          deployedAt: matchingDep.createdAt || earliestTimestamp - 5 * 60 * 1000,
          imageTag: image || `${entry.workload}:latest`,
          description: `Rollout of ${entry.workload} (revision ${rev}) in ${entry.namespace}`,
          confidence: 'HIGH'
        };
      }

      spikes.push({
        id: `spike-${crypto.randomBytes(4).toString('hex')}`,
        clusterId: entry.clusterId,
        namespace: entry.namespace,
        workload: entry.workload,
        normalRatePerHour: baselineRatePerHour,
        currentRatePerHour,
        multiplier,
        spikeStartedAt: earliestTimestamp,
        detectedAt: now,
        topErrorPattern: topPattern,
        affectedPodsCount: affectedPods.size,
        relatedDeployment,
        relatedIncidentId: relatedIncident?.id
      });
    }

    return spikes;
  }

  // --- Real Deployment Comparison ---

  public async compareDeployments(
    orgId: string,
    workload: string,
    namespace = 'production'
  ): Promise<DeploymentLogComparison> {
    const logs = await this.getOrGenerateClusterLogs(orgId);
    const wlLogs = logs.filter(
      (l) => l.workload === workload && (!namespace || namespace === 'all' || l.namespace === namespace)
    );

    const now = Date.now();
    const recentWindowStart = now - 30 * 60 * 1000; // past 30m
    const baselineWindowStart = now - 60 * 60 * 1000; // 30m to 60m ago

    let currentErrors = 0;
    let previousErrors = 0;
    const newPatterns: string[] = [];

    for (const l of wlLogs) {
      if (l.severity === 'ERROR' || l.severity === 'FATAL') {
        if (l.timestampMs >= recentWindowStart) {
          currentErrors++;
          if (newPatterns.length < 3 && !newPatterns.includes(l.message)) {
            newPatterns.push(l.message);
          }
        } else if (l.timestampMs >= baselineWindowStart && l.timestampMs < recentWindowStart) {
          previousErrors++;
        }
      }
    }

    const regressionDetected = currentErrors >= 5 && (previousErrors === 0 || currentErrors > previousErrors * 2);
    const verdict = regressionDetected
      ? `Regression detected on ${workload}: error volume elevated (${currentErrors} errors in post-deployment window vs ${previousErrors} in baseline window).`
      : currentErrors === 0 && previousErrors === 0
      ? `No error regressions detected for ${workload}. Service running stably across recent deployment window.`
      : `Error volume remains within baseline expectations (${currentErrors} current vs ${previousErrors} prior).`;

    return {
      workload,
      namespace,
      currentRevision: 'current',
      previousRevision: 'prior',
      currentErrors,
      previousErrors,
      newErrorPatterns: newPatterns,
      regressionDetected,
      verdict,
      confidence: regressionDetected ? 'HIGH' : 'LOW',
      timeWindowDescription: 'Comparing 30m window post-rollout vs 30m baseline pre-rollout'
    };
  }

  // --- Log to Incident Connection ---

  public async createIncidentFromLogs(
    orgId: string,
    clusterId: string,
    data: {
      workload: string;
      namespace: string;
      errorPattern: string;
      occurrences: number;
      timeWindow: string;
      sampleLines: string[];
    },
    actor: { id: string; name: string }
  ) {
    const cluster = store.getCluster(clusterId, orgId);
    const clusterName = cluster?.name || 'Production Cluster';

    // Deduplication: prevent duplicate incident tickets if pattern or workload already actively tracked
    const existing = store.getIncidents(orgId).find(
      (inc) =>
        inc.clusterId === clusterId &&
        inc.namespace === data.namespace &&
        (inc.resourceName === data.workload || (inc as any).workload === data.workload) &&
        (inc.status === 'OPEN' || inc.status === 'IN_PROGRESS' || inc.status === 'ACKNOWLEDGED')
    );
    if (existing) {
      return existing;
    }

    const title = `Log Alert: Error spike in ${data.workload} (${data.errorPattern.substring(0, 60)})`;
    const incident = store.createIncident(orgId, clusterId, {
      clusterName,
      namespace: data.namespace,
      resourceKind: 'Deployment',
      resourceName: data.workload,
      incidentType: 'CRASH_LOOP_BACKOFF',
      title,
      severity: 'HIGH',
      workload: data.workload,
      technicalDetails: {
        reason: 'ErrorSpikeDetected',
        message: `${data.occurrences} errors detected in ${data.timeWindow}: ${data.errorPattern}`,
        evidence: data.sampleLines.map((line) => ({
          source: 'LogCollectionEngine',
          reason: 'PatternMatch',
          message: line,
          timestamp: Date.now()
        }))
      }
    });

    auditService.record({
      orgId,
      actorId: actor.id,
      actorName: actor.name,
      actorType: 'USER',
      action: 'incident.create',
      resourceType: 'INCIDENT',
      resourceId: incident.id,
      result: 'SUCCESS',
      details: { workload: data.workload, pattern: data.errorPattern }
    });

    return incident;
  }

  // --- Export Log Evidence ---

  public async exportLogs(
    orgId: string,
    format: 'txt' | 'json' | 'csv',
    filter: LogQueryFilter,
    actor: { id: string; name: string }
  ): Promise<{ data: string; filename: string; mimeType: string }> {
    const result = await this.searchLogs(orgId, { ...filter, limit: 1000 });
    const records = result.records;
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `skyops-logs-${filter.workload || filter.clusterId || 'export'}-${timestampStr}.${format}`;

    let data = '';
    let mimeType = 'text/plain';

    if (format === 'json') {
      mimeType = 'application/json';
      data = JSON.stringify(records, null, 2);
    } else if (format === 'csv') {
      mimeType = 'text/csv';
      const headers = ['timestamp', 'severity', 'cluster', 'namespace', 'workload', 'podName', 'container', 'message'];
      const rows = records.map((r) => [
        `"${r.timestamp}"`,
        `"${r.severity}"`,
        `"${r.clusterName || r.clusterId}"`,
        `"${r.namespace}"`,
        `"${r.workload}"`,
        `"${r.podName}"`,
        `"${r.container}"`,
        `"${r.message.replace(/"/g, '""')}"`
      ]);
      data = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    } else {
      mimeType = 'text/plain';
      data = records.map((r) => `[${r.timestamp}] [${r.severity}] [${r.namespace}/${r.workload}/${r.podName}:${r.container}] ${r.message}`).join('\n');
    }

    auditService.record({
      orgId,
      actorId: actor.id,
      actorName: actor.name,
      actorType: 'USER',
      action: 'log.export' as any,
      resourceType: 'LOGS' as any,
      resourceId: filename,
      result: 'SUCCESS',
      details: { format, recordCount: records.length, workload: filter.workload }
    });

    return { data, filename, mimeType };
  }
}

export const logManager = new LogManager();
