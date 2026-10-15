export type BillingConfig = {
  secretKey: string;
  webhookSecret: string;
  accountId: string;
  mode: 'test' | 'live';
  proPrice: string;
  premiumPrice: string;
  portalConfiguration: string;
  enabled: boolean;
};
export function readBillingConfig(): BillingConfig | undefined {
  const mode = process.env.STRIPE_MODE === 'live' ? 'live' : 'test';
  const secretKey = process.env.STRIPE_SECRET_KEY || '';
  if (!new RegExp(`^(sk|rk)_${mode}_`).test(secretKey)) return undefined;
  return {
    secretKey,
    mode,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    accountId: process.env.STRIPE_ACCOUNT_ID || '',
    proPrice: process.env.STRIPE_PRO_PRICE_ID || '',
    premiumPrice: process.env.STRIPE_PREMIUM_PRICE_ID || '',
    portalConfiguration: process.env.STRIPE_PORTAL_CONFIGURATION_ID || '',
    enabled: process.env.STRIPE_CHECKOUT_ENABLED === '1',
  };
}
export function billingConfigured(config?: BillingConfig) {
  return Boolean(
    config?.webhookSecret.startsWith('whsec_') &&
    config.accountId.startsWith('acct_') &&
    config.proPrice.startsWith('price_') &&
    config.premiumPrice.startsWith('price_') &&
    config.proPrice !== config.premiumPrice &&
    config.portalConfiguration.startsWith('bpc_'),
  );
}
