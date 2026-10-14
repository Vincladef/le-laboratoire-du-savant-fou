import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
if (!process.env.DATABASE_URL)
  throw new Error(
    'Renseignez DATABASE_URL dans les paramètres sécurisés ou .env (ignoré par Git).',
  );
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: 'migrations' });
  console.log('Migrations appliquées au schéma lab.');
} finally {
  await pool.end();
}
