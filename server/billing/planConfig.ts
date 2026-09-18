import {
  BillingInterval,
  IntervalPricing,
  PlanDefinition,
  PlanFeatures,
  PlanLimits,
  PlanTier
} from '../../src/types/billing';

export const BILLING_INTERVALS: Record<
  BillingInterval,
  { months: number; label: string; shortLabel: string }
> = {
  MONTHLY: { months: 1, label: '1 Month', shortLabel: '/mo' },
  QUARTERLY: { months: 3, label: '3 Months', shortLabel: '/qtr' },
  HALF_YEARLY: { months: 6, label: '6 Months', shortLabel: '/half-yr' },
  YEARLY: { months: 12, label: '12 Months', shortLabel: '/yr' }
};

export const PLANS: Record<PlanTier, PlanDefinition> = {
  FREE: {
    id: 'FREE',
    name: 'Developer Free',
    tagline: 'Essential Kubernetes observability for individuals & dev environments',
    description: 'Connect a single cluster to explore real-time telemetry, pod logs, and basic incident alerts.',
    currency: 'INR',
    badge: 'Standard Free',
    pricing: {
      MONTHLY: {
        durationMonths: 1,
        label: '1 Month',
        totalPrice: 0,
        effectiveMonthlyPrice: 0,
        savingsAmount: 0,
        savingsPercent: 0
      },
      QUARTERLY: {
        durationMonths: 3,
        label: '3 Months',
        totalPrice: 0,
        effectiveMonthlyPrice: 0,
        savingsAmount: 0,
        savingsPercent: 0
      },
      HALF_YEARLY: {
        durationMonths: 6,
        label: '6 Months',
        totalPrice: 0,
        effectiveMonthlyPrice: 0,
        savingsAmount: 0,
        savingsPercent: 0
      },
      YEARLY: {
        durationMonths: 12,
        label: '12 Months',
        totalPrice: 0,
        effectiveMonthlyPrice: 0,
        savingsAmount: 0,
        savingsPercent: 0
      }
    },
    limits: {
      clusters: 1,
      nodes: 5,
      workloads: 100,
      members: 1,
      dataRetentionDays: 7,
      auditRetentionDays: 7,
      aiMonthlyAllowance: 20,
      storageGb: 5
    },
    features: {
      incidentDetection: true,
      incidentCorrelation: 'basic',
      aiInvestigation: 'limited',
      rca: 'basic',
      remediationRecommendations: 'limited',
      automatedRemediation: 'disabled',
      notifications: 'basic',
      webhooks: false,
      rbac: 'basic',
      slaSupport: 'community'
    }
  },

  PRO: {
    id: 'PRO',
    name: 'Team Pro',
    tagline: 'Full operational visibility and AI root-cause analysis for growing teams',
    description: 'Multi-cluster support, 30-day telemetry retention, outbound webhooks, and AI-assisted remediations.',
    currency: 'INR',
    badge: 'Popular',
    isPopular: true,
    pricing: {
      MONTHLY: {
        durationMonths: 1,
        label: '1 Month',
        totalPrice: 5000,
        effectiveMonthlyPrice: 5000,
        savingsAmount: 0,
        savingsPercent: 0
      },
      QUARTERLY: {
        durationMonths: 3,
        label: '3 Months',
        totalPrice: 14000,
        effectiveMonthlyPrice: 4667,
        savingsAmount: 1000,
        savingsPercent: 7
      },
      HALF_YEARLY: {
        durationMonths: 6,
        label: '6 Months',
        totalPrice: 26000,
        effectiveMonthlyPrice: 4333,
        savingsAmount: 4000,
        savingsPercent: 13
      },
      YEARLY: {
        durationMonths: 12,
        label: '12 Months',
        totalPrice: 48000,
        effectiveMonthlyPrice: 4000,
        savingsAmount: 12000,
        savingsPercent: 20
      }
    },
    limits: {
      clusters: 5,
      nodes: 50,
      workloads: 1000,
      members: 10,
      dataRetentionDays: 30,
      auditRetentionDays: 30,
      aiMonthlyAllowance: 200,
      storageGb: 25
    },
    features: {
      incidentDetection: true,
      incidentCorrelation: 'advanced',
      aiInvestigation: 'full',
      rca: 'full',
      remediationRecommendations: 'full',
      automatedRemediation: 'limited', // approval required
      notifications: 'advanced',
      webhooks: true,
      rbac: 'full',
      slaSupport: 'standard_8h'
    }
  },

  BUSINESS: {
    id: 'BUSINESS',
    name: 'Business Scale',
    tagline: 'High-density infrastructure, autonomous auto-recovery, and compliance',
    description: 'Up to 20 clusters, 90-day retention, full autonomous remediation, priority incident queues, and 50 team members.',
    currency: 'INR',
    badge: 'Scale',
    pricing: {
      MONTHLY: {
        durationMonths: 1,
        label: '1 Month',
        totalPrice: 12000,
        effectiveMonthlyPrice: 12000,
        savingsAmount: 0,
        savingsPercent: 0
      },
      QUARTERLY: {
        durationMonths: 3,
        label: '3 Months',
        totalPrice: 33000,
        effectiveMonthlyPrice: 11000,
        savingsAmount: 3000,
        savingsPercent: 8
      },
      HALF_YEARLY: {
        durationMonths: 6,
        label: '6 Months',
        totalPrice: 60000,
        effectiveMonthlyPrice: 10000,
        savingsAmount: 12000,
        savingsPercent: 17
      },
      YEARLY: {
        durationMonths: 12,
        label: '12 Months',
        totalPrice: 108000,
        effectiveMonthlyPrice: 9000,
        savingsAmount: 36000,
        savingsPercent: 25
      }
    },
    limits: {
      clusters: 20,
      nodes: 200,
      workloads: 5000,
      members: 50,
      dataRetentionDays: 90,
      auditRetentionDays: 90,
      aiMonthlyAllowance: 1000,
      storageGb: 100
    },
    features: {
      incidentDetection: true,
      incidentCorrelation: 'advanced',
      aiInvestigation: 'advanced',
      rca: 'advanced',
      remediationRecommendations: 'advanced',
      automatedRemediation: 'full',
      notifications: 'advanced',
      webhooks: true,
      rbac: 'advanced',
      slaSupport: 'business_4h'
    }
  },

  ENTERPRISE: {
    id: 'ENTERPRISE',
    name: 'Enterprise Dedicated',
    tagline: 'Custom fleet sizing, sovereign data tenancy, custom integrations, and 1-hour SLA',
    description: 'Custom cluster capacity, tailored security boundaries, dedicated technical account manager, and 24/7 incident hotline.',
    currency: 'INR',
    badge: 'Enterprise',
    pricing: {
      MONTHLY: {
        durationMonths: 1,
        label: '1 Month',
        totalPrice: 0, // Custom negotiated
        effectiveMonthlyPrice: 0,
        savingsAmount: 0,
        savingsPercent: 0
      },
      QUARTERLY: {
        durationMonths: 3,
        label: '3 Months',
        totalPrice: 0,
        effectiveMonthlyPrice: 0,
        savingsAmount: 0,
        savingsPercent: 0
      },
      HALF_YEARLY: {
        durationMonths: 6,
        label: '6 Months',
        totalPrice: 0,
        effectiveMonthlyPrice: 0,
        savingsAmount: 0,
        savingsPercent: 0
      },
      YEARLY: {
        durationMonths: 12,
        label: '12 Months',
        totalPrice: 0,
        effectiveMonthlyPrice: 0,
        savingsAmount: 0,
        savingsPercent: 0
      }
    },
    limits: {
      clusters: 100, // Or custom
      nodes: 1000,
      workloads: 25000,
      members: 250,
      dataRetentionDays: 365,
      auditRetentionDays: 365,
      aiMonthlyAllowance: -1, // Unlimited
      storageGb: 1000
    },
    features: {
      incidentDetection: true,
      incidentCorrelation: 'advanced',
      aiInvestigation: 'advanced',
      rca: 'advanced',
      remediationRecommendations: 'advanced',
      automatedRemediation: 'full',
      notifications: 'advanced',
      webhooks: true,
      rbac: 'advanced',
      slaSupport: 'enterprise_1h',
      customIntegrations: true
    }
  }
};

/**
 * Get definition of a plan
 */
export function getPlanDefinition(tier: PlanTier): PlanDefinition {
  return PLANS[tier] || PLANS.FREE;
}

/**
 * Get pricing for a plan and billing interval
 */
export function getPlanPricing(tier: PlanTier, interval: BillingInterval): IntervalPricing {
  const plan = getPlanDefinition(tier);
  return (
    plan.pricing[interval] || {
      durationMonths: 1,
      label: '1 Month',
      totalPrice: 0,
      effectiveMonthlyPrice: 0,
      savingsAmount: 0,
      savingsPercent: 0
    }
  );
}

/**
 * Default Trial configuration (14 days of PRO plan)
 */
export const TRIAL_CONFIG = {
  planId: 'PRO' as PlanTier,
  durationDays: 14,
  durationMs: 14 * 24 * 60 * 60 * 1000
};
