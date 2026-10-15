ALTER TABLE "lab"."subscriptions" ADD COLUMN "immediate_access_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lab"."subscriptions" ADD COLUMN "accepted_legal" jsonb;--> statement-breakpoint
ALTER TABLE "lab"."subscriptions" ADD COLUMN "accepted_offer" jsonb;--> statement-breakpoint
ALTER TABLE "lab"."subscriptions" ADD CONSTRAINT "subscription_plan_valid" CHECK ("lab"."subscriptions"."plan" IN ('free','pro','premium'));--> statement-breakpoint
ALTER TABLE "lab"."subscriptions" ADD CONSTRAINT "subscription_mode_valid" CHECK ("lab"."subscriptions"."mode" IS NULL OR "lab"."subscriptions"."mode" IN ('test','live'));--> statement-breakpoint
ALTER TABLE "lab"."subscriptions" ADD CONSTRAINT "checkout_plan_valid" CHECK ("lab"."subscriptions"."checkout_plan" IS NULL OR "lab"."subscriptions"."checkout_plan" IN ('pro','premium'));