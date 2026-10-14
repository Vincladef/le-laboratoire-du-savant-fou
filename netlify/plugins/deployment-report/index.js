import { readFile } from 'node:fs/promises';

export async function onPostBuild({ utils }) {
  if (process.env.LAB_DEPLOY_PREPARE !== '1') return;
  const report = JSON.parse(await readFile('.netlify/deployment-report.json', 'utf8'));
  utils.status.show({
    title: 'Neon et recette du service publié',
    summary: `${report.tables} tables ; ${report.remote?.passed || 0} contrôles distants réussis`,
    text: JSON.stringify(report),
  });
}
