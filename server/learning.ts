import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { and, asc, eq, getTableColumns, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './db';
import { documents, memoryAnchors, profiles, versions } from './db/schema';
import { syncAnchors } from './anchors';
import { extractAnchors, type RichNode } from '../src/shared/document';
import { linkedMembers, enrichReviewPassages } from '../src/shared/review-groups';
import { difficultySchema, prioritySchema, type Priority } from '../src/shared/learning';

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
/** Update every fragment of an annotation, including passages spanning styled text runs. */
function withPassageAttribute(
  content: RichNode,
  ids: string[],
  attribute: 'priority' | 'hint',
  value: Priority | string,
) {
  let found = false;
  const targets = new Set(ids);
  function visit(node: RichNode): RichNode {
    return {
      ...node,
      ...(node.marks && {
        marks: node.marks.map((mark) => {
          if (mark.type !== 'memoryAnchor' || !targets.has(mark.attrs?.id)) return mark;
          found = true;
          return { ...mark, attrs: { ...mark.attrs, [attribute]: value } };
        }),
      }),
      ...(node.content && { content: node.content.map(visit) }),
    };
  }
  const next = visit(content);
  return found ? next : null;
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
    return c.json(
      enrichReviewPassages(doc.content as RichNode, inDocumentOrder(doc.content as RichNode, rows)),
    );
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
        return {
          document,
          passages: enrichReviewPassages(
            document.content as RichNode,
            inDocumentOrder(document.content as RichNode, passages),
          ),
        };
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
        const { anchor, document } = await passage(tx, c.req.param('id'), userId);
        const group = linkedMembers(document.content as RichNode, anchor.id);
        const [leader] =
          group.leaderId === anchor.id
            ? [anchor]
            : await tx
                .select()
                .from(memoryAnchors)
                .where(own(memoryAnchors, group.leaderId, userId));
        if (!leader || leader.status === 'deleted')
          fail(409, 'Le passage lié a changé. Rechargez le document.');
        // Independent of document revisions: autosave cannot erase an evaluation.
        // A request replay after a lost response does not create another change.
        if (leader.difficultyRevision !== data.difficultyRevision) {
          if (
            leader.difficultyRevision === data.difficultyRevision + 1 &&
            leader.difficulty === data.difficulty
          )
            return {
              id: leader.id,
              memberIds: group.ids,
              difficulty: leader.difficulty,
              difficultyRevision: leader.difficultyRevision,
            };
          fail(
            409,
            'La difficulté a changé sur un autre appareil. Rechargez-la avant de la modifier.',
          );
        }
        // Persist the common rating on every member as well, so removing the
        // founding occurrence does not erase what was learned.
        const updatedMembers = await tx
          .update(memoryAnchors)
          .set({
            difficulty: data.difficulty,
            difficultyRevision: leader.difficultyRevision + 1,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(memoryAnchors.ownerId, userId),
              eq(memoryAnchors.documentId, document.id),
              inArray(memoryAnchors.id, group.ids),
            ),
          )
          .returning({
            id: memoryAnchors.id,
            difficulty: memoryAnchors.difficulty,
            difficultyRevision: memoryAnchors.difficultyRevision,
          });
        const updated = updatedMembers.find((row) => row.id === leader.id);
        if (!updated) fail(409, 'Le groupe a changé. Rechargez-le.');
        return { ...updated, memberIds: group.ids };
      }),
    );
  });
  // Priority is saved to the document's annotation AND its indexed row atomically.
  // Incrementing the document revision prevents another editor tab from silently overwriting it.
  app.patch('/anchors/:id/priority', async (c) => {
    const userId = c.get('userId');
    const data = z
      .object({ priority: prioritySchema, revision: z.number().int().positive() })
      .strict()
      .parse(await c.req.json());
    return c.json(
      await db.transaction(async (tx) => {
        await lock(tx, userId);
        const { anchor, document } = await passage(tx, c.req.param('id'), userId);
        const group = linkedMembers(document.content as RichNode, anchor.id);
        if (anchor.revision !== data.revision) {
          // A response can be lost after the first request was committed.
          if (anchor.revision !== data.revision + 1 || anchor.priority !== data.priority)
            fail(409, 'La priorité a changé. Rechargez le passage avant de la modifier.');
          return {
            document,
            passage: { id: anchor.id, priority: anchor.priority, revision: anchor.revision },
          };
        }
        if (anchor.priority === data.priority)
          return {
            document,
            passage: { id: anchor.id, priority: anchor.priority, revision: anchor.revision },
          };
        const content = withPassageAttribute(
          document.content as RichNode,
          group.ids,
          'priority',
          data.priority,
        );
        if (!content) fail(409, 'Ce passage ne figure plus dans le document. Rechargez-le.');
        const [updatedDoc] = await tx
          .update(documents)
          .set({
            content: content as Record<string, unknown>,
            revision: document.revision + 1,
            updatedAt: new Date(),
          })
          .where(own(documents, document.id, userId))
          .returning();
        await tx.insert(versions).values({
          documentId: updatedDoc.id,
          ownerId: userId,
          revision: updatedDoc.revision,
          title: updatedDoc.title,
          content: updatedDoc.content,
          layout: updatedDoc.layout,
          reason: 'priority',
        });
        await syncAnchors(tx, updatedDoc);
        const [updatedAnchor] = await tx
          .select({
            id: memoryAnchors.id,
            priority: memoryAnchors.priority,
            revision: memoryAnchors.revision,
          })
          .from(memoryAnchors)
          .where(own(memoryAnchors, anchor.id, userId));
        const memberRows = await tx
          .select({
            id: memoryAnchors.id,
            priority: memoryAnchors.priority,
            revision: memoryAnchors.revision,
          })
          .from(memoryAnchors)
          .where(
            and(eq(memoryAnchors.ownerId, userId), eq(memoryAnchors.documentId, updatedDoc.id)),
          );
        return {
          document: updatedDoc,
          passage: updatedAnchor,
          passages: memberRows.filter((row) => group.ids.includes(row.id)),
        };
      }),
    );
  });
  // Hints are part of document annotations, not a transient revision setting.
  // Update styled fragments, document history and the indexed passage in one transaction.
  app.patch('/anchors/:id/hint', async (c) => {
    const userId = c.get('userId');
    const data = z
      .object({ hint: z.string().trim().max(1000), revision: z.number().int().positive() })
      .strict()
      .parse(await c.req.json());
    return c.json(
      await db.transaction(async (tx) => {
        await lock(tx, userId);
        const { anchor, document } = await passage(tx, c.req.param('id'), userId);
        const group = linkedMembers(document.content as RichNode, anchor.id);
        if (anchor.revision !== data.revision) {
          if (anchor.revision !== data.revision + 1 || anchor.hint !== data.hint)
            fail(409, 'L’indice a changé. Rechargez le passage avant de le modifier.');
          return {
            document,
            passage: { id: anchor.id, hint: anchor.hint, revision: anchor.revision },
          };
        }
        if (anchor.hint === data.hint)
          return {
            document,
            passage: { id: anchor.id, hint: anchor.hint, revision: anchor.revision },
          };
        const content = withPassageAttribute(
          document.content as RichNode,
          group.ids,
          'hint',
          data.hint,
        );
        if (!content) fail(409, 'Ce passage ne figure plus dans le document. Rechargez-le.');
        const [updatedDoc] = await tx
          .update(documents)
          .set({
            content: content as Record<string, unknown>,
            revision: document.revision + 1,
            updatedAt: new Date(),
          })
          .where(own(documents, document.id, userId))
          .returning();
        await tx.insert(versions).values({
          documentId: updatedDoc.id,
          ownerId: userId,
          revision: updatedDoc.revision,
          title: updatedDoc.title,
          content: updatedDoc.content,
          layout: updatedDoc.layout,
          reason: 'hint',
        });
        await syncAnchors(tx, updatedDoc);
        const [updatedAnchor] = await tx
          .select({
            id: memoryAnchors.id,
            hint: memoryAnchors.hint,
            revision: memoryAnchors.revision,
          })
          .from(memoryAnchors)
          .where(own(memoryAnchors, anchor.id, userId));
        const memberRows = await tx
          .select({
            id: memoryAnchors.id,
            hint: memoryAnchors.hint,
            revision: memoryAnchors.revision,
          })
          .from(memoryAnchors)
          .where(
            and(eq(memoryAnchors.ownerId, userId), eq(memoryAnchors.documentId, updatedDoc.id)),
          );
        return {
          document: updatedDoc,
          passage: updatedAnchor,
          passages: memberRows.filter((row) => group.ids.includes(row.id)),
        };
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
