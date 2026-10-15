import Stripe from 'stripe';
import type { BillingConfig } from './config';

// Official SDK, API version pinned by stripe 23.0.0: 2026-09-30.endive.
// The narrow port allows deterministic integration tests without pretending to contact Stripe.
export interface StripeGateway {
  account(): Promise<Stripe.Account>;
  price(id: string): Promise<Stripe.Price>;
  customer(id: string): Promise<Stripe.Customer | Stripe.DeletedCustomer>;
  createCustomer(params: Stripe.CustomerCreateParams, key: string): Promise<Stripe.Customer>;
  subscriptions(customer: string): Promise<Stripe.Subscription[]>;
  checkout(id: string): Promise<Stripe.Checkout.Session>;
  createCheckout(
    params: Stripe.Checkout.SessionCreateParams,
    key: string,
  ): Promise<Stripe.Checkout.Session>;
  portal(params: Stripe.BillingPortal.SessionCreateParams): Promise<Stripe.BillingPortal.Session>;
  verify(payload: string, signature: string): Stripe.Event;
}
export function stripeGateway(config: BillingConfig): StripeGateway {
  const stripe = new Stripe(config.secretKey, { timeout: 10000, maxNetworkRetries: 1 });
  return {
    account: () => stripe.accounts.retrieveCurrent(),
    price: (id) => stripe.prices.retrieve(id),
    customer: (id) => stripe.customers.retrieve(id),
    createCustomer: (params, key) => stripe.customers.create(params, { idempotencyKey: key }),
    async subscriptions(customer) {
      const result = await stripe.subscriptions.list({
        customer,
        status: 'all',
        limit: 100,
        expand: ['data.latest_invoice'],
      });
      if (result.has_more) throw new Error('Stripe subscription pagination requires review');
      return result.data;
    },
    checkout: (id) => stripe.checkout.sessions.retrieve(id),
    createCheckout: (params, key) =>
      stripe.checkout.sessions.create(params, { idempotencyKey: key }),
    portal: (params) => stripe.billingPortal.sessions.create(params),
    verify: (payload, signature) =>
      stripe.webhooks.constructEvent(payload, signature, config.webhookSecret, 300),
  };
}
