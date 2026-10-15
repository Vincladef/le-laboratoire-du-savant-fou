import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import type { PoolClient } from 'pg';
import type { Database } from '../server/db';
import { createApp } from '../server/app';
import { getConfig } from '../server/config';

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
        'select (select count(*)::int from lab."user") as users, (select count(*)::int from lab.documents) as documents, (select count(*)::int from neon_auth."user") as managed_users',
      )
    ).rows[0];
  const before = await counts();
  const id = randomUUID(),
    legacyId = randomUUID(),
    docId = randomUUID();
  const email = `migration-${id}@example.test`,
    password = randomBytes(32).toString('base64url');
  const checks: string[] = [];
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
    const { app } = createApp(db, config);
    const cookies = new Map<string, string>();
    async function call(path: string, method = 'GET', body?: unknown, expected = 200) {
      const r = await app.fetch(
        new Request(`${config.baseURL}/api${path}`, {
          method,
          headers: {
            Origin: config.baseURL,
            'Content-Type': 'application/json',
            Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
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
  } finally {
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
  };
}
