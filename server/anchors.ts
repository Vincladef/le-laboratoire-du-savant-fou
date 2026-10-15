import { and, eq, notInArray } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { extractAnchors, plainText, type RichNode } from '../src/shared/document';
import { documents, fsrsCards, memoryAnchors } from './db/schema';
import { initialCard } from './scheduling';

/** Called inside the document save/version transaction. No detached asynchronous indexing. */
export async function syncAnchors(tx: any, doc: typeof documents.$inferSelect) {
  const anchors = extractAnchors(doc.content as RichNode);
  const now = new Date();
  await tx
    .update(memoryAnchors)
    .set({ status: 'deleted', documentRevision: doc.revision, updatedAt: now })
    .where(
      and(
        eq(memoryAnchors.documentId, doc.id),
        ...(anchors.length
          ? [
              notInArray(
                memoryAnchors.id,
                anchors.map((a) => a.id),
              ),
            ]
          : []),
      ),
    )
    .returning({ id: memoryAnchors.id });
  for (const a of anchors) {
    const [existing] = await tx.select().from(memoryAnchors).where(eq(memoryAnchors.id, a.id));
    if (existing && (existing.documentId !== doc.id || existing.ownerId !== doc.ownerId))
      throw new HTTPException(409, {
        message: 'Identité de passage déjà utilisée ; copiez le passage via l’éditeur.',
      });
    const hint = a.hint ?? existing?.hint ?? '';
    const priority = a.priority ?? existing?.priority ?? 'medium';
    const baseline = existing
      ? (existing.metadata?.confirmedQuote ??
        (existing.originalSlice as RichNode[]).map(plainText).join(''))
      : a.quote;
    const status =
      a.disconnected || !a.quote.trim() || baseline !== a.quote ? 'needs_review' : 'active';
    const changed =
      existing &&
      (existing.quote !== a.quote ||
        existing.hint !== hint ||
        existing.priority !== priority ||
        existing.status !== status);
    await tx
      .insert(memoryAnchors)
      .values({
        id: a.id,
        sourceId: a.sourceId,
        documentId: doc.id,
        ownerId: doc.ownerId,
        quote: a.quote,
        originalSlice: a.slices,
        metadata: { confirmedQuote: a.quote },
        hint,
        priority,
        status,
        documentRevision: doc.revision,
      })
      .onConflictDoUpdate({
        target: memoryAnchors.id,
        set: {
          quote: a.quote,
          hint,
          priority,
          status,
          revision: existing ? existing.revision + (changed ? 1 : 0) : 1,
          documentRevision: doc.revision,
          updatedAt: now,
        },
      });
    await tx
      .insert(fsrsCards)
      .values({ anchorId: a.id, ownerId: doc.ownerId, ...initialCard(now) })
      .onConflictDoNothing();
  }
}
