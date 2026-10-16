import { documentMenu, reviewMenu, navigation } from '../tests/e2e/navigation';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';
export async function verifyHostedBrowser(
  origin: string,
  email: string,
  password: string,
  documentId: string,
) {
  if (
    process.env.NETLIFY !== 'true' ||
    process.env.LAB_VERIFY_PUBLISHED !== '1' ||
    process.env.LAB_VERIFY_BROWSER !== '1'
  )
    throw new Error('Recette navigateur hébergée non autorisée.');
  await promisify(execFile)(
    process.execPath,
    ['node_modules/playwright/cli.js', 'install', 'chromium', '--only-shell'],
    { timeout: 180000, maxBuffer: 1024 * 1024 },
  );
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const checks: string[] = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
      page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin, { timeout: 45000 });
    await expect(page.getByRole('button', { name: 'Continuer avec Google' })).toBeVisible();
    await page.getByLabel('Adresse email').fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Me connecter' }).click();
    await expect(page).toHaveURL(/\/library$/, { timeout: 30000 });
    checks.push('hosted-browser-neon-login');
    await page.goto(`${origin}/document/${documentId}`);
    const editor = page.getByRole('textbox', { name: 'Contenu du document' });
    await expect(editor).toBeVisible({ timeout: 30000 });
    await expect(
      page.getByRole('button', { name: 'Plan du document', exact: true }),
    ).toHaveAttribute('aria-expanded', 'false');
    const paper = page.locator('.document-paper');
    const paperBounds = await paper.boundingBox();
    if (!paperBounds || paperBounds.width < 850)
      throw new Error('Page trop étroite sur ordinateur');
    await page.getByRole('button', { name: 'Plan du document', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Plan du document' })).toBeVisible();
    await page.getByRole('button', { name: 'Masquer le plan', exact: true }).click();
    checks.push('hosted-browser-stationery-and-outline-toggle');
    await expect(editor.locator('strong')).toContainText('Une réponse');
    await expect(editor.locator('em')).toContainText('formatée');
    await editor.focus();
    await page.evaluate(() => {
      const root = document.querySelector('[aria-label="Contenu du document"]')!,
        walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode()))
        if (node.textContent === ' puis ') {
          const range = document.createRange();
          range.selectNodeContents(node);
          const s = window.getSelection()!;
          s.removeAllRanges();
          s.addRange(range);
          document.dispatchEvent(new Event('selectionchange'));
          return;
        }
      throw new Error('Sélection de contrôle introuvable');
    });
    await page.getByRole('button', { name: 'Créer un texte à trous', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByLabel('Indice facultatif')
      .fill('Ajout depuis le navigateur hébergé');
    await page.getByRole('button', { name: 'Créer le passage', exact: true }).click();
    await expect(page.locator('.save-state')).toHaveText('Enregistré', { timeout: 30000 });
    const anchors = await (
      await page.request.get(`${origin}/api/documents/${documentId}/anchors`)
    ).json();
    if (anchors.length !== 3) throw new Error('Annotation navigateur non persistée');
    checks.push('hosted-browser-create-rich-passage');
    await reviewMenu(page);
    await page.getByRole('button', { name: 'Révision libre', exact: true }).click();
    await expect(page).toHaveURL(/\/study\/free\//);
    await expect.poll(() => page.locator('.study-hidden').count()).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Révéler toutes les réponses' }).click();
    await expect(page.locator('.study-hidden')).toHaveCount(0);
    checks.push('hosted-browser-free-study');
    await page.goto(`${origin}/study?document=${documentId}`);
    await page.getByRole('button', { name: 'Commencer la révision', exact: true }).click();
    await expect(page).toHaveURL(/\/study\/session\//);
    const sessionURL = page.url();
    await page.getByRole('button', { name: 'Révéler la réponse', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: '3 · Moyen' })).toBeVisible();
    await page.getByRole('button', { name: '3 · Moyen' }).click();
    await expect(page.getByRole('status')).toContainText('1 / 2');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Révéler la réponse', exact: true }).click();
    await page.getByRole('button', { name: '4 · Facile' }).click();
    await expect(page.getByRole('heading', { name: 'Séance terminée.' })).toBeVisible();
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2))
      throw new Error('Débordement mobile');
    checks.push('hosted-browser-scheduled-fsrs-resume-mobile');
    await page.goto(`${origin}/document/${documentId}`);
    const plan = page.getByRole('button', { name: 'Plan du document', exact: true });
    if ((await plan.getAttribute('aria-expanded')) === 'false') await plan.click();
    await page.getByRole('button', { name: 'Ajouter un onglet', exact: true }).click();
    await editor.fill('Onglet publié et conservé dans Neon.');
    await expect(page.locator('.save-state')).toHaveText('Enregistré', { timeout: 30000 });
    const tabRecord = await (
      await page.request.get(`${origin}/api/documents/${documentId}`)
    ).json();
    if (
      tabRecord.content.content.length !== 2 ||
      tabRecord.content.content[0].type !== 'documentTab'
    )
      throw new Error('Onglets non enregistrés via le navigateur');
    await page.reload();
    await expect(editor).toContainText('Onglet publié et conservé dans Neon.');
    checks.push('hosted-browser-document-tabs-persistence');
    await page.goto(`${origin}/library`);
    await navigation(page);
    await page.getByRole('button', { name: 'Déconnexion', exact: true }).click();
    await page.getByLabel('Adresse email').fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Me connecter' }).click();
    await expect(page).toHaveURL(/\/library$/);
    await page.goto(`${origin}/document/${documentId}`);
    await expect(editor).toContainText('Onglet publié et conservé dans Neon.');
    await page.goto(sessionURL);
    await expect(page.getByRole('heading', { name: 'Séance terminée.' })).toBeVisible();
    checks.push('hosted-browser-relogin-persistence');
    if (process.env.LAB_VERIFY_BILLING === '1') {
      await page.goto(`${origin}/billing`);
      await expect(
        page.getByRole('heading', { name: 'Mon abonnement', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Formule Gratuit', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Choisir Pro (Stripe, nouvel onglet)', exact: true }),
      ).toHaveAttribute('href', 'https://buy.stripe.com/14AcN40XQ29egaJ4ymffy0R');
      await expect(
        page.getByRole('link', { name: 'Choisir Premium (Stripe, nouvel onglet)', exact: true }),
      ).toHaveAttribute('href', 'https://buy.stripe.com/9B6fZg4a25lq1fPc0Offy0S');
      await expect(page.getByRole('checkbox')).toHaveCount(0);
      await page.getByRole('button', { name: 'CGU & confidentialité' }).click();
      await expect(page.getByRole('dialog', { name: 'Informations et conditions' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.goto(`${origin}/legal/mentions`);
      await expect(
        page.getByRole('heading', { name: 'Mentions légales', exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('status')).toContainText('Document préparatoire');
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2))
        throw new Error('Débordement mobile des pages commerciales');
      checks.push('hosted-browser-stripe-links-legal-popup-and-mobile');
    }
    if (errors.length) throw new Error(`Erreurs JavaScript navigateur : ${errors.length}`);
    return { passed: checks.length, checks, viewport: 'desktop-and-390x844', javascriptErrors: 0 };
  } finally {
    await browser.close();
  }
}
