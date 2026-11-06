import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import { navigation } from './navigation';
const saved = (page: Page) =>
  expect(page.locator('.save-state')).toHaveText('Enregistré', { timeout: 20000 });
async function register(page: Page) {
  const email = `ai-${crypto.randomUUID()}@example.test`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Créer mon espace' }).click();
  await page.getByLabel('Votre nom').fill('Camille Carnet');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill('Assistant-Test-Password-42!');
  await page.getByRole('button', { name: 'Créer mon compte', exact: true }).click();
  let url = '';
  await expect
    .poll(async () => {
      const files = await readdir(`${process.env.LAB_E2E_DIR}/mail`).catch(() => []);
      for (const file of files) {
        const mail = JSON.parse(await readFile(`${process.env.LAB_E2E_DIR}/mail/${file}`, 'utf8'));
        if (mail.to === email) url = mail.url;
      }
      return Boolean(url);
    })
    .toBe(true);
  await page.goto(url);
  await page.getByRole('button', { name: 'Nouveau document', exact: true }).click();
  return email;
}
async function select(page: Page, text: string) {
  const editor = page.getByRole('textbox', { name: 'Contenu du document' });
  await editor.focus();
  await page.evaluate((text) => {
    const root = document.querySelector('[aria-label="Contenu du document"]')!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const at = n.textContent!.indexOf(text);
      if (at < 0) continue;
      const r = document.createRange();
      r.setStart(n, at);
      r.setEnd(n, at + text.length);
      const s = window.getSelection()!;
      s.removeAllRanges();
      s.addRange(r);
      document.dispatchEvent(new Event('selectionchange'));
      return;
    }
    throw new Error('Texte non trouvé');
  }, text);
}
async function mockAI(page: Page) {
  const requests: any[] = [];
  await page.route('**/api/ai/config', (route) =>
    route.fulfill({ json: { enabled: true, model: 'gpt-6-luna' } }),
  );
  await page.route('**/api/documents/*/ai', async (route) => {
    const request = route.request().postDataJSON();
    requests.push(request);
    const holes =
      request.mode === 'cloze'
        ? request.sources
            .filter((s: any) => s.text.includes('cellule'))
            .slice(0, 200)
            .map((s: any) => ({
              sourceId: s.id,
              quote: 'cellule',
              occurrence: 1,
              hint: 'Unité du vivant',
              priority: request.priority,
              difficulty: request.difficulty,
            }))
        : request.mode === 'compose-cloze'
          ? [
              {
                sourceId: 'generated',
                quote: 'ADN',
                occurrence: 1,
                hint: 'Support génétique',
                priority: 'medium',
                difficulty: 'unrated',
              },
            ]
          : [];
    await route.fulfill({
      json: {
        text:
          request.mode === 'cloze'
            ? ''
            : request.mode === 'compose-cloze'
              ? 'L’ADN porte l’information génétique.'
              : request.mode === 'complete'
                ? 'La suite complète cette idée.'
                : 'Une nouvelle explication.',
        holes,
      },
    });
  });
  return requests;
}
test('création immédiate, réglages, propositions IA modifiables, rejet, insertion et protection des onglets', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(15000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const requests = await mockAI(page);
  const email = await register(page);
  const editor = page.getByRole('textbox', { name: 'Contenu du document' });
  await editor.fill('La cellule contient un noyau. Une autre cellule reste à étudier.');
  await select(page, 'noyau');
  await page.getByRole('button', { name: 'Créer un texte à trous', exact: true }).click();
  await expect(editor).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(editor.locator('[data-memory-id]')).toHaveCount(1);
  await editor.press('End');
  await editor.press('!');
  await expect(editor.locator('[data-memory-id]')).toHaveText('noyau');
  await editor.locator('[data-memory-id]').click();
  const settings = page.getByRole('region', { name: 'Réglages du passage' });
  await settings.getByLabel('Indice facultatif').fill('Centre de commande');
  await settings.getByRole('combobox', { name: 'Priorité', exact: true }).selectOption('high');
  await settings.getByRole('combobox', { name: 'Difficulté', exact: true }).selectOption('hard');
  await settings.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(settings).toHaveCount(0);
  await expect(editor).toBeFocused();
  await saved(page);
  const id = page.url().split('/').pop()!;
  const original = (await (await page.request.get(`/api/documents/${id}/anchors`)).json())[0];
  expect(original).toMatchObject({
    quote: 'noyau',
    hint: 'Centre de commande',
    priority: 'high',
    difficulty: 'hard',
  });
  await select(page, 'cellule');
  await page.getByRole('button', { name: 'Gras (Ctrl+B)', exact: true }).click();
  await select(page, 'cellule');
  await page.getByRole('button', { name: 'Ouvrir l’assistant IA' }).click();
  const ai = page.getByRole('region', { name: 'Assistant IA', exact: true });
  await expect(ai.getByText('Nombre maximal de trous')).toHaveCount(0);
  await ai.getByRole('button', { name: 'Proposer', exact: true }).click();
  await expect(ai).toContainText('Proposition à vérifier');
  expect(requests[0].sources.map((s: any) => s.text).join('')).toBe('cellule');
  await expect(editor.locator('[data-memory-id]')).toHaveCount(1);
  await ai.getByText('Indice et réglages', { exact: true }).click();
  await ai
    .getByRole('textbox', { name: 'Indice du passage 1', exact: true })
    .fill('Une unité élémentaire');
  await ai.getByRole('button', { name: 'Appliquer (1)', exact: true }).click();
  await saved(page);
  await expect(editor.locator('strong')).toHaveText('cellule');
  let anchors = await (await page.request.get(`/api/documents/${id}/anchors`)).json();
  expect(anchors).toHaveLength(2);
  expect(anchors.find((a: any) => a.id === original.id)).toMatchObject({
    id: original.id,
    quote: original.quote,
    hint: original.hint,
    priority: original.priority,
    difficulty: original.difficulty,
  });
  expect(anchors.find((a: any) => a.quote === 'cellule').hint).toBe('Une unité élémentaire');
  const firstAiId = anchors.find((a: any) => a.quote === 'cellule').id;
  await expect(
    editor.locator('[data-memory-id]').filter({ hasText: 'cellule' }).first(),
  ).toHaveAttribute('data-memory-id', firstAiId);
  await ai.getByRole('button', { name: 'Fermer l’assistant IA' }).click();
  await page.getByRole('button', { name: 'Ajouter un onglet', exact: true }).click();
  await editor.fill('La cellule possède une membrane.');
  await page.getByRole('button', { name: 'Ouvrir l’assistant IA' }).click();
  await ai.getByText('Étendre au document entier', { exact: true }).click();
  await ai.getByRole('checkbox', { name: 'Inclure tous les onglets' }).check();
  await ai.getByRole('button', { name: 'Proposer', exact: true }).click();
  await expect(ai).toContainText('Proposition à vérifier');
  expect(new Set(requests.at(-1).sources.map((s: any) => s.id.split(':')[0])).size).toBe(2);
  expect(requests.at(-1).sources.some((s: any) => s.text.includes('noyau'))).toBe(false);
  await ai.getByRole('button', { name: 'Rejeter', exact: true }).click();
  await expect(editor.locator('[data-memory-id]')).toHaveCount(0);
  await ai.getByRole('button', { name: 'Proposer', exact: true }).click();
  await expect(ai).toContainText('Proposition à vérifier');
  await ai.getByRole('button', { name: 'Appliquer (2)', exact: true }).click();
  await saved(page);
  for (const mode of ['write', 'compose-cloze']) {
    await ai.getByLabel('Que souhaitez-vous faire ?').selectOption(mode);
    await ai.getByLabel(/Vos consignes/).fill('Écris une phrase de cours.');
    await ai.getByRole('button', { name: 'Proposer', exact: true }).click();
    await expect(ai).toContainText('Proposition à vérifier');
    if (mode === 'compose-cloze') {
      await ai.getByText('Modifier le texte', { exact: true }).click();
      await ai
        .getByRole('textbox', { name: 'Texte proposé', exact: true })
        .fill('L’ADN porte l’information génétique.\nUne phrase relue.');
      await expect(ai.locator('.ai-text-preview mark')).toHaveText('ADN');
      await page.screenshot({
        path: info.outputPath('assistant-desktop-proposition.png'),
        fullPage: true,
      });
    }
    await ai.getByRole('button', { name: 'Appliquer', exact: true }).click();
    await saved(page);
  }
  await expect(editor).toContainText('La cellule possède une membrane.');
  await expect(editor).toContainText('Une nouvelle explication.');

  await expect(editor).toContainText('Une phrase relue.');
  await ai.getByLabel('Que souhaitez-vous faire ?').selectOption('write');
  await ai.getByRole('button', { name: 'Proposer', exact: true }).click();
  await expect(ai).toContainText('Proposition à vérifier');
  await editor.press('ControlOrMeta+End');
  await editor.press('Enter');
  await editor.press('x');
  await ai.getByRole('button', { name: 'Appliquer', exact: true }).click();
  await expect(ai.getByRole('alert')).toContainText('a changé depuis la génération');
  await ai.getByRole('button', { name: 'Rejeter', exact: true }).click();
  await page.screenshot({ path: info.outputPath('assistant-desktop.png'), fullPage: true });
  await ai.getByRole('button', { name: 'Fermer l’assistant IA' }).click();
  await saved(page);
  await page.reload();
  await expect(editor).toContainText('Une phrase relue.');
  await navigation(page);
  await page.getByRole('button', { name: 'Déconnexion', exact: true }).click();
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill('Assistant-Test-Password-42!');
  await page.getByRole('button', { name: 'Me connecter', exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  await page.goto(`/document/${id}`);
  await expect(editor).toContainText('Une phrase relue.');
  anchors = await (await page.request.get(`/api/documents/${id}/anchors`)).json();
  expect(anchors).toHaveLength(5);
  expect(anchors.every((a: any) => a.status === 'active')).toBe(true);
  expect(anchors.some((a: any) => a.id === firstAiId)).toBe(true);
  expect(errors).toEqual([]);
});

test('mobile : raccourci immédiat, panneau discret, erreurs IA et aucune sortie de l’écran', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAI(page);
  await register(page);
  const editor = page.getByRole('textbox', { name: 'Contenu du document' });
  await editor.fill('La cellule est vivante.');
  await select(page, 'vivante');
  await editor.press('ControlOrMeta+Shift+m');
  await expect(editor).toBeFocused();
  await expect(editor.locator('[data-memory-id]')).toHaveText('vivante');
  await editor.locator('[data-memory-id]').click();
  const settings = page.getByRole('region', { name: 'Réglages du passage' });
  await expect(settings).toBeVisible();
  let bounds = await settings.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await settings.getByLabel('Indice facultatif').fill('Un adjectif');
  await settings.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await select(page, 'cellule');
  await page.getByRole('button', { name: 'Ouvrir l’assistant IA' }).click();
  const ai = page.getByRole('region', { name: 'Assistant IA', exact: true });
  bounds = await ai.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await ai.getByRole('button', { name: 'Proposer', exact: true }).click();
  await expect(ai).toContainText('Proposition à vérifier');
  await page.screenshot({ path: info.outputPath('assistant-mobile.png'), fullPage: true });
  await ai.getByRole('button', { name: 'Appliquer (1)', exact: true }).click();
  await saved(page);

  await ai.getByLabel('Que souhaitez-vous faire ?').selectOption('write');
  await ai.getByLabel(/Vos consignes/).fill('Une phrase.');
  await page.route('**/api/documents/*/ai', (route) =>
    route.fulfill({ status: 503, json: { error: 'Service IA temporairement indisponible.' } }),
  );
  await ai.getByRole('button', { name: 'Proposer', exact: true }).click();
  await expect(ai.getByRole('alert')).toContainText('temporairement indisponible');
  await expect(editor.locator('[data-memory-id]')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('partage : lecture anonyme, révision, copie après connexion et révocation', async ({
  page,
  browser,
}) => {
  const email = await register(page);
  const editor = page.getByRole('textbox', { name: 'Contenu du document' });
  await editor.fill('La cellule est vivante.');
  await select(page, 'cellule');
  await editor.press('ControlOrMeta+Shift+m');
  await saved(page);
  await page.getByRole('button', { name: 'Partager', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Partager le document' });
  await panel.getByRole('button', { name: 'Créer le lien public' }).click();
  const link = await panel.getByLabel('Lien public').inputValue();
  const context = await browser.newContext({ baseURL: 'http://localhost:5174' });
  const guest = await context.newPage();
  await guest.goto(link);
  await expect(guest.getByRole('document', { name: 'Document de révision' })).toContainText(
    'La cellule est vivante.',
  );
  await expect(guest.locator('[contenteditable=true]')).toHaveCount(0);
  await guest.getByRole('button', { name: 'Réviser', exact: true }).click();
  await guest.getByRole('button', { name: 'Révéler le passage 1' }).click();
  await expect(guest.getByLabel('Évaluer la difficulté du passage 1')).toHaveCount(0);
  await guest.getByRole('link', { name: 'Créer un compte et obtenir ma copie' }).click();
  await guest.getByLabel('Adresse email').fill(email);
  await guest.getByLabel('Mot de passe', { exact: true }).fill('Assistant-Test-Password-42!');
  await guest.getByRole('button', { name: 'Me connecter', exact: true }).click();
  await expect(guest).toHaveURL(/\/document\//);
  await expect(guest.getByRole('textbox', { name: 'Contenu du document' })).toContainText(
    'cellule',
  );
  await panel.getByRole('button', { name: 'Révoquer le lien' }).click();
  await guest.goto(link);
  await expect(guest.getByRole('heading', { name: 'Ce lien n’est plus disponible' })).toBeVisible();
  await context.close();
});
