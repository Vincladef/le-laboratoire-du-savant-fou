import type { Page } from '@playwright/test';
export async function documentMenu(page: Page) {
  const menu = page.locator('.document-tools');
  if (!(await menu.evaluate((el) => el.hasAttribute('open'))))
    await menu.locator('summary').click();
}
export async function reviewMenu(page: Page) {
  const menu = page.locator('.review-menu');
  if (!(await menu.evaluate((el) => el.hasAttribute('open'))))
    await menu.locator('summary').click();
}
export async function navigation(page: Page) {
  if (!(await page.getByRole('button', { name: 'Déconnexion', exact: true }).isVisible()))
    await page.getByRole('button', { name: 'Ouvrir le menu', exact: true }).click();
}
