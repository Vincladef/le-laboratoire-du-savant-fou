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
export const profiles = lab.table(
  'profiles',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull().default('free'),
    legacyVersionLimit: integer('legacy_version_limit').notNull().default(0),
    preferences: jsonb('preferences')
      .$type<{ theme?: string; timezone?: string; lastDocumentId?: string }>()
      .notNull()
      .default({}),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [check('legacy_version_limit_valid', sql`${t.legacyVersionLimit} BETWEEN 0 AND 100`)],
);
// Stable application identities: do not rewrite document ownership during auth migration.
// Provider subjects are trusted only after server-side validation by Neon Auth.
export const authIdentities = lab.table('auth_identities', {
  subject: text('subject').primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: created(),
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

// Identity-bearing annotations stay separate from the original rich document content.
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
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    hint: text('hint').notNull().default(''),
    priority: text('priority').$type<'high' | 'medium' | 'low'>().notNull().default('medium'),
    revision: integer('revision').notNull().default(1),
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
    index('anchors_owner_status_idx').on(t.ownerId, t.status),
    check('anchor_status', sql`${t.status} IN ('active','deleted','needs_review')`),
    check('anchor_priority', sql`${t.priority} IN ('high','medium','low')`),
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
    learningSteps: integer('learning_steps').notNull().default(0),
    revision: integer('revision').notNull().default(1),
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
    sessionItemId: uuid('session_item_id').unique(),
  },
  (t) => [
    foreignKey({
      columns: [t.cardId, t.ownerId],
      foreignColumns: [fsrsCards.id, fsrsCards.ownerId],
      name: 'review_card_owner',
    }).onDelete('cascade'),
    check('valid_review_rating', sql`${t.rating} BETWEEN 1 AND 4`),
    foreignKey({
      columns: [t.sessionItemId, t.ownerId],
      foreignColumns: [studyItems.id, studyItems.ownerId],
      name: 'review_session_item_owner',
    }),
  ],
);
export const studySessions = lab.table(
  'study_sessions',
  {
    id: uuid('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    filters: jsonb('filters')
      .$type<{
        documentIds: string[];
        folderIds: string[];
        priorities: ('high' | 'medium' | 'low')[];
      }>()
      .notNull(),
    status: text('status').notNull().default('active'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    unique('study_session_id_owner').on(t.id, t.ownerId),
    index('study_session_owner_status').on(t.ownerId, t.status),
    check('study_session_status', sql`${t.status} IN ('active','completed')`),
  ],
);
export const studyItems = lab.table(
  'study_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').notNull(),
    ownerId: text('owner_id').notNull(),
    anchorId: uuid('anchor_id').notNull(),
    position: integer('position').notNull(),
    status: text('status').notNull().default('pending'),
    cardRevision: integer('card_revision'),
    anchorRevision: integer('anchor_revision'),
    revealedAt: date('revealed_at'),
  },
  (t) => [
    foreignKey({
      columns: [t.sessionId, t.ownerId],
      foreignColumns: [studySessions.id, studySessions.ownerId],
      name: 'study_item_session_owner',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.anchorId, t.ownerId],
      foreignColumns: [memoryAnchors.id, memoryAnchors.ownerId],
      name: 'study_item_anchor_owner',
    }).onDelete('cascade'),
    unique('study_item_position').on(t.sessionId, t.position),
    unique('study_item_anchor').on(t.sessionId, t.anchorId),
    unique('study_items_id_owner').on(t.id, t.ownerId),
    check('study_item_status', sql`${t.status} IN ('pending','revealed','reviewed','skipped')`),
  ],
);
export const subscriptions = lab.table(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    stripeCustomerId: text('stripe_customer_id').unique(),
    stripeSubscriptionId: text('stripe_subscription_id').unique(),
    status: text('status').notNull().default('inactive'),
    plan: text('plan').notNull().default('free'),
    stripePriceId: text('stripe_price_id'),
    mode: text('mode'),
    currentPeriodEnd: date('current_period_end'),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    cancelAt: date('cancel_at'),
    invoiceStatus: text('invoice_status'),
    paidEntitlement: jsonb('paid_entitlement').$type<{
      plan: 'pro' | 'premium';
      priceId: string;
      through: string;
      invoiceId: string;
      subscriptionId: string;
    }>(),
    syncedAt: date('synced_at'),
    checkoutSessionId: text('checkout_session_id').unique(),
    checkoutRequestId: uuid('checkout_request_id'),
    checkoutPlan: text('checkout_plan'),
    checkoutExpiresAt: date('checkout_expires_at'),
    checkoutUrl: text('checkout_url'),
    acceptedTermsVersion: text('accepted_terms_version'),
    acceptedOfferVersion: text('accepted_offer_version'),
    acceptedAt: date('accepted_at'),
    immediateAccessRequestedAt: date('immediate_access_requested_at'),
    acceptedLegal: jsonb('accepted_legal').$type<Record<string, unknown>>(),
    acceptedOffer: jsonb('accepted_offer').$type<Record<string, unknown>>(),
    updatedAt: updated(),
  },
  (t) => [
    check('subscription_plan_valid', sql`${t.plan} IN ('free','pro','premium')`),
    check('subscription_mode_valid', sql`${t.mode} IS NULL OR ${t.mode} IN ('test','live')`),
    check(
      'checkout_plan_valid',
      sql`${t.checkoutPlan} IS NULL OR ${t.checkoutPlan} IN ('pro','premium')`,
    ),
  ],
);
export const billingEvents = lab.table('billing_events', {
  stripeEventId: text('stripe_event_id').primaryKey(),
  receivedAt: created(),
  processedAt: date('processed_at'),
  type: text('type'),
  mode: text('mode'),
  objectId: text('object_id'),
  outcome: text('outcome'),
});
export const billingAdminAudit = lab.table('billing_admin_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
  targetId: text('target_id').references(() => user.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  createdAt: created(),
});
