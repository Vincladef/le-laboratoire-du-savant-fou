import { test, expect } from './fixtures';

test('le favicon reprend le symbole Bouche-trou et se charge comme une image SVG', async ({ page }) => {
  await page.goto('/');
  const icon = page.locator('link[rel="icon"]');
  await expect(icon).toHaveAttribute('href', '/favicon.svg');
  await expect(icon).toHaveAttribute('type', 'image/svg+xml');
  const response = await page.request.get('/favicon.svg');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/svg+xml');
  expect(await response.text()).toContain('<title>Bouche-trou</title>');
  expect(
    await page.evaluate(async () => {
      const image = new Image();
      image.src = document.querySelector<HTMLLinkElement>('link[rel="icon"]')!.href;
      await image.decode();
      return image.naturalWidth > 0 && image.naturalHeight > 0;
    }),
  ).toBe(true);
});
