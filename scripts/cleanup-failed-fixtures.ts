import type { PoolClient } from 'pg';
/** Exact failed development-deployment window and reserved synthetic identities only. */
export async function cleanupFailedFixtures(client: PoolClient) {
  if (process.env.LAB_CLEAN_FAILED_FIXTURES !== '1') return { removed: 0 };
  if (
    process.env.CONTEXT !== 'branch-deploy' ||
    process.env.BRANCH !== 'mission-2' ||
    process.env.LAB_EXPECTED_DATABASE_HOST !==
      'ep-holy-breeze-bap2004l-pooler.c-8.eu-central-1.aws.neon.tech'
  )
    throw new Error('Nettoyage réservé à development.');
  const candidates = (
    await client.query(
      `select n.id as subject,n.email,l.id as local_id,p.role,
    (select count(*)::int from lab.documents d where d.owner_id=l.id) as documents,
    (select count(*)::int from lab.documents d where d.owner_id=l.id and d.title='Document préexistant de contrôle') as fixture_documents
    from neon_auth."user" n left join lab."user" l on l.email=n.email left join lab.profiles p on p.user_id=l.id
    where n."createdAt">=$1 and n."createdAt"<=$2 and n.email='migration-'||n.id::text||'@example.test'
      and n.name in ('Recette migration temporaire','Autre compte de contrôle temporaire')`,
      ['2026-10-15T15:35:36Z', '2026-10-15T15:40:17Z'],
    )
  ).rows;
  // Earlier cleanup removed the managed identity before the failed SQL cascade.
  // Resolve those exact orphaned fixtures by the persisted subject and time window.
  const orphans = (
    await client.query(
      `select i.subject::uuid as subject,l.email,l.id as local_id,p.role,
    (select count(*)::int from lab.documents d where d.owner_id=l.id) as documents,
    (select count(*)::int from lab.documents d where d.owner_id=l.id and d.title='Document préexistant de contrôle') as fixture_documents
    from lab."user" l join lab.auth_identities i on i.user_id=l.id join lab.profiles p on p.user_id=l.id
    where l.created_at>=$1 and l.created_at<=$2 and l.email='migration-'||i.subject||'@example.test'
      and l.name='Recette migration' and not exists(select 1 from neon_auth."user" n where n.id::text=i.subject)`,
      ['2026-10-15T15:35:36Z', '2026-10-15T15:40:17Z'],
    )
  ).rows;
  candidates.push(...orphans);
  if (
    candidates.some(
      (row) =>
        row.local_id &&
        (row.role !== 'free' || row.documents !== row.fixture_documents || row.documents > 1),
    )
  )
    throw new Error('Une cible de nettoyage ne correspond pas aux fixtures attendues.');
  await client.query('BEGIN');
  try {
    for (const row of candidates) {
      if (row.local_id)
        await client.query('delete from lab."user" where id=$1 and email=$2', [
          row.local_id,
          row.email,
        ]);
      await client.query('delete from neon_auth."user" where id=$1 and email=$2', [
        row.subject,
        row.email,
      ]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  return {
    removed: candidates.length,
    subjects: candidates.map((row) => row.subject),
    scope: 'two-failed-development-builds-reserved-example-test-fixtures',
  };
}
