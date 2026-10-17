import { and, eq } from 'drizzle-orm';
import { authIdentities, profiles, subscriptions } from '../db/schema';
import type { AppConfig } from '../config';
import { imageLimit, plans, type Plan } from '../../src/shared/plans';

export async function rights(db: any, userId: string, config: AppConfig, now = new Date()) {
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  let owner = profile?.role === 'owner' && config.development;
  if (profile?.role === 'owner' && config.neonAuthURL && config.ownerNeonSubject) {
    const [identity] = await db
      .select()
      .from(authIdentities)
      .where(
        and(eq(authIdentities.userId, userId), eq(authIdentities.subject, config.ownerNeonSubject)),
      );
    owner = Boolean(identity);
  }
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));
  let tier: Plan = 'free';
  if (owner) tier = 'premium';
  else if (
    subscription &&
    config.billing &&
    subscription.mode === config.billing.mode &&
    (subscription.status === 'active' ||
      (subscription.status === 'past_due' &&
        subscription.invoiceStatus !== 'paid' &&
        subscription.paidEntitlement?.pendingInvoiceReason === 'subscription_update')) &&
    subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd > now &&
    (!subscription.cancelAt || subscription.cancelAt > now)
  ) {
    if (subscription.invoiceStatus === 'paid') {
      if (subscription.plan === 'pro' && subscription.stripePriceId === config.billing.proPrice)
        tier = 'pro';
      if (
        subscription.plan === 'premium' &&
        subscription.stripePriceId === config.billing.premiumPrice
      )
        tier = 'premium';
    } else {
      // An unpaid upgrade must not grant the new tier or erase a still-paid old tier.
      const paid = subscription.paidEntitlement;
      if (
        paid &&
        paid.subscriptionId === subscription.stripeSubscriptionId &&
        new Date(paid.through) > now
      ) {
        if (paid.plan === 'pro' && paid.priceId === config.billing.proPrice) tier = 'pro';
        if (paid.plan === 'premium' && paid.priceId === config.billing.premiumPrice)
          tier = 'premium';
      }
    }
  }
  return {
    tier,
    role: owner ? ('owner' as const) : tier,
    permanent: owner,
    billingExempt: owner,
    quotas: {
      documents: plans[tier].documents,
      bytes: plans[tier].bytes,
      image: imageLimit,
      clozes: plans[tier].clozes,
      versions: Math.max(plans[tier].versions, profile?.legacyVersionLimit || 0),
    },
    features: { editor: true, versions: true, cloze: true, review: true, docx: true, pdf: true },
  };
}
