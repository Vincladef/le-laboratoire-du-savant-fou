import { eq, isNull, or } from 'drizzle-orm';
import type { Database } from './db';
import { fsrsCards, memoryAnchors } from './db/schema';
import { initialCard } from './scheduling';
/** Initialize only missing/uninitialized mission-1 placeholders, never reset a learned card. */
export async function prepareLearning(db: Database) {
  return db.transaction(async (tx) => {
    const anchors = await tx
      .select({ id: memoryAnchors.id, ownerId: memoryAnchors.ownerId, existing: fsrsCards })
      .from(memoryAnchors)
      .leftJoin(fsrsCards, eq(fsrsCards.anchorId, memoryAnchors.id))
      .where(or(isNull(fsrsCards.id), eq(fsrsCards.algorithmVersion, 'uninitialized')));
    let initialized = 0;
    for (const a of anchors) {
      const existing = a.existing;
      if (!existing) {
        await tx
          .insert(fsrsCards)
          .values({ anchorId: a.id, ownerId: a.ownerId, ...initialCard(new Date()) })
          .onConflictDoNothing();
        initialized++;
      } else if (existing.algorithmVersion === 'uninitialized' && existing.reps === 0) {
        await tx
          .update(fsrsCards)
          .set(initialCard(existing.due))
          .where(eq(fsrsCards.id, existing.id));
        initialized++;
      } else if (existing.algorithmVersion === 'uninitialized')
        throw new Error(
          'Une ancienne carte possède des révisions sans version FSRS : migration explicite nécessaire.',
        );
    }
    return { initialized };
  });
}
