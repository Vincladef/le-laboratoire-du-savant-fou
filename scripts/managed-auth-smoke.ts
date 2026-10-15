import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import type { PoolClient } from 'pg';
import type { Database } from '../server/db';
import { createApp } from '../server/app';
import { getConfig } from '../server/config';
import { verifyHostedBrowser } from './hosted-browser-smoke';

/** Development-only real Neon Auth check; never alters existing users or credentials. */
export async function verifyManagedAuth(client: PoolClient, db: Database) {
  const config = getConfig();
  if (
    process.env.CONTEXT !== 'branch-deploy' ||
    process.env.BRANCH !== 'mission-2' ||
    !config.neonAuthURL?.includes('ep-holy-breeze-bap2004l.neonauth.')
  )
    throw new Error('La recette de migration est réservée à development.');
  const counts = async () =>
    (
      await client.query(
        'select (select count(*)::int from lab."user") as users, (select count(*)::int from lab.documents) as documents, (select count(*)::int from neon_auth."user") as managed_users, (select count(*)::int from lab.memory_anchors) as anchors, (select count(*)::int from lab.fsrs_cards) as cards, (select count(*)::int from lab.review_history) as reviews, (select count(*)::int from lab.study_sessions) as sessions',
      )
    ).rows[0];
  const before = await counts();
  const ownerEmail = process.env.LAB_OWNER_EMAIL;
  const ownerCandidates = ownerEmail
    ? (
        await client.query(
          'select id from neon_auth."user" where lower(email)=lower($1) and "emailVerified"=true',
          [ownerEmail],
        )
      ).rows
    : [];
  const id = randomUUID(),
    legacyId = randomUUID(),
    docId = randomUUID();
  const email = `migration-${id}@example.test`,
    password = randomBytes(32).toString('base64url');
  const foreignId = randomUUID(),
    foreignEmail = `migration-${foreignId}@example.test`;
  const checks: string[] = [];
  let browser: Awaited<ReturnType<typeof verifyHostedBrowser>> | null = null;
  try {
    await client.query(
      'insert into lab."user" (id,name,email,email_verified) values ($1,$2,$3,true)',
      [legacyId, 'Recette migration', email],
    );
    await client.query('insert into lab.profiles (user_id) values ($1)', [legacyId]);
    await client.query(
      'insert into lab.documents (id,owner_id,title,content) values ($1,$2,$3,$4)',
      [
        docId,
        legacyId,
        'Document préexistant de contrôle',
        JSON.stringify({
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Ne pas perdre ce contenu.' }] },
          ],
        }),
      ],
    );
    // Administrative fixtures, not proof of email delivery or a public verification bypass.
    await client.query(
      'insert into neon_auth."user" (id,name,email,"emailVerified") values ($1,$2,$3,true)',
      [id, 'Recette migration temporaire', email],
    );
    await client.query(
      'insert into neon_auth.account ("accountId","providerId","userId",password,"updatedAt") values ($1,$2,$3,$4,now())',
      [id, 'credential', id, await hashPassword(password)],
    );
    await client.query(
      'insert into neon_auth."user" (id,name,email,"emailVerified") values ($1,$2,$3,true)',
      [foreignId, 'Autre compte de contrôle temporaire', foreignEmail],
    );
    await client.query(
      'insert into neon_auth.account ("accountId","providerId","userId",password,"updatedAt") values ($1,$2,$3,$4,now())',
      [foreignId, 'credential', foreignId, await hashPassword(password)],
    );
    const { app } = createApp(db, config);
    const cookies = new Map<string, string>();
    async function call(path: string, method = 'GET', body?: unknown, expected = 200) {
      const request = new Request(`${config.baseURL}/api${path}`, {
        method,
        headers: {
          Origin: config.baseURL,
          'Content-Type': 'application/json',
          Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const r =
        process.env.LAB_VERIFY_PUBLISHED === '1'
          ? await fetch(request, { redirect: 'manual', signal: AbortSignal.timeout(30000) })
          : await app.fetch(request);
      for (const cookie of r.headers.getSetCookie()) {
        const pair = cookie.split(';')[0],
          i = pair.indexOf('=');
        cookies.set(pair.slice(0, i), pair.slice(i + 1));
      }
      if (r.status !== expected)
        throw new Error(`MANAGED_CHECK_FAILED ${path}: ${r.status} attendu ${expected}`);
      return r;
    }
    await call('/documents', 'GET', undefined, 401);
    checks.push('managed-anonymous-denied');
    const signed = await call('/auth/sign-in/email', 'POST', { email, password });
    const cookie = signed.headers.getSetCookie().join(';');
    if (!/HttpOnly/i.test(cookie) || !/Secure/i.test(cookie))
      throw new Error('Cookies Neon non sécurisés');
    checks.push('managed-real-login-secure-cookies');
    const session = await (await call('/auth/get-session')).json();
    if (session.user.id !== legacyId) throw new Error('Identité historique non conservée');
    const document = await (await call(`/documents/${docId}`)).json();
    if (
      document.ownerId !== legacyId ||
      document.content.content[0].content[0].text !== 'Ne pas perdre ce contenu.'
    )
      throw new Error('Contenu historique non conservé');
    checks.push('managed-migration-preserves-user-and-document');
    const originalCookies = new Map(cookies);
    await call('/auth/sign-out', 'POST', {});
    for (const [k, v] of originalCookies) cookies.set(k, v);
    await call('/documents', 'GET', undefined, 401);
    checks.push('managed-revoked-session-denied');
    cookies.clear();
    await call('/auth/sign-in/email', 'POST', { email, password });
    await call(`/documents/${docId}`);
    checks.push('managed-relogin-persists-document');
    const anchorId = randomUUID(),
      otherAnchorId = randomUUID();
    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Une réponse ',
              marks: [
                { type: 'bold' },
                {
                  type: 'memoryAnchor',
                  attrs: { id: anchorId, sourceId: null, hint: 'Indice Neon', priority: 'high' },
                },
              ],
            },
            {
              type: 'text',
              text: 'formatée',
              marks: [
                { type: 'italic' },
                {
                  type: 'memoryAnchor',
                  attrs: { id: anchorId, sourceId: null, hint: 'Indice Neon', priority: 'high' },
                },
              ],
            },
            { type: 'text', text: ' puis ' },
            {
              type: 'text',
              text: 'une autre',
              marks: [
                {
                  type: 'memoryAnchor',
                  attrs: {
                    id: otherAnchorId,
                    sourceId: null,
                    hint: 'Second indice',
                    priority: 'low',
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    const saved = await (
      await call(`/documents/${docId}`, 'PUT', {
        revision: document.revision,
        title: document.title,
        layout: document.layout,
        content,
      })
    ).json();
    const passages = await (await call(`/documents/${docId}/anchors`)).json();
    if (
      passages.length !== 2 ||
      passages.find((a: any) => a.id === anchorId)?.quote !== 'Une réponse formatée'
    )
      throw new Error('Annotations Neon incohérentes');
    checks.push('neon-rich-annotations-hints-priorities');
    const createdSession = await (
      await call(
        '/learning/sessions',
        'POST',
        {
          id: randomUUID(),
          filters: { documentIds: [docId], folderIds: [], priorities: ['high'] },
        },
        201,
      )
    ).json();
    if (createdSession.total !== 1 || createdSession.current.anchor.id !== anchorId)
      throw new Error('Filtrage programmé incorrect');
    const path = `/learning/sessions/${createdSession.id}/items/${createdSession.current.itemId}`;
    await call(`${path}/rate`, 'POST', { actionId: randomUUID(), rating: 3 }, 409);
    await call(`${path}/reveal`, 'POST', {});
    const resumed = await (await call(`/learning/sessions/${createdSession.id}`)).json();
    if (!resumed.current.revealed) throw new Error('Révélation non persistée');
    const actionId = randomUUID();
    await call(`${path}/rate`, 'POST', { actionId, rating: 3 });
    await call(`${path}/rate`, 'POST', { actionId, rating: 3 });
    const history = await (await call(`/anchors/${anchorId}/reviews`)).json();
    if (history.length !== 1) throw new Error('Révision dupliquée');
    const direct = await client.query(
      'select c.reps,c.stability,c.difficulty,c.due,count(r.id)::int as reviews from lab.fsrs_cards c join lab.review_history r on r.card_id=c.id where c.anchor_id=$1 and c.owner_id=$2 group by c.id',
      [anchorId, legacyId],
    );
    if (
      direct.rows[0]?.reps !== 1 ||
      direct.rows[0]?.reviews !== 1 ||
      !(Number(direct.rows[0]?.stability) > 0)
    )
      throw new Error('Persistance FSRS Neon incorrecte');
    checks.push('neon-fsrs-scheduling-deduplication-direct-sql');
    await call(
      `/documents/${docId}`,
      'PUT',
      { revision: document.revision, title: document.title, layout: document.layout, content },
      409,
    );
    checks.push('neon-document-save-conflict');
    await call('/auth/sign-out', 'POST', {});
    cookies.clear();
    await call('/auth/sign-in/email', 'POST', { email, password });
    const persisted = await (await call(`/documents/${docId}/anchors`)).json();
    if (persisted.find((a: any) => a.id === anchorId)?.card.reps !== 1)
      throw new Error('FSRS perdu après reconnexion');
    checks.push('neon-learning-persists-after-relogin');
    const ownCookies = new Map(cookies);
    cookies.clear();
    await call('/auth/sign-in/email', 'POST', { email: foreignEmail, password });
    const foreignProfile = await (await call('/profile')).json();
    if (foreignProfile.role !== 'free') throw new Error('Rôle inattendu pour un nouveau compte');
    await call(`/documents/${docId}/anchors`, 'GET', undefined, 404);
    await call(`/anchors/${anchorId}/reviews`, 'GET', undefined, 404);
    await call(`/learning/sessions/${createdSession.id}`, 'GET', undefined, 404);
    await call('/auth/sign-out', 'POST', {});
    cookies.clear();
    for (const [k, v] of ownCookies) cookies.set(k, v);
    checks.push('neon-managed-learning-user-isolation');
    if (process.env.LAB_VERIFY_BROWSER === '1') {
      browser = await verifyHostedBrowser(config.baseURL, email, password, docId);
      const persisted = await client.query(
        'select count(*)::int as count, sum(c.reps)::int as reps from lab.fsrs_cards c join lab.memory_anchors a on a.id=c.anchor_id where a.document_id=$1 and a.owner_id=$2',
        [docId, legacyId],
      );
      if (persisted.rows[0].count !== 3 || persisted.rows[0].reps !== 3)
        throw new Error('Données navigateur non persistées dans Neon');
      checks.push('hosted-browser-learning-direct-neon-persistence');
    }
  } catch (error) {
    if (error instanceof Error) {
      error.message = error.message.replaceAll(password, '[redacted]');
    }
    throw error;
  } finally {
    await client.query(
      'delete from lab."user" where id in (select user_id from lab.auth_identities where subject=$1) and email=$2',
      [foreignId, foreignEmail],
    );
    await client.query('delete from neon_auth."user" where id=$1 and email=$2', [
      foreignId,
      foreignEmail,
    ]);
    await client.query('delete from neon_auth."user" where id=$1 and email=$2', [id, email]);
    await client.query('delete from lab."user" where id=$1 and email=$2', [legacyId, email]);
  }
  const after = await counts();
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error('Le nettoyage de la recette ne correspond pas à l’inventaire initial');
  return {
    checks,
    passed: checks.length,
    before,
    after,
    emailDelivery: 'shared-provider-not-inbox-tested',
    google: 'shared-provider-not-interactive-tested',
    ownerCandidate:
      ownerCandidates.length === 1
        ? {
            subject: ownerCandidates[0].id,
            source: 'verified-infrastructure-account-and-verified-neon-identity',
          }
        : null,
    transport:
      process.env.LAB_VERIFY_PUBLISHED === '1'
        ? 'published-https'
        : 'in-process-with-real-neon-auth-and-database',
    browser,
  };
}
