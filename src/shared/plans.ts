export const plans = {
  free: {
    name: 'Gratuit',
    monthlyCents: 0,
    documents: null,
    clozes: null,
    versions: null,
    bytes: 25 * 1024 * 1024,
  },
  pro: {
    name: 'Pro',
    monthlyCents: 900,
    documents: null,
    clozes: null,
    versions: null,
    bytes: 100 * 1024 * 1024,
  },
  premium: {
    name: 'Premium',
    monthlyCents: 1900,
    documents: null,
    clozes: null,
    versions: null,
    bytes: 500 * 1024 * 1024,
  },
} as const;
export type Plan = keyof typeof plans;
export type PaidPlan = Exclude<Plan, 'free'>;
export const imageLimit = 4 * 1024 * 1024;
// Document count, cloze count, and history have no plan quotas; image storage still varies by tier.
// Versions are preserved across plan changes and always remain accessible.
export const offerVersion = '2026-11-23-v3';
