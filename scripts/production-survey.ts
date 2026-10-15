import { Pool } from 'pg';
import { assertDatabaseTarget } from './deployment-guards';
/** Read-only production inventory, after development verification and before any production migration. */
export async function surveyProduction() {
  if (
    process.env.CONTEXT !== 'branch-deploy' ||
    process.env.BRANCH !== 'mission-2' ||
    !process.env.LAB_PRODUCTION_DATABASE_URL
  )
    return null;
  assertDatabaseTarget(
    process.env.LAB_PRODUCTION_DATABASE_URL,
    'ep-wispy-lake-ba7v96jl-pooler.c-8.eu-central-1.aws.neon.tech',
    'laboratoire',
  );
  const pool = new Pool({
    connectionString: process.env.LAB_PRODUCTION_DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 15000,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    const counts = (
      await client.query(
        'select (select count(*)::int from lab."user") as legacy_users,(select count(*)::int from lab.documents) as documents,(select count(*)::int from lab.document_versions) as versions,(select count(*)::int from neon_auth."user") as managed_users',
      )
    ).rows[0];
    const legacy = (
      await client.query(
        'select count(*)::int as without_managed_identity from lab."user" l where not exists (select 1 from neon_auth."user" n where lower(n.email)=lower(l.email))',
      )
    ).rows[0];
    const candidates = process.env.LAB_OWNER_EMAIL
      ? (
          await client.query(
            'select id from neon_auth."user" where lower(email)=lower($1) and "emailVerified"=true',
            [process.env.LAB_OWNER_EMAIL],
          )
        ).rows
      : [];
    const fingerprint = (
      await client.query(
        "select md5(coalesce(string_agg(md5(id::text || owner_id || revision::text || content::text),'' order by id),'')) as documents from lab.documents",
      )
    ).rows[0].documents;
    await client.query('COMMIT');
    return {
      readOnly: true,
      counts,
      ...legacy,
      documentFingerprint: fingerprint,
      ownerCandidate:
        candidates.length === 1
          ? {
              subject: candidates[0].id,
              source: 'verified-netlify-owner-and-verified-neon-identity',
            }
          : null,
    };
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    await pool.end();
  }
}
