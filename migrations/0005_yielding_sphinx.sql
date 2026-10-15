CREATE TABLE "lab"."billing_admin_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"target_id" text,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lab"."billing_events" ADD COLUMN "type" text;--> statement-breakpoint
ALTER TABLE "lab"."billing_events" ADD COLUMN "mode" text;--> statement-breakpoint
ALTER TABLE "lab"."billing_events" ADD COLUMN "object_id" text;--> statement-breakpoint
ALTER TABLE "lab"."billing_events" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "lab"."subscriptions" ADD COLUMN "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "lab"."subscriptions" ADD COLUMN "stripe_price_id" text;--> statement-breakpoint
ALTER TABLE "lab"."subscriptions" ADD COLUMN "mode" text;--> statement-breakpoint
ALTER TABLE "lab"."subscriptions" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lab"."subscriptions" ADD COLUMN "cancel_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lab"."subscriptions" ADD COLUMN "invoice_status" text;--> statement-breakpoint
ALTER TABLE "lab"."subscriptions" ADD COLUMN "synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lab"."subscriptions" ADD COLUMN "checkout_session_id" text;--> statement-breakpoint
ALTER TABLE "lab"."subscriptions" ADD COLUMN "checkout_request_id" uuid;--> statement-breakpoint
ALTER TABLE "lab"."subscriptions" ADD COLUMN "checkout_plan" text;--> statement-breakpoint
ALTER TABLE "lab"."subscriptions" ADD COLUMN "checkout_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lab"."subscriptions" ADD COLUMN "checkout_url" text;--> statement-breakpoint
ALTER TABLE "lab"."subscriptions" ADD COLUMN "accepted_terms_version" text;--> statement-breakpoint
ALTER TABLE "lab"."subscriptions" ADD COLUMN "accepted_offer_version" text;--> statement-breakpoint
ALTER TABLE "lab"."subscriptions" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lab"."billing_admin_audit" ADD CONSTRAINT "billing_admin_audit_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "lab"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab"."billing_admin_audit" ADD CONSTRAINT "billing_admin_audit_target_id_user_id_fk" FOREIGN KEY ("target_id") REFERENCES "lab"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab"."subscriptions" ADD CONSTRAINT "subscriptions_checkout_session_id_unique" UNIQUE("checkout_session_id");