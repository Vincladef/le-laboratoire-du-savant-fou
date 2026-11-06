import { readFile } from 'node:fs/promises';

export async function onPostBuild({ utils }) {
  const ai = await readFile('.netlify/ai-provider-report.json', 'utf8')
    .then(JSON.parse)
    .catch(() => null);
  if (process.env.LAB_VERIFY_AI === '1' && ai)
    utils.status.show({
      title: 'Recette OpenAI',
      summary: `${ai.model} : ${ai.passed} parcours`,
      text: JSON.stringify(ai),
    });
  if (process.env.LAB_DEPLOY_PREPARE !== '1') return;
  const report = JSON.parse(await readFile('.netlify/deployment-report.json', 'utf8'));
  utils.status.show({
    title: 'Neon et recette du service publié',
    summary: `${report.tables} tables ; ${report.remote?.passed || 0} contrôles du site ; ${report.managedAuth?.passed || 0} contrôles Neon Auth`,
    text: JSON.stringify(report),
  });
}
export async function onError({ utils }) {
  const report = await readFile('.netlify/deployment-failure.json', 'utf8')
    .then(JSON.parse)
    .catch(() => null);
  if (report?.deployId === process.env.DEPLOY_ID)
    utils.status.show({
      title: 'Échec de la préparation contrôlée',
      summary: `${report.stage} : ${report.code}`,
      text: JSON.stringify(report),
    });
}
