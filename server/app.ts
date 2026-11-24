import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { bodyLimit } from 'hono/body-limit';
import { and, eq, isNull, isNotNull, desc, ilike, or, sql, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './db';
import { createAuth } from './auth';
import { managedAuth, resolveManagedIdentity } from './managed-auth';
import type { AppConfig } from './config';
import { documents, folders, versions, profiles, assets, memoryAnchors, user } from './db/schema';
import { syncAnchors } from './anchors';
import { learningRoutes } from './learning';
import { aiRoutes, type AiGenerator } from './ai';
import { billingService } from './billing/service';
import { billingRoutes } from './billing/routes';
import { stripeGateway, type StripeGateway } from './billing/stripe';
import { rights } from './billing/rights';
import { plans, offerVersion } from '../src/shared/plans';
import {
  contentSchema,
  layoutSchema,
  emptyDocument,
  defaultLayout,
  plainText,
  assetIds,
  type RichNode,
} from '../src/shared/document';
import { documentShares, sharedCopies } from './db/schema';
import { randomBytes } from 'node:crypto';
import { copyWithNewAnchors } from '../src/shared/document';
import { editorPreferencesSchema, validateShortcuts } from '../src/shared/editor-preferences';
import { validateClozeMarkers } from '../src/editor/cloze-markers';
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
export function createApp(
  db: Database,
  config: AppConfig,
  dependencies: { stripe?: StripeGateway; ai?: AiGenerator } = {},
) {
  const auth = config.neonAuthURL ? null : createAuth(db, config);
  const managed = config.neonAuthURL ? managedAuth(config, db) : null;
  const storage = createStorage(config);
  const billing = billingService(
    db,
    config,
    dependencies.stripe || (config.billing ? stripeGateway(config.billing) : undefined),
  );
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
      c.req.header('Origin') !== config.baseURL &&
      !(c.req.method === 'POST' && c.req.path === '/api/billing/webhook')
    )
      return c.json({ error: 'Origine de la requête non autorisée.' }, 403);
    await next();
  });
  // Only this exact server-to-server endpoint is exempt from browser Origin checking.
  // It authenticates the original bytes with Stripe's official signature verifier instead.
  app.post('/api/billing/webhook', async (c) => {
    const signature = c.req.header('stripe-signature');
    if (!signature) return c.json({ error: 'Signature Stripe requise.' }, 400);
    const body = await c.req.text();
    if (new TextEncoder().encode(body).length > 1024 * 1024)
      return c.json({ error: 'Événement trop volumineux.' }, 413);
    return c.json(await billing.webhook(body, signature));
  });
  app.get('/api/billing/plans', (c) =>
    c.json({
      plans,
      offerVersion,
      checkoutReady: billing.checkoutReady(),
      mode: config.billing?.mode || null,
      limitsApproved: Boolean(config.legal?.reviewed && config.billing?.enabled),
      termsVersion: config.legal?.termsVersion || null,
    }),
  );
  app.get('/api/legal', (c) =>
    c.json({ configured: Boolean(config.legal), details: config.legal || null }),
  );
  app.get('/api/health', async (c) => {
    await db.execute(sql`select 1`);
    return c.json({
      status: 'ok',
      database: config.development ? 'local-postgresql' : 'postgresql',
      email: config.development ? 'local-mailbox' : config.mail ? 'configured' : 'missing',
      authentication: managed ? 'neon-managed' : config.development ? 'local' : 'legacy',
    });
  });
  app.get('/api/config', (c) =>
    c.json({
      local: config.development,
      google: config.google,
      email: config.development || config.mail,
      managed: Boolean(managed),
    }),
  );
  app.on(['GET', 'POST'], '/api/auth/*', async (c) => {
    if (managed) {
      const response = await managed.handler(c);
      if (
        [
          '/api/auth/get-session',
          '/api/auth/sign-in/email',
          '/api/auth/email-otp/verify-email',
        ].includes(c.req.path) &&
        response.ok
      ) {
        const data = await response.clone().json();
        if (data?.user) {
          const id = await resolveManagedIdentity(db, data.user, config.ownerNeonSubject);
          // Stable local identifiers also preserve this account's unsynchronized browser drafts.
          const headers = new Headers(response.headers);
          headers.delete('Content-Length');
          const safeUser = {
            id,
            name: data.user.name,
            email: data.user.email,
            emailVerified: data.user.emailVerified,
            image: data.user.image,
            createdAt: data.user.createdAt,
            updatedAt: data.user.updatedAt,
          };
          return new Response(
            JSON.stringify({
              ...data,
              user: safeUser,
              ...(data.session ? { session: { ...data.session, userId: id } } : {}),
            }),
            {
              status: response.status,
              headers,
            },
          );
        }
      }
      return response;
    }
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
    return auth!.handler(c.req.raw);
  });
  async function publicShare(token: string, runner: any = db) {
    if (!/^[a-f0-9]{64}$/.test(token)) failure(404, 'Lien de partage indisponible.');
    const [row] = await runner.select().from(documentShares).where(eq(documentShares.token, token));
    if (!row) failure(404, 'Lien de partage indisponible.');
    const [source] = await runner.select().from(documents).where(eq(documents.id, row.documentId));
    if (!source || source.deletedAt) failure(404, 'Lien de partage indisponible.');
    return {
      row,
      source,
      value:
        row.mode === 'live'
          ? { title: source.title, content: source.content as RichNode, layout: source.layout }
          : row.snapshot,
    };
  }
  app.get('/api/public/:token', async (c) => {
    const { value } = await publicShare(c.req.param('token'));
    c.header('X-Robots-Tag', 'noindex, nofollow');
    return c.json(value);
  });
  app.get('/api/public/:token/assets/:id', async (c) => {
    const { row, value } = await publicShare(c.req.param('token'));
    const id = uuid.parse(c.req.param('id'));
    if (!assetIds(value.content).includes(id)) failure(404, 'Image indisponible.');
    const [asset] = await db
      .select()
      .from(assets)
      .where(and(eq(assets.id, id), eq(assets.ownerId, row.ownerId)));
    if (!asset) failure(404, 'Image indisponible.');
    const data = await storage.get(asset.storageKey);
    if (!data) failure(404, 'Image indisponible.');
    return new Response(data, {
      headers: {
        'Content-Type': asset.mime,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
  app.use('/api/*', async (c, next) => {
    const session = managed
      ? await managed.session(c)
      : await auth!.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: 'Connectez-vous pour accéder à votre espace.' }, 401);
    c.set(
      'userId',
      managed
        ? await resolveManagedIdentity(db, session.user, config.ownerNeonSubject)
        : session.user.id,
    );
    await next();
  });
  // Small account-level preferences; independent of document saves and Netlify deploys.
  app.get('/api/editor/preferences', async (c) => {
    const [profile] = await db
      .select({ preferences: profiles.preferences })
      .from(profiles)
      .where(eq(profiles.userId, c.get('userId')));
    const value = editorPreferencesSchema.safeParse(
      (profile?.preferences as Record<string, unknown> | undefined)?.editor,
    );
    return c.json(value.success ? value.data : null);
  });
  app.put('/api/editor/preferences', async (c) => {
    const value = editorPreferencesSchema.parse(await c.req.json());
    const markerError = validateClozeMarkers(value.markers);
    const shortcutError = validateShortcuts(value.shortcuts);
    if (markerError || shortcutError) return c.json({ error: markerError || shortcutError }, 400);
    const userId = c.get('userId');
    await db.transaction(async (tx) => {
      await tx.insert(profiles).values({ userId }).onConflictDoNothing();
      await tx.select().from(profiles).where(eq(profiles.userId, userId)).for('update');
      await tx
        .update(profiles)
        .set({
          preferences: sql`${profiles.preferences} || ${JSON.stringify({ editor: value })}::jsonb`,
          updatedAt: new Date(),
        })
        .where(eq(profiles.userId, userId));
    });
    return c.json(value);
  });
  const owner = (id: string, userId: string) =>
    and(eq(documents.id, uuid.parse(id)), eq(documents.ownerId, userId));
  async function ownedDocument(id: string, userId: string, runner: any = db) {
    const [doc] = await runner.select().from(documents).where(owner(id, userId));
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
    await syncAnchors(tx, doc);
  }
  app.get('/api/documents/:id/share', async (c) => {
    await ownedDocument(c.req.param('id'), c.get('userId'));
    const [share] = await db
      .select()
      .from(documentShares)
      .where(eq(documentShares.documentId, c.req.param('id')));
    return c.json(share ? { token: share.token, mode: share.mode } : null);
  });
  app.post('/api/documents/:id/share', async (c) => {
    const mode = z.enum(['live', 'snapshot']).parse((await c.req.json()).mode);
    return c.json(
      await db.transaction(async (tx) => {
        await lockProfile(tx, c.get('userId'));
        const doc = await ownedDocument(c.req.param('id'), c.get('userId'), tx);
        if (doc.deletedAt) failure(404, 'Document indisponible.');
        await tx.delete(documentShares).where(eq(documentShares.documentId, doc.id));
        const token = randomBytes(32).toString('hex');
        await tx.insert(documentShares).values({
          token,
          documentId: doc.id,
          ownerId: doc.ownerId,
          mode,
          snapshot: { title: doc.title, content: doc.content as RichNode, layout: doc.layout },
        });
        return { token, mode };
      }),
    );
  });
  app.delete('/api/documents/:id/share', async (c) => {
    await db.transaction(async (tx) => {
      await lockProfile(tx, c.get('userId'));
      await ownedDocument(c.req.param('id'), c.get('userId'), tx);
      await tx.delete(documentShares).where(eq(documentShares.documentId, c.req.param('id')));
    });
    return c.json({ ok: true });
  });
  app.post('/api/public/:token/copy', async (c) => {
    const uploaded: string[] = [];
    try {
      const result = await db.transaction(async (tx) => {
        const ownerId = c.get('userId');
        await lockProfile(tx, ownerId);
        await tx
          .select()
          .from(documentShares)
          .where(eq(documentShares.token, c.req.param('token')))
          .for('share');
        const { row, value } = await publicShare(c.req.param('token'), tx);
        const key = ownerId + ':' + row.token;
        const [previous] = await tx.select().from(sharedCopies).where(eq(sharedCopies.key, key));
        if (previous) {
          const [existing] = await tx
            .select()
            .from(documents)
            .where(eq(documents.id, previous.documentId));
          if (existing && !existing.deletedAt) return { id: existing.id };
          await tx.delete(sharedCopies).where(eq(sharedCopies.key, key));
        }
        const quota = (await rights(tx, ownerId, config)).quotas;
        const content = copyWithNewAnchors(value.content);
        const [{ used }] = await tx
          .select({ used: sql<number>`coalesce(sum(bytes),0)::bigint` })
          .from(assets)
          .where(eq(assets.ownerId, ownerId));
        let bytes = Number(used);
        const replacements = new Map<string, string>();
        for (const id of assetIds(content)) {
          const [asset] = await tx
            .select()
            .from(assets)
            .where(and(eq(assets.id, id), eq(assets.ownerId, row.ownerId)));
          if (!asset) failure(404, 'Image source indisponible.');
          bytes += asset.bytes;
          if (bytes > quota.bytes) failure(413, 'Votre quota de fichiers est atteint.');
          const data = await storage.get(asset.storageKey);
          if (!data) failure(404, 'Image source indisponible.');
          const newId = crypto.randomUUID();
          await storage.put(newId, data!);
          uploaded.push(newId);
          await tx.insert(assets).values({ ...asset, id: newId, ownerId, storageKey: newId });
          replacements.set('/api/assets/' + id, '/api/assets/' + newId);
        }
        const rewrite = (node: RichNode) => {
          if (node.type === 'image' && node.attrs)
            node.attrs.src = replacements.get(node.attrs.src) || node.attrs.src;
          node.content?.forEach(rewrite);
        };
        rewrite(content);
        const [created] = await tx
          .insert(documents)
          .values({
            ownerId,
            title: value.title,
            layout: value.layout,
            content: content as any,
            plainText: plainText(content),
          })
          .returning();
        await snapshot(tx, created, 'shared-copy');
        await tx.insert(sharedCopies).values({ key, ownerId, documentId: created.id });
        return { id: created.id };
      });
      return c.json(result, 201);
    } catch (error) {
      await Promise.all(uploaded.map((id) => storage.delete(id)));
      throw error;
    }
  });
  app.route('/api', learningRoutes(db));
  app.route('/api', aiRoutes(db, config, ownedDocument, dependencies.ai));
  app.route('/api', billingRoutes(db, config, billing));
  app.get('/api/profile', async (c) => {
    await db
      .insert(profiles)
      .values({ userId: c.get('userId') })
      .onConflictDoNothing();
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, c.get('userId')));
    const effective = await rights(db, c.get('userId'), config);
    return c.json({
      ...profile,
      role: effective.role,
      quotas: effective.quotas,
      entitlements: effective,
    });
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
          })
          .optional(),
      })
      .strict()
      .parse(await c.req.json());
    if (managed) await managed.updateName(c, data.name);
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
          // Explicit outer qualification: Drizzle unqualifies projection columns in a
          // single-table select, which would otherwise bind "id" to the inner anchor.
          passageCount: sql<number>`(select count(*)::integer from lab.memory_anchors a where a.document_id = "lab"."documents"."id" and a.owner_id = "lab"."documents"."owner_id" and a.status <> 'deleted')`,
        })
        .from(documents)
        .where(and(...conditions))
        .orderBy(desc(documents.updatedAt)),
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
      // An already-open pre-tabs editor may silently strip unknown ProseMirror
      // nodes. Only a tab-aware client can intentionally restore a flat version.
      if (
        (current.content as RichNode).content?.[0]?.type === 'documentTab' &&
        data.content.content?.[0]?.type !== 'documentTab' &&
        c.req.header('X-Bouche-Document-Version') !== '2'
      )
        return { conflict: true, current, upgrade: true } as const;
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
            error:
              'upgrade' in result
                ? 'Ce document utilise des onglets. Actualisez l’application ; la version distante et votre copie locale sont conservées.'
                : 'Une autre version existe. Vos modifications locales sont conservées.',
            current: result.current,
          },
          409,
        )
      : c.json(result.current);
  });
  app.put('/api/documents/:id/position', async (c) => {
    const { cursor, tabId } = z
      .object({
        cursor: z.number().int().min(0).max(2_000_000),
        tabId: z.union([z.literal('main'), z.string().uuid()]).optional(),
      })
      .parse(await c.req.json());
    await ownedDocument(c.req.param('id'), c.get('userId'));
    await db.transaction(async (tx) => {
      await lockProfile(tx, c.get('userId'));
      const [doc] = await tx
        .select()
        .from(documents)
        .where(owner(c.req.param('id'), c.get('userId')))
        .for('update');
      if (!doc) failure(404, 'Document introuvable.');
      const tabIds =
        (doc.content as RichNode).content?.[0]?.type === 'documentTab'
          ? (doc.content.content as any[]).map((t) => t.attrs.id)
          : ['main'];
      if (tabId && !tabIds.includes(tabId))
        failure(409, 'Cet onglet n’est pas encore synchronisé ou a été supprimé.');
      const cursors = Object.fromEntries(
        Object.entries(doc.viewState.cursors || {}).filter(([key]) => tabIds.includes(key)),
      );
      if (tabId) cursors[tabId] = cursor;
      await tx
        .update(documents)
        .set({
          cursor,
          lastOpenedAt: new Date(),
          ...(tabId ? { viewState: { tabId, cursors } } : {}),
        })
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
      await lockProfile(tx, c.get('userId'));
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
        .orderBy(desc(versions.revision)),
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
    const limits = (await rights(db, c.get('userId'), config)).quotas;
    if (!(file instanceof File) || file.size === 0 || file.size > limits.image)
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
        const quota = (await rights(tx, c.get('userId'), config)).quotas;
        const [{ used }] = await tx
          .select({ used: sql<number>`coalesce(sum(${assets.bytes}), 0)::int` })
          .from(assets)
          .where(eq(assets.ownerId, c.get('userId')));
        if (used + image.size > quota.bytes)
          failure(
            413,
            `Le quota de fichiers de ${quota.bytes / 1024 / 1024} Mo de votre formule est atteint.`,
          );
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
