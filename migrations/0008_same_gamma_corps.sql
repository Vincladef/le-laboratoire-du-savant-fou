ALTER TABLE "lab"."profiles" ADD COLUMN "legacy_version_limit" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Preserve the pre-commercial 100-version window for existing accounts, without deleting history.
UPDATE "lab"."profiles" SET "legacy_version_limit" = 100;
