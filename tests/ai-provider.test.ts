import { it, expect, vi } from 'vitest';
import { openAiGenerator } from '../server/ai';
import type { AiRequest } from '../src/shared/ai';
const config = {
  key: 'test-secret-never-shipped',
  model: 'gpt-6-luna',
  dailyLimit: 40,
  siteDailyLimit: 500,
};
const request: AiRequest = {
  mode: 'write',
  instructions: 'Explique une cellule',
  count: 5,
  length: 'short',
  difficulty: 'unrated',
  priority: 'medium',
  sources: [],
};
it('utilise Luna avec sortie structurée, budget de tokens borné et sans stockage de réponse', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      status: 'completed',
      output: [
        {
          content: [
            { type: 'output_text', text: JSON.stringify({ text: 'Une cellule.', holes: [] }) },
          ],
        },
      ],
    }),
  );
  const generate = openAiGenerator(config, fetcher);
  expect(await generate(request)).toEqual({ text: 'Une cellule.', holes: [] });
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe('https://api.openai.com/v1/responses');
  const body = JSON.parse(options!.body as string);
  expect(body).toMatchObject({
    model: 'gpt-6-luna',
    store: false,
    max_output_tokens: 10000,
    text: { format: { type: 'json_schema', strict: true } },
  });
  expect(body).not.toHaveProperty('temperature');
});
it('rend les erreurs fournisseur sans clé ni message sensible et refuse les sorties incomplètes', async () => {
  for (const response of [
    new Response('test-secret-never-shipped', { status: 401 }),
    Response.json({ status: 'incomplete', output: [] }),
  ]) {
    const generate = openAiGenerator(config, vi.fn<typeof fetch>().mockResolvedValue(response));
    await expect(generate(request)).rejects.not.toThrow('test-secret-never-shipped');
  }
});

it('récupère une source mal identifiée seulement si la citation exacte est unique', async () => {
  const { repairCitations, validateHoles } = await import('../src/shared/ai');
  const hole = {
    sourceId: 'wrong',
    quote: '1789',
    occurrence: 1,
    hint: 'Année',
    priority: 'medium' as const,
    difficulty: 'unrated' as const,
  };
  const sources = [{ id: 'selection:0', text: 'La révolution française a eu lieu en 1789' }];
  const repaired = repairCitations([hole], sources);
  expect(repaired[0].sourceId).toBe('selection:0');
  expect(() => validateHoles(repaired, sources)).not.toThrow();
  const ambiguous = [...sources, { id: 'other', text: '1789' }];
  expect(() => validateHoles(repairCitations([hole], ambiguous), ambiguous)).toThrow();
  expect(() =>
    validateHoles(repairCitations([{ ...hole, quote: '1800' }], sources), sources),
  ).toThrow();
});

it('rattache les trous générés au seul texte généré et refuse les réponses absentes ou ambiguës', async () => {
  const { normalizeAiProposal, validateHoles } = await import('../src/shared/ai');
  const input: AiRequest = {
    ...request,
    mode: 'compose-cloze',
    sources: [{ id: 'context', text: 'noyau' }],
  };
  const hole = {
    sourceId: 'context',
    quote: 'noyau',
    occurrence: 8,
    hint: '',
    priority: 'medium' as const,
    difficulty: 'unrated' as const,
  };
  const proposal = normalizeAiProposal(input, {
    text: 'La cellule contient un noyau.',
    holes: [hole],
  });
  expect(proposal.holes[0]).toMatchObject({ sourceId: 'generated', occurrence: 1 });
  expect(() =>
    validateHoles(proposal.holes, [{ id: 'generated', text: proposal.text }]),
  ).not.toThrow();
  for (const text of ['Une cellule.', 'noyau et noyau']) {
    const invalid = normalizeAiProposal(input, { text, holes: [hole] });
    expect(() => validateHoles(invalid.holes, [{ id: 'generated', text }])).toThrow();
  }
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({
        status: 'completed',
        output: [{ content: [{ type: 'output_text', text: JSON.stringify(proposal) }] }],
      }),
    );
  await openAiGenerator(config, fetcher)(input);
  const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
  expect(body.text.format.schema.properties.holes.items.properties.sourceId.enum).toEqual([
    'generated',
  ]);
});
