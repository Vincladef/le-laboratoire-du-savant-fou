export const plans = {
  free: {
    name: 'Gratuit',
    monthlyCents: 0,
    documents: 100,
    clozes: 500,
    versions: 10,
    bytes: 25 * 1024 * 1024,
  },
  pro: {
    name: 'Pro',
    monthlyCents: 900,
    documents: 100,
    clozes: 5000,
    versions: 30,
    bytes: 100 * 1024 * 1024,
  },
  premium: {
    name: 'Premium',
    monthlyCents: 1900,
    documents: 1000,
    clozes: 50000,
    versions: 100,
    bytes: 500 * 1024 * 1024,
  },
} as const;
export type Plan = keyof typeof plans;
export type PaidPlan = Exclude<Plan, 'free'>;
export const imageLimit = 4 * 1024 * 1024;
// Paid caps were read on the operator's existing Stripe pages. Free caps remain provisional.
// Existing profiles preserve their 100-version window. Never purge history on a downgrade.
export const offerVersion = '2026-10-15-v2';
