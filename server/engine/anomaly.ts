import { KubernetesResource, MetricHistoryPoint } from '../../src/types/index';
import { BaselineEngine } from './baseline';
import {
  AnomalyStatus,
  AnomalyType,
  DetectedAnomaly,
  HistoricalBaseline
} from './types';

/**
 * Deterministic Anomaly Detection Engine
 *
 * Evaluates real Kubernetes runtime telemetry, conditions, and event frequencies
 * to detect operational anomalies without non-deterministic LLM hallucination.
 *
 * False-Positive Prevention:
 *  - Requires 2-3 consecutive samples for sustained high and growth patterns.
 *  - Statistical anomalies check against historical baselines and standard deviations.
 *  - Fallbacks to authoritative deterministic indicators (exit codes, condition flags)
 *    when baselines have insufficient samples.
 */
export class AnomalyDetector {
  /**
   * Evaluates cluster-level historical metric points and current telemetry for anomalies.
   */
  public static detectClusterAnomalies(params: {
    orgId: string;
    clusterId: string;
    history: MetricHistoryPoint[];
    baselines: HistoricalBaseline[];
    now?: number;
  }): DetectedAnomaly[] {
    const { orgId, clusterId, history, baselines, now = Date.now() } = params;
    const anomalies: DetectedAnomaly[] = [];

    if (!history || history.length === 0) {
      return anomalies;
    }

    const recentPoints = history.filter((p) => p && p.isUsageAvailable);
    if (recentPoints.length === 0) {
      return anomalies;
    }

    const latest = recentPoints[recentPoints.length - 1];
    const cpuBaseline = baselines.find((b) => b.metric === 'cpu_usage' && b.scope === 'cluster');
    const memBaseline = baselines.find((b) => b.metric === 'memory_usage' && b.scope === 'cluster');

    // 1. Cluster CPU Spike / Sustained High
    if (latest.cpuUsageMillicores !== undefined && Number.isFinite(latest.cpuUsageMillicores)) {
      const cpuVal = latest.cpuUsageMillicores;
      const cpuDisp = cpuVal < 1000 ? `${Math.round(cpuVal)}m` : `${(cpuVal / 1000).toFixed(2)} cores`;

      // Check against baseline if available
      if (cpuBaseline && cpuBaseline.status === 'AVAILABLE') {
        const comp = BaselineEngine.compareWithBaseline(cpuVal, cpuBaseline);
        if (comp.hasAnomaly) {
          anomalies.push({
            id: `anom-cpu-spike-${clusterId}-${latest.timestamp}`,
            orgId,
            clusterId,
            resourceId: clusterId,
            resourceKind: 'Cluster',
            resourceName: clusterId,
            metric: 'cpu_usage',
            anomalyType: 'CPU_SPIKE',
            observedValue: cpuVal,
            observedDisplay: cpuDisp,
            baselineValue: cpuBaseline.centralValue,
            baselineDisplay: BaselineEngine.formatBaselineValue(cpuBaseline),
            deviation: comp.deviationRatio,
            deviationDisplay: `${comp.deviationRatio}x baseline (+${comp.sigmaDeviation}σ)`,
            detectionWindow: '15m',
            firstObservedAt: latest.timestamp,
            lastObservedAt: latest.timestamp,
            severity: comp.sigmaDeviation >= 4.0 ? 'CRITICAL' : 'WARNING',
            confidence: cpuBaseline.quality === 'HIGH' ? 0.95 : 0.85,
            evidenceReferences: [`cluster_metric_ts_${latest.timestamp}`],
            status: 'ACTIVE',
            details: comp.description
          });
        }
      }

      // Check sustained high utilization (last 3 points all > 85% utilization)
      if (recentPoints.length >= 3) {
        const last3 = recentPoints.slice(-3);
        const allHigh = last3.every(
          (p) => p.cpuUsagePercent !== undefined && p.cpuUsagePercent >= 85
        );
        if (allHigh) {
          const avgUtil = Math.round(last3.reduce((s, p) => s + (p.cpuUsagePercent || 0), 0) / 3);
          anomalies.push({
            id: `anom-cpu-sustained-${clusterId}-${latest.timestamp}`,
            orgId,
            clusterId,
            resourceId: clusterId,
            resourceKind: 'Cluster',
            resourceName: clusterId,
            metric: 'cpu_utilization',
            anomalyType: 'CPU_SUSTAINED_HIGH',
            observedValue: avgUtil,
            observedDisplay: `${avgUtil}% utilization`,
            deviation: Math.round((avgUtil / 85) * 100) / 100,
            deviationDisplay: `${avgUtil}% sustained across 3 consecutive windows (>85% threshold)`,
            detectionWindow: '15m',
            firstObservedAt: last3[0].timestamp,
            lastObservedAt: latest.timestamp,
            severity: avgUtil >= 95 ? 'CRITICAL' : 'WARNING',
            confidence: 0.92,
            evidenceReferences: last3.map((p) => `cluster_metric_ts_${p.timestamp}`),
            status: 'ACTIVE',
            details: `Cluster CPU utilization sustained at ${avgUtil}% across consecutive observation windows.`
          });
        }
      }
    }

    // 2. Cluster Memory Sustained High / Spike
    if (latest.memoryUsageBytes !== undefined && Number.isFinite(latest.memoryUsageBytes)) {
      const memVal = latest.memoryUsageBytes;
      const memMib = Math.round(memVal / (1024 * 1024));
      const memDisp = memMib >= 1024 ? `${(memMib / 1024).toFixed(2)} GiB` : `${memMib} MiB`;

      if (memBaseline && memBaseline.status === 'AVAILABLE') {
        const comp = BaselineEngine.compareWithBaseline(memVal, memBaseline);
        if (comp.hasAnomaly) {
          anomalies.push({
            id: `anom-mem-spike-${clusterId}-${latest.timestamp}`,
            orgId,
            clusterId,
            resourceId: clusterId,
            resourceKind: 'Cluster',
            resourceName: clusterId,
            metric: 'memory_usage',
            anomalyType: 'MEMORY_SPIKE',
            observedValue: memVal,
            observedDisplay: memDisp,
            baselineValue: memBaseline.centralValue,
            baselineDisplay: BaselineEngine.formatBaselineValue(memBaseline),
            deviation: comp.deviationRatio,
            deviationDisplay: `${comp.deviationRatio}x baseline (+${comp.sigmaDeviation}σ)`,
            detectionWindow: '15m',
            firstObservedAt: latest.timestamp,
            lastObservedAt: latest.timestamp,
            severity: comp.sigmaDeviation >= 3.5 ? 'CRITICAL' : 'WARNING',
            confidence: memBaseline.quality === 'HIGH' ? 0.95 : 0.85,
            evidenceReferences: [`cluster_metric_ts_${latest.timestamp}`],
            status: 'ACTIVE',
            details: comp.description
          });
        }
      }

      // Memory growth: 4 consecutive rising points
      if (recentPoints.length >= 4) {
        const last4 = recentPoints.slice(-4);
        let strictlyIncreasing = true;
        for (let i = 1; i < last4.length; i++) {
          const prev = last4[i - 1].memoryUsageBytes || 0;
          const curr = last4[i].memoryUsageBytes || 0;
          if (curr <= prev) {
            strictlyIncreasing = false;
            break;
          }
        }
        if (strictlyIncreasing) {
          const startMib = Math.round((last4[0].memoryUsageBytes || 0) / (1024 * 1024));
          const endMib = Math.round((last4[3].memoryUsageBytes || 0) / (1024 * 1024));
          const growthDelta = endMib - startMib;
          if (growthDelta >= 100) {
            anomalies.push({
              id: `anom-mem-growth-${clusterId}-${latest.timestamp}`,
              orgId,
              clusterId,
              resourceId: clusterId,
              resourceKind: 'Cluster',
              resourceName: clusterId,
              metric: 'memory_growth',
              anomalyType: 'MEMORY_GROWTH',
              observedValue: growthDelta,
              observedDisplay: `+${growthDelta} MiB increase`,
              deviation: Math.round((endMib / (startMib || 1)) * 100) / 100,
              deviationDisplay: `Monotonically increasing (+${growthDelta} MiB over 4 consecutive windows)`,
              detectionWindow: '30m',
              firstObservedAt: last4[0].timestamp,
              lastObservedAt: latest.timestamp,
              severity: 'WARNING',
              confidence: 0.85,
              evidenceReferences: last4.map((p) => `cluster_metric_ts_${p.timestamp}`),
              status: 'ACTIVE',
              details: `Cluster memory usage grew continuously from ${startMib} MiB to ${endMib} MiB without recovery.`
            });
          }
        }
      }
    }

    return anomalies;
  }

  /**
   * Evaluates a specific Kubernetes resource for operational anomalies.
   */
  public static detectResourceAnomalies(params: {
    orgId: string;
    clusterId: string;
    resource: KubernetesResource;
    allResources?: KubernetesResource[];
    baselines?: HistoricalBaseline[];
    now?: number;
  }): DetectedAnomaly[] {
    const { orgId, clusterId, resource, allResources = [], baselines = [], now = Date.now() } = params;
    const anomalies: DetectedAnomaly[] = [];
    const resId = resource.id || `${clusterId}-${resource.kind}-${resource.namespace || 'default'}-${resource.name}`;
    const ns = resource.namespace || 'default';

    // 1. Pod Resource Anomaly Detection
    if (resource.kind === 'Pod') {
      const containers = resource.containers || [];
      const events = resource.events || [];

      // 1a. Restart Count Spikes
      for (const c of containers) {
        if (c.restartCount !== undefined && c.restartCount >= 3) {
          anomalies.push({
            id: `anom-restart-${resource.name}-${c.name}-${now}`,
            orgId,
            clusterId,
            resourceId: resId,
            resourceKind: 'Pod',
            resourceName: resource.name,
            namespace: ns,
            metric: `containers.${c.name}.restarts`,
            anomalyType: 'RESTART_SPIKE',
            observedValue: c.restartCount,
            observedDisplay: `${c.restartCount} restarts`,
            deviation: c.restartCount,
            deviationDisplay: `${c.restartCount} restarts observed (exceeds threshold of 3)`,
            detectionWindow: 'recent',
            firstObservedAt: resource.updatedAt || now,
            lastObservedAt: resource.updatedAt || now,
            severity: c.restartCount >= 10 ? 'CRITICAL' : 'WARNING',
            confidence: 1.0, // Authoritative CRI fact
            evidenceReferences: [`container_${c.name}_restarts_${c.restartCount}`],
            status: 'ACTIVE',
            details: `Container "${c.name}" has restarted ${c.restartCount} times.`
          });
        }

        // 1b. Crash / Non-zero exit code
        if (c.exitCode !== undefined && c.exitCode !== 0) {
          const isOOM = c.exitCode === 137 || c.terminationReason === 'OOMKilled';
          anomalies.push({
            id: `anom-exitcode-${resource.name}-${c.name}-${now}`,
            orgId,
            clusterId,
            resourceId: resId,
            resourceKind: 'Pod',
            resourceName: resource.name,
            namespace: ns,
            metric: `containers.${c.name}.exitCode`,
            anomalyType: 'ERROR_RATE_ANOMALY',
            observedValue: c.exitCode,
            observedDisplay: `Exit Code ${c.exitCode}${isOOM ? ' (OOMKilled)' : ''}`,
            deviation: 1.0,
            deviationDisplay: `Non-zero exit code: ${c.exitCode}`,
            detectionWindow: 'exit_status',
            firstObservedAt: resource.updatedAt || now,
            lastObservedAt: resource.updatedAt || now,
            severity: isOOM ? 'CRITICAL' : 'WARNING',
            confidence: 1.0,
            evidenceReferences: [`container_${c.name}_exitcode_${c.exitCode}`],
            status: 'ACTIVE',
            details: isOOM
              ? `Container "${c.name}" killed by Linux OOM Killer (exit code 137: memory limit exceeded).`
              : `Container "${c.name}" terminated abnormally with exit code ${c.exitCode}.`
          });
        }
      }

      // 1c. Elevated Warning Event Frequency
      const warningEvents = events.filter((e) => e.type === 'Warning');
      if (warningEvents.length >= 3) {
        anomalies.push({
          id: `anom-event-rate-${resource.name}-${now}`,
          orgId,
          clusterId,
          resourceId: resId,
          resourceKind: 'Pod',
          resourceName: resource.name,
          namespace: ns,
          metric: 'warning_events_frequency',
          anomalyType: 'EVENT_RATE_ANOMALY',
          observedValue: warningEvents.length,
          observedDisplay: `${warningEvents.length} warning events`,
          deviation: warningEvents.length,
          deviationDisplay: `${warningEvents.length} warning events on pod (threshold >= 3)`,
          detectionWindow: '1h',
          firstObservedAt: warningEvents[0].timestamp || now,
          lastObservedAt: warningEvents[warningEvents.length - 1].timestamp || now,
          severity: warningEvents.length >= 6 ? 'CRITICAL' : 'WARNING',
          confidence: 0.95,
          evidenceReferences: warningEvents.map((e, idx) => `pod_warning_event_${idx}_${e.reason}`),
          status: 'ACTIVE',
          details: `Pod has accumulated ${warningEvents.length} Warning events (reasons: ${[...new Set(warningEvents.map((e) => e.reason))].join(', ')}).`
        });
      }
    }

    // 2. Node Resource Anomaly Detection
    if (resource.kind === 'Node') {
      const conditions = resource.conditions || [];
      const pressureConditions = conditions.filter(
        (c) => ['MemoryPressure', 'DiskPressure', 'PIDPressure'].includes(c.type) && c.status === 'True'
      );
      const readyCond = conditions.find((c) => c.type === 'Ready');

      if (pressureConditions.length > 0 || (readyCond && readyCond.status !== 'True')) {
        const issues = pressureConditions.map((c) => c.type);
        if (readyCond && readyCond.status !== 'True') issues.push(`NotReady (${readyCond.message || 'Kubelet unready'})`);

        anomalies.push({
          id: `anom-node-pressure-${resource.name}-${now}`,
          orgId,
          clusterId,
          resourceId: resId,
          resourceKind: 'Node',
          resourceName: resource.name,
          metric: 'node_conditions',
          anomalyType: 'NODE_PRESSURE',
          observedValue: issues.length,
          observedDisplay: issues.join(', '),
          deviation: 1.0,
          deviationDisplay: `Condition flags tripped: ${issues.join(', ')}`,
          detectionWindow: 'node_status',
          firstObservedAt: resource.updatedAt || now,
          lastObservedAt: resource.updatedAt || now,
          severity: 'CRITICAL',
          confidence: 1.0,
          evidenceReferences: issues.map((i) => `node_condition_${i}`),
          status: 'ACTIVE',
          details: `Node "${resource.name}" reporting active pressure or unready condition: ${issues.join(', ')}.`
        });
      }
    }

    // 3. Workload (Deployment / StatefulSet / DaemonSet) Replica Degradation
    if (['Deployment', 'StatefulSet', 'DaemonSet'].includes(resource.kind)) {
      const spec = (resource.specSummary || {}) as Record<string, unknown>;
      const status = (resource.statusSummary || {}) as Record<string, unknown>;
      const desiredReplicas = Number(spec.replicas ?? 1);
      const readyReplicas = Number(status.readyReplicas ?? status.availableReplicas ?? 0);

      if (desiredReplicas > 0 && readyReplicas < desiredReplicas) {
        const ratio = Math.round((readyReplicas / desiredReplicas) * 100);
        anomalies.push({
          id: `anom-replica-degradation-${resource.name}-${now}`,
          orgId,
          clusterId,
          resourceId: resId,
          resourceKind: resource.kind,
          resourceName: resource.name,
          namespace: ns,
          metric: 'replica_availability',
          anomalyType: 'REPLICA_DEGRADATION',
          observedValue: readyReplicas,
          observedDisplay: `${readyReplicas}/${desiredReplicas} replicas ready`,
          baselineValue: desiredReplicas,
          baselineDisplay: `${desiredReplicas} desired replicas`,
          deviation: Math.round((1 - readyReplicas / desiredReplicas) * 100) / 100,
          deviationDisplay: `${ratio}% replica availability (${desiredReplicas - readyReplicas} replicas missing)`,
          detectionWindow: 'workload_spec_status',
          firstObservedAt: resource.updatedAt || now,
          lastObservedAt: resource.updatedAt || now,
          severity: readyReplicas === 0 ? 'CRITICAL' : 'WARNING',
          confidence: 1.0,
          evidenceReferences: [`workload_replicas_${readyReplicas}_of_${desiredReplicas}`],
          status: 'ACTIVE',
          details: `Workload ${resource.kind}/${resource.name} is degraded: only ${readyReplicas} of ${desiredReplicas} desired replicas are ready.`
        });
      }
    }

    return anomalies;
  }
}
