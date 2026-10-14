import { test, expect, type Page } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import { makeDocx } from '../../src/editor/docx-export';
import { defaultLayout } from '../../src/shared/document';
import { PDFDocument } from 'pdf-lib';
const password = 'Browser-Validation-Password42!';
async function register(page: Page) {
  const email = `browser-${crypto.randomUUID()}@example.test`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Créer mon espace' }).click();
  await page.getByLabel('Votre nom').fill('Camille Recherche');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('status')).toContainText('lien de confirmation');
  let mail: { url: string } | undefined;
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
  await page.goto(mail!.url);
  await expect(page).toHaveURL(/\/library$/);
  return email;
}
async function newDocument(page: Page) {
  await page.getByRole('button', { name: 'Nouveau document', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Contenu du document' })).toBeVisible();
}
async function saved(page: Page) {
  await expect(page.locator('.save-state')).toHaveText('Enregistré', { timeout: 20000 });
}
test('inscription, écriture riche, versions, DOCX, PDF et persistance après reconnexion', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const email = await register(page);
  await page.getByRole('button', { name: 'Nouveau dossier', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Nom', { exact: true }).fill('Carnets de physique');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.locator('.folder-card')).toContainText('Carnets de physique');
  await newDocument(page);
  await page.getByLabel('Titre du document').fill('Les expériences de Camille');
  const editor = page.getByRole('textbox', { name: 'Contenu du document' });
  await editor.fill('Première observation scientifique.');
  await editor.press('ControlOrMeta+a');
  await page.getByRole('button', { name: 'Gras (Ctrl+B)', exact: true }).click();
  await expect(editor.locator('strong')).toHaveText('Première observation scientifique.');
  await page.getByLabel('Police', { exact: true }).selectOption('Georgia');
  await page.getByLabel('Taille de police', { exact: true }).selectOption('14pt');
  await page.getByLabel('Interligne', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: 'Centrer', exact: true }).click();
  await expect(editor.locator('p')).toHaveCSS('text-align', 'center');
  await editor.press('ArrowRight');
  await editor.press('End');
  await editor.press('Enter');
  await page.getByLabel('Style de paragraphe').selectOption('h2');
  await page.keyboard.type('Les résultats');
  await expect(editor.locator('h2')).toHaveText('Les résultats');
  await editor.press('End');
  await editor.press('Enter');
  await page.getByLabel('Style de paragraphe').selectOption('paragraph');
  await page.keyboard.type('Le phénomène est reproductible.');
  await page.getByRole('button', { name: 'Rechercher et remplacer (Ctrl+F)', exact: true }).click();
  await page.getByLabel('Texte à rechercher').fill('reproductible');
  await page.getByLabel('Texte de remplacement').fill('mesurable');
  await page.getByRole('button', { name: 'Tout remplacer', exact: true }).click();
  await expect(editor).toContainText('mesurable');
  await page.getByRole('button', { name: 'Fermer la recherche' }).click();
  await editor.press('ControlOrMeta+End');
  await editor.press('Enter');
  await page.getByRole('button', { name: 'Insérer un tableau', exact: true }).click();
  await expect(editor.locator('table')).toBeVisible();
  await expect(editor.locator('tr')).toHaveCount(3);
  await page.getByRole('button', { name: '+ Ligne', exact: true }).click();
  await expect(editor.locator('tr')).toHaveCount(4);
  await editor.press('ControlOrMeta+End');
  await editor.press('ArrowDown');
  await editor.press('Enter');
  await page.getByRole('button', { name: 'Insérer ou modifier une équation', exact: true }).click();
  await page.getByLabel('Expression LaTeX').fill('E = mc^2');
  await page.getByRole('button', { name: 'Appliquer', exact: true }).click();
  await expect(editor.locator('.katex')).toBeVisible();
  await editor.press('ControlOrMeta+End');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 80;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#294e41';
    context.fillRect(0, 0, 120, 80);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('input[accept="image/png,image/jpeg,image/webp"]').setInputFiles({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(editor.locator('img[src^="/api/assets/"]')).toBeVisible();
  await saved(page);
  await page.getByRole('button', { name: 'Saut de page (Ctrl+Entrée)', exact: true }).click();
  await page.keyboard.type('Deuxième page.');
  await saved(page);
  await page.getByRole('button', { name: 'Historique', exact: true }).click();
  await expect(page.locator('.version-item')).not.toHaveCount(0);
  await page.getByRole('button', { name: 'Fermer l’historique' }).click();
  await page.screenshot({ path: testInfo.outputPath('editor.png'), fullPage: true });
  const pdf = await page.pdf({
    preferCSSPageSize: true,
    printBackground: true,
    path: testInfo.outputPath('document.pdf'),
  });
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  expect(pdf.length).toBeGreaterThan(6000);
  const parsedPDF = await PDFDocument.load(pdf);
  expect(parsedPDF.getPageCount()).toBeGreaterThanOrEqual(2);
  expect(parsedPDF.getPage(0).getWidth()).toBeCloseTo(595, -1);
  await page.getByRole('button', { name: 'Exporter', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Document Word (.docx)', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(testInfo.outputPath('document.docx'));
  expect(download.suggestedFilename()).toBe('Les expériences de Camille.docx');
  const url = page.url();
  await page.getByRole('button', { name: 'Revenir à la bibliothèque' }).click();
  await expect(
    page.getByRole('heading', { name: 'Les expériences de Camille' }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Déconnexion', exact: true }).click();
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrer dans mon laboratoire' }).click();
  await expect(page).toHaveURL(/\/library$/);
  await page.goto(url);
  await expect(editor).toContainText('Première observation scientifique.');
  await expect(editor.locator('table')).toBeVisible();
  await expect(editor.locator('img[src^="/api/assets/"]')).toBeVisible();
  expect(errors).toEqual([]);
});
test('conflit entre deux onglets et récupération après coupure réseau', async ({
  page,
  context,
}) => {
  await register(page);
  await newDocument(page);
  const editor = page.getByRole('textbox', { name: 'Contenu du document' });
  await editor.fill('Version initiale');
  await saved(page);
  const url = page.url();
  const second = await context.newPage();
  await second.goto(url);
  const secondEditor = second.getByRole('textbox', { name: 'Contenu du document' });
  await expect(secondEditor).toContainText('Version initiale');
  await secondEditor.fill('Une modification sur un autre appareil');
  await saved(second);
  await editor.fill('Le travail local à conserver');
  await expect(page.locator('.conflict-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Conserver ma version dans un nouveau document' }).click();
  await expect(page).not.toHaveURL(url);
  await expect(editor).toHaveText('Le travail local à conserver');
  const copyURL = page.url();
  const id = copyURL.split('/').pop()!;
  await page.route(`**/api/documents/${id}`, (route) =>
    route.request().method() === 'PUT' ? route.abort() : route.continue(),
  );
  await editor.fill('Modifications sauvées hors connexion');
  await expect(page.locator('.save-state')).toContainText('Hors connexion');
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await expect(page.getByText('Une copie locale attend d’être récupérée.')).toBeVisible();
  await page.unroute(`**/api/documents/${id}`);
  await page.getByRole('button', { name: 'Récupérer', exact: true }).click();
  await saved(page);
  await page.reload();
  await expect(editor).toHaveText('Modifications sauvées hors connexion');
  await second.close();
});
test('import DOCX réel, listes, liens, copier-coller enrichi et vue mobile', async ({
  page,
}, testInfo) => {
  await register(page);
  await newDocument(page);
  const source = await makeDocx(
    'Import scientifique',
    {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Un document Word' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Texte important', marks: [{ type: 'bold' }] }],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Une expérience' }] }],
            },
          ],
        },
      ],
    },
    defaultLayout,
  );
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  await page.locator('input[accept=".docx,.json"]').setInputFiles({
    name: 'Import scientifique.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from(await source.arrayBuffer()),
  });
  const editor = page.getByRole('textbox', { name: 'Contenu du document' });
  await expect(editor.locator('h1')).toHaveText('Un document Word');
  await expect(editor.locator('strong')).toHaveText('Texte important');
  await expect(editor.locator('li')).toHaveText('Une expérience');
  await editor.press('ControlOrMeta+End');
  await editor.press('Enter');
  await editor.press('Enter');
  await page.getByRole('button', { name: 'Cases à cocher', exact: true }).click();
  await page.keyboard.type('Vérifier les résultats');
  await expect(editor.locator('input[type=checkbox]')).toBeVisible();
  await editor.locator('input[type=checkbox]').check();
  await editor.press('ControlOrMeta+End');
  await editor.press('Enter');
  await editor.press('Enter');
  await page.keyboard.type('Documentation');
  await editor.press('ControlOrMeta+Shift+ArrowLeft');
  await page.getByRole('button', { name: 'Insérer ou modifier un lien', exact: true }).click();
  await page.getByLabel('Adresse du lien').fill('https://example.org');
  await page.getByRole('button', { name: 'Appliquer', exact: true }).click();
  await expect(editor.locator('a[href="https://example.org"]')).toBeVisible();
  await editor.press('ControlOrMeta+End');
  await editor.press('Enter');
  await editor.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.setData('text/html', '<p><strong>Collage enrichi</strong> et <em>italique</em></p>');
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }),
    );
  });
  await expect(editor).toContainText('Collage enrichi');
  await expect(editor.locator('em')).toContainText('italique');
  await saved(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(editor).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
  await page.goto('/library');
  const search = page.getByRole('textbox', { name: 'Rechercher dans les documents' });
  await expect(search).toBeVisible();
  await search.fill('Un document Word');
  await expect(page.getByRole('heading', { name: 'Résultats de recherche 1' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('mobile-library.png'), fullPage: true });
});
