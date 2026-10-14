import { randomBytes, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { hashPassword } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';
import { getStore } from '@netlify/blobs';
import type { Database } from '../server/db';
import { account, documents, profiles, user } from '../server/db/schema';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`REMOTE_CHECK_FAILED: ${message}`);
}

export async function verifyRemoteDeployment(db: Database) {
  const origin = process.env.AUTH_BASE_URL || '';
  assert(origin.startsWith('https://') && origin === process.env.URL, 'origine publiée exacte');
  const created: { id: string; email: string; password: string }[] = [];
  const uploaded: string[] = [];
  const checks: string[] = [];
  const report = {
    checks,
    passed: 0,
    fixturesRemoved: 0,
    blobCleanupPending: 0,
    emailDelivery: 'not-tested',
    google: 'not-tested',
  };
  const pass = (name: string) => {
    checks.push(name);
    console.log('REMOTE_CHECK_OK', name);
  };
  function client() {
    const cookies = new Map<string, string>();
    return async (path: string, method = 'GET', body?: unknown, expected = 200) => {
      const multipart = body instanceof FormData;
      const response = await fetch(`${origin}/api${path}`, {
        method,
        redirect: 'manual',
        signal: AbortSignal.timeout(30000),
        headers: {
          Origin: origin,
          Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
          ...(multipart ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
      });
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(';')[0];
        const split = pair.indexOf('=');
        cookies.set(pair.slice(0, split), pair.slice(split + 1));
      }
      assert(
        response.status === expected,
        `${method} ${path}: HTTP ${response.status}, attendu ${expected}`,
      );
      const data = response.headers.get('Content-Type')?.includes('application/json')
        ? await response.json()
        : null;
      return { response, data };
    };
  }
  try {
    const anonymous = client();
    const health = await anonymous('/health');
    assert(health.data.database === 'postgresql' && health.data.status === 'ok', 'Neon réel');
    pass('health-neon');
    await anonymous('/documents', 'GET', undefined, 401);
    pass('anonymous-access-denied');
    const configuration = (await anonymous('/config')).data;
    report.emailDelivery = configuration.email
      ? 'configured-not-delivery-tested'
      : 'not-configured';
    report.google = configuration.google ? 'configured-not-oauth-tested' : 'not-configured';
    if (!configuration.email) {
      await anonymous(
        '/auth/sign-up/email',
        'POST',
        {
          name: 'Vérification déploiement',
          email: `not-created-${randomUUID()}@example.test`,
          password: randomBytes(24).toString('base64url'),
        },
        503,
      );
      pass('signup-safely-disabled-without-smtp');
    }
    // Fixtures only: not a public signup bypass. Random credentials never leave this process.
    // No privileged role, no real email identity, and exact-ID cleanup in finally.
    for (let i = 0; i < 2; i++) {
      const id = randomUUID();
      const email = `deployment-${id}@example.test`;
      const password = randomBytes(24).toString('base64url');
      const hash = await hashPassword(password);
      await db.transaction(async (tx) => {
        await tx
          .insert(user)
          .values({ id, email, name: 'Contrôle de déploiement temporaire', emailVerified: true });
        await tx.insert(account).values({
          id: randomUUID(),
          accountId: id,
          providerId: 'credential',
          userId: id,
          password: hash,
        });
        await tx.insert(profiles).values({ userId: id });
      });
      created.push({ id, email, password });
    }
    const alice = client();
    const bob = client();
    const signIn = async (call: ReturnType<typeof client>, fixture: (typeof created)[number]) => {
      const result = await call('/auth/sign-in/email', 'POST', {
        email: fixture.email,
        password: fixture.password,
      });
      const cookies = result.response.headers.getSetCookie().join(';');
      assert(
        cookies.includes('HttpOnly') && cookies.includes('Secure') && /SameSite=Lax/i.test(cookies),
        'cookies sécurisés',
      );
    };
    await signIn(alice, created[0]);
    await signIn(bob, created[1]);
    pass('email-password-login-secure-cookies');
    assert((await alice('/profile')).data.role === 'free', 'rôle gratuit');
    const folder = (await alice('/folders', 'POST', { name: 'Recette temporaire' }, 201)).data;
    const initial = (
      await alice('/documents', 'POST', { title: 'Recette Neon réelle', folderId: folder.id }, 201)
    ).data;
    const form = new FormData();
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=',
      'base64',
    );
    form.append('file', new File([png], 'deployment-check.png', { type: 'image/png' }));
    const image = (await alice('/assets', 'POST', form, 201)).data;
    uploaded.push(image.id);
    const richContent = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Observation persistante' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Contenu formaté', marks: [{ type: 'bold' }] }],
        },
        { type: 'image', attrs: { src: image.src, alt: 'Image de contrôle' } },
      ],
    };
    const saved = (
      await alice(`/documents/${initial.id}`, 'PUT', {
        revision: initial.revision,
        title: initial.title,
        content: richContent,
        layout: initial.layout,
      })
    ).data;
    assert(saved.revision === initial.revision + 1, 'révision atomique');
    assert((await alice(`/documents/${initial.id}/versions`)).data.length === 2, 'historique');
    pass('folders-rich-document-save-and-history');
    const downloaded = await alice(`/assets/${image.id}`);
    assert(Buffer.from(await downloaded.response.arrayBuffer()).equals(png), 'octets Blobs');
    await bob(`/assets/${image.id}`, 'GET', undefined, 404);
    await bob(`/documents/${initial.id}`, 'GET', undefined, 404);
    pass('private-netlify-blobs-and-user-isolation');
    await alice(
      `/documents/${initial.id}`,
      'PUT',
      {
        revision: initial.revision,
        title: initial.title,
        content: richContent,
        layout: initial.layout,
      },
      409,
    );
    pass('stale-save-conflict');
    await alice('/auth/sign-out', 'POST', {});
    await alice('/documents', 'GET', undefined, 401);
    await signIn(alice, created[0]);
    const reopened = (await alice(`/documents/${initial.id}`)).data;
    assert(isDeepStrictEqual(reopened.content, richContent), 'persistance après reconnexion');
    const [stored] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, initial.id), eq(documents.ownerId, created[0].id)));
    assert(
      stored?.revision === saved.revision && stored.plainText.includes('Observation persistante'),
      'lecture directe Neon',
    );
    pass('logout-login-neon-persistence');
    await alice('/auth/sign-out', 'POST', {});
    await bob('/auth/sign-out', 'POST', {});
    console.log(
      'REMOTE_CHECK_SUMMARY',
      JSON.stringify({
        passed: checks.length,
        emailDelivery: configuration.email ? 'configured-not-delivery-tested' : 'not-configured',
        google: configuration.google ? 'configured-not-oauth-tested' : 'not-configured',
      }),
    );
    report.passed = checks.length;
    return report;
  } finally {
    for (const key of uploaded) {
      try {
        await getStore({ name: 'laboratoire-assets', consistency: 'strong' }).delete(key);
      } catch {
        report.blobCleanupPending++;
        console.warn('REMOTE_CHECK_BLOB_CLEANUP_PENDING', key);
      }
    }
    for (const fixture of created) {
      await db.delete(user).where(and(eq(user.id, fixture.id), eq(user.email, fixture.email)));
      report.fixturesRemoved++;
    }
    console.log('REMOTE_CHECK_FIXTURES_REMOVED', created.length);
  }
}
