import { createEmptyCard, fsrs, generatorParameters, type Card, type Grade } from 'ts-fsrs';
import type { fsrsCards } from './db/schema';
export const algorithmVersion = 'FSRS-6 / ts-fsrs@5.4.2';
export const fsrsParameters = generatorParameters({
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ['1m', '10m'],
  relearning_steps: ['10m'],
});
const scheduler = fsrs(fsrsParameters);
type StoredCard = typeof fsrsCards.$inferSelect;
export function toEngine(card: StoredCard): Card {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsedDays,
    scheduled_days: card.scheduledDays,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    learning_steps: card.learningSteps,
    ...(card.lastReview ? { last_review: card.lastReview } : {}),
  };
}
export function toStored(card: Card) {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    learningSteps: card.learning_steps,
    lastReview: card.last_review ?? null,
    algorithmVersion,
    parameters: fsrsParameters,
  };
}
export const initialCard = (now: Date) => toStored(createEmptyCard(now));
export function schedule(card: StoredCard, rating: Grade, now: Date) {
  if (card.algorithmVersion !== algorithmVersion && card.algorithmVersion !== 'uninitialized')
    throw new Error('Version FSRS incompatible.');
  if (card.algorithmVersion === 'uninitialized' && card.reps > 0)
    throw new Error('Carte historique sans version FSRS : migration nécessaire.');
  return scheduler.next(toEngine(card), now, rating);
}
export function previews(card: StoredCard, now: Date) {
  return Object.fromEntries(
    ([1, 2, 3, 4] as Grade[]).map((rating) => [
      rating,
      schedule(card, rating, now).card.due.toISOString(),
    ]),
  );
}
