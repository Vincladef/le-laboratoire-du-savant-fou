import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { and, eq, sql } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { openLocalDatabase } from '../scripts/local-database';
import { createApp } from '../server/app';
import { account, fsrsCards, reviews, studySessions, studyItems, user } from '../server/db/schema';
import { matchesPassage, type MemoryPassage } from '../src/shared/learning';
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
async function evaluate(id: string, difficulty: string, difficultyRevision = 0, status = 200) {
  return alice.call(
    `/anchors/${id}/difficulty`,
    'PATCH',
    { difficulty, difficultyRevision },
    status,
  );
}
describe('Révision unique, annotations et difficulté persistante', () => {
  it('enregistre la difficulté choisie à la création sans écraser une évaluation ultérieure', async () => {
    for (const initialDifficulty of ['unrated', 'easy', 'medium', 'hard']) {
      const id = crypto.randomUUID();
      const node = marked(id, 'Passage avec difficulté', 'medium');
      node.marks!.find((m) => m.type === 'memoryAnchor')!.attrs!.initialDifficulty =
        initialDifficulty;
      const d = await doc([node]);
      expect((await anchors(d))[0]).toMatchObject({
        difficulty: initialDifficulty,
        difficultyRevision: 0,
      });
      await evaluate(id, 'easy');
      const updated = await save(d, [node]);
      expect((await anchors(updated))[0]).toMatchObject({
        difficulty: 'easy',
        difficultyRevision: 1,
      });
    }
    const invalid = marked(crypto.randomUUID(), 'Invalide');
    invalid.marks!.find((m) => m.type === 'memoryAnchor')!.attrs!.initialDifficulty = 'inventée';
    await alice.call(
      '/documents',
      'POST',
      { title: 'Invalide', content: content([invalid]), layout: defaultLayout },
      400,
    );
  });
  it('préserve les passages multistyles, indices et priorité ; aucune carte n’est créée', async () => {
    const id = crypto.randomUUID(),
      second = crypto.randomUUID();
    const d = await doc([
      marked(id, 'mémoire ', 'medium'),
      marked(id, 'formatée', 'medium', 'Un indice', 'italic'),
      { type: 'text', text: ' et ' },
      marked(second, 'science', 'low'),
    ]);
    const rows = await anchors(d);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      quote: 'mémoire formatée',
      hint: 'Un indice',
      priority: 'medium',
      difficulty: 'unrated',
      difficultyRevision: 0,
    });
    expect(rows[0]).not.toHaveProperty('card');
    expect(d.content.content[0].content[1].marks[0].type).toBe('italic');
    expect(await connection.db.select().from(fsrsCards)).toHaveLength(0);
  });
  it('change la priorité pendant la révision dans les fragments formatés, le document et la base', async () => {
    const id = crypto.randomUUID();
    const d = await doc([
      marked(id, 'Partie ', 'high', 'Indice', 'bold'),
      marked(id, 'formatée', 'high', 'Indice', 'italic'),
      { type: 'text', text: ' reste identique' },
    ]);
    const original = (await anchors(d))[0];
    await evaluate(id, 'hard');
    const result = await alice.call(`/anchors/${id}/priority`, 'PATCH', {
      priority: 'low',
      revision: original.revision,
    });
    expect(result.passage).toMatchObject({
      id,
      priority: 'low',
      revision: original.revision + 1,
    });
    expect(result.document.revision).toBe(d.revision + 1);
    const updatedDoc = await alice.call(`/documents/${d.id}`);
    expect(updatedDoc.revision).toBe(d.revision + 1);
    const parts = updatedDoc.content.content[0].content;
    expect(parts.slice(0, 2).map((n: RichNode) => n.marks?.find((m) => m.type === 'memoryAnchor')?.attrs?.priority))
      .toEqual(['low', 'low']);
    expect(parts[0].marks[0].type).toBe('bold');
    expect(parts[1].marks[0].type).toBe('italic');
    expect((await anchors(d))[0]).toMatchObject({
      priority: 'low',
      difficulty: 'hard',
      difficultyRevision: 1,
    });
    expect((await alice.call(`/documents/${d.id}/review`)).passages[0].priority).toBe('low');
    const retry = await alice.call(`/anchors/${id}/priority`, 'PATCH', {
      priority: 'low',
      revision: original.revision,
    });
    expect(retry.document.revision).toBe(updatedDoc.revision);
    const unchanged = await alice.call(`/anchors/${id}/priority`, 'PATCH', {
      priority: 'low',
      revision: result.passage.revision,
    });
    expect(unchanged.document.revision).toBe(updatedDoc.revision);
    const saved = await save(updatedDoc, parts);
    expect((await anchors(saved))[0].priority).toBe('low');
    const latest = (await anchors(saved))[0];
    const raised = await alice.call(`/anchors/${id}/priority`, 'PATCH', {
      priority: 'medium',
      revision: latest.revision,
    });
    expect(raised.passage.priority).toBe('medium');
    expect((await anchors(saved))[0].difficulty).toBe('hard');
  });
  it('protège les priorités des changements concurrents et des autres comptes', async () => {
    const id = crypto.randomUUID(), d = await doc([marked(id, 'Privé')]);
    const initial = (await anchors(d))[0];
    await bob.call(`/anchors/${id}/priority`, 'PATCH', { priority: 'low', revision: initial.revision }, 404);
    await alice.call(`/anchors/${id}/priority`, 'PATCH', { priority: 'urgent', revision: initial.revision }, 400);
    await alice.call(`/anchors/${id}/priority`, 'PATCH', { priority: 'low', revision: initial.revision, ownerId: bob.id }, 400);
    await alice.call(`/anchors/${id}/priority`, 'PATCH', { priority: 'low', revision: initial.revision });
    await alice.call(`/anchors/${id}/priority`, 'PATCH', { priority: 'medium', revision: initial.revision }, 409);
    expect((await anchors(d))[0].priority).toBe('low');
  });
  it('combine les filtres exacts, indépendants, avec toutes les valeurs par défaut', () => {
    const base = { status: 'active', priority: 'medium', difficulty: 'unrated' } as MemoryPassage;
    const all = {
      priority: ['high', 'medium', 'low'],
      difficulty: ['easy', 'medium', 'hard', 'unrated'],
    } as const;
    const filters = { priority: [...all.priority], difficulty: [...all.difficulty] };
    expect(matchesPassage(base, filters)).toBe(true);
    expect(matchesPassage(base, { ...filters, priority: ['high'] })).toBe(false);
    expect(matchesPassage(base, { priority: ['medium'], difficulty: ['unrated'] })).toBe(true);
    expect(matchesPassage(base, { priority: ['medium'], difficulty: ['easy'] })).toBe(false);
    expect(
      matchesPassage(base, { priority: ['high', 'medium'], difficulty: ['easy', 'unrated'] }),
    ).toBe(true);
    expect(matchesPassage(base, { priority: [], difficulty: [...all.difficulty] })).toBe(false);
    expect(matchesPassage(base, { priority: [...all.priority], difficulty: [] })).toBe(false);
    for (const priority of ['high', 'medium', 'low'] as const)
      for (const difficulty of ['easy', 'medium', 'hard', 'unrated'] as const)
        expect(
          matchesPassage(
            { ...base, priority, difficulty },
            { priority: [priority], difficulty: [difficulty] },
          ),
        ).toBe(true);
    expect(matchesPassage({ ...base, status: 'needs_review' }, filters)).toBe(false);
    expect(matchesPassage({ ...base, status: 'deleted' }, filters)).toBe(false);
  });
  it('enregistre une difficulté sans changer le texte, ses styles ou la révision documentaire', async () => {
    const id = crypto.randomUUID(),
      d = await doc([marked(id, 'Un texte')]);
    await evaluate(id, 'hard');
    const stored = await alice.call(`/documents/${d.id}`);
    expect(stored.content).toEqual(d.content);
    expect(stored.revision).toBe(d.revision);
    expect((await anchors(d))[0]).toMatchObject({
      difficulty: 'hard',
      difficultyRevision: 1,
      priority: 'high',
    });
    expect(await connection.db.select().from(reviews)).toHaveLength(0);
  });
  it('résiste aux réponses réseau perdues et aux changements concurrents de difficulté', async () => {
    const id = crypto.randomUUID(),
      d = await doc([marked(id, 'Réponse')]);
    const first = await evaluate(id, 'easy');
    expect(await evaluate(id, 'easy')).toEqual(first);
    await evaluate(id, 'hard', 0, 409);
    expect((await anchors(d))[0].difficulty).toBe('easy');
    await evaluate(id, 'hard', 1);
    await evaluate(id, 'easy', 0, 409);
    await evaluate(id, 'unrated', 2);
    expect((await anchors(d))[0]).toMatchObject({ difficulty: 'unrated', difficultyRevision: 3 });
  });
  it('permet toutes les difficultés et refuse les notes FSRS et champs arbitraires', async () => {
    const id = crypto.randomUUID();
    await doc([marked(id, 'Réponse')]);
    for (const [revision, difficulty] of ['easy', 'medium', 'hard', 'unrated'].entries())
      await evaluate(id, difficulty, revision);
    await evaluate(id, 'forgotten', 4, 400);
    await evaluate(id, 'easy', -1, 400);
    await alice.call(
      `/anchors/${id}/difficulty`,
      'PATCH',
      { difficulty: 'easy', difficultyRevision: 4, ownerId: bob.id },
      400,
    );
    await alice.call(`/anchors/${id}/difficulty`, 'PATCH', { rating: 4 }, 400);
  });
  it('suit l’ordre documentaire, même après des mises à jour et un déplacement de passages', async () => {
    const first = crypto.randomUUID(),
      second = crypto.randomUUID();
    let d = await doc([
      marked(first, 'Premier'),
      { type: 'text', text: ' et ' },
      marked(second, 'Deuxième'),
    ]);
    await evaluate(first, 'hard');
    const read = () => alice.call(`/documents/${d.id}/review`);
    expect((await anchors(d)).map((p: any) => p.id)).toEqual([first, second]);
    expect((await read()).passages.map((p: any) => p.id)).toEqual([first, second]);
    d = await save(d, [
      marked(second, 'Deuxième'),
      { type: 'text', text: ' puis ' },
      marked(first, 'Premier'),
    ]);
    expect((await read()).passages.map((p: any) => p.id)).toEqual([second, first]);
    expect((await anchors(d)).find((p: any) => p.id === first).difficulty).toBe('hard');
  });
  it('modifier priorité, indice, style ou paragraphe ne réinitialise pas la difficulté', async () => {
    const id = crypto.randomUUID();
    let d = await doc([marked(id, 'Original')]);
    await evaluate(id, 'medium');
    d = await save(d, [
      { type: 'text', text: 'Avant ' },
      marked(id, 'Original', 'low', 'Indice amélioré', 'italic'),
      { type: 'text', text: ' après.' },
    ]);
    expect((await anchors(d))[0]).toMatchObject({
      difficulty: 'medium',
      difficultyRevision: 1,
      priority: 'low',
      hint: 'Indice amélioré',
      status: 'active',
    });
    expect(d.content.content[0].content[1].marks[0].type).toBe('italic');
  });
  it('une réponse modifiée doit être validée ; validation ne programme ni ne réinitialise rien', async () => {
    const id = crypto.randomUUID();
    let d = await doc([marked(id, 'Original')]);
    await evaluate(id, 'hard');
    d = await save(d, [marked(id, 'Nouveau texte')]);
    let p = (await anchors(d))[0];
    expect(p.status).toBe('needs_review');
    await alice.call(`/anchors/${id}/confirm`, 'POST', { revision: p.revision - 1 }, 409);
    await alice.call(`/anchors/${id}/confirm`, 'POST', { revision: p.revision });
    p = (await anchors(d))[0];
    expect(p).toMatchObject({ status: 'active', difficulty: 'hard', difficultyRevision: 1 });
    d = await save(d, [marked(id, 'Nouveau texte'), { type: 'text', text: ' contexte' }]);
    expect((await anchors(d))[0].status).toBe('active');
  });
  it('un passage fragmenté reste visible et ne peut pas être confirmé à tort', async () => {
    const id = crypto.randomUUID();
    let d = await doc([marked(id, 'Réponse')]);
    d = await save(d, [marked(id, 'Ré'), { type: 'text', text: 'intrus' }, marked(id, 'ponse')]);
    const p = (await anchors(d))[0];
    expect(p.status).toBe('needs_review');
    await alice.call(`/anchors/${id}/confirm`, 'POST', { revision: p.revision }, 409);
  });
  it('suppression, restauration et duplication conservent la bonne identité', async () => {
    const id = crypto.randomUUID();
    let d = await doc([marked(id, 'Réponse')]);
    const original = structuredClone(d);
    await evaluate(id, 'easy');
    d = await save(d, [{ type: 'text', text: 'Réponse sans annotation' }]);
    expect((await anchors(d))[0]).toMatchObject({ status: 'deleted', difficulty: 'easy' });
    await evaluate(id, 'hard', 1, 404);
    d = await save(d, original.content.content[0].content);
    expect((await anchors(d))[0]).toMatchObject({ status: 'active', difficulty: 'easy' });
    const copied = await alice.call(
      '/documents',
      'POST',
      { title: 'Copie', content: copyWithNewAnchors(d.content) },
      201,
    );
    const copy = (await anchors(copied))[0];
    expect(copy.id).not.toBe(id);
    expect(copy.sourceId).toBe(id);
    expect(copy.difficulty).toBe('unrated');
  });
  it('lit le document et ses passages de façon cohérente et isole les comptes', async () => {
    const id = crypto.randomUUID(),
      d = await doc([marked(id, 'Privé')]);
    const view = await alice.call(`/documents/${d.id}/review`);
    expect(view.document.content).toEqual(d.content);
    expect(view.passages[0].id).toBe(id);
    await bob.call(`/documents/${d.id}/review`, 'GET', undefined, 404);
    await bob.call(`/documents/${d.id}/anchors`, 'GET', undefined, 404);
    await bob.call(
      `/anchors/${id}/difficulty`,
      'PATCH',
      { difficulty: 'easy', difficultyRevision: 0 },
      404,
    );
    await bob.call(`/anchors/${id}/confirm`, 'POST', { revision: 1 }, 404);
  });
  it('persiste après déconnexion et reconnexion, sans calendrier', async () => {
    const id = crypto.randomUUID(),
      d = await doc([marked(id, 'Durable')]);
    await evaluate(id, 'medium');
    await alice.call('/auth/sign-out', 'POST', {});
    await alice.call(`/documents/${d.id}/review`, 'GET', undefined, 401);
    await alice.login();
    expect((await alice.call(`/documents/${d.id}/review`)).passages[0].difficulty).toBe('medium');
  });
  it('un document à la corbeille ne peut plus être révisé ni évalué', async () => {
    const id = crypto.randomUUID(),
      d = await doc([marked(id, 'Archivé')]);
    await alice.call(`/documents/${d.id}/trash`, 'POST', { revision: d.revision, deleted: true });
    await alice.call(`/documents/${d.id}/review`, 'GET', undefined, 404);
    await evaluate(id, 'easy', 0, 404);
  });
  it('retire les anciens endpoints et ne crée aucune séance ni carte', async () => {
    await alice.call('/learning/eligible', 'POST', {}, 410);
    await alice.call('/learning/sessions', 'GET', undefined, 410);
    await alice.call('/learning/sessions', 'POST', { id: crypto.randomUUID(), filters: {} }, 410);
    await alice.call(
      `/learning/sessions/${crypto.randomUUID()}/items/${crypto.randomUUID()}/rate`,
      'POST',
      { rating: 4 },
      410,
    );
    await alice.call(`/anchors/${crypto.randomUUID()}/reviews`, 'GET', undefined, 410);
    expect(await connection.db.select().from(studySessions)).toHaveLength(0);
    expect(await connection.db.select().from(studyItems)).toHaveLength(0);
    expect(await connection.db.select().from(fsrsCards)).toHaveLength(0);
    expect(await connection.db.select().from(reviews)).toHaveLength(0);
  });
});
