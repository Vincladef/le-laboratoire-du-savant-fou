import { documentMenu, navigation } from './navigation';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
import { readdir, readFile } from 'node:fs/promises';
import { defaultLayout } from '../../src/shared/document';

async function register(page: Page) {
  const email = `design-${crypto.randomUUID()}@example.test`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Créer mon espace' }).click();
  await page.getByLabel('Votre nom').fill('Camille Carnet');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill('Carnet-Accessibilite-42!');
  await page.getByRole('button', { name: 'Créer mon compte', exact: true }).click();
  let mail: { url: string } | undefined;
  await expect
    .poll(async () => {
      const entries = await Promise.all(
        (await readdir(`${process.env.LAB_E2E_DIR}/mail`).catch(() => [])).map(async (f) =>
          JSON.parse(await readFile(`${process.env.LAB_E2E_DIR}/mail/${f}`, 'utf8')),
        ),
      );
      mail = entries.find((m) => m.to === email);
      return Boolean(mail);
    })
    .toBe(true);
  await page.goto(mail!.url);
  await expect(page).toHaveURL(/\/library$/);
}
async function accessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
}
test('contraste et accessibilité des formulaires, des formules et du dialogue légal', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.getByLabel('Adresse email')).toBeVisible();
  await accessible(page);
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: 'Pro', exact: true })).toBeVisible();
  await accessible(page);
  await page.screenshot({ path: info.outputPath('formules-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'CGU & confidentialité' }).click();
  await accessible(page);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await accessible(page);
  await page.screenshot({ path: info.outputPath('formules-mobile.png'), fullPage: true });
});
test('compte simplifié : aucun réglage de calendrier, nom modifiable et préférences préservées', async ({
  page,
}) => {
  await register(page);
  const headers = { Origin: 'http://localhost:5174' };
  expect(
    (
      await page.request.patch('/api/profile', {
        headers,
        data: { name: 'Camille Carnet', timezone: 'Pacific/Tahiti' },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole('button', { name: 'Mon compte', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Mon compte' })).toBeVisible();
  await expect(page.getByLabel('Fuseau horaire')).toHaveCount(0);
  await page.getByLabel('Nom affiché', { exact: true }).fill('Camille Bouche-trou');
  await accessible(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const profile = await (await page.request.get('/api/profile')).json();
  expect(profile.preferences.timezone).toBe('Pacific/Tahiti');
  expect(profile.role).toBe('free');
  await page.getByRole('button', { name: 'Mon compte', exact: true }).click();
  await expect(page.getByLabel('Nom affiché', { exact: true })).toHaveValue('Camille Bouche-trou');
});
test('page agrandie, plan persistant utilisable sur mobile, clavier et interface accessible', async ({
  page,
}, info) => {
  await register(page);
  await accessible(page);
  await page.getByRole('button', { name: 'Nouveau document', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Contenu du document' });
  await editor.fill('Observations du laboratoire.');
  await expect(page.locator('.save-state')).toHaveText('Enregistré');
  const toggle = page.getByRole('button', { name: 'Plan du document', exact: true });
  await expect(toggle).toHaveText('Plan');
  await expect(page.locator('.editor-header-actions .outline-toggle')).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await documentMenu(page);
  await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('fit');
  await page.locator('.document-tools > summary').click();
  await expect
    .poll(async () => (await page.locator('.document-paper').boundingBox())?.width || 0)
    .toBeGreaterThan(1000);
  await accessible(page);
  await page.screenshot({ path: info.outputPath('carnet-desktop.png'), fullPage: true });
  await toggle.click();
  await expect(page.getByRole('complementary', { name: 'Plan du document' })).toBeVisible();
  await expect(
    page
      .locator('.document-tab-item')
      .filter({ has: page.locator('.tab-title-row.active') })
      .getByRole('navigation', { name: 'Titres de l’onglet actif' }),
  ).toBeVisible();
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'Masquer le plan' })).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toBeFocused();
  await documentMenu(page);
  await page.getByLabel('Zoom', { exact: true }).selectOption('100');
  expect((await page.locator('.document-paper').boundingBox())!.width).toBeGreaterThan(790);
  expect((await page.locator('.document-paper').boundingBox())!.width).toBeLessThan(800);
  await documentMenu(page);
  await page.getByLabel('Zoom', { exact: true }).selectOption('fit');
  await page.locator('.document-tools > summary').click();
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await toggle.click();
    await expect(page.getByRole('complementary', { name: 'Plan du document' })).toBeVisible();
    await toggle.click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(
      true,
    );
    expect((await editor.boundingBox())!.width).toBeGreaterThan(width === 390 ? 300 : 350);
    await accessible(page);
  }
  await page.screenshot({ path: info.outputPath('carnet-mobile.png'), fullPage: true });
  await editor.focus();
  await editor.press('ControlOrMeta+End');
  await page.keyboard.type(' Ajout mobile.');
  await editor.press('ControlOrMeta+s');
  await expect(page.locator('.save-state')).toHaveText('Enregistré');
  await page.reload();
  await expect(editor).toContainText('Ajout mobile.');
});
test('grand document : 1 000 paragraphes, 100 annotations, édition et persistance', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await register(page);
  const content = {
    type: 'doc',
    content: Array.from({ length: 1000 }, (_, i) => ({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: `Observation ${i + 1}. La méthode scientifique confronte les hypothèses aux résultats mesurés. `.repeat(
            3,
          ),
          ...(i < 100
            ? {
                marks: [
                  {
                    type: 'memoryAnchor',
                    attrs: {
                      id: crypto.randomUUID(),
                      source: 'selection',
                      hint: `Indice ${i}`,
                      priority: 'medium',
                    },
                  },
                ],
              }
            : {}),
        },
      ],
    })),
  };
  const created = await page.request.post('/api/documents', {
    headers: { Origin: 'http://localhost:5174' },
    data: { title: 'Carnet volumineux', content, layout: defaultLayout },
  });
  expect(created.status()).toBe(201);
  const document = await created.json();
  const start = Date.now();
  await page.goto(`/document/${document.id}`);
  const editor = page.getByRole('textbox', { name: 'Contenu du document' });
  await expect(editor).toBeVisible();
  await expect(editor.locator('p')).toHaveCount(1000);
  const openedMs = Date.now() - start;
  await editor.press('ControlOrMeta+End');
  await page.keyboard.type(' Mesure finale conservée.');
  await expect(page.locator('.save-state')).toHaveText('Enregistré', { timeout: 30000 });
  const saved = await (await page.request.get(`/api/documents/${document.id}`)).json();
  expect(JSON.stringify(saved.content)).toContain('Mesure finale conservée.');
  expect(
    await (await page.request.get(`/api/documents/${document.id}/anchors`)).json(),
  ).toHaveLength(100);
  await info.attach('mesure-grand-document', {
    body: JSON.stringify({
      paragraphs: 1000,
      anchors: 100,
      characters: JSON.stringify(content).length,
      openedMs,
      editAndSaveMs: Date.now() - start - openedMs,
    }),
    contentType: 'application/json',
  });
  await page.getByRole('button', { name: 'Réviser ce document', exact: true }).click();
  await expect(page.locator('.review-reveal')).toHaveCount(100);
  await expect(page.getByRole('document', { name: 'Document de révision' })).toContainText(
    'Mesure finale conservée.',
  );
});

test('une panne de chargement affiche une récupération et permet de rouvrir le document', async ({
  page,
}) => {
  await register(page);
  await page.route('**/src/editor/EditorPage.tsx*', (route) => route.abort());
  await page.getByRole('button', { name: 'Nouveau document', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reprenons l’expérience.' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('ne supprime pas vos copies locales');
  await page.unroute('**/src/editor/EditorPage.tsx*');
  await page.getByRole('button', { name: 'Recharger la page', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Contenu du document' })).toBeVisible();
});

test('accessibilité de la bibliothèque, du document à réviser et des commandes proches des trous', async ({
  page,
}) => {
  await register(page);
  const response = await page.request.post('/api/documents', {
    headers: { Origin: 'http://localhost:5174' },
    data: {
      title: 'La cellule',
      layout: defaultLayout,
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'La cellule contient un noyau.',
                marks: [
                  {
                    type: 'memoryAnchor',
                    attrs: { id: crypto.randomUUID(), hint: 'Biologie', priority: 'high' },
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  });
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'La cellule', exact: true }).first(),
  ).toBeVisible();
  await accessible(page);
  await page.goto(`/study/${id}`);
  await expect(page.getByRole('button', { name: 'Tout révéler' })).toBeVisible();
  await accessible(page);
  await page.getByRole('button', { name: 'Tout révéler' }).click();
  await accessible(page);
  await page.getByLabel('Évaluer la difficulté du passage 1', { exact: true }).click();
  await accessible(page);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Masquer', exact: true }).click();
  await page.getByLabel('Afficher l’indice du passage 1', { exact: true }).click();
  await accessible(page);
});
