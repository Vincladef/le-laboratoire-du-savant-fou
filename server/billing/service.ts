import { and, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type Stripe from 'stripe';
import type { Database } from '../db';
import type { AppConfig } from '../config';
import { billingEvents, profiles, subscriptions } from '../db/schema';
import { offerVersion, plans, type PaidPlan } from '../../src/shared/plans';
import { billingConfigured } from './config';
import { rights } from './rights';
import type { StripeGateway } from './stripe';

const appTag = 'lab_savant_fou';
const deny = (status: 400 | 403 | 404 | 409 | 503, message: string): never => {
  throw new HTTPException(status, { message });
};
const idOf = (value: unknown): string | undefined =>
  typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'id' in value
      ? String(value.id)
      : undefined;
const terminal = (s: Stripe.Subscription) => ['canceled', 'incomplete_expired'].includes(s.status);
const recognizedEvent =
  /^(customer\.subscription\.(created|updated|deleted|paused|resumed|pending_update_applied|pending_update_expired)|invoice\.(paid|payment_failed|payment_action_required|voided|marked_uncollectible|finalized)|checkout\.session\.(completed|async_payment_succeeded|async_payment_failed|expired)|customer\.deleted)$/;

export function billingService(db: Database, config: AppConfig, gateway?: StripeGateway) {
  const settings = config.billing;
  const available = () => Boolean(settings && gateway && billingConfigured(settings));
  const checkoutReady = () => Boolean(available() && settings?.enabled && config.legal?.reviewed);
  function connected(): StripeGateway {
    if (!available())
      deny(503, 'Le raccordement Stripe sécurisé n’est pas finalisé. Aucun achat n’a été lancé.');
    return gateway!;
  }
  async function account() {
    const actual = await connected().account();
    if (actual.id !== settings!.accountId)
      deny(503, 'Le compte Stripe configuré ne correspond pas au compte autorisé.');
  }
  async function lock(tx: any, userId: string) {
    await tx.insert(profiles).values({ userId }).onConflictDoNothing();
    await tx.select().from(profiles).where(eq(profiles.userId, userId)).for('update');
    const [row] = await tx.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    return row as typeof subscriptions.$inferSelect | undefined;
  }
  function checkMode(livemode: boolean) {
    if (livemode !== (settings!.mode === 'live'))
      deny(503, 'Les données Stripe et le mode configuré ne correspondent pas.');
  }
  async function verifyPrice(plan: PaidPlan) {
    const price = await connected().price(
      plan === 'pro' ? settings!.proPrice : settings!.premiumPrice,
    );
    checkMode(price.livemode);
    if (
      !price.active ||
      price.currency !== 'eur' ||
      price.unit_amount !== plans[plan].monthlyCents ||
      price.type !== 'recurring' ||
      price.recurring?.interval !== 'month' ||
      price.recurring.interval_count !== 1 ||
      price.tax_behavior !== 'inclusive' ||
      price.billing_scheme !== 'per_unit' ||
      price.custom_unit_amount ||
      price.transform_quantity
    )
      deny(
        503,
        'Le tarif Stripe doit être actif, mensuel, fixe en EUR et taxes incluses, sans transformation de quantité.',
      );
    return price;
  }
  async function reconcile(tx: any, row: typeof subscriptions.$inferSelect) {
    if (!row.stripeCustomerId) return [];
    if (row.mode !== settings!.mode) deny(503, 'Le client Stripe appartient à un autre mode.');
    const customer = await connected().customer(row.stripeCustomerId);
    if (customer.deleted) {
      await tx
        .update(subscriptions)
        .set({
          status: 'customer_deleted',
          plan: 'free',
          currentPeriodEnd: null,
          syncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, row.id));
      return [];
    }
    checkMode(customer.livemode);
    if (customer.metadata.labUserId !== row.userId || customer.metadata.app !== appTag)
      deny(409, 'L’association du client Stripe doit être vérifiée par le propriétaire.');
    const all = await connected().subscriptions(row.stripeCustomerId);
    for (const sub of all) {
      checkMode(sub.livemode);
      if (idOf(sub.customer) !== row.stripeCustomerId) deny(503, 'Client Stripe incohérent.');
    }
    const own = all.filter((s) => s.metadata.app === appTag && s.metadata.labUserId === row.userId);
    const ongoing = own.filter((s) => !terminal(s));
    // Never guess an entitlement when a duplicate subscription is found. Portal remains available.
    const sub =
      ongoing.length === 1
        ? ongoing[0]
        : ongoing.length > 1
          ? undefined
          : own.sort((a, b) => b.created - a.created)[0];
    const item =
      sub?.items.data.length === 1 && sub.items.data[0].quantity === 1
        ? sub.items.data[0]
        : undefined;
    const priceId = item?.price.id;
    const plan =
      priceId === settings!.proPrice
        ? 'pro'
        : priceId === settings!.premiumPrice
          ? 'premium'
          : 'free';
    // Live API state, never the event payload or redirect query, determines rights.
    const invoice = sub?.latest_invoice;
    const invoiceStatus = invoice && typeof invoice === 'object' ? invoice.status : null;
    const paidEntitlement: (typeof subscriptions.$inferSelect)['paidEntitlement'] =
      sub?.status === 'active' &&
      !sub.pause_collection &&
      item &&
      invoiceStatus === 'paid' &&
      invoice &&
      typeof invoice === 'object' &&
      plan !== 'free'
        ? {
            plan,
            priceId: item.price.id,
            through: new Date(item.current_period_end * 1000).toISOString(),
            invoiceId: invoice.id,
            subscriptionId: sub.id,
          }
        : row.paidEntitlement;
    await tx
      .update(subscriptions)
      .set({
        stripeSubscriptionId: sub?.id || null,
        stripePriceId: priceId || null,
        status:
          ongoing.length > 1
            ? 'multiple_subscriptions'
            : sub?.pause_collection
              ? 'paused'
              : sub?.status || 'inactive',
        plan,
        invoiceStatus,
        paidEntitlement,
        currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : null,
        cancelAtPeriodEnd: sub?.cancel_at_period_end || false,
        cancelAt: sub?.cancel_at ? new Date(sub.cancel_at * 1000) : null,
        syncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, row.id));
    const effective = await rights(tx, row.userId, config);
    // Cache for display only; every protected quota independently computes effective rights.
    if (effective.role !== 'owner')
      await tx
        .update(profiles)
        .set({ role: effective.tier, updatedAt: new Date() })
        .where(and(eq(profiles.userId, row.userId)));
    return all;
  }
  return {
    available,
    checkoutReady,
    async refresh(userId: string) {
      await account();
      await db.transaction(async (tx) => {
        const row = await lock(tx, userId);
        if (row?.stripeCustomerId) await reconcile(tx, row);
      });
    },
    async checkout(
      userId: string,
      input: {
        plan: PaidPlan;
        requestId: string;
        termsVersion: string;
        offerVersion: string;
        accepted: true;
        immediateAccess: true;
      },
    ) {
      if (!checkoutReady())
        deny(
          503,
          'Les souscriptions sont fermées : raccordement Stripe ou informations légales non finalisés. Aucun achat n’a été lancé.',
        );
      if (input.termsVersion !== config.legal!.termsVersion)
        deny(409, 'Les CGV ont changé. Relisez-les avant de continuer.');
      if (input.offerVersion !== offerVersion)
        deny(409, 'Les formules ont changé. Rechargez la page avant de continuer.');
      await account();
      await verifyPrice(input.plan);
      const reservation = await db.transaction(async (tx) => {
        let row = await lock(tx, userId);
        if ((await rights(tx, userId, config)).billingExempt)
          deny(403, 'Le propriétaire dispose de Premium à vie, sans facturation.');
        if (!row) {
          [row] = await tx
            .insert(subscriptions)
            .values({ userId, mode: settings!.mode })
            .returning();
        }
        if (row!.mode !== settings!.mode)
          deny(409, 'Un changement de mode Stripe requiert une migration contrôlée.');
        if (!row!.stripeCustomerId) {
          const customer = await connected().createCustomer(
            { metadata: { app: appTag, labUserId: userId } },
            `lab-customer-${settings!.mode}-${userId}`,
          );
          checkMode(customer.livemode);
          [row] = await tx
            .update(subscriptions)
            .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
            .where(eq(subscriptions.userId, userId))
            .returning();
        }
        const existing = await reconcile(tx, row!);
        if (existing.some((s) => !terminal(s)))
          deny(
            409,
            'Un abonnement existe déjà. Utilisez « Gérer mon abonnement » pour le modifier ou le résilier.',
          );
        if (row!.checkoutSessionId) {
          const pending = await connected().checkout(row!.checkoutSessionId);
          checkMode(pending.livemode);
          if (idOf(pending.customer) !== row!.stripeCustomerId)
            deny(503, 'Session de paiement incohérente.');
          if (pending.status === 'open') {
            if (
              row!.checkoutPlan !== input.plan ||
              row!.acceptedTermsVersion !== input.termsVersion
            )
              deny(
                409,
                'Une souscription est déjà ouverte. Terminez-la ou attendez son expiration (31 minutes) avant de changer d’offre ou de conditions.',
              );
            if (!pending.url) deny(503, 'URL de paiement indisponible.');
            return { url: pending.url, reused: true };
          }
          if (
            pending.status === 'complete' &&
            !existing.some((s) => s.id === idOf(pending.subscription) && terminal(s))
          )
            deny(
              409,
              'Le paiement est en cours de synchronisation. Actualisez les droits avant une nouvelle souscription.',
            );
          if (row!.checkoutRequestId === input.requestId)
            deny(409, 'Cette demande de paiement a expiré. Lancez une nouvelle demande.');
        }
        // Commit the intent before the external call. A lost response keeps exactly the same
        // idempotency key AND parameters (including expiry) across retries and server restarts.
        if (
          !row!.checkoutSessionId &&
          row!.checkoutRequestId &&
          row!.checkoutExpiresAt &&
          row!.checkoutExpiresAt > new Date()
        ) {
          if (row!.checkoutPlan !== input.plan || row!.acceptedTermsVersion !== input.termsVersion)
            deny(
              409,
              'Une demande de paiement est en cours. Réessayez la même offre ou attendez son expiration.',
            );
          return {
            requestId: row!.checkoutRequestId,
            expires: row!.checkoutExpiresAt,
            plan: input.plan,
            customer: row!.stripeCustomerId!,
          };
        }
        if (!row!.checkoutSessionId && row!.checkoutRequestId === input.requestId)
          deny(409, 'Cette demande a expiré. Lancez une nouvelle demande.');
        const expires = new Date((Math.floor(Date.now() / 1000) + 1860) * 1000);
        await tx
          .update(subscriptions)
          .set({
            checkoutSessionId: null,
            checkoutUrl: null,
            checkoutRequestId: input.requestId,
            checkoutPlan: input.plan,
            checkoutExpiresAt: expires,
            acceptedTermsVersion: input.termsVersion,
            acceptedOfferVersion: offerVersion,
            acceptedAt: new Date(),
            updatedAt: new Date(),
            immediateAccessRequestedAt: new Date(),
            acceptedLegal: config.legal,
            acceptedOffer: { ...plans[input.plan], offerVersion },
          })
          .where(eq(subscriptions.userId, userId));
        return {
          requestId: input.requestId,
          expires,
          plan: input.plan,
          customer: row!.stripeCustomerId!,
        };
      });
      if ('url' in reservation) return reservation;
      return db.transaction(async (tx) => {
        const row = await lock(tx, userId);
        if ((await rights(tx, userId, config)).billingExempt)
          deny(403, 'Le propriétaire dispose de Premium sans facturation.');
        if (row!.checkoutRequestId !== reservation.requestId)
          deny(409, 'La demande de souscription a changé. Actualisez la page.');
        if (row!.checkoutUrl) return { url: row!.checkoutUrl, reused: true };
        const price = reservation.plan === 'pro' ? settings!.proPrice : settings!.premiumPrice;
        const session = await connected().createCheckout(
          {
            mode: 'subscription',
            customer: reservation.customer,
            client_reference_id: userId,
            line_items: [{ price, quantity: 1 }],
            allowed_payment_method_types: ['card'],
            billing_address_collection: 'required',
            customer_update: { address: 'auto', name: 'auto' },
            success_url: `${config.baseURL}/billing?checkout=returned`,
            cancel_url: `${config.baseURL}/billing?checkout=cancelled`,
            expires_at: Math.floor(reservation.expires.getTime() / 1000),
            metadata: {
              app: appTag,
              labUserId: userId,
              termsVersion: input.termsVersion,
              offerVersion,
            },
            subscription_data: { metadata: { app: appTag, labUserId: userId } },
            consent_collection: { terms_of_service: 'required' },
            custom_text: {
              terms_of_service_acceptance: {
                message: `J’accepte les [CGV](${config.baseURL}/legal/cgv) de l’abonnement mensuel.`,
              },
            },
          },
          `lab-checkout-${settings!.mode}-${userId}-${reservation.requestId}`,
        );
        checkMode(session.livemode);
        if (!session.url || !session.url.startsWith('https://checkout.stripe.com/'))
          deny(503, 'URL de paiement Stripe invalide.');
        await tx
          .update(subscriptions)
          .set({
            checkoutSessionId: session.id,
            checkoutExpiresAt: new Date(session.expires_at * 1000),
            checkoutUrl: session.url,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.userId, userId));
        return { url: session.url, reused: false };
      });
    },
    async portal(userId: string) {
      await account();
      return db.transaction(async (tx) => {
        const row = await lock(tx, userId);
        if ((await rights(tx, userId, config)).billingExempt)
          deny(403, 'Le propriétaire n’a pas besoin d’abonnement payant.');
        if (!row?.stripeCustomerId) deny(404, 'Aucun compte de facturation associé.');
        await reconcile(tx, row!);
        const session = await connected().portal({
          customer: row!.stripeCustomerId!,
          configuration: settings!.portalConfiguration,
          return_url: `${config.baseURL}/billing`,
        });
        if (!session.url.startsWith('https://billing.stripe.com/'))
          deny(503, 'URL de gestion Stripe invalide.');
        return { url: session.url };
      });
    },
    async webhook(payload: string, signature: string) {
      let event: Stripe.Event;
      try {
        event = connected().verify(payload, signature);
      } catch (error) {
        if (error instanceof HTTPException) throw error;
        deny(400, 'Signature Stripe invalide ou expirée.');
      }
      if (event!.livemode !== (settings!.mode === 'live') || event!.account)
        deny(400, 'Événement d’un autre mode ou compte Connect refusé.');
      await account();
      return db.transaction(async (tx) => {
        await tx
          .insert(billingEvents)
          .values({
            stripeEventId: event!.id,
            type: event!.type,
            mode: settings!.mode,
            objectId: idOf(event!.data.object),
          })
          .onConflictDoNothing();
        const [stored] = await tx
          .select()
          .from(billingEvents)
          .where(eq(billingEvents.stripeEventId, event!.id))
          .for('update');
        if (stored.processedAt) return { received: true, duplicate: true };
        let outcome = 'ignored_event';
        if (recognizedEvent.test(event!.type)) {
          const object = event!.data.object as unknown as Record<string, unknown>;
          const customer =
            event!.type === 'customer.deleted' ? idOf(object) : idOf(object.customer);
          const [row] = customer
            ? await tx
                .select()
                .from(subscriptions)
                .where(eq(subscriptions.stripeCustomerId, customer))
            : [];
          if (row) {
            await lock(tx, row.userId);
            await reconcile(tx, row);
            outcome = 'reconciled';
          } else outcome = 'ignored_unmapped_customer';
        }
        await tx
          .update(billingEvents)
          .set({ processedAt: new Date(), outcome })
          .where(eq(billingEvents.stripeEventId, event!.id));
        return { received: true, duplicate: false };
      });
    },
  };
}
