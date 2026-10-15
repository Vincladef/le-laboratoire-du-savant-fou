import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import Stripe from 'stripe';
import { hashPassword } from 'better-auth/crypto';
import { createApp } from '../server/app';
import type { AppConfig } from '../server/config';
import type { StripeGateway } from '../server/billing/stripe';
import { rights } from '../server/billing/rights';
import { openLocalDatabase } from '../scripts/local-database';
import {
  account,
  authIdentities,
  assets,
  billingAdminAudit,
  billingEvents,
  memoryAnchors,
  documents,
  profiles,
  subscriptions,
  user,
  versions,
} from '../server/db/schema';
import { offerVersion } from '../src/shared/plans';
const origin = 'http://localhost:5173',
  password = 'Billing-Local-Test-42!';
const webhookSecret = 'whsec_fixture_only_not_a_real_stripe_secret';
const sdk = new Stripe('sk_test_fixture_only');
class FakeStripe implements StripeGateway {
  people = new Map<string, Stripe.Customer>();
  sessions = new Map<string, Stripe.Checkout.Session>();
  byKey = new Map<string, { params: string; session: Stripe.Checkout.Session }>();
  current: Stripe.Subscription[] = [];
  checkoutCalls = 0;
  customerCalls = 0;
  failAfterCreate = false;
  failRead = false;
  accountId = 'acct_fixture';
  priceAmount = 900;
  priceLive = false;
  usageType = 'licensed';
  portalCustomer = '';
  async account() {
    return { id: this.accountId } as Stripe.Account;
  }
  async price(id: string) {
    return {
      id,
      active: true,
      livemode: this.priceLive,
      currency: 'eur',
      unit_amount: id === 'price_premium' ? 1900 : this.priceAmount,
      type: 'recurring',
      recurring: { interval: 'month', interval_count: 1, usage_type: this.usageType },
      tax_behavior: 'inclusive',
      billing_scheme: 'per_unit',
      custom_unit_amount: null,
      transform_quantity: null,
    } as Stripe.Price;
  }
  async customer(id: string) {
    if (!this.people.has(id)) throw Error('Unknown fixture customer');
    return this.people.get(id)!;
  }
  async createCustomer(params: Stripe.CustomerCreateParams) {
    this.customerCalls++;
    const c = {
      id: `cus_${crypto.randomUUID()}`,
      object: 'customer',
      livemode: false,
      metadata: params.metadata,
    } as Stripe.Customer;
    this.people.set(c.id, c);
    return c;
  }
  async subscriptions(id: string) {
    if (this.failRead) throw Error('Injected provider outage');
    return structuredClone(this.current.filter((s) => s.customer === id));
  }
  async checkout(id: string) {
    return this.sessions.get(id)!;
  }
  async createCheckout(params: Stripe.Checkout.SessionCreateParams, key: string) {
    this.checkoutCalls++;
    const old = this.byKey.get(key);
    if (old) {
      expect(JSON.stringify(params)).toBe(old.params);
      return old.session;
    }
    const id = `cs_test_${crypto.randomUUID()}`;
    const session = {
      id,
      url: `https://checkout.stripe.com/c/pay/${id}`,
      livemode: false,
      status: 'open',
      customer: params.customer,
      expires_at: params.expires_at,
      metadata: params.metadata,
    } as Stripe.Checkout.Session;
    this.sessions.set(id, session);
    this.byKey.set(key, { params: JSON.stringify(params), session });
    if (this.failAfterCreate) {
      this.failAfterCreate = false;
      throw Error('Injected response lost after Stripe creation');
    }
    return session;
  }
  async portal(params: Stripe.BillingPortal.SessionCreateParams) {
    this.portalCustomer = params.customer!;
    return {
      id: 'bps_fixture',
      url: 'https://billing.stripe.com/p/session/fixture',
    } as Stripe.BillingPortal.Session;
  }
  verify(payload: string, signature: string) {
    return sdk.webhooks.constructEvent(payload, signature, webhookSecret, 300);
  }
}
let db: Awaited<ReturnType<typeof openLocalDatabase>>,
  app: ReturnType<typeof createApp>['app'],
  config: AppConfig,
  gateway: FakeStripe;
class Client {
  id = crypto.randomUUID();
  cookies = new Map<string, string>();
  async call(path: string, method = 'GET', body?: unknown, expected = 200) {
    const res = await app.fetch(
      new Request(`${origin}/api${path}`, {
        method,
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
    for (const c of res.headers.getSetCookie()) {
      const p = c.split(';')[0],
        i = p.indexOf('=');
      this.cookies.set(p.slice(0, i), p.slice(i + 1));
    }
    const result = await res.json();
    expect(res.status, `${path}: ${JSON.stringify(result)}`).toBe(expected);
    return result as any;
  }
}
const alice = new Client(),
  bob = new Client(),
  owner = new Client();
const request = (plan = 'pro') => ({
  plan,
  requestId: crypto.randomUUID(),
  accepted: true,
  immediateAccess: true,
  termsVersion: 'test-terms-v1',
  offerVersion,
});
async function start(client = alice, plan = 'pro') {
  return client.call('/billing/checkout', 'POST', request(plan));
}
async function row(client = alice) {
  return (await db.db.select().from(subscriptions).where(eq(subscriptions.userId, client.id)))[0];
}
async function subscribed(client = alice, overrides: Record<string, unknown> = {}) {
  let r = await row(client);
  if (!r) {
    await start(client);
    r = await row(client);
  }
  const sub = {
    id: `sub_${client.id}`,
    object: 'subscription',
    customer: r.stripeCustomerId,
    metadata: { app: 'lab_savant_fou', labUserId: client.id },
    livemode: false,
    status: 'active',
    created: 100,
    items: {
      data: [
        {
          quantity: 1,
          price: { id: 'price_pro' },
          current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
        },
      ],
    },
    latest_invoice: { id: 'in_fixture', status: 'paid' },
    cancel_at: null,
    cancel_at_period_end: false,
    pause_collection: null,
    pending_update: null,
    ...overrides,
  } as unknown as Stripe.Subscription;
  gateway.current = gateway.current.filter((s) => s.customer !== r.stripeCustomerId);
  gateway.current.push(sub);
  const session = gateway.sessions.get(r.checkoutSessionId!)!;
  session.status = 'complete';
  session.subscription = sub.id;
  await client.call('/billing/refresh', 'POST', {});
  return sub;
}
async function webhook(
  type = 'invoice.paid',
  customer?: string,
  eventId = `evt_${crypto.randomUUID()}`,
  options: { live?: boolean; timestamp?: number; account?: string; alter?: boolean } = {},
) {
  const payload = JSON.stringify({
    id: eventId,
    object: 'event',
    type,
    livemode: options.live || false,
    created: 10,
    data: { object: { id: 'in_fixture', customer: customer || 'cus_unknown' } },
    ...(options.account ? { account: options.account } : {}),
  });
  const signature = sdk.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret,
    ...(options.timestamp ? { timestamp: options.timestamp } : {}),
  });
  return app.fetch(
    new Request(`${origin}/api/billing/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': signature },
      body: options.alter ? payload + ' ' : payload,
    }),
  );
}
beforeAll(async () => {
  config = {
    development: true,
    baseURL: origin,
    secret: 'billing-tests-local-secret-over-thirty-two-characters',
    localDir: await mkdtemp(join(tmpdir(), 'lab-billing-')),
    google: false,
    mail: false,
    billing: {
      secretKey: 'sk_test_fixture_only',
      webhookSecret,
      accountId: 'acct_fixture',
      mode: 'test',
      proPrice: 'price_pro',
      premiumPrice: 'price_premium',
      portalConfiguration: 'bpc_fixture',
      enabled: true,
    },
    legal: {
      publisher: 'Fixture only',
      legalForm: 'Fixture',
      address: 'Fixture address',
      registration: 'Fixture registration',
      director: 'Fixture director',
      supportEmail: 'support@example.test',
      privacyEmail: 'privacy@example.test',
      taxStatement: 'Fixture tax',
      mediator: 'Fixture mediator',
      mediatorUrl: 'https://example.test',
      mediatorAddress: 'Fixture mediator address',
      withdrawalAddress: 'Fixture address',
      hostingDetails: 'Fixture hosts',
      processingLocations: 'Fixture locations',
      internationalTransfers: 'Fixture transfers',
      retentionPolicy: 'Fixture retention',
      termsVersion: 'test-terms-v1',
      privacyVersion: 'test-privacy-v1',
      reviewed: true,
    },
  };
  db = await openLocalDatabase(config);
  gateway = new FakeStripe();
  app = createApp(db.db, config, { stripe: gateway }).app;
  for (const c of [alice, bob, owner]) {
    await db.db.insert(user).values({
      id: c.id,
      email: `billing-${c.id}@example.test`,
      name: 'Billing fixture',
      emailVerified: true,
    });
    await db.db.insert(account).values({
      id: crypto.randomUUID(),
      userId: c.id,
      accountId: c.id,
      providerId: 'credential',
      password: await hashPassword(password),
    });
    await db.db.insert(profiles).values({ userId: c.id, role: c === owner ? 'owner' : 'free' });
    await c.call('/auth/sign-in/email', 'POST', {
      email: `billing-${c.id}@example.test`,
      password,
    });
  }
});
beforeEach(async () => {
  await db.db.delete(subscriptions);
  await db.db.delete(billingEvents);
  await db.db.delete(billingAdminAudit);
  await db.db.update(profiles).set({ role: 'free' }).where(eq(profiles.userId, alice.id));
  gateway = new FakeStripe();
  app = createApp(db.db, config, { stripe: gateway }).app;
});
afterAll(async () => {
  await db?.close();
});
describe('Stripe : API, transactions PostgreSQL et SDK de signature réels, transport Stripe substitué', () => {
  it('réserve le propriétaire à son sujet Neon configuré, pas à un rôle historique ou un email', async () => {
    const subject = crypto.randomUUID();
    await db.db.insert(authIdentities).values({ subject, userId: owner.id });
    const managed = {
      ...config,
      development: false,
      neonAuthURL: 'https://fixture.neon.tech/laboratoire/auth',
      ownerNeonSubject: subject,
    };
    expect((await rights(db.db, owner.id, managed)).billingExempt).toBe(true);
    expect(
      (await rights(db.db, owner.id, { ...managed, ownerNeonSubject: 'another-subject' }))
        .billingExempt,
    ).toBe(false);
    expect((await rights(db.db, owner.id, { ...managed, ownerNeonSubject: undefined })).tier).toBe(
      'free',
    );
  });
  it('suspend les droits en cas de duplication et prolonge une période après renouvellement confirmé', async () => {
    const sub = await subscribed();
    const original = (await row()).currentPeriodEnd!.getTime();
    sub.items.data[0].current_period_end += 86400 * 30;
    gateway.current = [sub];
    await alice.call('/billing/refresh', 'POST', {});
    expect((await row()).currentPeriodEnd!.getTime()).toBe(original + 86400 * 30 * 1000);
    gateway.current.push({ ...structuredClone(sub), id: 'sub_duplicate' });
    await alice.call('/billing/refresh', 'POST', {});
    expect((await alice.call('/profile')).entitlements.tier).toBe('free');
    expect((await row()).status).toBe('multiple_subscriptions');
  });
  it('publie le catalogue sans secret, mais refuse toute vente sans configuration complète', async () => {
    const disconnected = createApp(db.db, { ...config, billing: undefined, legal: undefined }).app;
    const catalog = await (
      await disconnected.fetch(new Request(`${origin}/api/billing/plans`))
    ).json();
    expect(catalog.checkoutReady).toBe(false);
    expect(JSON.stringify(catalog)).not.toContain('sk_test');
    expect(
      (
        await disconnected.fetch(
          new Request(`${origin}/api/billing/checkout`, {
            method: 'POST',
            headers: {
              Origin: origin,
              'Content-Type': 'application/json',
              Cookie: [...alice.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
            },
            body: JSON.stringify(request()),
          }),
        )
      ).status,
    ).toBe(503);
  });
  it('impose consentements, version et champs serveur ; aucun prix, client ou rôle choisi par le navigateur', async () => {
    await alice.call('/billing/checkout', 'POST', { ...request(), accepted: false }, 400);
    await alice.call('/billing/checkout', 'POST', { ...request(), immediateAccess: false }, 400);
    await alice.call('/billing/checkout', 'POST', { ...request(), termsVersion: 'obsolete' }, 409);
    await alice.call('/billing/checkout', 'POST', { ...request(), offerVersion: 'obsolete' }, 409);
    await alice.call(
      '/billing/checkout',
      'POST',
      { ...request(), price: 'price_cheap', userId: bob.id },
      400,
    );
    expect(gateway.customerCalls).toBe(0);
  });
  it('crée Checkout pour le compte authentifié avec tarif, URLs et métadonnées serveur', async () => {
    const result = await start();
    expect(result.url).toContain('https://checkout.stripe.com/');
    const r = await row();
    expect(r.stripeCustomerId).toBeTruthy();
    expect(r.plan).toBe('free');
    const args = JSON.parse([...gateway.byKey.values()][0].params);
    expect(args.client_reference_id).toBe(alice.id);
    expect(args.line_items).toEqual([{ price: 'price_pro', quantity: 1 }]);
    expect(args.subscription_data.metadata.labUserId).toBe(alice.id);
    expect(args.success_url).toBe(`${origin}/billing?checkout=returned`);
    expect(r.acceptedLegal?.publisher).toBe('Fixture only');
    expect(r.acceptedOffer?.documents).toBe(100);
    expect(r.immediateAccessRequestedAt).toBeInstanceOf(Date);
    expect((await alice.call('/profile')).entitlements.tier).toBe('free');
  });
  it('déduplique deux onglets et refuse un second plan pendant un Checkout ouvert', async () => {
    const [a, b] = await Promise.all([start(), start()]);
    expect(a.url).toBe(b.url);
    expect(gateway.checkoutCalls).toBe(1);
    expect(gateway.customerCalls).toBe(1);
    await alice.call('/billing/checkout', 'POST', request('premium'), 409);
  });
  it('récupère une réponse Stripe perdue avec le même UUID et exactement les mêmes paramètres', async () => {
    const data = request();
    gateway.failAfterCreate = true;
    await alice.call('/billing/checkout', 'POST', data, 500);
    const pending = await row();
    expect(pending.checkoutRequestId).toBe(data.requestId);
    expect(pending.checkoutSessionId).toBeNull();
    const result = await alice.call('/billing/checkout', 'POST', data);
    expect(result.url).toBe([...gateway.sessions.values()][0].url);
    expect(gateway.sessions.size).toBe(1);
  });
  it('vérifie compte, montant et mode avant de créer un client', async () => {
    gateway.accountId = 'acct_wrong';
    await alice.call('/billing/checkout', 'POST', request(), 503);
    gateway.accountId = 'acct_fixture';
    gateway.priceAmount = 1;
    await alice.call('/billing/checkout', 'POST', request(), 503);
    gateway.priceAmount = 900;
    gateway.priceLive = true;
    await alice.call('/billing/checkout', 'POST', request(), 503);
    gateway.priceLive = false;
    gateway.usageType = 'metered';
    await alice.call('/billing/checkout', 'POST', request(), 503);
    expect(gateway.customerCalls).toBe(0);
  });
  it('refuse signatures absentes, corps altérés, horodatages expirés et mélanges de modes ou Connect', async () => {
    expect(
      (
        await app.fetch(
          new Request(`${origin}/api/billing/webhook`, { method: 'POST', body: '{}' }),
        )
      ).status,
    ).toBe(400);
    expect((await webhook('invoice.paid', undefined, undefined, { alter: true })).status).toBe(400);
    expect(
      (
        await webhook('invoice.paid', undefined, undefined, {
          timestamp: Math.floor(Date.now() / 1000) - 400,
        })
      ).status,
    ).toBe(400);
    expect((await webhook('invoice.paid', undefined, undefined, { live: true })).status).toBe(400);
    expect(
      (await webhook('invoice.paid', undefined, undefined, { account: 'acct_other' })).status,
    ).toBe(400);
    expect(await db.db.select().from(billingEvents)).toHaveLength(0);
  });
  it('reçoit sans Origin un webhook signé, traite une seule fois et ignore un client non associé', async () => {
    const sub = await subscribed();
    const id = `evt_${crypto.randomUUID()}`;
    const first = await webhook('invoice.paid', String(sub.customer), id);
    expect(first.status).toBe(200);
    const second = await webhook('invoice.paid', String(sub.customer), id);
    expect((await second.json()).duplicate).toBe(true);
    expect(await db.db.select().from(billingEvents)).toHaveLength(1);
    expect((await webhook()).status).toBe(200);
    expect(
      (await db.db.select().from(billingEvents)).some(
        (e) => e.outcome === 'ignored_unmapped_customer',
      ),
    ).toBe(true);
  });
  it('relit l’état courant malgré un ancien événement ; une facture payée ne réactive pas un abonnement résilié', async () => {
    await subscribed(alice, { status: 'canceled' });
    const r = await row();
    expect((await webhook('invoice.paid', r.stripeCustomerId!)).status).toBe(200);
    expect((await alice.call('/profile')).entitlements.tier).toBe('free');
  });
  it('active Pro puis Premium et conserve un downgrade payé jusqu’à son application effective', async () => {
    const sub = await subscribed();
    expect((await alice.call('/profile')).entitlements.tier).toBe('pro');
    sub.items.data[0].price.id = 'price_premium';
    gateway.current = [sub];
    await alice.call('/billing/refresh', 'POST', {});
    expect((await alice.call('/profile')).entitlements.tier).toBe('premium');
    sub.items.data[0].price.id = 'price_pro';
    gateway.current = [sub];
    await alice.call('/billing/refresh', 'POST', {});
    expect((await alice.call('/profile')).entitlements.tier).toBe('pro');
  });
  it('conserve l’accès lors d’une résiliation à échéance, puis le retire à l’instant de fin UTC', async () => {
    const sub = await subscribed(alice, { cancel_at_period_end: true });
    expect((await alice.call('/profile')).entitlements.tier).toBe('pro');
    const after = new Date(sub.items.data[0].current_period_end * 1000 + 1);
    expect((await rights(db.db, alice.id, config, after)).tier).toBe('free');
    expect((await alice.call('/billing')).subscription.cancelAtPeriodEnd).toBe(true);
  });
  it('conserve seulement l’ancien droit payé pendant une hausse non réglée, sans le transférer à un nouvel abonnement', async () => {
    const sub = await subscribed();
    sub.items.data[0].price.id = 'price_premium';
    sub.latest_invoice = { id: 'in_upgrade', status: 'open' } as Stripe.Invoice;
    gateway.current = [sub];
    await alice.call('/billing/refresh', 'POST', {});
    expect((await alice.call('/profile')).entitlements.tier).toBe('pro');
    gateway.current = [{ ...sub, id: 'sub_new_without_payment' }];
    await alice.call('/billing/refresh', 'POST', {});
    expect((await alice.call('/profile')).entitlements.tier).toBe('free');
  });
  it.each([
    'past_due',
    'unpaid',
    'incomplete',
    'incomplete_expired',
    'paused',
    'trialing',
    'canceled',
  ])('retire les droits pour %s sans effacer les données', async (status) => {
    await subscribed(alice, { status });
    expect((await alice.call('/profile')).entitlements.tier).toBe('free');
  });
  it('ne donne pas Premium pour une hausse non payée ou un prix inconnu', async () => {
    const sub = await subscribed(alice, { latest_invoice: { id: 'in_unpaid', status: 'open' } });
    sub.items.data[0].price.id = 'price_premium';
    gateway.current = [sub];
    await alice.call('/billing/refresh', 'POST', {});
    expect((await alice.call('/profile')).entitlements.tier).toBe('free');
    sub.latest_invoice = { id: 'in_paid', status: 'paid' } as Stripe.Invoice;
    sub.items.data[0].price.id = 'price_unknown';
    gateway.current = [sub];
    await alice.call('/billing/refresh', 'POST', {});
    expect((await alice.call('/profile')).entitlements.tier).toBe('free');
  });
  it('refuse une seconde souscription active et permet une nouvelle souscription après résiliation effective', async () => {
    await subscribed();
    await alice.call('/billing/checkout', 'POST', request(), 409);
    gateway.current[0].status = 'canceled';
    await alice.call('/billing/refresh', 'POST', {});
    const again = await start();
    expect(again.url).toContain('https://checkout.stripe.com/');
    expect(gateway.sessions.size).toBe(2);
  });
  it('conserve les droits précédents et permet la reprise si la lecture Stripe échoue ; événement non acquitté', async () => {
    const sub = await subscribed();
    gateway.failRead = true;
    const id = `evt_${crypto.randomUUID()}`;
    expect((await webhook('invoice.payment_failed', String(sub.customer), id)).status).toBe(500);
    expect(
      await db.db.select().from(billingEvents).where(eq(billingEvents.stripeEventId, id)),
    ).toHaveLength(0);
    expect((await alice.call('/profile')).entitlements.tier).toBe('pro');
    gateway.failRead = false;
    expect((await webhook('invoice.payment_failed', String(sub.customer), id)).status).toBe(200);
  });
  it('isole le portail et les données et interdit l’administration aux utilisateurs ordinaires', async () => {
    await subscribed();
    await alice.call('/billing/portal', 'POST', {});
    expect(gateway.portalCustomer).toBe((await row()).stripeCustomerId);
    await bob.call('/billing/portal', 'POST', { customer: (await row()).stripeCustomerId }, 400);
    await bob.call('/billing/portal', 'POST', {}, 404);
    expect((await bob.call(`/billing?userId=${alice.id}`)).rights.tier).toBe('free');
    for (const path of ['/admin/accounts', '/admin/billing/events', '/admin/billing/audit'])
      await bob.call(path, 'GET', undefined, 403);
    expect((await app.fetch(new Request(`${origin}/api/admin/accounts`))).status).toBe(401);
  });
  it('offre Premium permanent au propriétaire, refuse sa facturation et journalise son administration', async () => {
    const data = await owner.call('/billing');
    expect(data.rights).toMatchObject({
      tier: 'premium',
      role: 'owner',
      permanent: true,
      billingExempt: true,
    });
    await owner.call('/billing/checkout', 'POST', request(), 403);
    await owner.call('/billing/portal', 'POST', {}, 403);
    expect(gateway.customerCalls).toBe(0);
    await subscribed();
    const accounts = await owner.call('/admin/accounts');
    expect(accounts.accounts.map((a: any) => a.id)).toContain(alice.id);
    await owner.call('/admin/billing/reconcile', 'POST', { userId: alice.id });
    expect(await db.db.select().from(billingAdminAudit)).toHaveLength(1);
  });
  it('limite les passages dans la transaction documentaire sans perte de réponse ni demi-sauvegarde', async () => {
    const nodes = Array.from({ length: 501 }, (_, i) => ({
      type: 'text',
      text: `Réponse ${i}`,
      marks: [
        {
          type: 'memoryAnchor',
          attrs: { id: crypto.randomUUID(), hint: '', priority: 'high', sourceId: null },
        },
      ],
    }));
    const content = (length: number) => ({
      type: 'doc',
      content: [{ type: 'paragraph', content: nodes.slice(0, length) }],
    });
    const doc = await alice.call(
      '/documents',
      'POST',
      { title: 'Quota passages', content: content(500) },
      201,
    );
    await alice.call(
      `/documents/${doc.id}`,
      'PUT',
      { revision: doc.revision, title: doc.title, layout: doc.layout, content: content(501) },
      413,
    );
    const unchanged = await alice.call(`/documents/${doc.id}`);
    expect(unchanged.revision).toBe(doc.revision);
    expect(unchanged.content).toEqual(doc.content);
    expect((await alice.call('/billing')).usage.clozes).toBe(500);
    await subscribed();
    const changed = await alice.call(`/documents/${doc.id}`, 'PUT', {
      revision: doc.revision,
      title: doc.title,
      layout: doc.layout,
      content: content(501),
    });
    expect(changed.revision).toBe(doc.revision + 1);
    // Preserve data on downgrade; removing just one annotation remains possible above quota.
    gateway.current[0].status = 'canceled';
    await alice.call('/billing/refresh', 'POST', {});
    const reduced = await alice.call(`/documents/${doc.id}`, 'PUT', {
      revision: changed.revision,
      title: doc.title,
      layout: doc.layout,
      content: content(500),
    });
    expect(reduced.revision).toBe(changed.revision + 1);
    await db.db.delete(documents).where(eq(documents.id, doc.id));
  });
  it('limite la fenêtre des versions sans purge et préserve les 100 versions des comptes historiques', async () => {
    const doc = await alice.call('/documents', 'POST', { title: 'Historique à préserver' }, 201);
    const inserted = await db.db
      .insert(versions)
      .values(
        Array.from({ length: 34 }, (_, i) => ({
          documentId: doc.id,
          ownerId: alice.id,
          revision: i + 2,
          title: 'Archive',
          content: doc.content,
          layout: doc.layout,
          reason: 'test',
        })),
      )
      .returning();
    expect(await alice.call(`/documents/${doc.id}/versions`)).toHaveLength(10);
    await alice.call(`/documents/${doc.id}/versions/${inserted[0].id}`, 'GET', undefined, 403);
    await subscribed();
    expect(await alice.call(`/documents/${doc.id}/versions`)).toHaveLength(30);
    await db.db
      .update(profiles)
      .set({ legacyVersionLimit: 100 })
      .where(eq(profiles.userId, alice.id));
    expect(await alice.call(`/documents/${doc.id}/versions`)).toHaveLength(35);
    expect((await alice.call(`/documents/${doc.id}/versions/${inserted[0].id}`)).id).toBe(
      inserted[0].id,
    );
    expect(await db.db.select().from(versions).where(eq(versions.documentId, doc.id))).toHaveLength(
      35,
    );
    await db.db
      .update(profiles)
      .set({ legacyVersionLimit: 0 })
      .where(eq(profiles.userId, alice.id));
    await db.db.delete(documents).where(eq(documents.id, doc.id));
  });
  it('applique les quotas en transaction : gratuit/Pro pleins, Premium autorisé, données conservées après retour gratuit', async () => {
    const count = (
      await db.db
        .select({ count: sql<number>`count(*)::int` })
        .from(documents)
        .where(eq(documents.ownerId, alice.id))
    )[0].count;
    const ids = Array.from({ length: 100 - count }, () => crypto.randomUUID());
    await db.db.insert(documents).values(
      ids.map((id) => ({
        id,
        ownerId: alice.id,
        title: 'Quota fixture',
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
      })),
    );
    await alice.call('/documents', 'POST', { title: 'Refus gratuit' }, 413);
    const paid = await subscribed();
    await alice.call('/documents', 'POST', { title: 'Refus Pro plein' }, 413);
    paid.items.data[0].price.id = 'price_premium';
    gateway.current = [paid];
    await alice.call('/billing/refresh', 'POST', {});
    const doc = await alice.call('/documents', 'POST', { title: 'Document conservé' }, 201);
    gateway.current[0].status = 'canceled';
    await alice.call('/billing/refresh', 'POST', {});
    await alice.call('/documents', 'POST', { title: 'Refus après baisse' }, 413);
    const saved = await alice.call(`/documents/${doc.id}`, 'PUT', {
      revision: doc.revision,
      title: 'Toujours éditable',
      content: doc.content,
      layout: doc.layout,
    });
    expect(saved.title).toBe('Toujours éditable');
    expect((await alice.call(`/documents/${doc.id}`)).id).toBe(doc.id);
    await db.db.insert(assets).values({
      id: crypto.randomUUID(),
      ownerId: alice.id,
      storageKey: 'fixture_quota',
      filename: 'fixture.png',
      mime: 'image/png',
      bytes: 25 * 1024 * 1024,
    });
    const upload = async (expected: number) => {
      const form = new FormData();
      form.set(
        'file',
        new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'fixture.png', {
          type: 'image/png',
        }),
      );
      const r = await app.fetch(
        new Request(`${origin}/api/assets`, {
          method: 'POST',
          headers: {
            Origin: origin,
            Cookie: [...alice.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
          },
          body: form,
        }),
      );
      expect(r.status, await r.text()).toBe(expected);
    };
    await upload(413);
    await subscribed();
    await upload(201);
  });
});
