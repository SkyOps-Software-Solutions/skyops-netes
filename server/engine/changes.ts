import { KubernetesResource } from '../../src/types/index';
import {
  ChangeCorrelation,
  ChangeType,
  ResourceChangeRecord,
  ResourceRelationship
} from './types';

/**
 * Change Detection & Temporal Correlation Engine
 *
 * Tracks real specification and state transitions between successive observations,
 * and correlates antecedent changes with detected incidents without making ungrounded causal claims.
 */
export class ChangeTracker {
  /**
   * Compares prior resource state with newly observed resource state to detect changes.
   */
  public static detectResourceChanges(
    previous: KubernetesResource,
    current: KubernetesResource,
    now: number = Date.now()
  ): ResourceChangeRecord[] {
    const changes: ResourceChangeRecord[] = [];
    const orgId = (current as any).orgId || (previous as any).orgId || 'default';
    const clusterId = current.clusterId || previous.clusterId || '';
    const kind = current.kind;
    const name = current.name;
    const namespace = current.namespace || 'default';

    const prevSpec = (previous.specSummary || {}) as Record<string, unknown>;
    const currSpec = (current.specSummary || {}) as Record<string, unknown>;

    // 1. Container Image Updates (Deployments, StatefulSets, DaemonSets, Pods)
    const prevImage = prevSpec.image || (previous.containers?.[0]?.image);
    const currImage = currSpec.image || (current.containers?.[0]?.image);

    if (prevImage && currImage && prevImage !== currImage) {
      changes.push({
        id: `chg-img-${clusterId}-${kind}-${name}-${now}`,
        orgId,
        clusterId,
        resourceKind: kind,
        resourceName: name,
        namespace,
        changeType: 'IMAGE_UPDATE',
        attribute: 'spec.containers[0].image',
        oldValue: prevImage,
        newValue: currImage,
        description: `Container image updated from "${prevImage}" to "${currImage}"`,
        timestamp: current.updatedAt || now
      });
    }

    // 2. Replicas Scaling (Deployments, StatefulSets)
    const prevReplicas = prevSpec.replicas !== undefined ? Number(prevSpec.replicas) : undefined;
    const currReplicas = currSpec.replicas !== undefined ? Number(currSpec.replicas) : undefined;

    if (prevReplicas !== undefined && currReplicas !== undefined && prevReplicas !== currReplicas) {
      changes.push({
        id: `chg-rep-${clusterId}-${kind}-${name}-${now}`,
        orgId,
        clusterId,
        resourceKind: kind,
        resourceName: name,
        namespace,
        changeType: 'REPLICA_COUNT',
        attribute: 'spec.replicas',
        oldValue: prevReplicas,
        newValue: currReplicas,
        description: `Desired replica count scaled from ${prevReplicas} to ${currReplicas}`,
        timestamp: current.updatedAt || now
      });
    }

    // 3. Node Condition Transitions (Node)
    if (kind === 'Node') {
      const prevConds = previous.conditions || [];
      const currConds = current.conditions || [];

      for (const currC of currConds) {
        const prevC = prevConds.find((c) => c.type === currC.type);
        if (prevC && prevC.status !== currC.status) {
          changes.push({
            id: `chg-node-cond-${name}-${currC.type}-${now}`,
            orgId,
            clusterId,
            resourceKind: kind,
            resourceName: name,
            namespace,
            changeType: 'NODE_CONDITION',
            attribute: `conditions.${currC.type}`,
            oldValue: prevC.status,
            newValue: currC.status,
            description: `Node condition ${currC.type} transitioned from "${prevC.status}" to "${currC.status}"`,
            timestamp: current.updatedAt || now
          });
        }
      }
    }

    // 4. Resource Limits / Requests changes
    const prevContainers = previous.containers || [];
    const currContainers = current.containers || [];
    for (const currC of currContainers) {
      const prevC = prevContainers.find((c) => c.name === currC.name);
      if (prevC) {
        if (prevC.memoryLimit && currC.memoryLimit && prevC.memoryLimit !== currC.memoryLimit) {
          changes.push({
            id: `chg-limit-${name}-${currC.name}-mem-${now}`,
            orgId,
            clusterId,
            resourceKind: kind,
            resourceName: name,
            namespace,
            changeType: 'RESOURCE_LIMITS',
            attribute: `containers.${currC.name}.limits.memory`,
            oldValue: prevC.memoryLimit,
            newValue: currC.memoryLimit,
            description: `Memory limit for container "${currC.name}" changed from ${prevC.memoryLimit} to ${currC.memoryLimit}`,
            timestamp: current.updatedAt || now
          });
        }
        if (prevC.cpuLimit && currC.cpuLimit && prevC.cpuLimit !== currC.cpuLimit) {
          changes.push({
            id: `chg-limit-${name}-${currC.name}-cpu-${now}`,
            orgId,
            clusterId,
            resourceKind: kind,
            resourceName: name,
            namespace,
            changeType: 'RESOURCE_LIMITS',
            attribute: `containers.${currC.name}.limits.cpu`,
            oldValue: prevC.cpuLimit,
            newValue: currC.cpuLimit,
            description: `CPU limit for container "${currC.name}" changed from ${prevC.cpuLimit} to ${currC.cpuLimit}`,
            timestamp: current.updatedAt || now
          });
        }
      }
    }

    return changes;
  }

  /**
   * Correlates recent changes with a target incident resource and incident detection timestamp.
   */
  public static correlateChangesWithIncident(params: {
    targetResource: { kind: string; name: string; namespace?: string };
    incidentTimestamp: number;
    relationships: ResourceRelationship[];
    allChanges: ResourceChangeRecord[];
    lookbackWindowMs?: number;
  }): ChangeCorrelation[] {
    const {
      targetResource,
      incidentTimestamp,
      relationships,
      allChanges,
      lookbackWindowMs = 60 * 60 * 1000 // 1 hour lookback
    } = params;

    const correlations: ChangeCorrelation[] = [];
    const targetNs = (targetResource.namespace || 'default').toLowerCase();
    const targetName = targetResource.name.toLowerCase();
    const targetKind = targetResource.kind.toLowerCase();

    // Find candidate changes that occurred before or around the incident
    const minTimestamp = incidentTimestamp - lookbackWindowMs;
    const candidateChanges = allChanges.filter(
      (chg) => chg.timestamp >= minTimestamp && chg.timestamp <= incidentTimestamp + 5 * 60 * 1000
    );

    for (const chg of candidateChanges) {
      const chgNs = (chg.namespace || 'default').toLowerCase();
      const chgName = chg.resourceName.toLowerCase();
      const chgKind = chg.resourceKind.toLowerCase();

      let relationship: 'SAME_RESOURCE' | 'CONTROLLER' | 'HOST_NODE' | 'DEPENDENT' | null = null;

      // 1. Direct Same Resource match
      if (chgKind === targetKind && chgName === targetName && chgNs === targetNs) {
        relationship = 'SAME_RESOURCE';
      }

      // 2. Controller relationship match
      if (!relationship) {
        const isController = relationships.some(
          (rel) =>
            rel.relation === 'OWNED_BY' &&
            rel.target.kind.toLowerCase() === chgKind &&
            rel.target.name.toLowerCase() === chgName
        );
        if (isController) {
          relationship = 'CONTROLLER';
        }
      }

      // 3. Scheduled Node relationship match
      if (!relationship) {
        const isHostNode = relationships.some(
          (rel) =>
            rel.relation === 'SCHEDULED_ON' &&
            rel.target.name.toLowerCase() === chgName
        );
        if (isHostNode) {
          relationship = 'HOST_NODE';
        }
      }

      // 4. Dependent / Mounting relationship match
      if (!relationship) {
        const isDependent = relationships.some(
          (rel) =>
            (rel.relation === 'MOUNTS_PVC' || rel.relation === 'EXPOSED_BY_SERVICE') &&
            rel.target.name.toLowerCase() === chgName
        );
        if (isDependent) {
          relationship = 'DEPENDENT';
        }
      }

      // If related, calculate proximity and strength
      if (relationship) {
        const proximityMs = incidentTimestamp - chg.timestamp;
        const absProximityMs = Math.abs(proximityMs);

        // Format friendly proximity string
        let proximityDisplay = '';
        if (proximityMs >= 0) {
          const secs = Math.round(proximityMs / 1000);
          if (secs < 60) proximityDisplay = `${secs}s before incident`;
          else {
            const mins = Math.round(secs / 60);
            proximityDisplay = `${mins}m before incident`;
          }
        } else {
          const secs = Math.round(absProximityMs / 1000);
          proximityDisplay = `${secs}s after initial detection`;
        }

        let strength: 'STRONG' | 'MODERATE' | 'WEAK' = 'MODERATE';
        let confidence = 0.75;

        if (absProximityMs <= 15 * 60 * 1000 && (relationship === 'SAME_RESOURCE' || relationship === 'CONTROLLER')) {
          strength = 'STRONG';
          confidence = 0.92;
        } else if (absProximityMs <= 30 * 60 * 1000) {
          strength = 'MODERATE';
          confidence = 0.80;
        } else {
          strength = 'WEAK';
          confidence = 0.60;
        }

        const explanation =
          `${chg.resourceKind}/${chg.resourceName} was modified (${chg.description}) ${proximityDisplay}. ` +
          `Because of the ${relationship.toLowerCase().replace('_', ' ')} relationship to this ${targetResource.kind}, ` +
          `this change is ${strength.toLowerCase()}ly correlated with the incident.`;

        correlations.push({
          change: chg,
          targetResource,
          relationship,
          temporalProximityMs: proximityMs,
          temporalProximityDisplay: proximityDisplay,
          correlationStrength: strength,
          confidence,
          explanation
        });
      }
    }

    // Sort by strongest correlation and closest temporal proximity
    correlations.sort((a, b) => {
      const weightMap = { STRONG: 3, MODERATE: 2, WEAK: 1 };
      const diff = weightMap[b.correlationStrength] - weightMap[a.correlationStrength];
      if (diff !== 0) return diff;
      return Math.abs(a.temporalProximityMs) - Math.abs(b.temporalProximityMs);
    });

    return correlations;
  }
}
