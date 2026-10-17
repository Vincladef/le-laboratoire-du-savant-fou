import type { Page } from '@playwright/test';
import { priorityLabels, difficultyLabels } from '../../src/shared/learning';
export async function filterReview(
  page: Page,
  category: 'priority' | 'difficulty',
  choices: string | string[],
) {
  const values = typeof choices === 'string' ? [choices] : choices;
  const title = category === 'priority' ? 'priorité' : 'difficulté';
  const summary = page.getByLabel(`Filtrer par ${title}`, { exact: true });
  const details = page.locator('.review-filter').filter({ has: summary });
  if (!(await details.evaluate((el) => el.hasAttribute('open')))) await summary.click();
  const labels = category === 'priority' ? priorityLabels : difficultyLabels;
  for (const [value, label] of Object.entries(labels))
    await details
      .getByRole('checkbox', { name: label, exact: true })
      .setChecked(values.includes('all') || values.includes(value));
  await summary.click();
}
export async function revealIndividually(page: Page) {
  const buttons = page.locator('.review-reveal');
  for (let n = 0; n < 1000 && (await buttons.count()); n++) await buttons.first().click();
}
export async function documentMenu(page: Page) {
  const menu = page.locator('.document-tools');
  if (!(await menu.evaluate((el) => el.hasAttribute('open'))))
    await menu.locator('summary').click();
}
export async function navigation(page: Page) {
  if (!(await page.getByRole('button', { name: 'Déconnexion', exact: true }).isVisible()))
    await page.getByRole('button', { name: 'Ouvrir le menu', exact: true }).click();
}
