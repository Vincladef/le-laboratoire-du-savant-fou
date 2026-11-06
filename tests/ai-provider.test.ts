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
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
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
    max_output_tokens: 5000,
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
