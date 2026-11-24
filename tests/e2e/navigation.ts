import type { Page } from '@playwright/test';
import { priorityLabels, difficultyLabels } from '../../src/shared/learning';
export async function filterReview(
  page: Page,
  category: 'priority' | 'difficulty',
  choices: string | string[],
) {
  await page.locator('.review-toolbar').waitFor();
  const secondary = page.locator('.review-secondary');
  if ((await secondary.count()) && !(await secondary.evaluate((e) => e.hasAttribute('open'))))
    await secondary.locator('summary').first().click();
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

/** Choose the question, not one of the potentially repeated linked marks.
 * The assessment UI is outside the document and contains one control per group.
 */
export async function activateReviewQuestion(page: Page, number: number) {
  const panel = page.getByRole('complementary', { name: 'Évaluation du passage ' + number });
  if (await panel.isVisible().catch(() => false)) return panel;
  const reveal = page.getByRole('button', { name: 'Révéler le passage ' + number, exact: true });
  if (await reveal.count()) {
    await reveal.first().click();
  } else {
    const id = await page
      .locator('.review-inline-tools')
      .nth(number - 1)
      .getAttribute('data-passage-id');
    await page
      .locator('.review-paper [data-memory-id="' + id + '"]')
      .first()
      .click();
  }
  await panel.waitFor();
  return panel;
}
export async function gradeReview(page: Page, number: number, grade: 'hard' | 'medium' | 'easy') {
  const panel = await activateReviewQuestion(page, number);
  const label = { hard: 'difficile', medium: 'moyenne', easy: 'facile' }[grade];
  await panel.getByRole('button', { name: 'Évaluer ' + label + ' le passage ' + number }).click();
  return panel;
}
