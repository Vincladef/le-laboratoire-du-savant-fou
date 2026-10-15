import { test, expect } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
test('formules publiques, informations légales, abonnement privé et ventes fermées sans Stripe', async ({
  page,
}) => {
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: 'Les formules du laboratoire' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pro', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Premium', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'CGV', exact: true }).click();
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
  await page.getByRole('checkbox').nth(0).check();
  await page.getByRole('checkbox').nth(1).check();
  await expect(page.getByRole('button', { name: 'Choisir Pro', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Résilier en ligne', exact: true })).toBeDisabled();
  const direct = await page.request.post('/api/billing/checkout', {
    headers: { Origin: 'http://localhost:5174' },
    data: {
      plan: 'pro',
      requestId: crypto.randomUUID(),
      accepted: true,
      immediateAccess: true,
      termsVersion: 'missing',
      offerVersion: '2026-10-15-v1',
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
