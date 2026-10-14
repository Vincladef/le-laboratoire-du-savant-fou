import path from 'node:path';

export function getConfig() {
  const development =
    process.env.LAB_LOCAL === '1' && process.env.NODE_ENV !== 'production' && !process.env.NETLIFY;
  const baseURL = process.env.AUTH_BASE_URL || (development ? 'http://localhost:5173' : '');
  const secret =
    process.env.BETTER_AUTH_SECRET ||
    (development ? 'local-development-only-secret-not-valid-in-production-123456789' : '');
  if (!baseURL || !secret || secret.length < 32)
    throw new Error('AUTH_BASE_URL et BETTER_AUTH_SECRET (32 caractères minimum) sont requis.');
  if (!development && (!baseURL.startsWith('https://') || !process.env.DATABASE_URL))
    throw new Error('Production : URL HTTPS et DATABASE_URL requis.');
  return {
    development,
    baseURL: new URL(baseURL).origin,
    secret,
    localDir: path.resolve(process.env.LAB_LOCAL_DIR || '.local'),
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    mail: Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM),
  };
}
export type AppConfig = ReturnType<typeof getConfig>;
