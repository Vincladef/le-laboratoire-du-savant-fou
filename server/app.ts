import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { bodyLimit } from 'hono/body-limit';
import { and, eq, isNull, isNotNull, desc, ilike, or, sql, inArray, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './db';
import { createAuth } from './auth';
import type { AppConfig } from './config';
import { documents, folders, versions, profiles, assets, memoryAnchors, user } from './db/schema';
import {
  contentSchema,
  layoutSchema,
  emptyDocument,
  defaultLayout,
  plainText,
  assetIds,
  extractAnchors,
  type RichNode,
} from '../src/shared/document';
import { createStorage } from './storage';

const uuid = z.string().uuid();
const titleSchema = z.string().trim().min(1).max(200);
const saveSchema = z
  .object({
    revision: z.number().int().positive(),
    title: titleSchema,
    content: contentSchema,
    layout: layoutSchema,
    folderId: uuid.nullable().optional(),
  })
  .strict();
const failure = (status: 400 | 403 | 404 | 409 | 413 | 429 | 503, message: string) => {
  throw new HTTPException(status, { message });
};
const quota = { documents: 100, bytes: 25 * 1024 * 1024, image: 4 * 1024 * 1024 };
export function createApp(db: Database, config: AppConfig) {
  const auth = createAuth(db, config);
  const storage = createStorage(config);
  const app = new Hono<{ Variables: { userId: string } }>();
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 6 * 1024 * 1024,
      onError: (c) => c.json({ error: 'Requête trop volumineuse.' }, 413),
    }),
  );
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) &&
      c.req.header('Origin') !== config.baseURL
    )
      return c.json({ error: 'Origine de la requête non autorisée.' }, 403);
    await next();
  });
  app.get('/api/health', async (c) => {
    await db.execute(sql`select 1`);
    return c.json({
      status: 'ok',
      database: config.development ? 'local-postgresql' : 'postgresql',
      email: config.development ? 'local-mailbox' : config.mail ? 'configured' : 'missing',
    });
  });
  app.get('/api/config', (c) =>
    c.json({
      local: config.development,
      google: config.google,
      email: config.development || config.mail,
    }),
  );
  app.on(['GET', 'POST'], '/api/auth/*', async (c) => {
    if (
      !config.development &&
      !config.mail &&
      [
        '/api/auth/sign-up/email',
        '/api/auth/request-password-reset',
        '/api/auth/send-verification-email',
      ].includes(c.req.path)
    )
      return c.json(
        { message: 'L’envoi des emails doit être configuré par le propriétaire du service.' },
        503,
      );
    return auth.handler(c.req.raw);
  });
  app.use('/api/*', async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: 'Connectez-vous pour accéder à votre espace.' }, 401);
    c.set('userId', session.user.id);
    await next();
  });
  const owner = (id: string, userId: string) =>
    and(eq(documents.id, uuid.parse(id)), eq(documents.ownerId, userId));
  async function ownedDocument(id: string, userId: string) {
    const [doc] = await db.select().from(documents).where(owner(id, userId));
    if (!doc) failure(404, 'Document introuvable.');
    return doc;
  }
  async function validFolder(id: string | null | undefined, userId: string, runner: any = db) {
    if (!id) return;
    const [folder] = await runner
      .select()
      .from(folders)
      .where(and(eq(folders.id, id), eq(folders.ownerId, userId)));
    if (!folder) failure(404, 'Dossier introuvable.');
  }
  async function validAssets(content: RichNode, userId: string) {
    const ids = assetIds(content);
    if (!ids.length) return;
    const own = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.ownerId, userId), inArray(assets.id, ids)));
    if (own.length !== ids.length) failure(403, 'Une image n’appartient pas à votre espace.');
  }
  async function lockProfile(tx: any, userId: string) {
    await tx.insert(profiles).values({ userId }).onConflictDoNothing();
    await tx.select().from(profiles).where(eq(profiles.userId, userId)).for('update');
  }
  async function snapshot(tx: any, doc: typeof documents.$inferSelect, reason: string) {
    await tx.insert(versions).values({
      documentId: doc.id,
      ownerId: doc.ownerId,
      revision: doc.revision,
      title: doc.title,
      content: doc.content,
      layout: doc.layout,
      reason,
    });
    const anchors = extractAnchors(doc.content as RichNode);
    await tx
      .update(memoryAnchors)
      .set({ status: 'deleted', documentRevision: doc.revision, updatedAt: new Date() })
      .where(
        and(
          eq(memoryAnchors.documentId, doc.id),
          ...(anchors.length
            ? [
                notInArray(
                  memoryAnchors.id,
                  anchors.map((a) => a.id),
                ),
              ]
            : []),
        ),
      );
    for (const a of anchors) {
      const [existing] = await tx.select().from(memoryAnchors).where(eq(memoryAnchors.id, a.id));
      if (existing && (existing.documentId !== doc.id || existing.ownerId !== doc.ownerId))
        failure(409, 'Identité de passage déjà utilisée ; copiez le passage via l’éditeur.');
      await tx
        .insert(memoryAnchors)
        .values({
          id: a.id,
          sourceId: a.sourceId,
          documentId: doc.id,
          ownerId: doc.ownerId,
          quote: a.quote,
          originalSlice: a.slices,
          documentRevision: doc.revision,
        })
        .onConflictDoUpdate({
          target: memoryAnchors.id,
          set: {
            quote: a.quote,
            status:
              existing?.quote !== a.quote || existing?.status === 'needs_review'
                ? 'needs_review'
                : 'active',
            documentRevision: doc.revision,
            updatedAt: new Date(),
          },
        });
    }
  }
  app.get('/api/profile', async (c) => {
    await db
      .insert(profiles)
      .values({ userId: c.get('userId') })
      .onConflictDoNothing();
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, c.get('userId')));
    return c.json({ ...profile, quotas: quota });
  });
  app.patch('/api/profile', async (c) => {
    const data = z
      .object({
        name: z.string().trim().min(1).max(100),
        timezone: z
          .string()
          .max(100)
          .refine((v) => {
            try {
              new Intl.DateTimeFormat('fr', { timeZone: v });
              return true;
            } catch {
              return false;
            }
          }),
      })
      .strict()
      .parse(await c.req.json());
    await db.transaction(async (tx) => {
      await tx
        .update(user)
        .set({ name: data.name, updatedAt: new Date() })
        .where(eq(user.id, c.get('userId')));
      await tx
        .update(profiles)
        .set({
          preferences: sql`${profiles.preferences} || ${JSON.stringify({ timezone: data.timezone })}::jsonb`,
          updatedAt: new Date(),
        })
        .where(eq(profiles.userId, c.get('userId')));
    });
    return c.json({ ok: true });
  });
  app.get('/api/folders', async (c) =>
    c.json(
      await db
        .select()
        .from(folders)
        .where(eq(folders.ownerId, c.get('userId')))
        .orderBy(folders.name),
    ),
  );
  app.post('/api/folders', async (c) => {
    const data = z
      .object({ name: titleSchema, parentId: uuid.nullable().default(null) })
      .strict()
      .parse(await c.req.json());
    const result = await db.transaction(async (tx) => {
      await lockProfile(tx, c.get('userId'));
      await validFolder(data.parentId, c.get('userId'), tx);
      const [folder] = await tx
        .insert(folders)
        .values({ ...data, ownerId: c.get('userId') })
        .returning();
      return folder;
    });
    return c.json(result, 201);
  });
  app.patch('/api/folders/:id', async (c) => {
    const id = uuid.parse(c.req.param('id'));
    const userId = c.get('userId');
    const data = z
      .object({ name: titleSchema.optional(), parentId: uuid.nullable().optional() })
      .strict()
      .parse(await c.req.json());
    return c.json(
      await db.transaction(async (tx) => {
        await lockProfile(tx, userId);
        const all = await tx.select().from(folders).where(eq(folders.ownerId, userId));
        if (!all.find((f) => f.id === id)) failure(404, 'Dossier introuvable.');
        let parent = data.parentId;
        const visited = new Set([id]);
        while (parent) {
          if (visited.has(parent))
            failure(400, 'Un dossier ne peut pas contenir son propre parent.');
          visited.add(parent);
          const item = all.find((f) => f.id === parent);
          if (!item) failure(404, 'Dossier parent introuvable.');
          parent = item!.parentId;
        }
        const [result] = await tx
          .update(folders)
          .set({ ...data, updatedAt: new Date() })
          .where(and(eq(folders.id, id), eq(folders.ownerId, userId)))
          .returning();
        return result;
      }),
    );
  });
  app.delete('/api/folders/:id', async (c) => {
    const id = uuid.parse(c.req.param('id')),
      userId = c.get('userId');
    await db.transaction(async (tx) => {
      await lockProfile(tx, userId);
      const children = await tx
        .select({ id: folders.id })
        .from(folders)
        .where(and(eq(folders.parentId, id), eq(folders.ownerId, userId)));
      const docs = await tx
        .select({ id: documents.id })
        .from(documents)
        .where(and(eq(documents.folderId, id), eq(documents.ownerId, userId)));
      if (children.length || docs.length)
        failure(
          409,
          'Déplacez d’abord les documents (y compris ceux dans la corbeille) et les sous-dossiers.',
        );
      const removed = await tx
        .delete(folders)
        .where(and(eq(folders.id, id), eq(folders.ownerId, userId)))
        .returning();
      if (!removed.length) failure(404, 'Dossier introuvable.');
    });
    return c.json({ ok: true });
  });
  app.get('/api/documents', async (c) => {
    const query = z
      .string()
      .max(200)
      .parse(c.req.query('q') || '');
    const folder = c.req.query('folder');
    const trash = c.req.query('trash') === '1';
    const conditions = [
      eq(documents.ownerId, c.get('userId')),
      trash ? isNotNull(documents.deletedAt) : isNull(documents.deletedAt),
    ];
    if (folder && folder !== 'all')
      conditions.push(
        folder === 'root' ? isNull(documents.folderId) : eq(documents.folderId, uuid.parse(folder)),
      );
    if (query) {
      const term = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
      conditions.push(or(ilike(documents.title, term), ilike(documents.plainText, term))!);
    }
    return c.json(
      await db
        .select({
          id: documents.id,
          title: documents.title,
          folderId: documents.folderId,
          revision: documents.revision,
          updatedAt: documents.updatedAt,
          createdAt: documents.createdAt,
          deletedAt: documents.deletedAt,
          lastOpenedAt: documents.lastOpenedAt,
          excerpt: sql<string>`left(${documents.plainText}, 180)`,
        })
        .from(documents)
        .where(and(...conditions))
        .orderBy(desc(documents.updatedAt))
        .limit(500),
    );
  });
  app.post('/api/documents', async (c) => {
    const data = z
      .object({
        title: titleSchema.default('Document sans titre'),
        folderId: uuid.nullable().default(null),
        content: contentSchema.default(emptyDocument),
        layout: layoutSchema.default(defaultLayout),
      })
      .strict()
      .parse(await c.req.json());
    await validAssets(data.content, c.get('userId'));
    const doc = await db.transaction(async (tx) => {
      await lockProfile(tx, c.get('userId'));
      await validFolder(data.folderId, c.get('userId'), tx);
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(documents)
        .where(eq(documents.ownerId, c.get('userId')));
      if (count >= quota.documents)
        failure(413, 'La limite actuelle de 100 documents est atteinte.');
      const [created] = await tx
        .insert(documents)
        .values({
          ...data,
          content: data.content as unknown as Record<string, unknown>,
          plainText: plainText(data.content),
          ownerId: c.get('userId'),
        })
        .returning();
      await snapshot(tx, created, 'create');
      return created;
    });
    return c.json(doc, 201);
  });
  app.get('/api/documents/:id', async (c) =>
    c.json(await ownedDocument(c.req.param('id'), c.get('userId'))),
  );
  app.put('/api/documents/:id', async (c) => {
    const data = saveSchema.parse(await c.req.json());
    const id = uuid.parse(c.req.param('id'));
    const userId = c.get('userId');
    await validAssets(data.content, userId);
    const result = await db.transaction(async (tx) => {
      await lockProfile(tx, userId);
      await validFolder(data.folderId, userId, tx);
      const [current] = await tx.select().from(documents).where(owner(id, userId)).for('update');
      if (!current) failure(404, 'Document introuvable.');
      if (current.revision !== data.revision || current.deletedAt)
        return { conflict: true, current } as const;
      const [doc] = await tx
        .update(documents)
        .set({
          ...data,
          content: data.content as unknown as Record<string, unknown>,
          plainText: plainText(data.content),
          revision: current.revision + 1,
          updatedAt: new Date(),
        })
        .where(owner(id, userId))
        .returning();
      await snapshot(tx, doc, 'autosave');
      return { conflict: false, current: doc } as const;
    });
    return result.conflict
      ? c.json(
          {
            error: 'Une autre version existe. Vos modifications locales sont conservées.',
            current: result.current,
          },
          409,
        )
      : c.json(result.current);
  });
  app.put('/api/documents/:id/position', async (c) => {
    const { cursor } = z
      .object({ cursor: z.number().int().min(0).max(2_000_000) })
      .parse(await c.req.json());
    await ownedDocument(c.req.param('id'), c.get('userId'));
    await db.transaction(async (tx) => {
      await tx
        .update(documents)
        .set({ cursor, lastOpenedAt: new Date() })
        .where(owner(c.req.param('id'), c.get('userId')));
      await tx
        .update(profiles)
        .set({
          preferences: sql`${profiles.preferences} || ${JSON.stringify({ lastDocumentId: c.req.param('id') })}::jsonb`,
        })
        .where(eq(profiles.userId, c.get('userId')));
    });
    return c.json({ ok: true });
  });
  app.post('/api/documents/:id/trash', async (c) => {
    const { revision, deleted } = z
      .object({ revision: z.number().int().positive(), deleted: z.boolean() })
      .parse(await c.req.json());
    const result = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(documents)
        .where(owner(c.req.param('id'), c.get('userId')))
        .for('update');
      if (!current) failure(404, 'Document introuvable.');
      if (current.revision !== revision)
        failure(409, 'Le document a changé. Rechargez la bibliothèque.');
      const [doc] = await tx
        .update(documents)
        .set({
          deletedAt: deleted ? new Date() : null,
          revision: revision + 1,
          updatedAt: new Date(),
        })
        .where(owner(current.id, c.get('userId')))
        .returning();
      await snapshot(tx, doc, deleted ? 'trash' : 'restore-from-trash');
      return doc;
    });
    return c.json(result);
  });
  app.get('/api/documents/:id/versions', async (c) => {
    await ownedDocument(c.req.param('id'), c.get('userId'));
    return c.json(
      await db
        .select({
          id: versions.id,
          revision: versions.revision,
          title: versions.title,
          reason: versions.reason,
          createdAt: versions.createdAt,
        })
        .from(versions)
        .where(
          and(eq(versions.documentId, c.req.param('id')), eq(versions.ownerId, c.get('userId'))),
        )
        .orderBy(desc(versions.revision))
        .limit(100),
    );
  });
  app.get('/api/documents/:id/versions/:versionId', async (c) => {
    await ownedDocument(c.req.param('id'), c.get('userId'));
    const [version] = await db
      .select()
      .from(versions)
      .where(
        and(
          eq(versions.id, uuid.parse(c.req.param('versionId'))),
          eq(versions.documentId, c.req.param('id')),
          eq(versions.ownerId, c.get('userId')),
        ),
      );
    if (!version) failure(404, 'Version introuvable.');
    return c.json(version);
  });
  app.post('/api/assets', async (c) => {
    const form = await c.req.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0 || file.size > quota.image)
      failure(413, 'Image requise, de 4 Mo maximum.');
    const image = file as File;
    const buffer = await image.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const mime =
      bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
        ? 'image/png'
        : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          ? 'image/jpeg'
          : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
              String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
            ? 'image/webp'
            : null;
    if (!mime) failure(400, 'Formats acceptés : PNG, JPEG et WebP.');
    const id = crypto.randomUUID();
    // Serialize quota reservations per owner; compensate storage on transaction failure.
    try {
      await db.transaction(async (tx) => {
        await lockProfile(tx, c.get('userId'));
        const [{ used }] = await tx
          .select({ used: sql<number>`coalesce(sum(${assets.bytes}), 0)::int` })
          .from(assets)
          .where(eq(assets.ownerId, c.get('userId')));
        if (used + image.size > quota.bytes)
          failure(413, 'Le quota de fichiers de 25 Mo est atteint.');
        await storage.put(id, buffer);
        await tx.insert(assets).values({
          id,
          ownerId: c.get('userId'),
          storageKey: id,
          filename: image.name.slice(0, 200),
          mime: mime!,
          bytes: image.size,
        });
      });
    } catch (error) {
      await storage.delete(id).catch(() => {});
      throw error;
    }
    return c.json({ id, src: `/api/assets/${id}`, filename: image.name }, 201);
  });
  app.get('/api/assets/:id', async (c) => {
    const [asset] = await db
      .select()
      .from(assets)
      .where(
        and(eq(assets.id, uuid.parse(c.req.param('id'))), eq(assets.ownerId, c.get('userId'))),
      );
    if (!asset) failure(404, 'Image introuvable.');
    const data = await storage.get(asset.storageKey);
    if (!data) failure(404, 'Fichier introuvable.');
    return new Response(data, {
      headers: {
        'Content-Type': asset.mime,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
      },
    });
  });
  app.onError((err, c) => {
    if (err instanceof z.ZodError)
      return c.json({ error: err.issues.map((i) => i.message).join(' ') }, 400);
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    if (err instanceof SyntaxError) return c.json({ error: 'Requête JSON invalide.' }, 400);
    const incident = crypto.randomUUID();
    console.error('API incident', incident, err.name);
    return c.json(
      {
        error: 'Une erreur du serveur est survenue. Vos modifications locales sont conservées.',
        incident,
      },
      500,
    );
  });
  return { app, auth };
}
