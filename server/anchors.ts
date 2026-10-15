import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
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
  if (!anchors.length) return;
  const identities = anchors.map((a) => a.id);
  const existingRows = await tx
    .select()
    .from(memoryAnchors)
    .where(inArray(memoryAnchors.id, identities));
  const existingById = new Map<string, typeof memoryAnchors.$inferSelect>(
    existingRows.map((row: typeof memoryAnchors.$inferSelect) => [row.id, row]),
  );
  const values = anchors.map((a) => {
    const existing = existingById.get(a.id);
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
    return {
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
      revision: existing ? existing.revision + (changed ? 1 : 0) : 1,
      documentRevision: doc.revision,
    };
  });
  for (let offset = 0; offset < values.length; offset += 400) {
    await tx
      .insert(memoryAnchors)
      .values(values.slice(offset, offset + 400))
      .onConflictDoUpdate({
        target: memoryAnchors.id,
        set: {
          quote: sql`excluded.quote`,
          hint: sql`excluded.hint`,
          priority: sql`excluded.priority`,
          status: sql`excluded.status`,
          revision: sql`excluded.revision`,
          documentRevision: doc.revision,
          updatedAt: now,
        },
      });
  }
  const cards = await tx
    .select({ anchorId: fsrsCards.anchorId })
    .from(fsrsCards)
    .where(inArray(fsrsCards.anchorId, identities));
  const initialized = new Set(cards.map((c: any) => c.anchorId));
  const missing = anchors
    .filter((a) => !initialized.has(a.id))
    .map((a) => ({ anchorId: a.id, ownerId: doc.ownerId, ...initialCard(now) }));
  for (let offset = 0; offset < missing.length; offset += 400)
    await tx
      .insert(fsrsCards)
      .values(missing.slice(offset, offset + 400))
      .onConflictDoNothing();
}
