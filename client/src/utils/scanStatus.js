export const ACTIVE_STATUSES = [
  'QUEUED',
  'VALIDATING',
  'RENDERING',
  'ANALYZING',
  'CLASSIFYING',
  'EXPLAINING',
];

export const STATUS_LABELS = {
  QUEUED: 'Waiting in queue',
  VALIDATING: 'Checking the URL',
  RENDERING: 'Loading the page',
  ANALYZING: 'Analyzing',
  CLASSIFYING: 'Prioritizing issues',
  EXPLAINING: 'Writing explanations',
  COMPLETED: 'Completed',
  COMPLETED_WITH_WARNINGS: 'Completed with warnings',
  FAILED: 'Failed',
};

export const ERROR_CODES = [
  'INVALID_URL',
  'SSRF_BLOCKED',
  'DNS_FAILED',
  'TIMEOUT',
  'TARGET_BLOCKED',
  'NON_HTML',
  'HTTP_ERROR',
  'RENDER_CRASH',
  'AXE_FAILED',
  'INTERNAL',
];

export const statusBadge = (status) => {
  if (status === 'FAILED') return 'bg-[#fee4e2] text-[#912018]';
  if (status === 'COMPLETED') return 'bg-green-100 text-green-900';
  if (status === 'COMPLETED_WITH_WARNINGS') return 'bg-amber-100 text-amber-900';
  return 'bg-[#e8e5ff] text-[#3b2fa8]';
};
