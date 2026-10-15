import { Pool } from 'pg';
import { mkdir, writeFile } from 'node:fs/promises';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { assertDatabaseTarget, assertMigrationHistory } from './deployment-guards';
import * as schema from '../server/db/schema';
import { verifyRemoteDeployment } from './remote-smoke';
import { verifyManagedAuth } from './managed-auth-smoke';
import { prepareLearning } from '../server/prepare-learning';
import { surveyProduction } from './production-survey';
import { cleanupFailedFixtures } from './cleanup-failed-fixtures';
import { inspectStripeLinks } from './inspect-stripe-links';

let stage = 'target-validation';
async function prepare() {
  // Opt-in for one controlled deployment, never enabled by default or on previews.
  if (process.env.LAB_DEPLOY_PREPARE !== '1') return;
  const developmentBranch =
    process.env.CONTEXT === 'branch-deploy' &&
    process.env.BRANCH === 'mission-2' &&
    process.env.LAB_EXPECTED_DATABASE_HOST ===
      'ep-holy-breeze-bap2004l-pooler.c-8.eu-central-1.aws.neon.tech';
  if (
    process.env.NETLIFY !== 'true' ||
    (process.env.CONTEXT !== 'production' && !developmentBranch)
  )
    throw new Error('Préparation réservée à un build Netlify explicitement autorisé.');
  const connectionString = process.env.DATABASE_URL || '';
  assertDatabaseTarget(
    connectionString,
    process.env.LAB_EXPECTED_DATABASE_HOST,
    process.env.LAB_EXPECTED_DATABASE_NAME,
  );
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 15000 });
  const client = await pool.connect();
  try {
    await client.query('set statement_timeout = 60000');
    await client.query('select pg_advisory_lock(62601, 1)');
    const identity = await client.query('select current_database() as database');
    if (identity.rows[0].database !== process.env.LAB_EXPECTED_DATABASE_NAME)
      throw new Error('Identité PostgreSQL inattendue.');
    const inventory = await client.query(
      "select nspname from pg_namespace where nspname in ('lab', 'drizzle') order by nspname",
    );
    const journal = await client.query(
      "select to_regclass('drizzle.__drizzle_migrations') as relation",
    );
    const applied = journal.rows[0].relation
      ? (
          await client.query(
            'select hash, created_at from drizzle.__drizzle_migrations order by created_at, id',
          )
        ).rows
      : [];
    const local = readMigrationFiles({ migrationsFolder: 'migrations' });
    const labExists = inventory.rows.some((row) => row.nspname === 'lab');
    const pending = assertMigrationHistory(labExists, applied, local);
    console.log(
      'DEPLOY_DATABASE_INSPECTED',
      JSON.stringify({
        database: identity.rows[0].database,
        labExists,
        applied: applied.length,
        pending,
      }),
    );
    const db = drizzle(client, { schema });
    stage = 'migrations';
    await migrate(db, { migrationsFolder: 'migrations' });
    const learning = await prepareLearning(db);
    const fixtureCleanup = await cleanupFailedFixtures(client);
    const tables = await client.query(
      "select count(*)::int as count from pg_tables where schemaname = 'lab'",
    );
    console.log('DEPLOY_MIGRATIONS_OK', JSON.stringify({ tables: tables.rows[0].count }));
    await client.query('select pg_advisory_unlock(62601, 1)');
    stage = 'managed-auth-and-learning-checks';
    const managedAuth =
      process.env.LAB_VERIFY_MANAGED_AUTH === '1' ? await verifyManagedAuth(client, db) : null;
    const productionSurvey = await surveyProduction();
    stage = 'public-stripe-link-inspection';
    const stripeLinks = await inspectStripeLinks();
    // The remote smoke check targets the currently published service, not an unserved build.
    const remote = process.env.LAB_VERIFY_REMOTE === '1' ? await verifyRemoteDeployment(db) : null;
    // Non-secret build evidence, published as a Netlify plugin status (not as a public route).
    await mkdir('.netlify', { recursive: true });
    await writeFile(
      '.netlify/deployment-report.json',
      JSON.stringify({
        deployId: process.env.DEPLOY_ID,
        database: identity.rows[0].database,
        labExistedBefore: labExists,
        previouslyApplied: applied.length,
        migrationsApplied: pending,
        tables: tables.rows[0].count,
        remote,
        managedAuth,
        learning,
        productionSurvey,
        fixtureCleanup,
        stripeLinks,
      }),
    );
  } finally {
    client.release();
    await pool.end();
  }
}

prepare().catch(async (error) => {
  // Drivers may include connection details in errors. Do not log the raw exception.
  console.error('DEPLOY_PREPARE_FAILED', error?.code || error?.name || 'Error');
  if (error instanceof Error && !('code' in error))
    console.error(error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]'));
  process.exitCode = 1;
  await mkdir('.netlify', { recursive: true });
  await writeFile(
    '.netlify/deployment-failure.json',
    JSON.stringify({
      deployId: process.env.DEPLOY_ID,
      stage,
      code: error?.code || error?.cause?.code || error?.name || 'Error',
      constraint: error?.constraint || error?.cause?.constraint,
      table: error?.table || error?.cause?.table,
      ...(error instanceof Error && !('code' in error) && !('cause' in error)
        ? { message: error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]').slice(0, 500) }
        : {}),
    }),
  );
});
