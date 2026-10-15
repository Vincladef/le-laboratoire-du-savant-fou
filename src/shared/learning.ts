import { z } from 'zod';
import type { DocumentRecord, RichNode } from './document';
export const prioritySchema = z.enum(['high', 'medium', 'low']);
export type Priority = z.infer<typeof prioritySchema>;
export const priorityLabels: Record<Priority, string> = {
  high: 'Haute',
  medium: 'Moyenne',
  low: 'Basse',
};
export const filtersSchema = z
  .object({
    documentIds: z.array(z.string().uuid()).max(100).default([]),
    folderIds: z.array(z.string().uuid()).max(100).default([]),
    priorities: z.array(prioritySchema).min(1).max(3).default(['high', 'medium', 'low']),
  })
  .strict();
export type StudyFilters = z.infer<typeof filtersSchema>;
export type MemoryPassage = {
  id: string;
  documentId: string;
  quote: string;
  hint: string;
  priority: Priority;
  status: 'active' | 'deleted' | 'needs_review';
  revision: number;
  documentRevision: number;
  originalSlice: RichNode[];
  card: null | {
    id: string;
    due: string;
    stability: number;
    difficulty: number;
    reps: number;
    lapses: number;
    state: number;
    revision: number;
    lastReview: string | null;
    algorithmVersion: string;
  };
};
export type StudySession = {
  id: string;
  status: string;
  filters: StudyFilters;
  total: number;
  completed: number;
  skipped: number;
  createdAt: string;
  current: null | {
    itemId: string;
    revealed: boolean;
    document: DocumentRecord;
    anchor: MemoryPassage;
    previews?: Record<string, string>;
  };
};
export const ratingLabels = { 1: 'Oublié', 2: 'Difficile', 3: 'Moyen', 4: 'Facile' } as const;
