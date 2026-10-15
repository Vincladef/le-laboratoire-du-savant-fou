import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';

// Public links supplied by the operator. Read-only inspection: never fill, submit, or pay.
export const suppliedStripeLinks = [
  'https://buy.stripe.com/14AcN40XQ29egaJ4ymffy0R',
  'https://buy.stripe.com/9B6fZg4a25lq1fPc0Offy0S',
];
export async function inspectStripeLinks() {
  if (process.env.LAB_INSPECT_STRIPE_LINKS !== '1') return null;
  if (
    process.env.NETLIFY !== 'true' ||
    process.env.CONTEXT !== 'branch-deploy' ||
    process.env.BRANCH !== 'mission-2'
  )
    throw new Error('Inspection des liens réservée au build de test autorisé.');
  await promisify(execFile)(
    process.execPath,
    ['node_modules/playwright/cli.js', 'install', 'chromium', '--only-shell'],
    { timeout: 180000, maxBuffer: 1024 * 1024 },
  );
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const results = [];
    for (const link of suppliedStripeLinks) {
      const page = await browser.newPage({ locale: 'fr-FR' });
      try {
        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForFunction(
          () => /€|EUR|désactivé|inactive|expired/i.test(document.body.innerText),
          {},
          { timeout: 30000 },
        );
        const text = await page.locator('body').innerText();
        const labels = [...new Set(text.match(/\b(Pro|Premium)\b/g) || [])];
        const priceLines = text
          .split('\n')
          .filter((line) => /€|\bEUR\b|par mois|per month|mensuel/i.test(line))
          .map((line) => line.trim().slice(0, 120))
          .slice(0, 8);
        results.push({
          link,
          labels,
          displayLines: text
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(0, 12)
            .map((line) => line.slice(0, 120)),
          priceLines,
          inspected: Boolean(labels.length && priceLines.length),
          testBanner: /mode test|test mode/i.test(text),
        });
      } catch {
        results.push({
          link,
          inspected: false,
          reason: 'Public page unreadable or challenge; no purchase attempted',
        });
      } finally {
        await page.close();
      }
    }
    return { mode: 'read-only-public-pages', results, authenticatedStripeApi: false };
  } finally {
    await browser.close();
  }
}
