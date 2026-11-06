import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { reviewDataFingerprint, verifyReviewMigration } from '../scripts/review-migration-proof';
import type { PoolClient } from 'pg';

it('migre la dernière évaluation explicite sans réécrire documents, indices ni archives', async () => {
  const db = new PGlite();
  try {
    const migrations = readMigrationFiles({ migrationsFolder: 'migrations' });
    expect(migrations.length).toBeGreaterThanOrEqual(13);
    for (const migration of migrations.slice(0, 12))
      for (const statement of migration.sql) await db.exec(statement);
    const owner = crypto.randomUUID(),
      docId = crypto.randomUUID();
    const ids = Array.from({ length: 5 }, () => crypto.randomUUID());
    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: ids.map((id, i) => ({
            type: 'text',
            text: `Réponse ${i + 1}.`,
            marks: [
              { type: 'bold' },
              { type: 'memoryAnchor', attrs: { id, hint: `Indice ${i + 1}`, priority: 'medium' } },
            ],
          })),
        },
      ],
    };
    await db.query('insert into lab."user" (id,name,email) values ($1,$2,$3)', [
      owner,
      'Migration locale',
      `${owner}@example.test`,
    ]);
    await db.query('insert into lab.documents (id,owner_id,title,content) values ($1,$2,$3,$4)', [
      docId,
      owner,
      'Original',
      JSON.stringify(content),
    ]);
    for (const [i, id] of ids.entries()) {
      await db.query(
        'insert into lab.memory_anchors (id,document_id,owner_id,quote,original_slice,hint,priority,document_revision) values ($1,$2,$3,$4,$5,$6,$7,1)',
        [
          id,
          docId,
          owner,
          `Réponse ${i + 1}.`,
          JSON.stringify(content.content[0].content[i]),
          `Indice ${i + 1}`,
          'medium',
        ],
      );
      if (i === 4) continue;
      const cardId = crypto.randomUUID();
      await db.query(
        'insert into lab.fsrs_cards (id,anchor_id,owner_id,difficulty,due,reps) values ($1,$2,$3,9.9,$4,2)',
        [cardId, id, owner, '2099-01-01'],
      );
      await db.query(
        'insert into lab.review_history (card_id,owner_id,rating,"before","after",created_at) values ($1,$2,4,$3,$3,$4)',
        [cardId, owner, '{}', '2025-01-01T00:00:00Z'],
      );
      await db.query(
        'insert into lab.review_history (card_id,owner_id,rating,"before","after",created_at) values ($1,$2,$3,$4,$4,$5)',
        [cardId, owner, i + 1, '{}', '2026-01-01T00:00:00Z'],
      );
    }
    const sessionId = crypto.randomUUID();
    await db.query('insert into lab.study_sessions (id,owner_id,filters) values ($1,$2,$3)', [
      sessionId,
      owner,
      JSON.stringify({ documentIds: [docId], folderIds: [], priorities: ['medium'] }),
    ]);
    await db.query(
      'insert into lab.study_items (session_id,owner_id,anchor_id,position) values ($1,$2,$3,0)',
      [sessionId, owner, ids[0]],
    );
    const snapshot = async () =>
      JSON.stringify(
        await Promise.all(
          ['documents', 'fsrs_cards', 'review_history', 'study_sessions', 'study_items'].map((t) =>
            db.query(`select * from lab.${t} order by id`),
          ),
        ),
      );
    const before = await snapshot();
    const proofClient = db as unknown as PoolClient;
    const fingerprint = await reviewDataFingerprint(proofClient);
    for (const statement of migrations[12].sql) await db.exec(statement);
    expect(await verifyReviewMigration(proofClient, fingerprint)).toMatchObject({
      documentsPreserved: true,
      annotationsPreserved: true,
      archivesPreserved: true,
      explicitRatingsPreserved: true,
      passages: 5,
      evaluated: 4,
    });
    expect(await snapshot()).toBe(before);
    const rows = (
      await db.query<any>(
        'select id,difficulty,difficulty_revision,hint,priority,original_slice from lab.memory_anchors',
      )
    ).rows;
    expect(ids.map((id) => rows.find((r) => r.id === id)?.difficulty)).toEqual([
      'hard',
      'hard',
      'medium',
      'easy',
      'unrated',
    ]);
    expect(ids.map((id) => rows.find((r) => r.id === id)?.difficulty_revision)).toEqual([
      1, 1, 1, 1, 0,
    ]);
    for (const [i, id] of ids.entries()) {
      const row = rows.find((r) => r.id === id);
      expect(row.hint).toBe(`Indice ${i + 1}`);
      expect(row.priority).toBe('medium');
      expect(row.original_slice).toEqual(content.content[0].content[i]);
    }
    await expect(
      db.query('update lab.memory_anchors set difficulty=$1 where id=$2', ['forgotten', ids[0]]),
    ).rejects.toThrow();
  } finally {
    await db.close();
  }
}, 30000);
