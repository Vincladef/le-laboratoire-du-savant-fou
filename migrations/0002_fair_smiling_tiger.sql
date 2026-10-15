CREATE TABLE "lab"."study_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"anchor_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"card_revision" integer,
	"anchor_revision" integer,
	"revealed_at" timestamp with time zone,
	CONSTRAINT "study_item_position" UNIQUE("session_id","position"),
	CONSTRAINT "study_item_anchor" UNIQUE("session_id","anchor_id"),
	CONSTRAINT "study_item_status" CHECK ("lab"."study_items"."status" IN ('pending','revealed','reviewed','skipped'))
);
--> statement-breakpoint
CREATE TABLE "lab"."study_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"filters" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_session_id_owner" UNIQUE("id","owner_id"),
	CONSTRAINT "study_session_status" CHECK ("lab"."study_sessions"."status" IN ('active','completed'))
);
--> statement-breakpoint
ALTER TABLE "lab"."fsrs_cards" ADD COLUMN "learning_steps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lab"."fsrs_cards" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "lab"."memory_anchors" ADD COLUMN "hint" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "lab"."memory_anchors" ADD COLUMN "priority" text DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "lab"."memory_anchors" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "lab"."review_history" ADD COLUMN "session_item_id" uuid;--> statement-breakpoint
ALTER TABLE "lab"."study_items" ADD CONSTRAINT "study_item_session_owner" FOREIGN KEY ("session_id","owner_id") REFERENCES "lab"."study_sessions"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab"."study_items" ADD CONSTRAINT "study_item_anchor_owner" FOREIGN KEY ("anchor_id","owner_id") REFERENCES "lab"."memory_anchors"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab"."study_sessions" ADD CONSTRAINT "study_sessions_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "lab"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_session_owner_status" ON "lab"."study_sessions" USING btree ("owner_id","status");--> statement-breakpoint
ALTER TABLE "lab"."review_history" ADD CONSTRAINT "review_history_session_item_id_unique" UNIQUE("session_item_id");--> statement-breakpoint
ALTER TABLE "lab"."memory_anchors" ADD CONSTRAINT "anchor_priority" CHECK ("lab"."memory_anchors"."priority" IN ('high','medium','low'));