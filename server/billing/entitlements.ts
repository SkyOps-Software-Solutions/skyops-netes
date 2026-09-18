import { PLANS, resolveEffectiveLimits } from '../../src/config/plans';
import { Plan, PlanFeatures, PlanId, PlanLimitError, PlanLimits, Subscription } from '../../src/types';
import { store } from '../store';

export interface EntitlementCheckResult {
  allowed: boolean;
  current?: number;
  limit?: number;
  plan: PlanId;
  error?: PlanLimitError;
}

export class EntitlementService {
  /**
   * Get the active subscription for an organization.
   * If none exists yet, this lazily bootstraps a default subscription.
   */
  public getSubscription(orgId: string): Subscription {
    return store.getOrCreateOrgSubscription(orgId);
  }

  /**
   * Get the resolved Plan for an organization
   */
  public getPlanForOrg(orgId: string): Plan {
    const sub = this.getSubscription(orgId);
    return PLANS[sub.planId] || PLANS.FREE;
  }

  /**
   * Get the plan definitions by PlanId
   */
  public getPlan(planId: PlanId): Plan {
    return PLANS[planId] || PLANS.FREE;
  }

  /**
   * Get effective limits for an organization (with custom overrides if enterprise)
   */
  public getLimits(orgId: string): PlanLimits {
    const sub = this.getSubscription(orgId);
    return resolveEffectiveLimits(sub.planId, sub.customLimits);
  }

  /**
   * Get effective features for an organization
   */
  public getFeatures(orgId: string): PlanFeatures {
    const plan = this.getPlanForOrg(orgId);
    return plan.features;
  }

  /**
   * Check if an organization has access to a specific feature flag
   */
  public hasFeature(orgId: string, feature: keyof PlanFeatures): boolean {
    const features = this.getFeatures(orgId);
    const val = features[feature];
    if (typeof val === 'boolean') return val;
    if (!val) return false;
    return true;
  }

  /**
   * Get numeric limit for a resource
   */
  public getLimit(orgId: string, resource: keyof PlanLimits): number {
    const limits = this.getLimits(orgId);
    return limits[resource] ?? 0;
  }

  /**
   * Get data retention days allowed
   */
  public getRetentionDays(orgId: string): number {
    return this.getLimit(orgId, 'dataRetentionDays');
  }

  /**
   * Formats a structured PlanLimitError
   */
  public createLimitError(
    resource: string,
    current: number,
    limit: number,
    planId: PlanId,
    customMsg?: string
  ): PlanLimitError {
    const plan = PLANS[planId] || PLANS.FREE;
    const errorMsg =
      customMsg ||
      `${resource.charAt(0).toUpperCase() + resource.slice(1)} limit reached. Your ${plan.name} plan allows up to ${limit} ${resource} (currently using ${current}). Upgrade your plan to expand capacity.`;

    return {
      code: 'PLAN_LIMIT_REACHED',
      error: errorMsg,
      resource,
      current,
      limit,
      plan: planId,
      upgradeRequired: true
    };
  }

  /**
   * Verify if a new cluster can be created
   */
  public canCreateCluster(orgId: string): EntitlementCheckResult {
    const sub = this.getSubscription(orgId);
    const limits = this.getLimits(orgId);

    // Enterprise / Custom unlimited check
    if (limits.clusters === -1) {
      return { allowed: true, plan: sub.planId };
    }

    const currentClusters = store.getClusters(orgId).length;
    if (currentClusters >= limits.clusters) {
      return {
        allowed: false,
        current: currentClusters,
        limit: limits.clusters,
        plan: sub.planId,
        error: this.createLimitError('clusters', currentClusters, limits.clusters, sub.planId)
      };
    }

    return { allowed: true, current: currentClusters, limit: limits.clusters, plan: sub.planId };
  }

  /**
   * Verify if a new member can be invited or added
   */
  public canAddMember(orgId: string): EntitlementCheckResult {
    const sub = this.getSubscription(orgId);
    const limits = this.getLimits(orgId);

    if (limits.members === -1) {
      return { allowed: true, plan: sub.planId };
    }

    const activeMembers = store.getOrgMembers(orgId).filter((m) => m.status !== 'REMOVED').length;
    if (activeMembers >= limits.members) {
      return {
        allowed: false,
        current: activeMembers,
        limit: limits.members,
        plan: sub.planId,
        error: this.createLimitError('members', activeMembers, limits.members, sub.planId)
      };
    }

    return { allowed: true, current: activeMembers, limit: limits.members, plan: sub.planId };
  }

  /**
   * Verify if AI investigation can be performed (based on monthly allowance)
   */
  public canUseAI(orgId: string): EntitlementCheckResult {
    const sub = this.getSubscription(orgId);
    const limits = this.getLimits(orgId);

    if (limits.aiInvestigationsMonthly === -1) {
      return { allowed: true, plan: sub.planId };
    }

    const usage = store.getOrgUsage(orgId);
    const current = usage.aiAnalysesPerformed || 0;

    if (current >= limits.aiInvestigationsMonthly) {
      return {
        allowed: false,
        current,
        limit: limits.aiInvestigationsMonthly,
        plan: sub.planId,
        error: this.createLimitError(
          'ai_investigations',
          current,
          limits.aiInvestigationsMonthly,
          sub.planId,
          `Monthly AI investigation quota reached (${current}/${limits.aiInvestigationsMonthly}). Upgrade to Pro or Business to continue utilizing Gemini AI incident analyses.`
        )
      };
    }

    return { allowed: true, current, limit: limits.aiInvestigationsMonthly, plan: sub.planId };
  }

  /**
   * Verify if automated remediation proposal execution is enabled and within quota
   */
  public canExecuteRemediation(orgId: string): EntitlementCheckResult {
    const sub = this.getSubscription(orgId);
    const features = this.getFeatures(orgId);
    const limits = this.getLimits(orgId);

    if (features.automatedRemediation === false) {
      return {
        allowed: false,
        current: 0,
        limit: 0,
        plan: sub.planId,
        error: this.createLimitError(
          'automated_remediation',
          0,
          0,
          sub.planId,
          'Automated remediation execution is not available on the Free plan. Upgrade to Pro or Business to enable automated cluster remediation actions.'
        )
      };
    }

    if (limits.remediationsMonthly === -1) {
      return { allowed: true, plan: sub.planId };
    }

    const usage = store.getOrgUsage(orgId);
    const current = usage.remediationsExecuted || 0;

    if (current >= limits.remediationsMonthly) {
      return {
        allowed: false,
        current,
        limit: limits.remediationsMonthly,
        plan: sub.planId,
        error: this.createLimitError(
          'remediations',
          current,
          limits.remediationsMonthly,
          sub.planId,
          `Monthly automated remediation quota reached (${current}/${limits.remediationsMonthly}). Upgrade your plan to execute additional remediations.`
        )
      };
    }

    return { allowed: true, current, limit: limits.remediationsMonthly, plan: sub.planId };
  }

  /**
   * Verify if Webhook creation/dispatch is permitted
   */
  public canUseWebhooks(orgId: string): EntitlementCheckResult {
    const sub = this.getSubscription(orgId);
    const features = this.getFeatures(orgId);

    if (!features.webhooks) {
      return {
        allowed: false,
        current: 0,
        limit: 0,
        plan: sub.planId,
        error: this.createLimitError(
          'webhooks',
          0,
          0,
          sub.planId,
          'Outbound webhooks and integrations are disabled on the Free tier. Upgrade to Pro or Business to configure custom HTTP webhooks.'
        )
      };
    }

    return { allowed: true, plan: sub.planId };
  }
}

export const entitlementService = new EntitlementService();
