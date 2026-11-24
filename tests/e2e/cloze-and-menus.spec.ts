import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import { defaultLayout } from '../../src/shared/document';

async function register(page: Page) {
  const email = 'cloze-' + crypto.randomUUID() + '@example.test';
  await page.goto('/');
  await page.getByRole('button', { name: 'Créer mon espace' }).click();
  await page.getByLabel('Votre nom').fill('Carnet de test');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill('Cloze-Test-Password42!');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  let mail: { url: string } | undefined;
  await expect
    .poll(async () => {
      const entries = await Promise.all(
        (await readdir(process.env.LAB_E2E_DIR + '/mail').catch(() => [])).map(async (name) => {
          try {
            return JSON.parse(await readFile(process.env.LAB_E2E_DIR + '/mail/' + name, 'utf8'));
          } catch {
            return null;
          }
        }),
      );
      mail = entries.find((entry) => entry?.to === email);
      return Boolean(mail);
    })
    .toBe(true);
  await page.goto(mail!.url);
  await expect(page).toHaveURL(/\/library$/);
}

test('balises manuscrites, préférences et menus de bibliothèque', async ({ page }) => {
  await register(page);
  await page.getByRole('button', { name: 'Nouveau document', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Contenu du document' });
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type('Les <<chats>>', { delay: 15 });
  await expect(editor.locator('[data-memory-id]')).toHaveText('chats');
  await expect(editor).toContainText('Les chats');
  await expect(editor).not.toContainText('<<');

  await page.getByLabel('Options du document').click();
  await page.getByRole('button', { name: 'Balises et raccourcis' }).click();
  await page.getByLabel('Balise d’ouverture').fill('[[');
  await page.getByLabel('Balise de fermeture').fill(']]');
  await page.getByLabel('Raccourci : Créer un trou').focus();
  await page.keyboard.press('Control+Shift+K');
  await expect(page.getByLabel('Raccourci : Créer un trou')).toHaveValue('Ctrl/⌘ + Maj + k');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/editor/preferences');
      return (await response.json()).shortcuts.create;
    })
    .toBe('Mod-Shift-k');
  await editor.click();
  await editor.press('End');
  await page.keyboard.type(' et les [[chiens]]', { delay: 15 });
  await expect(editor.locator('[data-memory-id]')).toHaveCount(2);
  await expect(editor.locator('[data-memory-id]').last()).toHaveText('chiens');
  await expect(page.locator('.save-state')).toHaveText('Enregistré', { timeout: 20000 });
  await page.reload();
  await expect(
    page.getByRole('textbox', { name: 'Contenu du document' }).locator('[data-memory-id]'),
  ).toHaveCount(2);
  await page.getByLabel('Options du document').click();
  await page.getByRole('button', { name: 'Balises et raccourcis' }).click();
  await expect(page.getByLabel('Raccourci : Créer un trou')).toHaveValue('Ctrl/⌘ + Maj + k');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();

  const headers = { Origin: 'http://localhost:5174' };
  const content = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Essai' }] }],
  };
  for (let i = 0; i < 4; i++) {
    const result = await page.request.post('/api/documents', {
      headers,
      data: { title: 'Document test ' + i, content, layout: defaultLayout },
    });
    expect(result.status()).toBe(201);
  }
  await page.goto('/library');
  await expect(page.locator('.document-card')).toHaveCount(5);
  const first = page.locator('.document-card').first();
  const firstMenu = first.locator('.document-menu');
  await firstMenu.locator('summary').click();
  await expect(firstMenu.locator('.menu-popover')).toBeVisible();
  await expect(first).toHaveCSS('z-index', '60');
  await page.keyboard.press('Escape');
  await expect(firstMenu).not.toHaveAttribute('open', '');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.document-card').first().locator('.document-menu summary').click();
  await expect(page.locator('.document-card').first().locator('.menu-popover')).toBeVisible();
  await expect(page.locator('.document-card').first()).toHaveCSS('z-index', '60');
});
