import 'dotenv/config';
import Stripe from 'stripe';
import { spawn } from 'node:child_process';
import { legalSchema } from '../server/legal';
import { suppliedStripeLinks } from './inspect-stripe-links';

// No purchase, subscription, charge or refund is ever created by this script.
// Default is read-only. --apply is an explicit, controlled configuration operation.
const site = '449cbaf7-eaaa-43ce-8b27-50460f3d036c';
const account = '687f48604316395b8f89bdba';
type Variable = {
  key: string;
  scopes: string[];
  values: { context: string; context_parameter?: string; value: string }[];
};
async function netlify(path: string, method = 'GET', body?: unknown) {
  if (!process.env.NETLIFY_AUTH_TOKEN) throw Error('Autorisation Netlify absente.');
  const args = [
    '--silent',
    '--show-error',
    '--max-time',
    '45',
    '--request',
    method,
    '--header',
    `Authorization: Bearer ${process.env.NETLIFY_AUTH_TOKEN}`,
    '--write-out',
    '\n%{http_code}',
  ];
  if (body !== undefined)
    args.push('--header', 'Content-Type: application/json', '--data-binary', '@-');
  args.push(`https://api.netlify.com/api/v1${path}`);
  return new Promise<any>((resolve, reject) => {
    const child = spawn('curl', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.resume();
    child.on('error', () => reject(Error('Transport Netlify impossible.')));
    child.on('close', (code) => {
      const raw = Buffer.concat(chunks).toString(),
        i = raw.lastIndexOf('\n'),
        status = Number(raw.slice(i + 1));
      if (code || status < 200 || status >= 300)
        return reject(Error(`Configuration Netlify refusée (HTTP ${status || 'transport'}).`));
      try {
        resolve(JSON.parse(raw.slice(0, i)));
      } catch {
        reject(Error('Réponse Netlify invalide.'));
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
async function configure() {
  const key = process.env.STRIPE_SECRET_KEY;
  const mode = process.env.STRIPE_MODE === 'live' ? 'live' : 'test';
  if (!key || !new RegExp(`^(sk|rk)_${mode}_`).test(key))
    throw Error(
      'STRIPE_SECRET_KEY serveur absente ou mode incompatible. Utiliser le canal sécurisé, jamais la conversation.',
    );
  const apply = process.argv.includes('--apply');
  const production = process.argv.includes('--production');
  if (production && mode !== 'live')
    throw Error(
      'La production requiert une autorisation Stripe live ; les essais restent sur development.',
    );
  if (!production && mode !== 'test')
    throw Error('La branche de développement ne doit pas utiliser Stripe live.');
  const origin = production
    ? 'https://le-laboratoire-du-savant-fou.netlify.app'
    : 'https://mission-2--le-laboratoire-du-savant-fou.netlify.app';
  const stripe = new Stripe(key, { timeout: 10000, maxNetworkRetries: 1 });
  const merchant = await stripe.accounts.retrieveCurrent();
  if (
    production &&
    apply &&
    process.argv.includes('--enable') &&
    (!merchant.charges_enabled || !merchant.details_submitted)
  )
    throw Error(
      'Le titulaire doit terminer la validation du compte Stripe avant tout encaissement.',
    );
  const context = production ? 'production' : 'branch';
  const current: Variable[] = await netlify(`/accounts/${account}/env?site_id=${site}`);
  const value = (name: string) =>
    current
      .find((x) => x.key === name)
      ?.values.find(
        (v) => v.context === context && (production || v.context_parameter === 'mission-2'),
      )?.value;
  if (value('STRIPE_ACCOUNT_ID') && value('STRIPE_ACCOUNT_ID') !== merchant.id)
    throw Error('Le compte Stripe diffère de celui déjà configuré ; aucune modification.');
  const catalog: Record<string, Stripe.Price> = {};
  const inspectedLinks: { url: string; priceId: string | null; plan: string | null }[] = [];
  let links = 0;
  for await (const link of stripe.paymentLinks.list({ limit: 100 })) {
    if (++links > 1000)
      throw Error('Inventaire de liens trop grand : aucune création automatique.');
    if (!suppliedStripeLinks.includes(link.url)) continue;
    const items = await stripe.paymentLinks.listLineItems(link.id, { limit: 100 });
    const p = items.data.length === 1 && items.data[0].quantity === 1 ? items.data[0].price : null;
    const plan = p?.unit_amount === 900 ? 'pro' : p?.unit_amount === 1900 ? 'premium' : null;
    inspectedLinks.push({ url: link.url, priceId: p?.id || null, plan });
    if (p && plan) catalog[plan] = p;
  }
  // A test catalog lives in the same Stripe account's sandbox, not in the live catalog.
  // Reuse existing active names/prices. Never manufacture live products or guess ambiguity.
  for (const plan of ['pro', 'premium'] as const) {
    if (catalog[plan]) continue;
    const found: Stripe.Price[] = [];
    let prices = 0;
    for await (const p of stripe.prices.list({
      active: true,
      limit: 100,
      expand: ['data.product'],
    })) {
      if (++prices > 1000)
        throw Error('Inventaire de prix trop grand : préciser le catalogue par accès autorisé.');
      const product = p.product;
      if (
        typeof product !== 'string' &&
        !product.deleted &&
        [plan, `le laboratoire du savant fou • ${plan}`].includes(
          product.name.toLowerCase().replace(/\s+/g, ' ').trim(),
        ) &&
        p.currency === 'eur' &&
        p.unit_amount === (plan === 'pro' ? 900 : 1900) &&
        p.recurring?.interval === 'month' &&
        p.recurring.interval_count === 1
      )
        found.push(p);
    }
    if (found.length !== 1)
      throw Error(
        `Prix ${plan} manquant ou ambigu dans ce mode ; aucun produit ni tarif dupliqué. Les IDs peuvent être obtenus par une lecture Stripe autorisée.`,
      );
    catalog[plan] = found[0];
  }
  if (production && inspectedLinks.length !== suppliedStripeLinks.length)
    throw Error(
      'Les deux liens fournis ne sont pas retrouvés dans ce compte live. Aucun raccordement à un autre compte.',
    );
  for (const [plan, p] of Object.entries(catalog)) {
    if (
      !p.active ||
      p.livemode !== production ||
      p.currency !== 'eur' ||
      p.unit_amount !== (plan === 'pro' ? 900 : 1900) ||
      p.type !== 'recurring' ||
      p.recurring?.interval !== 'month' ||
      p.recurring.interval_count !== 1 ||
      p.recurring.usage_type !== 'licensed' ||
      p.tax_behavior !== 'inclusive' ||
      p.billing_scheme !== 'per_unit' ||
      p.transform_quantity ||
      p.custom_unit_amount
    )
      throw Error(
        `Le tarif ${plan} ne correspond pas à l’offre mensuelle fixe EUR taxes incluses. Rien n’est modifié.`,
      );
  }
  const configs = await stripe.billingPortal.configurations.list({ limit: 100 });
  if (configs.has_more)
    throw Error('Inventaire de portails incomplet : aucune création automatique.');
  const own = configs.data.filter(
    (c) => c.metadata?.app === 'lab_savant_fou' && c.default_return_url === `${origin}/billing`,
  );
  if (own.length > 1) throw Error('Configurations Portal ambiguës ; aucune duplication.');
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  if (endpoints.has_more)
    throw Error('Inventaire de webhooks incomplet : aucune création automatique.');
  const existing = endpoints.data.filter((e) => e.url === `${origin}/api/billing/webhook`);
  if (existing.length > 1)
    throw Error('Endpoints dupliqués ; intervention de réconciliation nécessaire.');
  if (existing[0] && !value('STRIPE_WEBHOOK_SECRET'))
    throw Error(
      'Le secret de signature existant n’est pas récupérable par API. Préserver sa valeur serveur ou autoriser une rotation ; aucun endpoint dupliqué.',
    );
  const product = (p: Stripe.Price) => (typeof p.product === 'string' ? p.product : p.product.id);
  const portal: Stripe.BillingPortal.ConfigurationCreateParams = {
    default_return_url: `${origin}/billing`,
    metadata: { app: 'lab_savant_fou' },
    business_profile: {
      headline: 'Le Laboratoire du Savant Fou',
      privacy_policy_url: `${origin}/legal/confidentialite`,
      terms_of_service_url: `${origin}/legal/cgv`,
    },
    features: {
      customer_update: { enabled: true, allowed_updates: ['email', 'address', 'tax_id'] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: 'at_period_end', proration_behavior: 'none' },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ['price'],
        products: [
          { product: product(catalog.pro), prices: [catalog.pro.id] },
          { product: product(catalog.premium), prices: [catalog.premium.id] },
        ],
        proration_behavior: 'always_invoice',
        schedule_at_period_end: { conditions: [{ type: 'decreasing_item_amount' }] },
      },
    },
  };
  const events: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
    'checkout.session.expired',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'customer.subscription.paused',
    'customer.subscription.resumed',
    'customer.subscription.pending_update_applied',
    'customer.subscription.pending_update_expired',
    'invoice.paid',
    'invoice.payment_failed',
    'invoice.payment_action_required',
    'invoice.voided',
    'invoice.marked_uncollectible',
    'invoice.finalized',
    'customer.deleted',
  ];
  console.log(
    JSON.stringify({
      operation: apply ? 'apply' : 'read-only',
      mode,
      origin,
      accountId: merchant.id,
      prices: { pro: catalog.pro.id, premium: catalog.premium.id },
      suppliedLinks: inspectedLinks,
      createsProducts: false,
      createsPayments: false,
    }),
  );
  if (!apply) return;
  const configuredPortal = own[0]
    ? await stripe.billingPortal.configurations.update(own[0].id, { ...portal, active: true })
    : await stripe.billingPortal.configurations.create(portal);
  const endpoint = existing[0]
    ? await stripe.webhookEndpoints.update(existing[0].id, {
        enabled_events: events,
        disabled: false,
      })
    : await stripe.webhookEndpoints.create({
        url: `${origin}/api/billing/webhook`,
        enabled_events: events,
        api_version: '2026-09-30.endive',
        metadata: { app: 'lab_savant_fou' },
      });
  let legal = false;
  try {
    legal = legalSchema.safeParse(JSON.parse(value('LEGAL_PUBLIC_CONFIG') || 'null')).success;
  } catch {}
  const variables: Record<string, string> = {
    STRIPE_SECRET_KEY: key,
    STRIPE_ACCOUNT_ID: merchant.id,
    STRIPE_MODE: mode,
    STRIPE_PRO_PRICE_ID: catalog.pro.id,
    STRIPE_PREMIUM_PRICE_ID: catalog.premium.id,
    STRIPE_PORTAL_CONFIGURATION_ID: configuredPortal.id,
    STRIPE_WEBHOOK_SECRET: endpoint.secret || value('STRIPE_WEBHOOK_SECRET')!,
    STRIPE_CHECKOUT_ENABLED: process.argv.includes('--enable') && legal ? '1' : '0',
  };
  for (const [name, saved] of Object.entries(variables)) {
    const old = current.find((x) => x.key === name);
    const desired = {
      key: name,
      scopes: ['builds', 'functions', 'runtime', 'post_processing'],
      values: [
        ...(old?.values || []).filter(
          (v) => !(v.context === context && (production || v.context_parameter === 'mission-2')),
        ),
        { context, ...(!production ? { context_parameter: 'mission-2' } : {}), value: saved },
      ],
    };
    await netlify(
      `/accounts/${account}/env${old ? '/' + name : ''}?site_id=${site}`,
      old ? 'PUT' : 'POST',
      old ? desired : [desired],
    );
  }
  console.log(
    JSON.stringify({
      configured: true,
      mode,
      variables: Object.keys(variables),
      checkoutEnabled: variables.STRIPE_CHECKOUT_ENABLED === '1',
      requiresDeploy: true,
      noPurchase: true,
    }),
  );
}
configure().catch((error) => {
  // Stripe errors may carry request bodies and credentials. Never dump raw errors.
  if (error?.type?.startsWith('Stripe'))
    console.error('STRIPE_CONFIGURATION_BLOCKED', error.type, error.statusCode || '');
  else
    console.error(
      'STRIPE_CONFIGURATION_BLOCKED',
      String(error.message)
        .replace(/(?:sk|rk|whsec)_[A-Za-z0-9_]+/g, '[redacted]')
        .slice(0, 450),
    );
  process.exitCode = 2;
});
