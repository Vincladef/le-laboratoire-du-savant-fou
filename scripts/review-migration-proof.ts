import type { PoolClient } from 'pg';
import { isDeepStrictEqual } from 'node:util';

/** Only non-secret aggregate fingerprints leave the database. No content or identities logged. */
export async function reviewDataFingerprint(client: Pick<PoolClient, 'query'>) {
  return (
    await client.query(`select
    (select md5(coalesce(jsonb_agg(to_jsonb(d) order by d.id)::text,'[]')) from lab.documents d) as documents,
    (select md5(coalesce(jsonb_agg(to_jsonb(a) - 'difficulty' - 'difficulty_revision' order by a.id)::text,'[]')) from lab.memory_anchors a) as annotations,
    md5(
      coalesce((select jsonb_agg(to_jsonb(c) order by c.id)::text from lab.fsrs_cards c),'[]') ||
      coalesce((select jsonb_agg(to_jsonb(r) order by r.id)::text from lab.review_history r),'[]') ||
      coalesce((select jsonb_agg(to_jsonb(s) order by s.id)::text from lab.study_sessions s),'[]') ||
      coalesce((select jsonb_agg(to_jsonb(i) order by i.id)::text from lab.study_items i),'[]')
    ) as archives`)
  ).rows[0];
}
export async function verifyReviewMigration(
  client: Pick<PoolClient, 'query'>,
  before: Awaited<ReturnType<typeof reviewDataFingerprint>>,
) {
  const after = await reviewDataFingerprint(client);
  if (!isDeepStrictEqual(before, after))
    throw new Error(
      'Le contenu ou les archives ont changé pendant la migration. Vérifiez l’inventaire avant de publier.',
    );
  const mapping = (
    await client.query(`select
    count(*)::int as passages,
    count(*) filter (where a.difficulty <> 'unrated')::int as evaluated,
    count(*) filter (where a.difficulty is distinct from coalesce(latest.difficulty,'unrated')
      or a.difficulty_revision <> case when latest.difficulty is null then 0 else 1 end)::int as mismatches
    from lab.memory_anchors a
    left join lateral (
      select case when r.rating=4 then 'easy' when r.rating=3 then 'medium' else 'hard' end as difficulty
      from lab.fsrs_cards c join lab.review_history r on r.card_id=c.id and r.owner_id=c.owner_id
      where c.anchor_id=a.id and c.owner_id=a.owner_id
      order by r.created_at desc,r.id desc limit 1
    ) latest on true`)
  ).rows[0];
  if (mapping.mismatches !== 0)
    throw new Error('La migration de la dernière difficulté explicite est incohérente.');
  return {
    documentsPreserved: true,
    annotationsPreserved: true,
    archivesPreserved: true,
    explicitRatingsPreserved: true,
    passages: mapping.passages,
    evaluated: mapping.evaluated,
  };
}
