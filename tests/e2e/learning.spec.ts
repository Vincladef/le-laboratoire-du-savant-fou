import { test, expect, type Page } from '@playwright/test';
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
test('passages multistyles, entraînement libre, FSRS, réponse perdue, reprise mobile et persistance', async ({
  page,
}, testInfo) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const email = await register(page);
  await page.getByRole('button', { name: 'Nouveau document', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Contenu du document' });
  await editor.fill('La cellule contient un noyau.');
  await selectText(page, 'cellule');
  await page.getByRole('button', { name: 'Gras (Ctrl+B)', exact: true }).click();
  await selectText(page, 'La cellule contient un noyau.');
  await page.getByRole('button', { name: 'Créer un texte à trous', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Indice facultatif').fill('Unité du vivant');
  await page.getByRole('dialog').getByRole('combobox').selectOption('high');
  await page.getByRole('button', { name: 'Créer le passage', exact: true }).click();
  await expect(editor.locator('strong')).toHaveText('cellule');
  await editor.press('ControlOrMeta+End');
  await editor.press('ArrowRight');
  await editor.press('Enter');
  await page.keyboard.type('Les mitochondries produisent de l’énergie.');
  await selectText(page, 'Les mitochondries produisent de l’énergie.');
  await editor.press('ControlOrMeta+Shift+m');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByLabel('Indice facultatif').fill('Organites énergétiques');
  await page.getByRole('button', { name: 'Créer le passage', exact: true }).click();
  await saved(page);
  const id = page.url().split('/').pop()!;
  let passages = await (await page.request.get(`/api/documents/${id}/anchors`)).json();
  expect(passages).toHaveLength(2);
  const before = JSON.stringify(passages.map((p: any) => p.card));
  await page.getByRole('button', { name: 'Révision libre', exact: true }).click();
  await expect(page).toHaveURL(/\/study\/free\//);
  await page.getByLabel('Priorités à réviser').selectOption('high');
  await expect(page.getByRole('status')).toContainText('0 / 1');
  await expect.poll(() => page.locator('.study-hidden').count()).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Afficher l’indice du passage 1', exact: true }).click();
  await expect(page.locator('.hint')).toHaveText('Unité du vivant');
  await page.getByRole('button', { name: 'Révéler toutes les réponses' }).click();
  await expect(page.locator('.study-hidden')).toHaveCount(0);
  await page.getByRole('document', { name: 'Document de révision' }).click();
  await page.keyboard.press('r');
  await expect.poll(() => page.locator('.study-hidden').count()).toBeGreaterThan(0);
  await page.keyboard.press('Space');
  await expect(page.getByRole('status')).toContainText('1 / 1');
  passages = await (await page.request.get(`/api/documents/${id}/anchors`)).json();
  expect(JSON.stringify(passages.map((p: any) => p.card))).toBe(before);
  await page.goto(`/document/${id}`);
  await expect(editor).toBeVisible();
  await page.getByRole('button', { name: /Passages mémorisés/ }).click();
  await page.getByRole('button', { name: 'Modifier l’indice' }).first().click();
  await page.getByRole('dialog').getByLabel('Indice facultatif').fill('Indice amélioré');
  await page.getByRole('button', { name: 'Enregistrer l’indice', exact: true }).click();
  await saved(page);
  await page.getByRole('button', { name: 'Révision programmée', exact: true }).click();
  await expect(page).toHaveURL(/\/study\?document=/);
  await expect(page.getByRole('status')).toContainText('2 passage(s)');
  await page.getByRole('button', { name: 'Commencer la révision', exact: true }).click();
  await expect(page).toHaveURL(/\/study\/session\//);
  const sessionURL = page.url();
  await page.getByRole('button', { name: 'Révéler la réponse', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: '3 · Moyen' })).toBeVisible();
  await page.route(
    '**/api/learning/sessions/*/items/*/rate',
    async (route) => {
      await route.fetch();
      await route.abort('failed');
    },
    { times: 1 },
  );
  await page.getByRole('button', { name: '3 · Moyen' }).click();
  await expect(page.getByRole('button', { name: 'Réessayer l’envoi' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('status')).toContainText('1 / 2');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Révéler la réponse', exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
  expect(overflow).toBe(false);
  await page.getByRole('document', { name: 'Document de révision' }).click();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: '4 · Facile' })).toBeVisible();
  await page.getByRole('document', { name: 'Document de révision' }).click();
  await page.keyboard.press('4');
  await expect(page.getByRole('heading', { name: 'Séance terminée.' })).toBeVisible();
  passages = await (await page.request.get(`/api/documents/${id}/anchors`)).json();
  expect(passages.map((p: any) => p.card.reps)).toEqual([1, 1]);
  for (const p of passages) {
    const history = await (await page.request.get(`/api/anchors/${p.id}/reviews`)).json();
    expect(history).toHaveLength(1);
  }
  await page.request.post('/api/auth/sign-out', {
    data: {},
    headers: { Origin: new URL(page.url()).origin },
  });
  await page.goto('/');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrer dans mon laboratoire' }).click();
  await expect(page).toHaveURL(/\/library$/);
  await page.goto(sessionURL);
  await expect(page.getByRole('heading', { name: 'Séance terminée.' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mission-2-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
});
test('les écrans Neon emploient les codes pour confirmation et récupération', async ({ page }) => {
  await page.route('**/api/config', (r) =>
    r.fulfill({ json: { local: false, google: true, email: true, managed: true } }),
  );
  await page.route('**/api/auth/sign-up/email', (r) =>
    r.fulfill({ json: { user: { id: crypto.randomUUID() }, token: null } }),
  );
  await page.route('**/api/auth/email-otp/request-password-reset', (r) =>
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
  await page.getByRole('button', { name: 'Envoyer le code de récupération' }).click();
  await expect(page.getByLabel('Code reçu par email')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Changer le mot de passe' })).toBeVisible();
});
