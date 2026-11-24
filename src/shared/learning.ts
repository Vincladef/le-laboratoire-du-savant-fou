import { z } from 'zod';
import type { RichNode } from './document';

export const prioritySchema = z.enum(['high', 'medium', 'low']);
export type Priority = z.infer<typeof prioritySchema>;
export const priorityLabels: Record<Priority, string> = {
  high: 'Haute',
  medium: 'Moyenne',
  low: 'Basse',
};
export const difficultySchema = z.enum(['easy', 'medium', 'hard', 'unrated']);
export type Difficulty = z.infer<typeof difficultySchema>;
export const difficultyLabels: Record<Difficulty, string> = {
  easy: 'Facile',
  medium: 'Moyenne',
  hard: 'Difficile',
  unrated: 'Non évaluée',
};
export type ReviewFilters = { priority: Priority[]; difficulty: Difficulty[] };
export type MemoryPassage = {
  id: string;
  documentId: string;
  quote: string;
  groupId?: string;
  hint: string;
  priority: Priority;
  difficulty: Difficulty;
  difficultyRevision: number;
  status: 'active' | 'deleted' | 'needs_review';
  revision: number;
  documentRevision: number;
  originalSlice?: RichNode[];
};
export function matchesPassage(passage: MemoryPassage, filters: ReviewFilters) {
  return (
    passage.status === 'active' &&
    filters.priority.includes(passage.priority) &&
    filters.difficulty.includes(passage.difficulty)
  );
}
