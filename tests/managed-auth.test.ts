import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { openLocalDatabase } from '../scripts/local-database';
import { resolveManagedIdentity } from '../server/managed-auth';
import { user, profiles, documents, authIdentities } from '../server/db/schema';
import { emptyDocument } from '../src/shared/document';

let connection: Awaited<ReturnType<typeof openLocalDatabase>>;
beforeAll(async () => {
  connection = await openLocalDatabase({
    development: true,
    baseURL: 'http://localhost:5173',
    secret: 'test-only-managed-auth-migration-secret',
    localDir: await mkdtemp(join(tmpdir(), 'lab-managed-')),
    google: false,
    mail: false,
  });
});
afterAll(async () => {
  await connection?.close();
});
describe('Migration des identités Neon sans réattribution des documents', () => {
  it('rattache une identité vérifiée au compte historique sans changer son rôle ni ses documents', async () => {
    const db = connection.db;
    const oldId = crypto.randomUUID();
    await db.insert(user).values({
      id: oldId,
      email: 'historique@example.test',
      name: 'Ancien compte',
      emailVerified: true,
    });
    await db.insert(profiles).values({ userId: oldId, role: 'premium' });
    const [doc] = await db
      .insert(documents)
      .values({ ownerId: oldId, title: 'À préserver', content: emptyDocument })
      .returning();
    const identity = {
      id: crypto.randomUUID(),
      email: 'HISTORIQUE@example.test',
      name: 'Neon',
      emailVerified: true,
    };
    expect(await resolveManagedIdentity(db, identity)).toBe(oldId);
    expect(await resolveManagedIdentity(db, identity)).toBe(oldId);
    expect((await db.select().from(profiles).where(eq(profiles.userId, oldId)))[0].role).toBe(
      'premium',
    );
    expect((await db.select().from(documents).where(eq(documents.id, doc.id)))[0].ownerId).toBe(
      oldId,
    );
    expect(
      await db.select().from(authIdentities).where(eq(authIdentities.subject, identity.id)),
    ).toHaveLength(1);
  });
  it('ne lie jamais un email non vérifié, même si le navigateur revendique un compte existant', async () => {
    await expect(
      resolveManagedIdentity(connection.db, {
        id: crypto.randomUUID(),
        email: 'historique@example.test',
        name: 'Intrus',
        emailVerified: false,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('préserve un ancien compte non vérifié sans en céder les documents', async () => {
    await connection.db.insert(user).values({
      id: crypto.randomUUID(),
      email: 'non-verifie@example.test',
      name: 'Ancien',
      emailVerified: false,
    });
    await expect(
      resolveManagedIdentity(connection.db, {
        id: crypto.randomUUID(),
        email: 'non-verifie@example.test',
        name: 'Neon',
        emailVerified: true,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('refuse une seconde identité pour un compte déjà associé', async () => {
    await expect(
      resolveManagedIdentity(connection.db, {
        id: crypto.randomUUID(),
        email: 'historique@example.test',
        name: 'Autre',
        emailVerified: true,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('provisionne les nouveaux comptes avec le rôle gratuit, indépendamment du rôle Neon', async () => {
    const identity = {
      id: crypto.randomUUID(),
      email: 'nouveau@example.test',
      name: 'Nouveau',
      emailVerified: true,
      role: 'admin',
    };
    const id = await resolveManagedIdentity(connection.db, identity);
    expect(
      (await connection.db.select().from(profiles).where(eq(profiles.userId, id)))[0].role,
    ).toBe('free');
  });
  it('réserve le rôle propriétaire au sujet Neon explicitement configuré côté serveur', async () => {
    const identity = {
      id: crypto.randomUUID(),
      email: 'proprietaire@example.test',
      name: 'Propriétaire',
      emailVerified: true,
    };
    const id = await resolveManagedIdentity(connection.db, identity, identity.id);
    expect(
      (await connection.db.select().from(profiles).where(eq(profiles.userId, id)))[0].role,
    ).toBe('owner');
    expect(await resolveManagedIdentity(connection.db, identity, identity.id)).toBe(id);
    const other = {
      id: crypto.randomUUID(),
      email: 'gratuit@example.test',
      name: 'Autre',
      emailVerified: true,
    };
    const otherId = await resolveManagedIdentity(connection.db, other, identity.id);
    expect(
      (await connection.db.select().from(profiles).where(eq(profiles.userId, otherId)))[0].role,
    ).toBe('free');
  });
});
