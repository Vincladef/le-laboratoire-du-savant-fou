import { documentMenu, reviewMenu, navigation } from './navigation';
import { test, expect } from './fixtures';
import { readdir, readFile } from 'node:fs/promises';
test('liens Stripe directs, conditions discrètes et droits privés non falsifiables', async ({
  page,
}) => {
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: 'Les formules Bouche-trou' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pro', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Premium', exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Choisir Pro (Stripe, nouvel onglet)', exact: true }),
  ).toHaveAttribute('href', 'https://buy.stripe.com/14AcN40XQ29egaJ4ymffy0R');
  await expect(
    page.getByRole('link', { name: 'Choisir Premium (Stripe, nouvel onglet)', exact: true }),
  ).toHaveAttribute('href', 'https://buy.stripe.com/9B6fZg4a25lq1fPc0Offy0S');
  const legal = page.getByRole('button', { name: 'CGU & confidentialité' });
  await legal.click();
  await expect(page.getByRole('dialog', { name: 'Informations et conditions' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(legal).toBeFocused();
  await legal.click();
  await page.getByRole('link', { name: 'Conditions générales de vente', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Document préparatoire');
  await page.goto('/');
  const email = `billing-browser-${crypto.randomUUID()}@example.test`;
  await page.getByRole('button', { name: 'Créer mon espace' }).click();
  await page.getByLabel('Votre nom').fill('Facturation navigateur');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill('Billing-Browser-Test-42!');
  await page.getByRole('button', { name: 'Créer mon compte', exact: true }).click();
  let mail: any;
  await expect
    .poll(async () => {
      const entries = await Promise.all(
        (await readdir(`${process.env.LAB_E2E_DIR}/mail`).catch(() => [])).map(async (f) =>
          JSON.parse(await readFile(`${process.env.LAB_E2E_DIR}/mail/${f}`, 'utf8')),
        ),
      );
      mail = entries.find((e) => e.to === email);
      return Boolean(mail);
    })
    .toBe(true);
  await page.goto(mail.url);
  await expect(page).toHaveURL(/\/library$/);
  await page.getByRole('button', { name: 'Mon abonnement', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Formule Gratuit' })).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Choisir Pro (Stripe, nouvel onglet)', exact: true }),
  ).toHaveAttribute('target', '_blank');
  await expect(
    page.getByText('payer via ces liens ne débloque pas automatiquement', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gérer ou résilier mon abonnement' })).toHaveCount(
    0,
  );
  const direct = await page.request.post('/api/billing/checkout', {
    headers: { Origin: 'http://localhost:5174' },
    data: {
      plan: 'pro',
      requestId: crypto.randomUUID(),
      accepted: true,
      immediateAccess: true,
      termsVersion: 'missing',
      offerVersion: '2026-10-15-v2',
    },
  });
  expect(direct.status()).toBe(503);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(
    true,
  );
  await page.goto('/admin');
  await expect(page.getByRole('alert').first()).toContainText('réservée au propriétaire');
  expect(await page.getByText(email, { exact: true }).count()).toBe(0);
});
