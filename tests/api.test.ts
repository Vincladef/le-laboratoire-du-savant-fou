import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openLocalDatabase as openDatabase } from '../scripts/local-database';
import { createApp } from '../server/app';
import { getConfig } from '../server/config';
import { defaultLayout } from '../src/shared/document';
const origin = 'http://localhost:5173';
let connection: Awaited<ReturnType<typeof openDatabase>>;
let runtime: ReturnType<typeof createApp>;
let localDir: string;
const password = 'Test-Only-Password-42!';
class Client {
  cookies = new Map<string, string>();
  constructor(
    public email: string,
    public ip: string,
  ) {}
  async request(path: string, method = 'GET', body?: unknown, originOverride = origin) {
    const response = await runtime.app.fetch(
      new Request(path.startsWith('http') ? path : `${origin}/api${path}`, {
        method,
        headers: {
          Origin: originOverride,
          'Content-Type': 'application/json',
          Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
          'x-forwarded-for': this.ip,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const i = pair.indexOf('=');
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return response;
  }
  async signup() {
    const response = await this.request('/auth/sign-up/email', 'POST', {
      name: this.email.split('@')[0],
      email: this.email,
      password,
      callbackURL: '/library',
    });
    expect(response.status, await response.text()).toBe(200);
    const mail = await latestMail(this.email, 'Confirmer');
    const verified = await this.request(mail.url);
    expect(verified.status).toBe(302);
  }
}
async function latestMail(email: string, subject: string) {
  const entries = await Promise.all(
    (await readdir(`${localDir}/mail`)).map(async (f) =>
      JSON.parse(await readFile(`${localDir}/mail/${f}`, 'utf8')),
    ),
  );
  const found = entries.find((m) => m.to === email && m.subject.includes(subject));
  expect(found).toBeTruthy();
  return found;
}
const alice = new Client('alice@example.test', '192.0.2.1');
const bob = new Client('bob@example.test', '192.0.2.2');
const content = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
let document: any;
beforeAll(async () => {
  localDir = await mkdtemp(join(tmpdir(), 'laboratoire-api-'));
  const config = {
    development: true,
    baseURL: origin,
    secret: 'integration-test-secret-longer-than-thirty-two-characters',
    localDir,
    google: false,
    mail: false,
  };
  connection = await openDatabase(config);
  runtime = createApp(connection.db, config);
  await alice.signup();
  await bob.signup();
});
afterAll(async () => {
  await connection?.close();
});
describe('Authentification et cloisonnement réels dans PostgreSQL', () => {
  it('isole les clients du proxy local sans désactiver les limites de connexion', async () => {
    const first = new Client('proxy-a@example.test', '192.0.2.88, 127.0.0.1');
    const second = new Client('proxy-b@example.test', '192.0.2.89, 127.0.0.1');
    for (let i = 0; i < 8; i++)
      expect(
        (
          await first.request('/auth/sign-in/email', 'POST', {
            email: alice.email,
            password: 'Wrong-Password-42!',
          })
        ).status,
      ).toBe(401);
    expect(
      (await first.request('/auth/sign-in/email', 'POST', { email: alice.email, password })).status,
    ).toBe(429);
    expect(
      (
        await second.request('/auth/sign-in/email', 'POST', {
          email: alice.email,
          password: 'Wrong-Password-42!',
        })
      ).status,
    ).toBe(401);
  });
  it('confirme les emails et ouvre une session HttpOnly', async () => {
    const session = await alice.request('/auth/get-session');
    const data = await session.json();
    expect(data.user.email).toBe(alice.email);
    const client = new Client('cookies@example.test', '192.0.2.3');
    const response = await client.request('/auth/sign-in/email', 'POST', {
      email: alice.email,
      password,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('SameSite=Lax');
  });
  it('refuse les accès anonymes et les requêtes cross-origin', async () => {
    const anonymous = new Client('anonymous@example.test', '192.0.2.4');
    expect((await anonymous.request('/documents')).status).toBe(401);
    expect((await alice.request('/documents', 'POST', {}, 'https://evil.example')).status).toBe(
      403,
    );
  });
  it('crée et sauvegarde un document avec une version immuable', async () => {
    const response = await alice.request('/documents', 'POST', {
      title: 'Carnet de recherche',
      content: content('Première observation.'),
      layout: defaultLayout,
    });
    expect(response.status, await response.clone().text()).toBe(201);
    document = await response.json();
    expect(document.revision).toBe(1);
    const saved = await alice.request(`/documents/${document.id}`, 'PUT', {
      revision: 1,
      title: document.title,
      content: content('Deuxième observation.'),
      layout: defaultLayout,
    });
    expect(saved.status, await saved.clone().text()).toBe(200);
    document = await saved.json();
    expect(document.revision).toBe(2);
    const list = await (await alice.request(`/documents/${document.id}/versions`)).json();
    expect(list.map((v: any) => v.revision)).toEqual([2, 1]);
    const first = await (
      await alice.request(`/documents/${document.id}/versions/${list[1].id}`)
    ).json();
    expect(first.content.content[0].content[0].text).toBe('Première observation.');
  });
  it('détecte une sauvegarde obsolète sans écraser la version distante', async () => {
    const response = await alice.request(`/documents/${document.id}`, 'PUT', {
      revision: 1,
      title: 'Obsolète',
      content: content('Ne pas écraser'),
      layout: defaultLayout,
    });
    expect(response.status).toBe(409);
    const conflict = await response.json();
    expect(conflict.current.revision).toBe(2);
    expect((await (await alice.request(`/documents/${document.id}`)).json()).title).toBe(
      'Carnet de recherche',
    );
  });
  it('empêche un autre compte de lire, modifier ou consulter les versions', async () => {
    expect((await bob.request(`/documents/${document.id}`)).status).toBe(404);
    expect((await bob.request(`/documents/${document.id}/versions`)).status).toBe(404);
    expect(
      (
        await bob.request(`/documents/${document.id}`, 'PUT', {
          revision: 2,
          title: 'Vol',
          content: content('non'),
          layout: defaultLayout,
        })
      ).status,
    ).toBe(404);
    expect(await (await bob.request('/documents')).json()).toEqual([]);
  });
  it('interdit les changements de rôle depuis le navigateur', async () => {
    expect(
      (
        await alice.request('/profile', 'PATCH', {
          name: 'Alice',
          timezone: 'Europe/Paris',
          role: 'owner',
        })
      ).status,
    ).toBe(400);
    expect((await (await alice.request('/profile')).json()).role).toBe('free');
  });
  it('refuse les images distantes et les liens exécutables', async () => {
    const badImage = {
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'https://evil.example/track' } }],
    };
    expect((await alice.request('/documents', 'POST', { content: badImage })).status).toBe(400);
    const badLink = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Lien',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    };
    expect((await alice.request('/documents', 'POST', { content: badLink })).status).toBe(400);
  });
  it('organise les dossiers, refuse les cycles et les références entre comptes', async () => {
    const folder = await (await alice.request('/folders', 'POST', { name: 'Sciences' })).json();
    const child = await (
      await alice.request('/folders', 'POST', { name: 'Physique', parentId: folder.id })
    ).json();
    expect(
      (await alice.request(`/folders/${folder.id}`, 'PATCH', { parentId: child.id })).status,
    ).toBe(400);
    expect((await bob.request('/documents', 'POST', { folderId: folder.id })).status).toBe(404);
    expect((await alice.request(`/folders/${folder.id}`, 'DELETE')).status).toBe(409);
    expect((await alice.request(`/folders/${child.id}`, 'DELETE')).status).toBe(200);
    expect((await alice.request(`/folders/${folder.id}`, 'DELETE')).status).toBe(200);
  });
  it('recherche le contenu et récupère un document placé dans la corbeille', async () => {
    expect(
      (await (await alice.request('/documents?q=Deuxième')).json()).map((d: any) => d.id),
    ).toContain(document.id);
    expect((await (await alice.request('/documents?q=%25')).json()).length).toBe(0);
    const trashed = await alice.request(`/documents/${document.id}/trash`, 'POST', {
      revision: 2,
      deleted: true,
    });
    expect(trashed.status).toBe(200);
    expect((await (await alice.request('/documents')).json()).length).toBe(0);
    expect((await (await alice.request('/documents?trash=1')).json()).length).toBe(1);
    const restored = await alice.request(`/documents/${document.id}/trash`, 'POST', {
      revision: 3,
      deleted: false,
    });
    expect(restored.status).toBe(200);
    document = await restored.json();
  });
  it('conserve les données après déconnexion et reconnexion', async () => {
    expect((await alice.request('/auth/sign-out', 'POST', {})).status).toBe(200);
    expect((await alice.request('/documents')).status).toBe(401);
    expect(
      (await alice.request('/auth/sign-in/email', 'POST', { email: alice.email, password })).status,
    ).toBe(200);
    const persisted = await (await alice.request(`/documents/${document.id}`)).json();
    expect(persisted.content.content[0].content[0].text).toBe('Deuxième observation.');
  });
  it('réinitialise un mot de passe avec un lien à usage unique et révoque les sessions', async () => {
    const response = await alice.request('/auth/request-password-reset', 'POST', {
      email: alice.email,
      redirectTo: `${origin}/reset-password`,
    });
    expect(response.status).toBe(200);
    const mail = await latestMail(alice.email, 'Réinitialiser');
    const redirect = await alice.request(mail.url);
    expect(redirect.status).toBe(302);
    const token = new URL(redirect.headers.get('location')!).searchParams.get('token');
    expect(token).toBeTruthy();
    const newPassword = 'New-Verified-Password-123!';
    expect(
      (await alice.request('/auth/reset-password', 'POST', { token, newPassword })).status,
    ).toBe(200);
    expect((await alice.request('/documents')).status).toBe(401);
    expect(
      (await alice.request('/auth/reset-password', 'POST', { token, newPassword })).status,
    ).not.toBe(200);
    expect(
      (
        await alice.request('/auth/sign-in/email', 'POST', {
          email: alice.email,
          password: newPassword,
        })
      ).status,
    ).toBe(200);
  });
});
describe('Fichiers privés et redémarrage', () => {
  it('stocke les fichiers hors de PostgreSQL et bloque leur lecture et réutilisation par un autre compte', async () => {
    const form = new FormData();
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=',
      'base64',
    );
    form.append('file', new File([png], 'fixture.png', { type: 'image/png' }));
    const response = await runtime.app.fetch(
      new Request(`${origin}/api/assets`, {
        method: 'POST',
        body: form,
        headers: {
          Origin: origin,
          Cookie: [...alice.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        },
      }),
    );
    expect(response.status).toBe(201);
    const image = await response.json();
    const own = await alice.request(`/assets/${image.id}`);
    expect(own.status).toBe(200);
    expect(own.headers.get('content-type')).toBe('image/png');
    expect((await bob.request(`/assets/${image.id}`)).status).toBe(404);
    expect(
      (
        await bob.request('/documents', 'POST', {
          content: { type: 'doc', content: [{ type: 'image', attrs: { src: image.src } }] },
        })
      ).status,
    ).toBe(403);
    expect((await readFile(`${localDir}/assets/${image.id}`)).length).toBeGreaterThan(0);
  });
  it('rouvre la base avec les mêmes migrations sans perdre comptes ni documents', async () => {
    await connection.close();
    const config = {
      development: true,
      baseURL: origin,
      secret: 'integration-test-secret-longer-than-thirty-two-characters',
      localDir,
      google: false,
      mail: false,
    };
    connection = await openDatabase(config);
    runtime = createApp(connection.db, config);
    const response = await alice.request(`/documents/${document.id}`);
    expect(response.status).toBe(200);
    expect((await response.json()).content.content[0].content[0].text).toBe(
      'Deuxième observation.',
    );
  });
});
describe('Configuration de production', () => {
  it('refuse le mode local et toute absence de secrets en production', () => {
    const old = { NODE_ENV: process.env.NODE_ENV, LAB_LOCAL: process.env.LAB_LOCAL };
    process.env.NODE_ENV = 'production';
    process.env.LAB_LOCAL = '1';
    try {
      expect(() => getConfig()).toThrow();
    } finally {
      for (const [key, value] of Object.entries(old)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
