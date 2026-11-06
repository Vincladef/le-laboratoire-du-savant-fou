import { z } from 'zod';
import { difficultySchema, prioritySchema } from './learning';

export const AI_MAX_SOURCE = 30000;
export const aiSourceSchema = z
  .object({ id: z.string().min(1).max(100), text: z.string().max(AI_MAX_SOURCE) })
  .strict();
export const aiRequestSchema = z
  .object({
    mode: z.enum(['cloze', 'write', 'complete', 'compose-cloze']),
    instructions: z.string().trim().max(4000),
    sources: z.array(aiSourceSchema).max(500),
    count: z.number().int().min(1).max(200).optional(),
    length: z.enum(['short', 'medium', 'long']),
    difficulty: difficultySchema.default('unrated'),
    priority: prioritySchema.default('medium'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.sources.reduce((sum, s) => sum + s.text.length, 0) > AI_MAX_SOURCE)
      ctx.addIssue({
        code: 'custom',
        message: 'Choisissez un extrait de 30 000 caractères maximum.',
      });
    if (new Set(value.sources.map((s) => s.id)).size !== value.sources.length)
      ctx.addIssue({ code: 'custom', message: 'Sources dupliquées.' });
    if (value.mode === 'cloze' && !value.sources.some((s) => s.text.trim()))
      ctx.addIssue({ code: 'custom', message: 'Sélectionnez du texte sans annotation existante.' });
    if (value.mode !== 'cloze' && !value.instructions)
      ctx.addIssue({ code: 'custom', message: 'Indiquez ce que vous souhaitez rédiger.' });
  });
export type AiRequest = z.infer<typeof aiRequestSchema>;
export const aiHoleSchema = z
  .object({
    sourceId: z.string().min(1).max(100),
    quote: z
      .string()
      .min(1)
      .max(2000)
      .refine(
        (s) => Boolean(s.trim()) && !s.includes('\n'),
        'Choisissez un passage sur une seule ligne.',
      ),
    occurrence: z.number().int().min(1).max(1000),
    hint: z.string().max(1000),
    priority: prioritySchema,
    difficulty: difficultySchema,
  })
  .strict();
export type AiHole = z.infer<typeof aiHoleSchema>;
export const aiProposalSchema = z
  .object({ text: z.string().max(20000), holes: z.array(aiHoleSchema).max(200) })
  .strict();
export type AiProposal = z.infer<typeof aiProposalSchema>;
export type AiSource = z.infer<typeof aiSourceSchema>;
export function holeRange(hole: AiHole, sources: AiSource[]) {
  if (!Number.isInteger(hole.occurrence) || hole.occurrence < 1 || hole.occurrence > 1000)
    throw new Error('Choisissez une occurrence entre 1 et 1 000.');
  const source = sources.find((s) => s.id === hole.sourceId);
  if (!source || !hole.quote.trim())
    throw new Error('Ce passage ne correspond plus au texte. Modifiez-le ou désélectionnez-le.');
  let start = -1,
    after = 0;
  for (let n = 0; n < hole.occurrence; n++) {
    start = source.text.indexOf(hole.quote, after);
    if (start < 0)
      throw new Error('Ce passage ne correspond plus au texte. Modifiez-le ou désélectionnez-le.');
    after = start + hole.quote.length;
  }
  return { from: start, to: after };
}
export function validateHoles(holes: AiHole[], sources: AiSource[]) {
  const ranges = holes.map((hole) => ({ ...holeRange(hole, sources), sourceId: hole.sourceId }));
  for (let i = 0; i < ranges.length; i++)
    for (let j = 0; j < i; j++)
      if (
        ranges[i].sourceId === ranges[j].sourceId &&
        ranges[i].from < ranges[j].to &&
        ranges[j].from < ranges[i].to
      )
        throw new Error('Deux propositions se chevauchent. Désélectionnez l’une d’elles.');
  return ranges;
}

/** Recover an incorrect model source identifier only when the exact quote has
 * one unambiguous occurrence inside the submitted scope. Never search the document. */
export function repairCitations(holes: AiHole[], sources: AiSource[]): AiHole[] {
  return holes.map((hole) => {
    try {
      holeRange(hole, sources);
      return hole;
    } catch {}
    const matches: AiHole[] = [];
    for (const source of sources) {
      let at = 0,
        occurrence = 0;
      while ((at = source.text.indexOf(hole.quote, at)) >= 0) {
        matches.push({ ...hole, sourceId: source.id, occurrence: ++occurrence });
        at += hole.quote.length;
        if (!hole.quote.length) break;
      }
    }
    return matches.length === 1 ? matches[0] : hole;
  });
}
