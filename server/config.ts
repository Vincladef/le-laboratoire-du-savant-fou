import path from 'node:path';
import { readBillingConfig, type BillingConfig } from './billing/config';
import { readLegalConfig, type LegalConfig } from './legal';

export type AppConfig = {
  development: boolean;
  baseURL: string;
  secret: string;
  localDir: string;
  neonAuthURL?: string;
  ownerNeonSubject?: string;
  google: boolean;
  mail: boolean;
  billing?: BillingConfig;
  legal?: LegalConfig;
};
export function getConfig(): AppConfig {
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
  const neonAuthURL = development ? undefined : process.env.NEON_AUTH_BASE_URL;
  if (neonAuthURL) {
    const url = new URL(neonAuthURL);
    if (
      url.protocol !== 'https:' ||
      !url.hostname.endsWith('.neon.tech') ||
      !url.pathname.endsWith('/auth') ||
      url.search ||
      url.hash ||
      url.username
    )
      throw new Error('URL Neon Auth serveur invalide.');
  }
  return {
    development,
    baseURL: new URL(baseURL).origin,
    secret,
    localDir: path.resolve(process.env.LAB_LOCAL_DIR || '.local'),
    ...(neonAuthURL ? { neonAuthURL } : {}),
    ...(neonAuthURL && process.env.OWNER_NEON_SUBJECT
      ? { ownerNeonSubject: process.env.OWNER_NEON_SUBJECT }
      : {}),
    google: Boolean(
      neonAuthURL || (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    ),
    mail: Boolean(neonAuthURL || (process.env.SMTP_HOST && process.env.MAIL_FROM)),
    billing: readBillingConfig(),
    legal: readLegalConfig(),
  };
}
