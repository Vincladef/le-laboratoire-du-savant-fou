import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { asc, desc, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AppConfig } from '../config';
import type { Database } from '../db';
import {
  assets,
  billingAdminAudit,
  billingEvents,
  documents,
  subscriptions,
  user,
} from '../db/schema';
import { rights } from './rights';
import type { billingService } from './service';

type Service = ReturnType<typeof billingService>;
export function billingRoutes(db: Database, config: AppConfig, billing: Service) {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.get('/billing', async (c) => {
    const id = c.get('userId');
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, id));
    const [docs] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(documents)
      .where(eq(documents.ownerId, id));
    const [files] = await db
      .select({ bytes: sql<number>`coalesce(sum(${assets.bytes}),0)::bigint` })
      .from(assets)
      .where(eq(assets.ownerId, id));
    return c.json({
      rights: await rights(db, id, config),
      usage: { documents: docs.count, bytes: Number(files.bytes) },
      checkoutReady: billing.checkoutReady(),
      manageReady: billing.available() && Boolean(subscription?.stripeCustomerId),
      mode: config.billing?.mode || null,
      subscription: subscription
        ? {
            status: subscription.status,
            plan: subscription.plan,
            invoiceStatus: subscription.invoiceStatus,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            cancelAt: subscription.cancelAt,
            syncedAt: subscription.syncedAt,
          }
        : null,
    });
  });
  app.post('/billing/checkout', async (c) => {
    const input = z
      .object({
        plan: z.enum(['pro', 'premium']),
        requestId: z.uuid(),
        termsVersion: z.string().min(1).max(200),
        offerVersion: z.string().min(1).max(200),
        accepted: z.literal(true),
        immediateAccess: z.literal(true),
      })
      .strict()
      .parse(await c.req.json());
    return c.json(await billing.checkout(c.get('userId'), input));
  });
  app.post('/billing/portal', async (c) => {
    z.object({})
      .strict()
      .parse(await c.req.json());
    return c.json(await billing.portal(c.get('userId')));
  });
  app.post('/billing/refresh', async (c) => {
    z.object({})
      .strict()
      .parse(await c.req.json());
    await billing.refresh(c.get('userId'));
    return c.json({ rights: await rights(db, c.get('userId'), config) });
  });
  app.use('/admin/*', async (c, next) => {
    if ((await rights(db, c.get('userId'), config)).role !== 'owner')
      throw new HTTPException(403, { message: 'Cette fonction est réservée au propriétaire.' });
    await next();
  });
  app.get('/admin/accounts', async (c) => {
    const after = z.string().max(200).optional().parse(c.req.query('after'));
    const people = await db
      .select({ id: user.id, name: user.name, email: user.email, createdAt: user.createdAt })
      .from(user)
      .where(after ? gt(user.id, after) : undefined)
      .orderBy(asc(user.id))
      .limit(51);
    const rows = await Promise.all(
      people.slice(0, 50).map(async (person) => {
        const [sub] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.userId, person.id));
        return {
          ...person,
          rights: await rights(db, person.id, config),
          subscription: sub
            ? {
                customerId: sub.stripeCustomerId,
                subscriptionId: sub.stripeSubscriptionId,
                status: sub.status,
                plan: sub.plan,
                mode: sub.mode,
                currentPeriodEnd: sub.currentPeriodEnd,
                cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
                invoiceStatus: sub.invoiceStatus,
                syncedAt: sub.syncedAt,
              }
            : null,
        };
      }),
    );
    return c.json({ accounts: rows, next: people.length > 50 ? people[49].id : null });
  });
  app.get('/admin/billing/events', async (c) =>
    c.json(
      await db.select().from(billingEvents).orderBy(desc(billingEvents.receivedAt)).limit(100),
    ),
  );
  app.get('/admin/billing/audit', async (c) =>
    c.json(
      await db
        .select()
        .from(billingAdminAudit)
        .orderBy(desc(billingAdminAudit.createdAt))
        .limit(100),
    ),
  );
  app.post('/admin/billing/reconcile', async (c) => {
    const { userId } = z
      .object({ userId: z.string().min(1).max(200) })
      .strict()
      .parse(await c.req.json());
    const [person] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId));
    if (!person) throw new HTTPException(404, { message: 'Compte introuvable.' });
    await billing.refresh(userId);
    await db
      .insert(billingAdminAudit)
      .values({ actorId: c.get('userId'), targetId: userId, action: 'stripe.reconcile' });
    return c.json({ rights: await rights(db, userId, config) });
  });
  return app;
}
