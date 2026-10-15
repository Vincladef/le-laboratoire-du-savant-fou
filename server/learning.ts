import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { and, asc, desc, eq, inArray, isNull, lte, sql, getTableColumns } from 'drizzle-orm';
import { z } from 'zod';
import type { Grade } from 'ts-fsrs';
import type { Database } from './db';
import {
  documents,
  folders,
  fsrsCards,
  memoryAnchors,
  profiles,
  reviews,
  studyItems,
  studySessions,
} from './db/schema';
import { extractAnchors, type RichNode } from '../src/shared/document';
import { filtersSchema, type StudyFilters } from '../src/shared/learning';
import { initialCard, previews, schedule, toStored } from './scheduling';
const uuid = z.string().uuid();
const {
  originalSlice: _originalSlice,
  metadata: _metadata,
  ...anchorFields
} = getTableColumns(memoryAnchors);
function fail(status: 404 | 409, message: string): never {
  throw new HTTPException(status, { message });
}
const own = (table: any, id: string, ownerId: string) =>
  and(eq(table.id, uuid.parse(id)), eq(table.ownerId, ownerId));
export function learningRoutes(db: Database) {
  const app = new Hono<{ Variables: { userId: string } }>();
  const lock = async (tx: any, userId: string) => {
    await tx.insert(profiles).values({ userId }).onConflictDoNothing();
    await tx.select().from(profiles).where(eq(profiles.userId, userId)).for('update');
  };
  const nowIn = async (tx: any): Promise<Date> =>
    new Date((await tx.execute(sql`select clock_timestamp() as now`)).rows[0].now);
  async function selectedDocuments(tx: any, userId: string, filters: StudyFilters) {
    const allFolders = await tx.select().from(folders).where(eq(folders.ownerId, userId));
    if (filters.folderIds.some((id) => !allFolders.some((f: any) => f.id === id)))
      fail(404, 'Dossier introuvable.');
    const folderIds = new Set(filters.folderIds);
    for (let round = 0; round <= allFolders.length; round++) {
      let changed = false;
      for (const folder of allFolders)
        if (folder.parentId && folderIds.has(folder.parentId) && !folderIds.has(folder.id)) {
          folderIds.add(folder.id);
          changed = true;
        }
      if (!changed) break;
    }
    const docs = await tx
      .select({ id: documents.id, folderId: documents.folderId })
      .from(documents)
      .where(and(eq(documents.ownerId, userId), isNull(documents.deletedAt)));
    if (filters.documentIds.some((id) => !docs.some((d: any) => d.id === id)))
      fail(404, 'Document introuvable.');
    return docs
      .filter(
        (doc: any) =>
          (!filters.documentIds.length && !filters.folderIds.length) ||
          filters.documentIds.includes(doc.id) ||
          folderIds.has(doc.folderId),
      )
      .map((doc: any) => doc.id) as string[];
  }
  async function sessionRow(tx: any, id: string, userId: string) {
    const [session] = await tx
      .select()
      .from(studySessions)
      .where(own(studySessions, id, userId));
    if (!session) fail(404, 'Séance introuvable.');
    return session as typeof studySessions.$inferSelect;
  }
  async function passage(tx: any, anchorId: string, userId: string, lockDocument = false) {
    const [anchor] = await tx
      .select()
      .from(memoryAnchors)
      .where(own(memoryAnchors, anchorId, userId));
    if (!anchor) return null;
    let query = tx
      .select()
      .from(documents)
      .where(own(documents, anchor.documentId, userId));
    if (lockDocument) query = query.for('update');
    const [document] = await query;
    const [card] = await tx
      .select()
      .from(fsrsCards)
      .where(and(eq(fsrsCards.anchorId, anchorId), eq(fsrsCards.ownerId, userId)));
    return document && card
      ? ({ anchor, document, card } as {
          anchor: typeof memoryAnchors.$inferSelect;
          document: typeof documents.$inferSelect;
          card: typeof fsrsCards.$inferSelect;
        })
      : null;
  }
  const eligible = (p: Awaited<ReturnType<typeof passage>>, filters: StudyFilters, now: Date) =>
    Boolean(
      p &&
      !p.document.deletedAt &&
      p.anchor.status === 'active' &&
      filters.priorities.includes(p.anchor.priority) &&
      p.card.due <= now,
    );
  async function result(tx: any, session: typeof studySessions.$inferSelect, userId: string) {
    const items: (typeof studyItems.$inferSelect)[] = await tx
      .select()
      .from(studyItems)
      .where(and(eq(studyItems.sessionId, session.id), eq(studyItems.ownerId, userId)))
      .orderBy(asc(studyItems.position));
    let current: any = null;
    const now = await nowIn(tx);
    for (const item of items) {
      if (!['pending', 'revealed'].includes(item.status)) continue;
      const p = await passage(tx, item.anchorId, userId, true);
      if (
        !eligible(p, session.filters, now) ||
        (item.status === 'revealed' &&
          (item.cardRevision !== p!.card.revision || item.anchorRevision !== p!.anchor.revision))
      ) {
        await tx
          .update(studyItems)
          .set({ status: 'skipped' })
          .where(own(studyItems, item.id, userId));
        item.status = 'skipped';
        continue;
      }
      current = {
        itemId: item.id,
        revealed: item.status === 'revealed',
        document: p!.document,
        anchor: {
          ...Object.fromEntries(
            Object.keys(anchorFields).map((key) => [key, (p!.anchor as any)[key]]),
          ),
          card: p!.card,
        },
        ...(item.status === 'revealed' ? { previews: previews(p!.card, now) } : {}),
      };
      break;
    }
    const status = current ? 'active' : 'completed';
    if (status !== session.status)
      await tx
        .update(studySessions)
        .set({ status, updatedAt: now })
        .where(own(studySessions, session.id, userId));
    return {
      ...session,
      status,
      total: items.length,
      completed: items.filter((i) => i.status === 'reviewed').length,
      skipped: items.filter((i) => i.status === 'skipped').length,
      current,
    };
  }
  app.get('/documents/:id/anchors', async (c) => {
    const userId = c.get('userId');
    const [doc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(own(documents, c.req.param('id'), userId));
    if (!doc) fail(404, 'Document introuvable.');
    const rows = await db
      .select({ anchor: anchorFields, card: fsrsCards })
      .from(memoryAnchors)
      .leftJoin(
        fsrsCards,
        and(eq(fsrsCards.anchorId, memoryAnchors.id), eq(fsrsCards.ownerId, userId)),
      )
      .where(and(eq(memoryAnchors.documentId, doc.id), eq(memoryAnchors.ownerId, userId)))
      .orderBy(asc(memoryAnchors.createdAt));
    return c.json(rows.map((r) => ({ ...r.anchor, card: r.card })));
  });
  app.post('/anchors/:id/confirm', async (c) => {
    const userId = c.get('userId');
    const data = z
      .object({ revision: z.number().int().positive(), resetSchedule: z.boolean().default(false) })
      .strict()
      .parse(await c.req.json());
    return c.json(
      await db.transaction(async (tx) => {
        await lock(tx, userId);
        const p = await passage(tx, uuid.parse(c.req.param('id')), userId, true);
        if (!p || p.document.deletedAt || p.anchor.status === 'deleted')
          fail(404, 'Passage introuvable.');
        if (p.anchor.revision !== data.revision)
          fail(409, 'Le passage a changé. Rechargez-le avant de le confirmer.');
        const current = extractAnchors(p.document.content as RichNode).find(
          (a) => a.id === p.anchor.id,
        );
        if (!current || current.disconnected || !current.quote.trim())
          fail(409, 'Ce passage est fragmenté ou vide. Recréez son annotation dans le document.');
        await tx
          .update(memoryAnchors)
          .set({
            status: 'active',
            metadata: {
              ...p.anchor.metadata,
              confirmedQuote: current.quote,
              lastConfirmedAt: new Date().toISOString(),
              ...(data.resetSchedule ? { lastResetAt: new Date().toISOString() } : {}),
            },
            revision: p.anchor.revision + 1,
            updatedAt: new Date(),
          })
          .where(own(memoryAnchors, p.anchor.id, userId));
        if (data.resetSchedule)
          await tx
            .update(fsrsCards)
            .set({ ...initialCard(await nowIn(tx)), revision: p.card.revision + 1 })
            .where(own(fsrsCards, p.card.id, userId));
        return { ok: true };
      }),
    );
  });
  app.get('/anchors/:id/reviews', async (c) => {
    const userId = c.get('userId');
    const p = await passage(db, uuid.parse(c.req.param('id')), userId);
    if (!p) fail(404, 'Passage introuvable.');
    return c.json(
      await db
        .select()
        .from(reviews)
        .where(and(eq(reviews.cardId, p.card.id), eq(reviews.ownerId, userId)))
        .orderBy(desc(reviews.reviewedAt))
        .limit(100),
    );
  });
  app.post('/learning/eligible', async (c) => {
    const userId = c.get('userId'),
      filters = filtersSchema.parse(await c.req.json());
    const ids = await selectedDocuments(db, userId, filters);
    if (!ids.length) return c.json({ count: 0, sessionLimit: 200 });
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(memoryAnchors)
      .innerJoin(
        fsrsCards,
        and(eq(fsrsCards.anchorId, memoryAnchors.id), eq(fsrsCards.ownerId, userId)),
      )
      .where(
        and(
          eq(memoryAnchors.ownerId, userId),
          inArray(memoryAnchors.documentId, ids),
          eq(memoryAnchors.status, 'active'),
          inArray(memoryAnchors.priority, filters.priorities),
          lte(fsrsCards.due, new Date()),
        ),
      );
    return c.json({ count, sessionLimit: 200 });
  });
  app.get('/learning/sessions', async (c) =>
    c.json(
      await db
        .select()
        .from(studySessions)
        .where(eq(studySessions.ownerId, c.get('userId')))
        .orderBy(desc(studySessions.updatedAt))
        .limit(30),
    ),
  );
  app.post('/learning/sessions', async (c) => {
    const userId = c.get('userId');
    const data = z
      .object({ id: uuid, filters: filtersSchema })
      .strict()
      .parse(await c.req.json());
    const session = await db.transaction(async (tx) => {
      await lock(tx, userId);
      const [prior] = await tx.select().from(studySessions).where(eq(studySessions.id, data.id));
      if (prior) {
        if (
          prior.ownerId !== userId ||
          JSON.stringify(prior.filters) !== JSON.stringify(data.filters)
        )
          fail(409, 'Identité de séance déjà utilisée.');
        return result(tx, prior, userId);
      }
      const ids = await selectedDocuments(tx, userId, data.filters);
      const now = await nowIn(tx);
      const candidates = ids.length
        ? await tx
            .select({ anchorId: memoryAnchors.id })
            .from(memoryAnchors)
            .innerJoin(
              fsrsCards,
              and(eq(fsrsCards.anchorId, memoryAnchors.id), eq(fsrsCards.ownerId, userId)),
            )
            .where(
              and(
                eq(memoryAnchors.ownerId, userId),
                inArray(memoryAnchors.documentId, ids),
                eq(memoryAnchors.status, 'active'),
                inArray(memoryAnchors.priority, data.filters.priorities),
                lte(fsrsCards.due, now),
              ),
            )
            .orderBy(asc(fsrsCards.due), asc(memoryAnchors.id))
            .limit(200)
        : [];
      const [created] = await tx
        .insert(studySessions)
        .values({
          id: data.id,
          ownerId: userId,
          filters: data.filters,
          status: candidates.length ? 'active' : 'completed',
        })
        .returning();
      if (candidates.length)
        await tx.insert(studyItems).values(
          candidates.map((a, index) => ({
            sessionId: created.id,
            ownerId: userId,
            anchorId: a.anchorId,
            position: index,
          })),
        );
      return result(tx, created, userId);
    });
    return c.json(session, 201);
  });
  app.get('/learning/sessions/:id', async (c) =>
    c.json(
      await db.transaction(async (tx) => {
        await lock(tx, c.get('userId'));
        return result(
          tx,
          await sessionRow(tx, c.req.param('id'), c.get('userId')),
          c.get('userId'),
        );
      }),
    ),
  );
  app.post('/learning/sessions/:id/items/:itemId/reveal', async (c) => {
    const userId = c.get('userId');
    return c.json(
      await db.transaction(async (tx) => {
        await lock(tx, userId);
        const session = await sessionRow(tx, c.req.param('id'), userId);
        const current = await result(tx, session, userId);
        if (current.current?.itemId !== uuid.parse(c.req.param('itemId')))
          fail(409, 'Ce passage n’est plus le passage courant.');
        const p = await passage(tx, current.current.anchor.id, userId, true);
        await tx
          .update(studyItems)
          .set({
            status: 'revealed',
            revealedAt: await nowIn(tx),
            cardRevision: p!.card.revision,
            anchorRevision: p!.anchor.revision,
          })
          .where(own(studyItems, current.current.itemId, userId));
        return result(tx, session, userId);
      }),
    );
  });
  app.post('/learning/sessions/:id/items/:itemId/rate', async (c) => {
    const userId = c.get('userId');
    const data = z
      .object({ actionId: uuid, rating: z.number().int().min(1).max(4) })
      .strict()
      .parse(await c.req.json());
    return c.json(
      await db.transaction(async (tx) => {
        await lock(tx, userId);
        const session = await sessionRow(tx, c.req.param('id'), userId);
        const itemId = uuid.parse(c.req.param('itemId'));
        const [recorded] = await tx.select().from(reviews).where(eq(reviews.id, data.actionId));
        if (recorded) {
          if (
            recorded.ownerId !== userId ||
            recorded.sessionItemId !== itemId ||
            recorded.rating !== data.rating
          )
            fail(409, 'Cette réponse a déjà été utilisée.');
          return { recorded: true, session: await result(tx, session, userId) };
        }
        const [item] = await tx
          .select()
          .from(studyItems)
          .where(and(own(studyItems, itemId, userId), eq(studyItems.sessionId, session.id)));
        if (!item) fail(404, 'Passage de séance introuvable.');
        if (item.status !== 'revealed')
          fail(409, 'Révélez d’abord la réponse, ou rechargez la séance si elle a déjà été notée.');
        const p = await passage(tx, item.anchorId, userId, true),
          now = await nowIn(tx);
        if (
          !eligible(p, session.filters, now) ||
          p!.card.revision !== item.cardRevision ||
          p!.anchor.revision !== item.anchorRevision
        )
          fail(409, 'Ce passage a changé ou a déjà été révisé ailleurs. Rechargez la séance.');
        const computed = schedule(p!.card, data.rating as Grade, now);
        const after = { ...toStored(computed.card), revision: p!.card.revision + 1 };
        await tx
          .update(fsrsCards)
          .set(after)
          .where(own(fsrsCards, p!.card.id, userId));
        await tx.insert(reviews).values({
          id: data.actionId,
          cardId: p!.card.id,
          ownerId: userId,
          sessionItemId: item.id,
          rating: data.rating,
          before: p!.card,
          after: { ...after, log: computed.log },
          reviewedAt: now,
        });
        await tx
          .update(studyItems)
          .set({ status: 'reviewed' })
          .where(own(studyItems, item.id, userId));
        await tx
          .update(studySessions)
          .set({ updatedAt: now })
          .where(own(studySessions, session.id, userId));
        return { recorded: true, session: await result(tx, session, userId) };
      }),
    );
  });
  return app;
}
