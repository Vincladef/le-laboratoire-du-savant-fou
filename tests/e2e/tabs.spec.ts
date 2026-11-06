import { test, expect } from './fixtures';
import { readFile, readdir } from 'node:fs/promises';
import { documentMenu, navigation } from './navigation';
test('Bristol : onglets, sous-onglets, renommage, duplication, retour mobile, export intégral et restauration', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const email = `tabs-${crypto.randomUUID()}@example.test`,
    password = 'Bristol-Onglets-Password-42!';
  await page.goto('/');
  await page.getByRole('button', { name: 'Créer mon espace' }).click();
  await page.getByLabel('Votre nom').fill('Camille Bristol');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Créer mon compte', exact: true }).click();
  let mail: { url: string } | undefined;
  await expect
    .poll(async () => {
      const entries = await Promise.all(
        (await readdir(`${process.env.LAB_E2E_DIR}/mail`).catch(() => [])).map(async (f) =>
          readFile(`${process.env.LAB_E2E_DIR}/mail/${f}`, 'utf8').then((s) => {
            try {
              return JSON.parse(s);
            } catch {
              return null;
            }
          }),
        ),
      );
      mail = entries.find((m) => m?.to === email);
      return !!mail;
    })
    .toBe(true);
  await page.goto(mail!.url);
  await page.getByRole('button', { name: 'Nouveau document', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Contenu du document' });
  await editor.fill('Premier contenu à conserver.');
  await editor.press('ControlOrMeta+a');
  await page.getByRole('button', { name: 'Gras (Ctrl+B)', exact: true }).click();
  await page.getByRole('button', { name: 'Créer un texte à trous', exact: true }).click();
  await editor.locator('[data-memory-id]').first().click();
  await page.getByLabel('Indice facultatif').fill('Indice de contrôle');
  await page
    .getByRole('region', { name: 'Réglages du passage' })
    .getByRole('button', { name: 'Enregistrer', exact: true })
    .click();
  await expect(page.locator('.save-state')).toHaveText('Enregistré');
  const url = page.url(),
    id = url.split('/').pop()!;
  await expect(page.getByRole('button', { name: 'Plan du document', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await page.getByRole('button', { name: 'Ajouter un onglet', exact: true }).click();
  await expect(editor).not.toContainText('Premier contenu');
  await editor.fill('Deuxième contenu indépendant.');
  await page.getByLabel('Titre du document').fill('Carnet à onglets');
  await editor.focus();
  await expect(page.locator('.save-state')).toHaveText('Enregistré');
  await page.getByRole('button', { name: 'Onglet 1', exact: true }).click();
  await expect(editor.locator('strong')).toHaveText('Premier contenu à conserver.');
  await page.getByRole('button', { name: 'Onglet 2', exact: true }).click();
  await expect(editor).toContainText('Deuxième contenu indépendant.');
  await page.getByLabel('Options de l’onglet Onglet 2', { exact: true }).click();
  await page.getByRole('button', { name: 'Renommer', exact: true }).click();
  await page.getByLabel('Nom de l’onglet', { exact: true }).fill('Observations');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByLabel('Options de l’onglet Observations', { exact: true }).click();
  await page.getByRole('button', { name: 'Ajouter un sous-onglet', exact: true }).click();
  await editor.fill('Mesure dans un sous-onglet.');
  await expect(page.locator('.save-state')).toHaveText('Enregistré');
  await page.getByLabel('Options de l’onglet Onglet 1', { exact: true }).click();
  await page.getByRole('button', { name: 'Dupliquer', exact: true }).click();
  await expect(editor.locator('strong')).toHaveText('Premier contenu à conserver.');
  await expect(page.locator('.save-state')).toHaveText('Enregistré');
  const stored = await (await page.request.get(`/api/documents/${id}`)).json();
  expect(stored.content.content).toHaveLength(4);
  const anchors = await (await page.request.get(`/api/documents/${id}/anchors`)).json();
  expect(anchors).toHaveLength(2);
  expect(new Set(anchors.map((a: any) => a.id)).size).toBe(2);
  expect(anchors.some((a: any) => a.sourceId)).toBe(true);
  // Changing tabs must not make Ctrl+Z import the previous tab's content.
  await page.getByRole('button', { name: 'Observations', exact: true }).click();
  await editor.press('ControlOrMeta+z');
  await expect(editor).toContainText('Deuxième contenu indépendant.');
  await expect(editor).not.toContainText('Premier contenu');
  await page.reload();
  await expect(editor).toContainText('Deuxième contenu indépendant.');
  await page.screenshot({ path: info.outputPath('onglets-desktop.png'), fullPage: true });
  await documentMenu(page);
  await page.getByRole('button', { name: 'Exporter', exact: true }).click();
  await page.evaluate(() => {
    window.print = () => {
      (window as any).__printed = document.querySelector('.print-document')?.textContent;
    };
  });
  await page.getByRole('button', { name: 'PDF / impression', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__printed || ''))
    .toContain('Mesure dans un sous-onglet.');
  expect(await page.evaluate(() => (window as any).__printed)).toContain(
    'Premier contenu à conserver.',
  );
  await page.getByRole('button', { name: 'Réviser ce document', exact: true }).click();
  const study = page.getByRole('document', { name: 'Document de révision' });
  await expect(study).toContainText('Deuxième contenu indépendant.');
  await expect(study).toContainText('Mesure dans un sous-onglet.');
  await expect(page.locator('.review-reveal')).toHaveCount(2);
  await page.goto(url);
  await page.setViewportSize({ width: 390, height: 844 });
  if (
    (await page
      .getByRole('button', { name: 'Plan du document', exact: true })
      .getAttribute('aria-expanded')) === 'false'
  )
    await page.getByRole('button', { name: 'Plan du document', exact: true }).click();
  await page.getByRole('button', { name: 'Onglet 3', exact: true }).click();
  await expect(editor).toContainText('Mesure dans un sous-onglet.');
  await page.getByRole('button', { name: 'Plan du document', exact: true }).click();
  await page.screenshot({ path: info.outputPath('onglets-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(
    true,
  );
  await navigation(page);
  await page.getByRole('button', { name: 'Déconnexion', exact: true }).click();
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Me connecter', exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  await page.goto(url);
  await expect(editor).toContainText('Mesure dans un sous-onglet.');
  await page.setViewportSize({ width: 1440, height: 1000 });
  const toggle = page.getByRole('button', { name: 'Plan du document', exact: true });
  // Wait for the desktop preference instead of clicking during the resize transition.
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const restoredRevision = (await (await page.request.get(`/api/documents/${id}`)).json()).revision;
  await page.getByLabel('Options de l’onglet Observations', { exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Supprimer l’onglet', exact: true }).click();
  await expect(page.locator('.save-state')).toHaveText('Enregistré');
  expect(
    (await (await page.request.get(`/api/documents/${id}`)).json()).content.content,
  ).toHaveLength(2);
  await documentMenu(page);
  await page.getByRole('button', { name: 'Historique', exact: true }).click();
  await page
    .locator('.version-item')
    .filter({ has: page.getByText(`Version ${restoredRevision}`, { exact: true }) })
    .click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Restaurer cette version', exact: true }).click();
  await expect(page.locator('.save-state')).toHaveText('Enregistré');
  expect(
    (await (await page.request.get(`/api/documents/${id}`)).json()).content.content,
  ).toHaveLength(4);
  await page.getByRole('button', { name: 'Fermer l’historique', exact: true }).click();
  await page.getByRole('button', { name: 'Onglet 1', exact: true }).click();
  await editor.press('ControlOrMeta+a');
  const originalId = await editor
    .locator('[data-memory-id]')
    .first()
    .getAttribute('data-memory-id');
  await editor.evaluate((el) => {
    const data = new DataTransfer();
    el.dispatchEvent(
      new ClipboardEvent('cut', { clipboardData: data, bubbles: true, cancelable: true }),
    );
    (window as any).__tabClipboard = data;
  });
  await page.getByRole('button', { name: 'Observations', exact: true }).click();
  await editor.press('ControlOrMeta+End');
  await editor.evaluate((el) =>
    el.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: (window as any).__tabClipboard,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expect(editor.locator(`[data-memory-id="${originalId}"]`)).toContainText(
    'Premier contenu à conserver.',
  );
  await expect(page.locator('.save-state')).toHaveText('Enregistré');
  await editor.evaluate((el) =>
    el.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: (window as any).__tabClipboard,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expect(page.locator('.save-state')).toHaveText('Enregistré');
  const afterPaste = await (await page.request.get(`/api/documents/${id}/anchors`)).json();
  expect(afterPaste.filter((a: any) => a.status !== 'deleted')).toHaveLength(3);
  expect(afterPaste.filter((a: any) => a.id === originalId)).toHaveLength(1);
  await page.getByRole('button', { name: 'Concentration', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Quitter la concentration', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.workspace-global-header')).not.toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.workspace-global-header')).toHaveCount(0);
  await expect(page.locator('.editor-header')).toBeVisible();
  await page.getByRole('button', { name: 'Revenir à la bibliothèque', exact: true }).click();
  await page.getByLabel('Options de Carnet à onglets', { exact: true }).click();
  await page.getByRole('button', { name: 'Dupliquer', exact: true }).click();
  await expect(page.locator('.document-card')).toHaveCount(2);
  const rows = await (await page.request.get('/api/documents')).json();
  expect(rows.every((d: any) => d.passageCount === 3)).toBe(true);
  await page.screenshot({ path: info.outputPath('bibliotheque-bristol.png'), fullPage: true });
  const long = await page.request.post('/api/documents', {
    headers: { Origin: 'http://localhost:5174' },
    data: {
      title: 'Navigation volumineuse',
      content: {
        type: 'doc',
        content: Array.from({ length: 30 }, (_, index) => ({
          type: 'documentTab',
          attrs: { id: crypto.randomUUID(), title: `Partie ${index + 1}`, parentId: null },
          content:
            index === 0
              ? Array.from({ length: 25 }, (_, n) => ({
                  type: 'heading',
                  attrs: { level: 2 },
                  content: [{ type: 'text', text: `Titre ${n + 1}` }],
                }))
              : [{ type: 'paragraph', content: [{ type: 'text', text: `Contenu ${index + 1}` }] }],
        })),
      },
    },
  });
  expect(long.status()).toBe(201);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/document/${(await long.json()).id}`);
  const navigationToggle = page.getByRole('button', { name: 'Plan du document', exact: true });
  if ((await navigationToggle.getAttribute('aria-expanded')) === 'false')
    await navigationToggle.click();
  const outlinePanel = page.getByRole('complementary', { name: 'Plan du document' });
  await expect(outlinePanel).toBeVisible();
  const dimensions = await outlinePanel.evaluate((el) => ({
    visible: el.clientHeight,
    content: el.scrollHeight,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.visible + 2);
  await page.getByRole('button', { name: 'Partie 30', exact: true }).click();
  await expect(editor).toContainText('Contenu 30');
  await page.screenshot({ path: info.outputPath('navigation-longue-mobile.png'), fullPage: true });
});
