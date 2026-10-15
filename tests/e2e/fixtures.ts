import { test as base, expect } from '@playwright/test';
import { createHash } from 'node:crypto';

// Each local browser represents an independent client. Keep real auth rate limits enabled;
// don't make a growing suite consume a single client's signup budget in under a minute.
export const test = base.extend({
  context: async ({ context, baseURL }, use, info) => {
    if (baseURL !== 'http://localhost:5174')
      throw new Error('Fixtures réservées à la recette locale.');
    const hash = createHash('sha256').update(info.testId).digest();
    await context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.${hash[0]}.${hash[1]}` });
    await use(context);
  },
});
export { expect };
