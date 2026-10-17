import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { and, asc, eq, getTableColumns } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './db';
import { documents, memoryAnchors, profiles } from './db/schema';
import { extractAnchors, type RichNode } from '../src/shared/document';
import { difficultySchema } from '../src/shared/learning';

const uuid = z.string().uuid();
const {
  originalSlice: _slice,
  metadata: _metadata,
  ...anchorFields
} = getTableColumns(memoryAnchors);
const own = (table: any, id: string, ownerId: string) =>
  and(eq(table.id, uuid.parse(id)), eq(table.ownerId, ownerId));
function fail(status: 404 | 409, message: string): never {
  throw new HTTPException(status, { message });
}
function inDocumentOrder<T extends { id: string }>(content: RichNode, passages: T[]) {
  const order = new Map(extractAnchors(content).map((passage, index) => [passage.id, index]));
  return passages.sort(
    (a, b) =>
      (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
      a.id.localeCompare(b.id),
  );
}
export function learningRoutes(db: Database) {
  const app = new Hono<{ Variables: { userId: string } }>();
  async function lock(tx: any, userId: string) {
    await tx.insert(profiles).values({ userId }).onConflictDoNothing();
    await tx.select().from(profiles).where(eq(profiles.userId, userId)).for('update');
  }
  async function passage(tx: any, id: string, userId: string) {
    const [anchor] = await tx
      .select()
      .from(memoryAnchors)
      .where(own(memoryAnchors, id, userId));
    if (!anchor) fail(404, 'Passage introuvable.');
    const [document] = await tx
      .select()
      .from(documents)
      .where(own(documents, anchor.documentId, userId))
      .for('update');
    if (!document || document.deletedAt || anchor.status === 'deleted')
      fail(404, 'Passage introuvable.');
    return { anchor, document };
  }
  app.get('/documents/:id/anchors', async (c) => {
    const userId = c.get('userId');
    const [doc] = await db
      .select({ id: documents.id, content: documents.content })
      .from(documents)
      .where(own(documents, c.req.param('id'), userId));
    if (!doc) fail(404, 'Document introuvable.');
    const rows = await db
      .select(anchorFields)
      .from(memoryAnchors)
      .where(and(eq(memoryAnchors.documentId, doc.id), eq(memoryAnchors.ownerId, userId)))
      .orderBy(asc(memoryAnchors.createdAt));
    return c.json(inDocumentOrder(doc.content as RichNode, rows));
  });
  app.get('/documents/:id/review', async (c) => {
    const userId = c.get('userId');
    return c.json(
      await db.transaction(async (tx) => {
        const [document] = await tx
          .select()
          .from(documents)
          .where(own(documents, c.req.param('id'), userId))
          .for('share');
        if (!document || document.deletedAt) fail(404, 'Document introuvable.');
        const passages = await tx
          .select(anchorFields)
          .from(memoryAnchors)
          .where(and(eq(memoryAnchors.documentId, document.id), eq(memoryAnchors.ownerId, userId)))
          .orderBy(asc(memoryAnchors.createdAt));
        return { document, passages: inDocumentOrder(document.content as RichNode, passages) };
      }),
    );
  });
  app.patch('/anchors/:id/difficulty', async (c) => {
    const userId = c.get('userId');
    const data = z
      .object({ difficulty: difficultySchema, difficultyRevision: z.number().int().nonnegative() })
      .strict()
      .parse(await c.req.json());
    return c.json(
      await db.transaction(async (tx) => {
        await lock(tx, userId);
        const { anchor } = await passage(tx, c.req.param('id'), userId);
        // Independent of document revisions: autosave cannot erase an evaluation.
        // A request replay after a lost response does not create another change.
        if (anchor.difficultyRevision !== data.difficultyRevision) {
          if (
            anchor.difficultyRevision === data.difficultyRevision + 1 &&
            anchor.difficulty === data.difficulty
          )
            return {
              id: anchor.id,
              difficulty: anchor.difficulty,
              difficultyRevision: anchor.difficultyRevision,
            };
          fail(
            409,
            'La difficulté a changé sur un autre appareil. Rechargez-la avant de la modifier.',
          );
        }
        const [updated] = await tx
          .update(memoryAnchors)
          .set({
            difficulty: data.difficulty,
            difficultyRevision: anchor.difficultyRevision + 1,
            updatedAt: new Date(),
          })
          .where(own(memoryAnchors, anchor.id, userId))
          .returning({
            id: memoryAnchors.id,
            difficulty: memoryAnchors.difficulty,
            difficultyRevision: memoryAnchors.difficultyRevision,
          });
        return updated;
      }),
    );
  });
  app.post('/anchors/:id/confirm', async (c) => {
    const userId = c.get('userId');
    const data = z
      .object({ revision: z.number().int().positive() })
      .strict()
      .parse(await c.req.json());
    return c.json(
      await db.transaction(async (tx) => {
        await lock(tx, userId);
        const { anchor, document } = await passage(tx, c.req.param('id'), userId);
        if (anchor.revision !== data.revision)
          fail(409, 'Le passage a changé. Rechargez-le avant de le confirmer.');
        const current = extractAnchors(document.content as RichNode).find(
          (a) => a.id === anchor.id,
        );
        if (!current || current.disconnected || !current.quote.trim())
          fail(409, 'Ce passage est fragmenté ou vide. Recréez son annotation dans le document.');
        await tx
          .update(memoryAnchors)
          .set({
            status: 'active',
            metadata: {
              ...anchor.metadata,
              confirmedQuote: current.quote,
              lastConfirmedAt: new Date().toISOString(),
            },
            revision: anchor.revision + 1,
            updatedAt: new Date(),
          })
          .where(own(memoryAnchors, anchor.id, userId));
        return { ok: true };
      }),
    );
  });
  // Old cached clients must not keep creating sessions, schedules or review events.
  const retired = (c: any) =>
    c.json(
      {
        error:
          'Les séances et calendriers ont été retirés. Rechargez Bouche-trou pour utiliser Réviser.',
      },
      410,
    );
  app.all('/learning/*', retired);
  app.all('/anchors/:id/reviews', retired);
  return app;
}
