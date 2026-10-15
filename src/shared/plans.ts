export const plans = {
  free: { name: 'Gratuit', monthlyCents: 0, documents: 100, bytes: 25 * 1024 * 1024 },
  pro: { name: 'Pro', monthlyCents: 900, documents: 250, bytes: 100 * 1024 * 1024 },
  premium: { name: 'Premium', monthlyCents: 1900, documents: 500, bytes: 250 * 1024 * 1024 },
} as const;
export type Plan = keyof typeof plans;
export type PaidPlan = Exclude<Plan, 'free'>;
export const imageLimit = 4 * 1024 * 1024;
// Paid limits are technical defaults, not an offer approved for sale. Checkout also requires
// the operator's explicit commercial/legal approval. Keep this configuration versioned.
export const offerVersion = '2026-10-15-v1';
