import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { mkdir } from 'node:fs/promises';
import * as schema from '../server/db/schema';
import type { Database } from '../server/db';
import type { AppConfig } from '../server/config';
export async function openLocalDatabase(config: AppConfig) {
  if (!config.development || process.env.NETLIFY || process.env.NODE_ENV === 'production')
    throw new Error('PostgreSQL embarqué interdit en production.');
  await mkdir(config.localDir, { recursive: true });
  const client = new PGlite(`${config.localDir}/postgres`);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: 'migrations' });
  return { db: db as unknown as Database, close: () => client.close() };
}
