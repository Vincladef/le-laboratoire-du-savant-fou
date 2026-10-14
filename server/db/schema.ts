import { sql } from 'drizzle-orm';
import {
  pgSchema,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uuid,
  unique,
  index,
  foreignKey,
  check,
  bigint,
  doublePrecision,
} from 'drizzle-orm/pg-core';

export const lab = pgSchema('lab');
const date = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const created = () => date('created_at').notNull().defaultNow();
const updated = () => date('updated_at').notNull().defaultNow();

// Better Auth owns credentials and sessions. Public profile updates never write role.
export const user = lab.table('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: created(),
  updatedAt: updated(),
});
export const session = lab.table(
  'session',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: date('expires_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('session_user_idx').on(t.userId)],
);
export const account = lab.table(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: date('access_token_expires_at'),
    refreshTokenExpiresAt: date('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    unique('account_provider_unique').on(t.providerId, t.accountId),
    index('account_user_idx').on(t.userId),
  ],
);
export const verification = lab.table(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: date('expires_at').notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);
export const rateLimit = lab.table('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});
export const roleEnum = lab.enum('role', ['free', 'pro', 'premium', 'owner']);
export const profiles = lab.table('profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  role: roleEnum('role').notNull().default('free'),
  preferences: jsonb('preferences')
    .$type<{ theme?: string; timezone?: string; lastDocumentId?: string }>()
    .notNull()
    .default({}),
  createdAt: created(),
  updatedAt: updated(),
});
export const folders = lab.table(
  'folders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    unique('folders_id_owner').on(t.id, t.ownerId),
    index('folders_owner_parent_idx').on(t.ownerId, t.parentId),
    foreignKey({
      columns: [t.parentId, t.ownerId],
      foreignColumns: [t.id, t.ownerId],
      name: 'folder_parent_same_owner',
    }),
    check('folder_not_self_parent', sql`${t.id} IS DISTINCT FROM ${t.parentId}`),
  ],
);
export const documents = lab.table(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    folderId: uuid('folder_id'),
    title: text('title').notNull().default('Document sans titre'),
    content: jsonb('content').$type<Record<string, unknown>>().notNull(),
    plainText: text('plain_text').notNull().default(''),
    layout: jsonb('layout')
      .$type<{ format: 'A4' | 'Letter'; margin: number; landscape: boolean }>()
      .notNull()
      .default({ format: 'A4', margin: 20, landscape: false }),
    schemaVersion: integer('schema_version').notNull().default(1),
    revision: integer('revision').notNull().default(1),
    cursor: integer('cursor').notNull().default(1),
    lastOpenedAt: date('last_opened_at'),
    deletedAt: date('deleted_at'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    unique('documents_id_owner').on(t.id, t.ownerId),
    index('documents_owner_folder_idx').on(t.ownerId, t.folderId),
    foreignKey({
      columns: [t.folderId, t.ownerId],
      foreignColumns: [folders.id, folders.ownerId],
      name: 'document_folder_same_owner',
    }),
    check('positive_document_revision', sql`${t.revision} > 0`),
  ],
);
export const versions = lab.table(
  'document_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id').notNull(),
    ownerId: text('owner_id').notNull(),
    revision: integer('revision').notNull(),
    title: text('title').notNull(),
    content: jsonb('content').$type<Record<string, unknown>>().notNull(),
    layout: jsonb('layout')
      .$type<{ format: 'A4' | 'Letter'; margin: number; landscape: boolean }>()
      .notNull(),
    reason: text('reason').notNull().default('autosave'),
    createdAt: created(),
  },
  (t) => [
    unique('versions_document_revision').on(t.documentId, t.revision),
    foreignKey({
      columns: [t.documentId, t.ownerId],
      foreignColumns: [documents.id, documents.ownerId],
      name: 'version_document_owner',
    }).onDelete('cascade'),
  ],
);
export const assets = lab.table(
  'assets',
  {
    id: uuid('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull().unique(),
    filename: text('filename').notNull(),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull(),
    createdAt: created(),
  },
  (t) => [
    index('assets_owner_idx').on(t.ownerId),
    check('asset_positive_size', sql`${t.bytes} > 0`),
  ],
);

// Reserved for mission 2: the editor already preserves identity-bearing marks.
export const memoryAnchors = lab.table(
  'memory_anchors',
  {
    id: uuid('id').primaryKey(),
    documentId: uuid('document_id').notNull(),
    ownerId: text('owner_id').notNull(),
    sourceId: uuid('source_id'),
    quote: text('quote').notNull(),
    originalSlice: jsonb('original_slice').notNull(),
    status: text('status').notNull().default('active'),
    metadata: jsonb('metadata').notNull().default({}),
    documentRevision: integer('document_revision').notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    foreignKey({
      columns: [t.documentId, t.ownerId],
      foreignColumns: [documents.id, documents.ownerId],
      name: 'anchor_document_owner',
    }).onDelete('cascade'),
    unique('anchors_id_owner').on(t.id, t.ownerId),
    check('anchor_status', sql`${t.status} IN ('active','deleted','needs_review')`),
  ],
);
export const fsrsCards = lab.table(
  'fsrs_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    anchorId: uuid('anchor_id').notNull(),
    ownerId: text('owner_id').notNull(),
    state: integer('state').notNull().default(0),
    due: date('due').notNull().defaultNow(),
    stability: doublePrecision('stability').notNull().default(0),
    difficulty: doublePrecision('difficulty').notNull().default(0),
    elapsedDays: integer('elapsed_days').notNull().default(0),
    scheduledDays: integer('scheduled_days').notNull().default(0),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    lastReview: date('last_review'),
    algorithmVersion: text('algorithm_version').notNull().default('uninitialized'),
    parameters: jsonb('parameters'),
  },
  (t) => [
    foreignKey({
      columns: [t.anchorId, t.ownerId],
      foreignColumns: [memoryAnchors.id, memoryAnchors.ownerId],
      name: 'card_anchor_owner',
    }).onDelete('cascade'),
    unique('cards_id_owner').on(t.id, t.ownerId),
    unique('card_anchor_unique').on(t.anchorId),
  ],
);
export const reviews = lab.table(
  'review_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cardId: uuid('card_id').notNull(),
    ownerId: text('owner_id').notNull(),
    rating: integer('rating').notNull(),
    before: jsonb('before').notNull(),
    after: jsonb('after').notNull(),
    reviewedAt: created(),
  },
  (t) => [
    foreignKey({
      columns: [t.cardId, t.ownerId],
      foreignColumns: [fsrsCards.id, fsrsCards.ownerId],
      name: 'review_card_owner',
    }).onDelete('cascade'),
    check('valid_review_rating', sql`${t.rating} BETWEEN 1 AND 4`),
  ],
);
export const subscriptions = lab.table('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  status: text('status').notNull().default('inactive'),
  currentPeriodEnd: date('current_period_end'),
  updatedAt: updated(),
});
export const billingEvents = lab.table('billing_events', {
  stripeEventId: text('stripe_event_id').primaryKey(),
  receivedAt: created(),
  processedAt: date('processed_at'),
});
