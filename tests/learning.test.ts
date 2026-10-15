import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { and, eq, sql } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { fsrs } from 'ts-fsrs';
import { openLocalDatabase } from '../scripts/local-database';
import { createApp } from '../server/app';
import { account, fsrsCards, memoryAnchors, reviews, user } from '../server/db/schema';
import { fsrsParameters, toEngine } from '../server/scheduling';
import { copyWithNewAnchors, defaultLayout, type RichNode } from '../src/shared/document';
const origin = 'http://localhost:5173',
  password = 'Learning-Test-Password-42!';
let connection: Awaited<ReturnType<typeof openLocalDatabase>>,
  runtime: ReturnType<typeof createApp>;
class Client {
  id = crypto.randomUUID();
  email = `learning-${this.id}@example.test`;
  cookies = new Map<string, string>();
  async call(path: string, method = 'GET', body?: unknown, status = 200) {
    const response = await runtime.app.fetch(
      new Request(`${origin}/api${path}`, {
        method,
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0],
        i = pair.indexOf('=');
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const data = await response.json();
    expect(response.status, `${path}: ${JSON.stringify(data)}`).toBe(status);
    return data as any;
  }
  async login() {
    await this.call('/auth/sign-in/email', 'POST', { email: this.email, password });
  }
}
const alice = new Client(),
  bob = new Client();
beforeAll(async () => {
  const localDir = await mkdtemp(join(tmpdir(), 'lab-learning-'));
  const config = {
    development: true,
    baseURL: origin,
    secret: 'learning-tests-long-random-development-secret',
    localDir,
    google: false,
    mail: false,
  };
  connection = await openLocalDatabase(config);
  runtime = createApp(connection.db, config);
  for (const client of [alice, bob]) {
    await connection.db
      .insert(user)
      .values({ id: client.id, email: client.email, name: 'Apprentissage', emailVerified: true });
    await connection.db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: client.id,
      userId: client.id,
      providerId: 'credential',
      password: await hashPassword(password),
    });
    await client.login();
  }
});
afterAll(async () => {
  await connection?.close();
});
const marked = (
  id: string,
  text: string,
  priority = 'high',
  hint = 'Un indice',
  style = 'bold',
): RichNode => ({
  type: 'text',
  text,
  marks: [{ type: style }, { type: 'memoryAnchor', attrs: { id, sourceId: null, hint, priority } }],
});
const content = (nodes: RichNode[]): RichNode => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: nodes }],
});
const doc = async (nodes: RichNode[], folderId?: string) =>
  alice.call(
    '/documents',
    'POST',
    {
      title: 'Mémoire durable',
      folderId: folderId ?? null,
      content: content(nodes),
      layout: defaultLayout,
    },
    201,
  );
const save = async (d: any, nodes: RichNode[]) =>
  alice.call(`/documents/${d.id}`, 'PUT', {
    revision: d.revision,
    title: d.title,
    content: content(nodes),
    layout: d.layout,
  });
const anchors = async (d: any) => alice.call(`/documents/${d.id}/anchors`);
const start = async (
  documentIds: string[],
  priorities = ['high', 'medium', 'low'],
  folderIds: string[] = [],
) =>
  alice.call(
    '/learning/sessions',
    'POST',
    { id: crypto.randomUUID(), filters: { documentIds, folderIds, priorities } },
    201,
  );
const reveal = async (s: any) =>
  alice.call(`/learning/sessions/${s.id}/items/${s.current.itemId}/reveal`, 'POST', {});
describe('Passages documentaires et vrai calendrier FSRS PostgreSQL', () => {
  it('synchronise des passages multistyles, leurs indices et priorités sans changer le texte', async () => {
    const id = crypto.randomUUID(),
      second = crypto.randomUUID();
    let d = await doc([
      marked(id, 'mémoire '),
      marked(id, 'formatée', 'high', 'Un indice', 'italic'),
      { type: 'text', text: ' et ' },
      marked(second, 'science', 'low', 'Savoir'),
    ]);
    let rows = await anchors(d);
    expect(rows).toHaveLength(2);
    expect(rows.find((a: any) => a.id === id)).toMatchObject({
      quote: 'mémoire formatée',
      hint: 'Un indice',
      priority: 'high',
      status: 'active',
      card: { reps: 0, algorithmVersion: 'FSRS-6 / ts-fsrs@5.4.2' },
    });
    const before = rows.find((a: any) => a.id === id).card;
    d = await save(d, [
      marked(id, 'mémoire ', 'medium', 'Nouvel indice'),
      marked(id, 'formatée', 'medium', 'Nouvel indice', 'italic'),
      { type: 'text', text: ' et ' },
      marked(second, 'science', 'low', 'Savoir'),
    ]);
    rows = await anchors(d);
    const after = rows.find((a: any) => a.id === id);
    expect(after).toMatchObject({ hint: 'Nouvel indice', priority: 'medium', status: 'active' });
    expect(after.card).toEqual(before);
    expect(d.content.content[0].content[1].marks[0].type).toBe('italic');
    const freeBefore = JSON.stringify(after.card);
    await alice.call(`/documents/${d.id}`);
    await anchors(d);
    expect(JSON.stringify((await anchors(d)).find((a: any) => a.id === id).card)).toBe(freeBefore);
  });
  it('filtre les documents, descendants de dossiers, priorités et échéances', async () => {
    const parent = await alice.call('/folders', 'POST', { name: 'Parent' }, 201),
      child = await alice.call('/folders', 'POST', { name: 'Enfant', parentId: parent.id }, 201);
    const id = crypto.randomUUID(),
      low = crypto.randomUUID();
    const d = await doc(
      [marked(id, 'Important'), { type: 'text', text: ' ' }, marked(low, 'Secondaire', 'low')],
      child.id,
    );
    const selected = await start([], ['high'], [parent.id]);
    expect(selected.total).toBe(1);
    expect(selected.current.anchor.id).toBe(id);
    expect((await start([d.id], ['high', 'medium', 'low'])).total).toBe(2);
    const [card] = await connection.db.select().from(fsrsCards).where(eq(fsrsCards.anchorId, id));
    await connection.db
      .update(fsrsCards)
      .set({ due: new Date(Date.now() + 86400000) })
      .where(eq(fsrsCards.id, card.id));
    expect((await start([d.id], ['high'])).total).toBe(0);
    await bob.call('/learning/eligible', 'POST', { documentIds: [d.id] }, 404);
    await bob.call('/learning/eligible', 'POST', { folderIds: [parent.id] }, 404);
  });
  it('refuse la note avant révélation, persiste le vrai résultat FSRS et déduplique les retransmissions', async () => {
    const id = crypto.randomUUID(),
      d = await doc([marked(id, 'Une réponse')]);
    let s = await start([d.id]);
    await alice.call(
      `/learning/sessions/${s.id}/items/${s.current.itemId}/rate`,
      'POST',
      { actionId: crypto.randomUUID(), rating: 3 },
      409,
    );
    s = await reveal(s);
    expect(s.current.revealed).toBe(true);
    expect((await alice.call(`/learning/sessions/${s.id}`)).current.revealed).toBe(true);
    const [before] = await connection.db.select().from(fsrsCards).where(eq(fsrsCards.anchorId, id));
    const actionId = crypto.randomUUID(),
      path = `/learning/sessions/${s.id}/items/${s.current.itemId}/rate`;
    const first = await alice.call(path, 'POST', { actionId, rating: 3 });
    expect(first.session.completed).toBe(1);
    expect(first.session.status).toBe('completed');
    await alice.call(path, 'POST', { actionId, rating: 3 });
    await alice.call(path, 'POST', { actionId: crypto.randomUUID(), rating: 4 }, 409);
    const history = await alice.call(`/anchors/${id}/reviews`);
    expect(history).toHaveLength(1);
    const expected = fsrs(fsrsParameters).next(
      toEngine(before),
      new Date(history[0].reviewedAt),
      3,
    ).card;
    const [after] = await connection.db.select().from(fsrsCards).where(eq(fsrsCards.anchorId, id));
    expect(after.due.toISOString()).toBe(expected.due.toISOString());
    expect(after.stability).toBe(expected.stability);
    expect(after.difficulty).toBe(expected.difficulty);
    expect(after.reps).toBe(1);
    await alice.call('/auth/sign-out', 'POST', {});
    await alice.login();
    expect((await anchors(d))[0].card.reps).toBe(1);
    expect(await alice.call(`/anchors/${id}/reviews`)).toHaveLength(1);
  });
  it('calcule les quatre notes du moteur et empêche deux séances de noter la même carte simultanément', async () => {
    for (const rating of [1, 2, 3, 4]) {
      const id = crypto.randomUUID(),
        d = await doc([marked(id, `Réponse ${rating}`)]);
      const s = await reveal(await start([d.id])),
        other = await reveal(await start([d.id]));
      const path = `/learning/sessions/${s.id}/items/${s.current.itemId}/rate`;
      await alice.call(path, 'POST', { actionId: crypto.randomUUID(), rating });
      await alice.call(
        `/learning/sessions/${other.id}/items/${other.current.itemId}/rate`,
        'POST',
        { actionId: crypto.randomUUID(), rating },
        409,
      );
      const [a] = await anchors(d);
      expect(a.card.reps).toBe(1);
      expect(Number.isFinite(a.card.stability)).toBe(true);
      expect(new Date(a.card.due).getTime()).toBeGreaterThan(Date.now() - 1000);
    }
  });
  it('suspend un passage modifié et conserve son historique lors d’une validation et d’une priorité différente', async () => {
    const id = crypto.randomUUID();
    let d = await doc([marked(id, 'Réponse initiale')]);
    let s = await reveal(await start([d.id]));
    await alice.call(`/learning/sessions/${s.id}/items/${s.current.itemId}/rate`, 'POST', {
      actionId: crypto.randomUUID(),
      rating: 3,
    });
    const previous = (await anchors(d))[0].card;
    d = await save(d, [marked(id, 'Réponse complètement modifiée', 'medium')]);
    let a = (await anchors(d))[0];
    expect(a.status).toBe('needs_review');
    expect((await start([d.id])).total).toBe(0);
    await alice.call(`/anchors/${id}/confirm`, 'POST', { revision: a.revision - 1 }, 409);
    await alice.call(`/anchors/${id}/confirm`, 'POST', {
      revision: a.revision,
      resetSchedule: false,
    });
    a = (await anchors(d))[0];
    expect(a.status).toBe('active');
    expect(a.card).toEqual(previous);
    expect(await alice.call(`/anchors/${id}/reviews`)).toHaveLength(1);
    await alice.call(`/anchors/${id}/confirm`, 'POST', {
      revision: a.revision,
      resetSchedule: true,
    });
    a = (await anchors(d))[0];
    expect(a.card.reps).toBe(0);
    expect(await alice.call(`/anchors/${id}/reviews`)).toHaveLength(1);
  });
  it('préserve l’identité avec le style et les déplacements, réidentifie les copies et restaure les annotations', async () => {
    const id = crypto.randomUUID();
    let d = await doc([marked(id, 'Déplacer')]);
    const initial = d;
    d = await save(d, [
      { type: 'text', text: 'Avant ' },
      marked(id, 'Déplacer', 'high', 'Un indice', 'italic'),
    ]);
    expect((await anchors(d))[0].status).toBe('active');
    const copied = copyWithNewAnchors(d.content);
    const copy = await alice.call('/documents', 'POST', { title: 'Copie', content: copied }, 201);
    const [a] = await anchors(copy);
    expect(a.id).not.toBe(id);
    expect(a.sourceId).toBe(id);
    expect(a.hint).toBe('Un indice');
    await bob.call(`/documents/${d.id}/anchors`, 'GET', undefined, 404);
    await bob.call(`/anchors/${id}/reviews`, 'GET', undefined, 404);
    await bob.call(`/anchors/${id}/confirm`, 'POST', { revision: 1 }, 404);
    const obsolete = d;
    d = await save(d, [{ type: 'text', text: 'Avant Déplacer' }]);
    expect((await anchors(d))[0].status).toBe('deleted');
    expect((await start([d.id])).total).toBe(0);
    await alice.call(
      `/documents/${d.id}`,
      'PUT',
      { revision: obsolete.revision, title: d.title, content: initial.content, layout: d.layout },
      409,
    );
    d = await save(d, initial.content.content[0].content);
    expect((await anchors(d))[0].status).toBe('active');
    expect((await anchors(d))[0].id).toBe(id);
  });
  it('exclut une annotation fragmentée, une suppression et un document mis à la corbeille pendant une séance', async () => {
    const id = crypto.randomUUID();
    let d = await doc([marked(id, 'Réponse')]);
    const s = await reveal(await start([d.id]));
    d = await save(d, [
      marked(id, 'Ré'),
      { type: 'text', text: 'insertion sans marque' },
      marked(id, 'ponse'),
    ]);
    let a = (await anchors(d))[0];
    expect(a.status).toBe('needs_review');
    await alice.call(`/anchors/${id}/confirm`, 'POST', { revision: a.revision }, 409);
    await alice.call(
      `/learning/sessions/${s.id}/items/${s.current.itemId}/rate`,
      'POST',
      { actionId: crypto.randomUUID(), rating: 3 },
      409,
    );
    expect((await alice.call(`/learning/sessions/${s.id}`)).skipped).toBe(1);
    const other = await doc([marked(crypto.randomUUID(), 'Autre')]);
    const session = await start([other.id]);
    await alice.call(`/documents/${other.id}/trash`, 'POST', {
      revision: other.revision,
      deleted: true,
    });
    expect((await alice.call(`/learning/sessions/${session.id}`)).status).toBe('completed');
    await bob.call(`/learning/sessions/${session.id}`, 'GET', undefined, 404);
  });
  it('ne confond pas un instant UTC avec sa représentation dans un autre fuseau', () => {
    const instant = new Date('2026-10-25T01:30:00.000Z');
    const paris = new Intl.DateTimeFormat('fr', {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      minute: '2-digit',
    }).format(instant);
    const newYork = new Intl.DateTimeFormat('fr', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
    }).format(instant);
    expect(paris).not.toBe(newYork);
    expect(instant.toISOString()).toBe('2026-10-25T01:30:00.000Z');
  });
  it('supprime un compte de contrôle et ses historiques sans laisser d’orphelins', async () => {
    const id = crypto.randomUUID(),
      temporary = new Client();
    await connection.db
      .insert(user)
      .values({
        id: temporary.id,
        email: temporary.email,
        name: 'Temporaire',
        emailVerified: true,
      });
    await connection.db
      .insert(account)
      .values({
        id: crypto.randomUUID(),
        accountId: temporary.id,
        userId: temporary.id,
        providerId: 'credential',
        password: await hashPassword(password),
      });
    await temporary.login();
    const d = await temporary.call(
      '/documents',
      'POST',
      { title: 'Temporaire', content: content([marked(id, 'Réponse temporaire')]) },
      201,
    );
    const s = await temporary.call(
      '/learning/sessions',
      'POST',
      { id: crypto.randomUUID(), filters: { documentIds: [d.id] } },
      201,
    );
    await temporary.call(`/learning/sessions/${s.id}/items/${s.current.itemId}/reveal`, 'POST', {});
    await temporary.call(`/learning/sessions/${s.id}/items/${s.current.itemId}/rate`, 'POST', {
      actionId: crypto.randomUUID(),
      rating: 3,
    });
    await connection.db.delete(user).where(eq(user.id, temporary.id));
    expect(
      await connection.db.select().from(reviews).where(eq(reviews.ownerId, temporary.id)),
    ).toHaveLength(0);
  });
});
