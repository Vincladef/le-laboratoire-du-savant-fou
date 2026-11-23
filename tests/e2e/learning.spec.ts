import { navigation, filterReview, revealIndividually } from './navigation';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { readdir, readFile } from 'node:fs/promises';
const password = 'Learning-Browser-Password-42!';
async function register(page: Page) {
  const email = `study-${crypto.randomUUID()}@example.test`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Créer mon espace' }).click();
  await page.getByLabel('Votre nom').fill('Camille Mémoire');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Créer mon compte', exact: true }).click();
  let mail: any;
  await expect
    .poll(async () => {
      const files = await readdir(`${process.env.LAB_E2E_DIR}/mail`).catch(() => []);
      const entries = await Promise.all(
        files.map(async (f) =>
          JSON.parse(await readFile(`${process.env.LAB_E2E_DIR}/mail/${f}`, 'utf8')),
        ),
      );
      mail = entries.find((m) => m.to === email);
      return Boolean(mail);
    })
    .toBe(true);
  await page.goto(mail.url);
  await expect(page).toHaveURL(/\/library$/);
  return email;
}
async function selectText(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Contenu du document' }).focus();
  await page.evaluate((text) => {
    const root = document.querySelector('[aria-label="Contenu du document"]')!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT),
      nodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) nodes.push(node as Text);
    const all = nodes.map((n) => n.textContent).join(''),
      start = all.indexOf(text);
    if (start < 0) throw new Error('Texte introuvable');
    let offset = 0,
      from: Text | undefined,
      to: Text | undefined,
      fromOffset = 0,
      toOffset = 0;
    for (const n of nodes) {
      const end = offset + n.length;
      if (!from && start < end) {
        from = n;
        fromOffset = start - offset;
      }
      if (start + text.length <= end) {
        to = n;
        toOffset = start + text.length - offset;
        break;
      }
      offset = end;
    }
    const range = document.createRange();
    range.setStart(from!, fromOffset);
    range.setEnd(to!, toOffset);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  }, text);
  await expect(
    page.getByRole('button', { name: 'Créer un texte à trous', exact: true }),
  ).toBeVisible();
}
const saved = async (page: Page) =>
  expect(page.locator('.save-state')).toHaveText('Enregistré', { timeout: 20000 });
test('révision unique : contexte, filtres combinés, indice local, difficulté facultative, réseau et reconnexion', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  const errors: string[] = [],
    obsoleteRequests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (r.url().includes('/api/learning/')) obsoleteRequests.push(r.url());
  });
  const email = await register(page);
  await page.getByRole('button', { name: 'Nouveau document', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Contenu du document' });
  await editor.fill(
    'La cellule contient un noyau.\nLes mitochondries produisent de l’énergie.\nLe ribosome fabrique les protéines.',
  );
  await selectText(page, 'cellule');
  await page.getByRole('button', { name: 'Gras (Ctrl+B)', exact: true }).click();
  await selectText(page, 'La cellule contient un noyau.');
  await page.getByRole('button', { name: 'Créer un texte à trous', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(editor).toBeFocused();
  await editor.locator('[data-memory-id]').first().click();
  await page
    .getByRole('region', { name: 'Réglages du passage' })
    .getByLabel('Indice facultatif')
    .fill('Unité du vivant');
  await page
    .getByRole('region', { name: 'Réglages du passage' })
    .getByRole('combobox', { name: 'Priorité', exact: true })
    .selectOption('high');
  await expect(
    page
      .getByRole('region', { name: 'Réglages du passage' })
      .getByRole('combobox', { name: 'Difficulté', exact: true }),
  ).toHaveValue('unrated');
  await page
    .getByRole('region', { name: 'Réglages du passage' })
    .getByRole('combobox', { name: 'Difficulté', exact: true })
    .selectOption('hard');
  await page
    .getByRole('region', { name: 'Réglages du passage' })
    .getByRole('button', { name: 'Enregistrer', exact: true })
    .click();
  await expect(editor.locator('strong')).toHaveText('cellule');
  for (const [text, priority] of [
    ['Les mitochondries produisent de l’énergie.', 'medium'],
    ['Le ribosome fabrique les protéines.', 'low'],
  ]) {
    await selectText(page, text);
    await editor.press('ControlOrMeta+Shift+m');
    await expect(editor).toBeFocused();
    await editor.locator('[data-memory-id]').filter({ hasText: text }).first().click();
    await expect(
      page
        .getByRole('region', { name: 'Réglages du passage' })
        .getByRole('combobox', { name: 'Priorité', exact: true }),
    ).toHaveValue('medium');
    await expect(
      page
        .getByRole('region', { name: 'Réglages du passage' })
        .getByRole('combobox', { name: 'Difficulté', exact: true }),
    ).toHaveValue('unrated');
    await page
      .getByRole('region', { name: 'Réglages du passage' })
      .getByRole('combobox', { name: 'Priorité', exact: true })
      .selectOption(priority);
    await page
      .getByRole('region', { name: 'Réglages du passage' })
      .getByRole('button', { name: 'Enregistrer', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await saved(page);
  const id = page.url().split('/').pop()!;
  const original = await (await page.request.get(`/api/documents/${id}`)).json();
  await page.getByRole('button', { name: 'Réviser ce document', exact: true }).click();
  await expect(page).toHaveURL(`/study/${id}`);
  await expect(page.locator('.review-reveal')).toHaveCount(3);
  await expect(page.getByLabel('Filtrer par priorité')).toContainText('Toutes');
  await expect(page.getByLabel('Filtrer par difficulté')).toContainText('Toutes');
  await expect(page.locator('.review-filter input:checked')).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'Tout révéler', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Masquer', exact: true })).toHaveCount(0);
  const paper = page.getByRole('document', { name: 'Document de révision' });
  const bounds = await paper.boundingBox();
  expect(bounds!.y).toBeLessThan(330);
  await filterReview(page, 'priority', 'high');
  await expect(page.locator('.review-reveal')).toHaveCount(1);
  await expect(paper).toContainText('Les mitochondries produisent');
  await expect(paper).toContainText('Le ribosome fabrique');
  await page.getByLabel('Afficher l’indice du passage 1', { exact: true }).click();
  await expect(page.locator('.review-hint[open]')).toContainText('Unité du vivant');
  await expect(page.locator('.review-hint')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Révéler le passage 1', exact: true }).click();
  await expect(
    page.getByLabel('Difficulté du passage 1', { exact: true }),
  ).toBeFocused();
  // The visible controls are native dropdowns: one interaction selects a value.
  await expect(page.locator('.review-evaluation select')).toHaveCount(1);
  await expect(page.locator('.review-priority select')).toHaveCount(1);
  await expect(page.locator('.review-evaluation details, .review-priority details')).toHaveCount(0);
  await expect(page.locator('.review-reveal')).toHaveCount(0);
  await expect(paper.locator('strong')).toHaveText('cellule');
  // Revealing is entirely optional and never writes an evaluation.
  let passages = await (await page.request.get(`/api/documents/${id}/anchors`)).json();
  expect(passages.map((p: any) => p.difficulty)).toEqual(['hard', 'unrated', 'unrated']);
  expect(passages.map((p: any) => p.difficultyRevision)).toEqual([1, 0, 0]);
  await page.getByLabel('Difficulté du passage 1', { exact: true }).selectOption('hard');
  // Choosing the current value is a no-op, not an extra evaluation or save.
  await expect(page.getByLabel('Difficulté du passage 1', { exact: true })).toHaveValue('hard');
  await filterReview(page, 'priority', 'all');
  await revealIndividually(page);
  for (const [number, difficulty] of [
    [2, 'medium'],
    [3, 'easy'],
  ] as const) {
    await page
      .getByLabel(`Difficulté du passage ${number}`, { exact: true })
      .selectOption(difficulty);
    await expect(page.getByRole('status')).toHaveText('Difficulté enregistrée.');
  }
  for (const difficulty of ['easy', 'medium', 'hard']) {
    await filterReview(page, 'difficulty', difficulty);
    await expect(page.locator('.review-reveal')).toHaveCount(1);
  }
  await filterReview(page, 'difficulty', ['easy', 'hard']);
  await expect(page.locator('.review-reveal')).toHaveCount(2);
  await filterReview(page, 'priority', ['high', 'low']);
  await expect(page.locator('.review-reveal')).toHaveCount(2);
  await filterReview(page, 'priority', ['high', 'medium']);
  await expect(page.locator('.review-reveal')).toHaveCount(1);
  await expect(paper).toContainText('Le ribosome fabrique les protéines.');
  await filterReview(page, 'difficulty', []);
  await expect(page.locator('.review-reveal')).toHaveCount(0);
  await filterReview(page, 'priority', 'all');
  await filterReview(page, 'difficulty', 'unrated');
  await expect(page.locator('.review-reveal')).toHaveCount(0);
  await expect(paper).toContainText('La cellule contient un noyau.');
  await filterReview(page, 'difficulty', 'hard');
  await filterReview(page, 'priority', 'medium');
  await expect(page.locator('.review-reveal')).toHaveCount(0);
  await filterReview(page, 'priority', 'high');
  await expect(page.locator('.review-reveal')).toHaveCount(1);
  await page.getByRole('heading', { name: 'Réviser', exact: true }).click();
  await page.keyboard.press('Space');
  await expect(page.locator('.review-reveal')).toHaveCount(0);
  await page.route(
    '**/api/anchors/*/difficulty',
    async (route) => {
      await route.fetch();
      await route.abort('failed');
    },
    { times: 1 },
  );
  await page.getByLabel('Difficulté du passage 1', { exact: true }).selectOption('easy');
  await expect(page.getByRole('button', { name: 'Réessayer l’enregistrement' })).toBeVisible();
  await filterReview(page, 'priority', 'all');
  await expect(page.getByRole('button', { name: 'Réessayer l’enregistrement' })).toBeVisible();
  await page.getByRole('button', { name: 'Réessayer l’enregistrement' }).click();
  await expect(page.getByRole('status')).toHaveText('Difficulté enregistrée.');
  await expect(page.locator('.review-reveal')).toHaveCount(0);
  const stored = await (await page.request.get(`/api/documents/${id}`)).json();
  expect(stored.content).toEqual(original.content);
  expect(stored.revision).toBe(original.revision);
  passages = await (await page.request.get(`/api/documents/${id}/anchors`)).json();
  expect(passages[0]).toMatchObject({
    difficulty: 'easy',
    difficultyRevision: 2,
    priority: 'high',
  });
  await filterReview(page, 'priority', 'all');
  await filterReview(page, 'difficulty', 'all');
  await revealIndividually(page);
  await expect(page.getByLabel('Priorité du passage 3', { exact: true })).toHaveValue('low');
  await page.getByLabel('Priorité du passage 3', { exact: true }).selectOption('high');
  await expect(page.getByRole('status')).toHaveText('Priorité enregistrée.');
  await expect(page.getByLabel('Priorité du passage 3', { exact: true }))
    .toHaveValue('high');
  const afterPriority = await (await page.request.get(`/api/documents/${id}`)).json();
  expect(afterPriority.revision).toBe(original.revision + 1);
  expect(afterPriority.content.content[0].content
    .flatMap((node: any) => node.marks || [])
    .filter((mark: any) => mark.type === 'memoryAnchor')
    .at(-1)?.attrs?.priority).toBe('high');
  passages = await (await page.request.get(`/api/documents/${id}/anchors`)).json();
  expect(passages[2].priority).toBe('high');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator('.review-reveal')).toHaveCount(3);
  await revealIndividually(page);
  await page.context().setOffline(true);
  await page.getByLabel('Difficulté du passage 2', { exact: true }).selectOption('hard');
  await expect(page.getByRole('button', { name: 'Réessayer l’enregistrement' })).toBeVisible();
  await page.context().setOffline(false);
  await page.getByRole('button', { name: 'Réessayer l’enregistrement' }).click();
  await expect(page.getByRole('status')).toHaveText('Difficulté enregistrée.');
  await page.getByLabel('Afficher l’indice du passage 1', { exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath('revision-simple-mobile.png'), fullPage: true });
  await navigation(page);
  await page.getByRole('button', { name: 'Déconnexion', exact: true }).click();
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Me connecter', exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  await page.goto(`/study/free/${id}`);
  await expect(page).toHaveURL(`/study/${id}`);
  await expect(page.locator('.review-reveal')).toHaveCount(3);
  passages = await (await page.request.get(`/api/documents/${id}/anchors`)).json();
  expect(passages.map((p: any) => p.difficulty)).toEqual(['easy', 'hard', 'easy']);
  await page.goto(`/document/${id}`);
  await expect(editor).toBeVisible();
  await page.getByRole('button', { name: /^Passages/ }).click();
  await page.getByLabel('Difficulté du passage 1', { exact: true }).selectOption('hard');
  await expect
    .poll(async () => {
      const rows = await (await page.request.get(`/api/documents/${id}/anchors`)).json();
      return rows[0].difficulty;
    })
    .toBe('hard');
  await page.getByLabel('Priorité du passage 1', { exact: true }).selectOption('medium');
  await page.getByRole('button', { name: 'Modifier l’indice', exact: true }).first().click();
  await page
    .getByRole('region', { name: 'Réglages du passage' })
    .getByLabel('Indice facultatif')
    .fill('Indice amélioré');
  await page
    .getByRole('region', { name: 'Réglages du passage' })
    .getByRole('button', { name: 'Enregistrer', exact: true })
    .click();
  await saved(page);
  passages = await (await page.request.get(`/api/documents/${id}/anchors`)).json();
  expect(passages[0]).toMatchObject({
    difficulty: 'hard',
    priority: 'medium',
    hint: 'Indice amélioré',
  });
  await expect(editor.locator('strong')).toHaveText('cellule');
  await page.getByRole('button', { name: 'Réviser ce document', exact: true }).click();
  await filterReview(page, 'priority', 'medium');
  await filterReview(page, 'difficulty', 'hard');
  await expect(page.locator('.review-reveal')).toHaveCount(2);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: info.outputPath('revision-simple-desktop.png'), fullPage: true });
  expect(obsoleteRequests).toEqual([]);
  expect(errors).toEqual([]);
});
test('les écrans Neon proposent la confirmation par code et la récupération par lien', async ({
  page,
}) => {
  await page.route('**/api/config', (r) =>
    r.fulfill({ json: { local: false, google: true, email: true, managed: true } }),
  );
  await page.route('**/api/auth/sign-up/email', (r) =>
    r.fulfill({ json: { user: { id: crypto.randomUUID() }, token: null } }),
  );
  await page.route('**/api/auth/request-password-reset', (r) =>
    r.fulfill({ json: { status: true } }),
  );
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Continuer avec Google' })).toBeVisible();
  await page.getByRole('button', { name: 'Créer mon espace' }).click();
  await page.getByLabel('Votre nom').fill('Test interface');
  await page.getByLabel('Adresse email').fill('interface@example.test');
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Créer mon compte', exact: true }).click();
  await expect(page.getByLabel('Code reçu par email')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmer mon adresse' })).toBeVisible();
  await page.getByRole('button', { name: 'Revenir à la connexion' }).click();
  await page.getByRole('button', { name: 'Mot de passe oublié ?' }).click();
  await page.getByRole('button', { name: 'Envoyer le lien de récupération' }).click();
  await expect(page.getByRole('status')).toContainText('un email de récupération');
});
