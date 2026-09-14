import { MetricHistoryPoint } from '../../src/types/index';
import {
  BaselineMetric,
  BaselineQuality,
  BaselineScope,
  HistoricalBaseline
} from './types';

/**
 * Historical Baseline Engine
 *
 * Deterministically calculates mathematical baselines from bounded, authoritative
 * telemetry observations across Cluster, Node, Workload, Pod, and Container scopes.
 *
 * Zero-Fabrication Guarantee:
 *  - Requires a minimum of 6 observations. If fewer exist, returns status: 'UNAVAILABLE'
 *    with reason: 'Insufficient historical observations.'
 *  - Quality is explicitly evaluated as 'HIGH', 'MEDIUM', 'LOW', or 'INSUFFICIENT'.
 *  - Supports spike-preserving min/max from tiered raw and 5-minute aggregates.
 */
export class BaselineEngine {
  public static readonly MIN_SAMPLES_REQUIRED = 6;

  /**
   * Computes a deterministic baseline for a series of numeric observations.
   */
  public static calculateNumericBaseline(params: {
    scope: BaselineScope;
    resourceKind: string;
    resourceName: string;
    namespace?: string;
    clusterId: string;
    metric: BaselineMetric;
    timeWindow?: string;
    unit: string;
    samples: Array<{ value: number; weight?: number; min?: number; max?: number; timestamp?: number }>;
  }): HistoricalBaseline {
    const {
      scope,
      resourceKind,
      resourceName,
      namespace,
      clusterId,
      metric,
      timeWindow = '1h',
      unit,
      samples
    } = params;

    const baselineId = `base-${clusterId}-${scope}-${namespace ? namespace + '-' : ''}${resourceName}-${metric}-${timeWindow}`;
    const calculatedAt = Date.now();

    // Valid, finite non-negative numbers only
    const validSamples = samples.filter((s) => Number.isFinite(s.value) && s.value >= 0);

    if (validSamples.length < this.MIN_SAMPLES_REQUIRED) {
      return {
        baselineId,
        scope,
        resourceKind,
        resourceName,
        namespace,
        clusterId,
        metric,
        timeWindow,
        sampleCount: validSamples.length,
        centralValue: 0,
        mean: 0,
        median: 0,
        min: 0,
        max: 0,
        stdDev: 0,
        p95: 0,
        calculationMethod: 'rolling_statistics',
        quality: 'INSUFFICIENT',
        calculatedAt,
        status: 'UNAVAILABLE',
        unavailableReason: 'Insufficient historical observations.',
        unit
      };
    }

    // Sort ascending for median and percentiles
    const sortedValues = validSamples.map((s) => s.value).sort((a, b) => a - b);
    const n = sortedValues.length;

    // Weighted mean (supports 5m aggregates having sampleCount weights)
    let totalWeight = 0;
    let weightedSum = 0;
    for (const s of validSamples) {
      const w = Math.max(1, s.weight || 1);
      weightedSum += s.value * w;
      totalWeight += w;
    }
    const mean = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;

    // Median
    const mid = Math.floor(n / 2);
    const median = n % 2 === 0 ? Math.round(((sortedValues[mid - 1] + sortedValues[mid]) / 2) * 100) / 100 : sortedValues[mid];

    // Spike-preserving min and max
    let min = sortedValues[0];
    let max = sortedValues[n - 1];
    for (const s of validSamples) {
      if (s.min !== undefined && s.min < min) min = s.min;
      if (s.max !== undefined && s.max > max) max = s.max;
    }

    // Standard Deviation
    let varianceSum = 0;
    for (const s of validSamples) {
      varianceSum += Math.pow(s.value - mean, 2);
    }
    const variance = varianceSum / n;
    const stdDev = Math.round(Math.sqrt(variance) * 100) / 100;

    // 95th Percentile
    const p95Index = Math.min(n - 1, Math.floor(0.95 * n));
    const p95 = sortedValues[p95Index];

    // Quality evaluation based on sample count and time span
    let quality: BaselineQuality = 'LOW';
    const firstTs = validSamples[0]?.timestamp;
    const lastTs = validSamples[validSamples.length - 1]?.timestamp;
    const timeSpanMs = (firstTs && lastTs && lastTs >= firstTs) ? (lastTs - firstTs) : 0;

    if (n >= 60 || timeSpanMs >= 6 * 60 * 60 * 1000) {
      quality = 'HIGH';
    } else if (n >= 20 || timeSpanMs >= 60 * 60 * 1000) {
      quality = 'MEDIUM';
    } else {
      quality = 'LOW';
    }

    return {
      baselineId,
      scope,
      resourceKind,
      resourceName,
      namespace,
      clusterId,
      metric,
      timeWindow,
      sampleCount: n,
      centralValue: median,
      mean,
      median,
      min,
      max,
      stdDev,
      p95,
      calculationMethod: 'rolling_statistics',
      quality,
      calculatedAt,
      status: 'AVAILABLE',
      unit
    };
  }

  /**
   * Computes cluster-wide baselines from historical MetricHistoryPoint records.
   */
  public static calculateClusterBaselines(
    clusterId: string,
    history: MetricHistoryPoint[],
    timeWindow: string = '1h'
  ): HistoricalBaseline[] {
    const baselines: HistoricalBaseline[] = [];

    // Filter points with valid runtime CPU
    const cpuSamples = history
      .filter((p) => p.isUsageAvailable && p.cpuUsageMillicores !== undefined && Number.isFinite(p.cpuUsageMillicores))
      .map((p) => ({
        value: p.cpuUsageMillicores!,
        weight: p.sampleCount || 1,
        min: p.cpuUsageMinMillicores,
        max: p.cpuUsageMaxMillicores,
        timestamp: p.timestamp
      }));

    baselines.push(
      this.calculateNumericBaseline({
        scope: 'cluster',
        resourceKind: 'Cluster',
        resourceName: clusterId,
        clusterId,
        metric: 'cpu_usage',
        timeWindow,
        unit: 'millicores',
        samples: cpuSamples
      })
    );

    // Filter points with valid runtime Memory
    const memSamples = history
      .filter((p) => p.isUsageAvailable && p.memoryUsageBytes !== undefined && Number.isFinite(p.memoryUsageBytes))
      .map((p) => ({
        value: p.memoryUsageBytes!,
        weight: p.sampleCount || 1,
        min: p.memoryUsageMinBytes,
        max: p.memoryUsageMaxBytes,
        timestamp: p.timestamp
      }));

    baselines.push(
      this.calculateNumericBaseline({
        scope: 'cluster',
        resourceKind: 'Cluster',
        resourceName: clusterId,
        clusterId,
        metric: 'memory_usage',
        timeWindow,
        unit: 'bytes',
        samples: memSamples
      })
    );

    return baselines;
  }

  /**
   * Formats baseline values into human-readable strings.
   */
  public static formatBaselineValue(baseline: HistoricalBaseline): string {
    if (baseline.status === 'UNAVAILABLE') {
      return baseline.unavailableReason || 'Unavailable';
    }

    switch (baseline.metric) {
      case 'cpu_usage': {
        if (baseline.unit === 'millicores') {
          return baseline.centralValue < 1000
            ? `${Math.round(baseline.centralValue)}m`
            : `${(baseline.centralValue / 1000).toFixed(2)} cores`;
        }
        return `${Math.round(baseline.centralValue)}%`;
      }
      case 'memory_usage': {
        if (baseline.unit === 'bytes') {
          const mib = baseline.centralValue / (1024 * 1024);
          return mib >= 1024
            ? `${(mib / 1024).toFixed(2)} GiB`
            : `${Math.round(mib)} MiB`;
        }
        return `${Math.round(baseline.centralValue)}%`;
      }
      case 'restart_rate':
        return `${baseline.centralValue.toFixed(1)} restarts/hr`;
      case 'replica_availability':
        return `${Math.round(baseline.centralValue)}%`;
      case 'node_pressure':
        return `${Math.round(baseline.centralValue * 100)}% pressure`;
      case 'event_frequency':
        return `${baseline.centralValue.toFixed(1)} events/hr`;
      case 'error_frequency':
        return `${baseline.centralValue.toFixed(1)} errors/hr`;
      default:
        return `${baseline.centralValue} ${baseline.unit}`;
    }
  }

  /**
   * Compares an observed value against its baseline to produce deviation stats.
   */
  public static compareWithBaseline(
    observedValue: number,
    baseline: HistoricalBaseline
  ): {
    hasAnomaly: boolean;
    deviationRatio: number;
    sigmaDeviation: number;
    description: string;
  } {
    if (baseline.status === 'UNAVAILABLE' || baseline.centralValue === 0) {
      return {
        hasAnomaly: false,
        deviationRatio: 1.0,
        sigmaDeviation: 0,
        description: 'Baseline unavailable for comparative analysis.'
      };
    }

    const deviationRatio = baseline.centralValue > 0
      ? Math.round((observedValue / baseline.centralValue) * 100) / 100
      : 1.0;

    const sigmaDeviation = baseline.stdDev > 0
      ? Math.round(((observedValue - baseline.mean) / baseline.stdDev) * 10) / 10
      : 0;

    // A true operational spike must exceed P95, be at least +2.5σ, and exhibit at least a 30% surge (deviationRatio >= 1.3)
    const isHighSpike = observedValue > baseline.p95 && sigmaDeviation >= 2.5 && deviationRatio >= 1.3;
    const isMajorSurge = deviationRatio >= 2.0 && observedValue > baseline.mean + 2 * baseline.stdDev;
    const hasAnomaly = isHighSpike || isMajorSurge;

    let description = '';
    if (hasAnomaly) {
      description = `Observed value (${observedValue}) is ${deviationRatio}x baseline median (${baseline.centralValue}) with +${sigmaDeviation}σ deviation.`;
    } else {
      description = `Observed value is within normal operational range (${baseline.min} - ${baseline.max}).`;
    }

    return {
      hasAnomaly,
      deviationRatio,
      sigmaDeviation,
      description
    };
  }
}
