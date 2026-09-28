/**
 * Canonical SkyOps Netes Contact & Customer Support Configuration
 * Single source of truth for all customer-facing communication channels.
 */

export const SKYOPS_CONTACT_EMAIL = 'skyopsnetes2000@gmail.com';
export const SKYOPS_SUPPORT_EMAIL = SKYOPS_CONTACT_EMAIL;
export const SKYOPS_SALES_EMAIL = SKYOPS_CONTACT_EMAIL;
export const SKYOPS_BILLING_EMAIL = SKYOPS_CONTACT_EMAIL;

export interface EnterpriseInquiryParams {
  organization?: string;
  currentPlan?: string;
  clusterCount?: number;
  nodeCount?: number;
  requestedCapacity?: string;
}

/**
 * Builds a customer-friendly mailto link for Enterprise inquiries with prefilled workspace telemetry context
 */
export function getEnterpriseMailtoUrl(params?: EnterpriseInquiryParams): string {
  const subject = encodeURIComponent('SkyOps Enterprise Plan Inquiry');
  const lines: string[] = [
    'Hello SkyOps Team,',
    '',
    'I would like to inquire about an Enterprise subscription for our organization.',
    ''
  ];

  if (params?.organization) {
    lines.push(`Organization: ${params.organization}`);
  }
  if (params?.currentPlan) {
    lines.push(`Current Plan: ${params.currentPlan}`);
  }
  if (params?.clusterCount !== undefined) {
    lines.push(`Target Cluster Count: ${params.clusterCount}`);
  }
  if (params?.nodeCount !== undefined) {
    lines.push(`Target Node Count: ${params.nodeCount}`);
  }
  if (params?.requestedCapacity) {
    lines.push(`Requested Capacity / Custom SLA: ${params.requestedCapacity}`);
  }

  lines.push('');
  lines.push('Best regards,');

  const body = encodeURIComponent(lines.join('\n'));
  return `mailto:${SKYOPS_CONTACT_EMAIL}?subject=${subject}&body=${body}`;
}

/**
 * Builds a support or billing enquiry mailto link
 */
export function getSupportMailtoUrl(subject = 'SkyOps Support Request', context?: string): string {
  const encSubject = encodeURIComponent(subject);
  const body = context ? encodeURIComponent(context) : '';
  return `mailto:${SKYOPS_CONTACT_EMAIL}?subject=${encSubject}${body ? `&body=${body}` : ''}`;
}
