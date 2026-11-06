import { mkdir, writeFile } from 'node:fs/promises';
import { getConfig } from '../server/config';
import { openAiGenerator } from '../server/ai';
import { validateHoles, type AiRequest } from '../src/shared/ai';

// Explicit opt-in: ordinary builds never spend OpenAI tokens.
if (process.env.LAB_VERIFY_AI === '1') {
  if (process.env.NETLIFY !== 'true')
    throw new Error('Recette IA réservée à un build Netlify contrôlé.');
  const config = getConfig();
  if (!config.ai) throw new Error('La clé OpenAI manque dans ce contexte de déploiement.');
  const generate = openAiGenerator(config.ai);
  const checks: string[] = [];
  try {
    const catalog = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${config.ai.key}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!catalog.ok)
      throw new Error(`Le catalogue OpenAI est inaccessible (HTTP ${catalog.status}).`);
    const models = (await catalog.json()).data.map((m: { id: string }) => m.id) as string[];
    if (!models.includes(config.ai.model))
      throw new Error('Le modèle demandé n’est pas proposé par l’API OpenAI de ce compte.', {
        cause: {
          availableEconomicModels: models
            .filter((m) => /^gpt-[\w.-]*(mini|nano|luna)[\w.-]*$/.test(m))
            .sort(),
        },
      });
    for (const mode of ['cloze', 'write', 'complete', 'compose-cloze'] as const) {
      const request: AiRequest = {
        mode,
        instructions:
          mode === 'cloze'
            ? 'Choisis une notion essentielle et un indice court.'
            : 'Écris une phrase simple sur une cellule pour un collégien.',
        count: 1,
        length: 'short',
        difficulty: 'unrated',
        priority: 'medium',
        sources: [
          {
            id: 'sample',
            text: 'La cellule est l’unité du vivant. Son noyau contient le matériel génétique.',
          },
        ],
      };
      const result = await generate(request);
      if (mode === 'cloze' && (result.text || !result.holes.length))
        throw new Error('Proposition de trous absente.');
      if (mode !== 'cloze' && !result.text.trim()) throw new Error('Texte généré absent.');
      if (mode === 'compose-cloze' && !result.holes.length)
        throw new Error('Texte à trous généré sans annotation.');
      if (['write', 'complete'].includes(mode) && result.holes.length)
        throw new Error('Annotations inattendues.');
      validateHoles(
        result.holes,
        mode === 'cloze' ? request.sources : [{ id: 'generated', text: result.text }],
      );
      checks.push(mode);
    }
    const report = {
      model: config.ai.model,
      passed: checks.length,
      checks,
      syntheticSourcesOnly: true,
      documentWrites: 0,
    };
    await mkdir('.netlify', { recursive: true });
    await writeFile('.netlify/ai-provider-report.json', JSON.stringify(report));
    console.log('AI_PROVIDER_VERIFIED', JSON.stringify(report));
  } catch (error) {
    // Do not log raw provider bodies, request text or credentials.
    console.error('AI_PROVIDER_CHECK_FAILED', error instanceof Error ? error.message : 'Unknown');
    const report = {
      model: config.ai.model,
      passed: checks.length,
      checks,
      success: false,
      failure: error instanceof Error ? error.message : 'Unknown',
      provider: error instanceof Error ? error.cause : undefined,
    };
    await mkdir('.netlify', { recursive: true });
    await writeFile('.netlify/ai-provider-report.json', JSON.stringify(report));
    process.exitCode = 1;
  }
}
