import { navigation, filterReview, revealIndividually } from '../tests/e2e/navigation';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, expect as baseExpect, type Page } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 30000 });
import { authRetryDelay, waitForAuthWindow } from './auth-retry';
async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  for (let attempt = 0; ; attempt++) {
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith('/api/auth/sign-in/email') && r.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Me connecter', exact: true }).click(),
    ]);
    // Playwright joins Set-Cookie entries with newlines in allHeaders(). Never
    // reconstruct a Headers object from it; only Retry-After is needed here.
    const retryAfter = await response.headerValue('retry-after');
    const delay = authRetryDelay(
      { status: response.status(), headers: { get: () => retryAfter } },
      attempt,
    );
    if (delay === null) {
      if (response.status() !== 200)
        throw new Error('Connexion navigateur refusée HTTP ' + response.status());
      break;
    }
    console.log('HOSTED_AUTH_LIMIT_WAIT', JSON.stringify({ delayMs: delay, attempt: attempt + 1 }));
    await waitForAuthWindow(delay);
  }
}
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
    await expect(page.locator('.brand-wordmark small')).toHaveCount(0);
    await expect(page.getByText('L’ATELIER DE VOS CONNAISSANCES', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Un espace à vous pour écrire/)).toHaveCount(0);
    await expect(page.getByText(/Vos documents vous attendent/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Continuer avec Google' })).toBeVisible();
    await signIn(page, email, password);
    await expect(page).toHaveURL(/\/library$/, { timeout: 30000 });
    checks.push('hosted-browser-neon-login');
    await page.goto(`${origin}/document/${documentId}`);
    const editor = page.getByRole('textbox', { name: 'Contenu du document' });
    await expect(editor).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.workspace-global-header')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Outils', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Police', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Plan du document', exact: true }),
    ).toHaveAttribute('aria-expanded', 'true');
    const paper = page.locator('.document-paper');
    const paperBounds = await paper.boundingBox();
    if (!paperBounds || paperBounds.width < 740)
      throw new Error('Page trop étroite sur ordinateur');
    await expect(page.getByRole('complementary', { name: 'Plan du document' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Plan du document', exact: true })).toHaveText(
      'Plan',
    );
    await expect(page.locator('.editor-header-actions .outline-toggle')).toHaveCount(0);
    await expect(page.locator('.document-tab-item .tab-headings')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Masquer le plan', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Plan du document', exact: true }).click();
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
    await editor.locator('[data-memory-id]').filter({ hasText: ' puis ' }).click();
    await page
      .getByRole('region', { name: 'Réglages du passage' })
      .getByLabel('Indice facultatif')
      .fill('Ajout depuis le navigateur hébergé');
    await page
      .getByRole('region', { name: 'Réglages du passage' })
      .getByRole('combobox', { name: 'Priorité', exact: true })
      .selectOption('medium');
    await page
      .getByRole('region', { name: 'Réglages du passage' })
      .getByRole('combobox', { name: 'Difficulté', exact: true })
      .selectOption('hard');
    await page
      .getByRole('region', { name: 'Réglages du passage' })
      .getByRole('button', { name: 'Enregistrer', exact: true })
      .click();
    await expect(page.getByRole('region', { name: 'Réglages du passage' })).toHaveCount(0);
    await expect(page.locator('.save-state')).toHaveText('Enregistré', { timeout: 30000 });
    const anchors = await (
      await page.request.get(`${origin}/api/documents/${documentId}/anchors`)
    ).json();
    if (anchors.length !== 3) throw new Error('Annotation navigateur non persistée');
    if (
      !anchors.some(
        (a: any) =>
          a.hint === 'Ajout depuis le navigateur hébergé' &&
          a.priority === 'medium' &&
          a.difficulty === 'hard',
      )
    )
      throw new Error('Priorité ou difficulté initiale non persistée');
    checks.push('hosted-browser-create-rich-passage');
    await page.getByRole('button', { name: 'Réviser ce document', exact: true }).click();
    await expect(page).toHaveURL(`${origin}/study/${documentId}`);
    await expect(page.locator('.review-reveal')).toHaveCount(3);
    await expect(page.getByLabel('Filtrer par priorité')).toContainText('Toutes');
    await expect(page.getByLabel('Filtrer par difficulté')).toContainText('Toutes');
    await expect(page.locator('.review-filter input:checked')).toHaveCount(7);
    await expect(page.getByRole('button', { name: 'Tout révéler', exact: true })).toHaveCount(0);
    await filterReview(page, 'priority', 'high');
    await expect(page.locator('.review-reveal')).toHaveCount(1);
    await page.getByRole('button', { name: 'Révéler le passage 1', exact: true }).click();
    await page.getByLabel('Évaluer la difficulté du passage 1', { exact: true }).click();
    await page.getByLabel('Difficulté du passage 1', { exact: true }).selectOption('easy');
    await expect(page.getByRole('status')).toHaveText('Difficulté enregistrée.');
    checks.push('hosted-browser-single-review-and-optional-difficulty');
    await filterReview(page, 'priority', 'all');
    await filterReview(page, 'difficulty', ['easy', 'hard']);
    await filterReview(page, 'priority', ['high', 'medium']);
    await expect(page.locator('.review-reveal')).toHaveCount(2);
    await filterReview(page, 'priority', 'all');
    await filterReview(page, 'difficulty', 'easy');
    await expect(page.locator('.review-reveal')).toHaveCount(1);
    await filterReview(page, 'priority', 'low');
    await expect(page.locator('.review-reveal')).toHaveCount(0);
    await filterReview(page, 'priority', 'all');
    await filterReview(page, 'difficulty', 'all');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.locator('.review-reveal')).toHaveCount(3);
    await revealIndividually(page);
    await expect(page.locator('.review-reveal')).toHaveCount(0);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2))
      throw new Error('Débordement mobile');
    checks.push('hosted-browser-combined-filters-and-mobile-reading');
    await page.goto(`${origin}/document/${documentId}`);
    const plan = page.getByRole('button', { name: 'Plan du document', exact: true });
    await expect(plan).toHaveAttribute('aria-expanded', 'false');
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
    await expect
      .poll(
        async () => {
          const stored = await (
            await page.request.get(`${origin}/api/documents/${documentId}`)
          ).json();
          return stored.viewState?.tabId;
        },
        { timeout: 30000 },
      )
      .toBe(tabRecord.content.content[1].attrs.id);
    await page.reload();
    await expect(editor).toContainText('Onglet publié et conservé dans Neon.');
    checks.push('hosted-browser-document-tabs-persistence');
    await page.goto(`${origin}/library`);
    await navigation(page);
    await page.getByRole('button', { name: 'Déconnexion', exact: true }).click();
    await signIn(page, email, password);
    await expect(page).toHaveURL(/\/library$/);
    await page.goto(`${origin}/document/${documentId}`);
    await expect(editor).toContainText('Onglet publié et conservé dans Neon.');
    await page.goto(`${origin}/study/${documentId}`);
    await expect(page.locator('.review-reveal')).toHaveCount(3);
    const persistedDifficulty = await (
      await page.request.get(`${origin}/api/documents/${documentId}/anchors`)
    ).json();
    if (persistedDifficulty.filter((p: any) => p.difficulty === 'easy').length !== 1)
      throw new Error('Difficulté perdue après reconnexion navigateur');
    checks.push('hosted-browser-relogin-persistence');
    await navigation(page);
    await page.getByRole('button', { name: 'Réglages', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Mon compte' })).toBeVisible();
    await expect(page.getByLabel('Fuseau horaire')).toHaveCount(0);
    await page.getByLabel('Nom affiché', { exact: true }).fill('Recette Bouche-trou simplifié');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Enregistrer', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await navigation(page);
    await page.getByRole('button', { name: 'Réglages', exact: true }).click();
    await expect(page.getByLabel('Nom affiché', { exact: true })).toHaveValue(
      'Recette Bouche-trou simplifié',
    );
    await page.keyboard.press('Escape');
    checks.push('hosted-browser-simplified-profile-and-managed-neon-update');
    const source = await (await page.request.get(`${origin}/api/documents/${documentId}`)).json();
    const longResponse = await page.request.post(`${origin}/api/documents`, {
      headers: { Origin: origin },
      data: {
        title: 'Contrôle défilement mobile',
        layout: source.layout,
        content: {
          type: 'doc',
          content: Array.from({ length: 100 }, (_, index) => ({
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: `Paragraphe ${index + 1}. Lecture et édition sur un document long, avec les commandes toujours accessibles.`,
              },
            ],
          })),
        },
      },
    });
    if (longResponse.status() !== 201) throw new Error('Document mobile de contrôle non créé');
    const longDocumentId = (await longResponse.json()).id;
    await page.goto(`${origin}/document/${longDocumentId}`);
    await expect(editor).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 2000));
    await expect
      .poll(async () => Math.round((await page.locator('.writing-tools').boundingBox())!.y))
      .toBe(0);
    await page.setViewportSize({ width: 390, height: 420 });
    await editor.locator('p').last().click();
    await editor.press('ControlOrMeta+End');
    await page.keyboard.type(' Saisie de contrôle en fin de document.');
    await expect(editor.locator('p').last()).toContainText(
      'Saisie de contrôle en fin de document.',
    );
    await expect
      .poll(() =>
        page.evaluate(() => {
          const range = getSelection()?.getRangeAt(0);
          if (!range) return false;
          const caret = range.getBoundingClientRect(),
            tools = document.querySelector('.writing-tools')!.getBoundingClientRect();
          return caret.top >= tools.bottom - 2 && caret.bottom <= innerHeight + 2;
        }),
      )
      .toBe(true);
    await expect(page.locator('.save-state')).toHaveText('Enregistré');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Ouvrir le menu', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Navigation principale' })
      .getByRole('button', { name: 'Réglages', exact: true })
      .click();
    await expect(page.getByRole('dialog', { name: 'Mon compte' })).toBeVisible();
    await page.keyboard.press('Escape');
    checks.push('hosted-browser-sticky-mobile-toolbar-and-navigation');
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const y of [2000, 5000]) {
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await expect
        .poll(async () => Math.round((await page.locator('.writing-tools').boundingBox())!.y))
        .toBe(0);
    }
    await editor.locator('p').last().click();
    await editor.press('ControlOrMeta+End');
    await page.keyboard.type(' Saisie sur ordinateur.');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const range = getSelection()?.getRangeAt(0);
          if (!range) return false;
          const caret = range.getBoundingClientRect(),
            tools = document.querySelector('.writing-tools')!.getBoundingClientRect();
          return caret.top >= tools.bottom - 2 && caret.bottom <= innerHeight + 2;
        }),
      )
      .toBe(true);
    await expect(page.locator('.save-state')).toHaveText('Enregistré');
    const savedLongDocument = await (
      await page.request.get(`${origin}/api/documents/${longDocumentId}`)
    ).json();
    if (!JSON.stringify(savedLongDocument.content).includes('Saisie sur ordinateur.'))
      throw new Error('Saisie ordinateur non persistée');
    checks.push('hosted-browser-sticky-desktop-toolbar-and-visible-caret');
    if (process.env.LAB_VERIFY_AI === '1') {
      // This account is a disposable fixture owned by verifyManagedAuth; its documents
      // are removed in that caller's finally block. Never open a real user's document.
      await page.goto(`${origin}/library`);
      await page.getByRole('button', { name: 'Nouveau document', exact: true }).click();
      await editor.fill(
        'La cellule est l’unité du vivant. Son noyau contient le matériel génétique.',
      );
      await expect(page.locator('.save-state')).toHaveText('Enregistré');
      const aiDocumentId = page.url().split('/').pop()!;
      await page.getByRole('button', { name: 'Ouvrir l’assistant IA', exact: true }).click();
      const assistant = page.getByRole('region', { name: 'Assistant IA', exact: true });

      await assistant.getByRole('button', { name: 'Proposer', exact: true }).click();
      await expect(assistant).toContainText('Proposition à vérifier', { timeout: 55000 });
      await expect(editor.locator('[data-memory-id]')).toHaveCount(0);
      await assistant.getByRole('button', { name: /^Appliquer \(/ }).click();
      await expect(page.locator('.save-state')).toHaveText('Enregistré');
      const beforeReload = await (
        await page.request.get(`${origin}/api/documents/${aiDocumentId}/anchors`)
      ).json();
      if (beforeReload.length < 1 || beforeReload[0].status !== 'active')
        throw new Error('Annotation IA réelle non persistée');
      await page.reload();
      await expect(editor.locator('[data-memory-id]').first()).toHaveAttribute(
        'data-memory-id',
        beforeReload[0].id,
      );
      checks.push('hosted-browser-real-openai-proposal-approval-and-stable-neon-identity');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: 'Ouvrir l’assistant IA', exact: true }).click();
      await assistant.getByLabel('Que souhaitez-vous faire ?').selectOption('compose-cloze');
      await assistant
        .getByLabel(/Vos consignes/)
        .fill('Écris une seule phrase sur la membrane cellulaire, avec un trou et un indice.');

      await assistant.getByRole('button', { name: 'Proposer', exact: true }).click();
      await expect(assistant).toContainText('Proposition à vérifier', { timeout: 55000 });
      const panelBounds = await assistant.boundingBox();
      if (!panelBounds || panelBounds.x < 0 || panelBounds.x + panelBounds.width > 391)
        throw new Error('Panneau IA mobile hors écran');
      await assistant.getByRole('button', { name: 'Appliquer', exact: true }).click();
      await expect(page.locator('.save-state')).toHaveText('Enregistré');
      const afterGeneration = await (
        await page.request.get(`${origin}/api/documents/${aiDocumentId}/anchors`)
      ).json();
      if (
        afterGeneration.length <= beforeReload.length ||
        !afterGeneration.some((p: any) => p.id === beforeReload[0].id)
      )
        throw new Error('Texte à trous IA ou annotation antérieure non conservés');
      checks.push('hosted-browser-real-openai-generated-cloze-mobile-and-preservation');
    }
    await page.setViewportSize({ width: 390, height: 844 });
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
    if (process.env.LAB_VERIFY_SHARING === '1') {
      await page.goto(`${origin}/document/${documentId}`);
      await page.getByRole('button', { name: 'Partager', exact: true }).click();
      const sharing = page.getByRole('complementary', { name: 'Partager le document' });
      await sharing.getByRole('button', { name: 'Créer le lien public' }).click();
      const link = await sharing.getByLabel('Lien public').inputValue();
      const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      try {
        const guest = await guestContext.newPage();
        await guest.goto(link);
        await expect(guest.getByRole('document', { name: 'Document de révision' })).toBeVisible();
        await expect(guest.locator('[contenteditable=true]')).toHaveCount(0);
        await guest.getByRole('button', { name: 'Onglet 1', exact: true }).click();
        await guest.getByRole('button', { name: 'Réviser', exact: true }).click();
        await guest.getByRole('button', { name: 'Révéler le passage 1', exact: true }).click();
        await expect(guest.locator('[contenteditable=true]')).toHaveCount(0);
        await guest.getByRole('link', { name: 'Créer un compte et obtenir ma copie' }).click();
        await signIn(guest, email, password);
        await expect(guest).toHaveURL(/\/document\//);
        await expect(guest.getByRole('textbox', { name: 'Contenu du document' })).toBeVisible();
        await sharing.getByRole('button', { name: 'Révoquer le lien' }).click();
        await guest.goto(link);
        await expect(
          guest.getByRole('heading', { name: 'Ce lien n’est plus disponible' }),
        ).toBeVisible();
        checks.push('public-share-anonymous-mobile-review-copy-login-and-revocation');
      } finally {
        await guestContext.close();
      }
    }
    if (errors.length) throw new Error(`Erreurs JavaScript navigateur : ${errors.length}`);
    return { passed: checks.length, checks, viewport: 'desktop-and-390x844', javascriptErrors: 0 };
  } finally {
    await browser.close();
  }
}
