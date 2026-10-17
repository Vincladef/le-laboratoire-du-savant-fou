ALTER TABLE "lab"."memory_anchors" ADD COLUMN "difficulty" text DEFAULT 'unrated' NOT NULL;--> statement-breakpoint
ALTER TABLE "lab"."memory_anchors" ADD COLUMN "difficulty_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lab"."memory_anchors" ADD CONSTRAINT "anchor_difficulty" CHECK ("lab"."memory_anchors"."difficulty" IN ('easy','medium','hard','unrated'));--> statement-breakpoint
ALTER TABLE "lab"."memory_anchors" ADD CONSTRAINT "anchor_difficulty_revision" CHECK ("lab"."memory_anchors"."difficulty_revision" >= 0);
-- Preserve the user's last explicit answer, not FSRS's computed numeric difficulty.
-- Legacy cards, review history and sessions remain untouched, as inactive archives.
--> statement-breakpoint
UPDATE "lab"."memory_anchors" AS anchor
SET "difficulty" = latest.difficulty, "difficulty_revision" = 1
FROM (
  SELECT DISTINCT ON (card.anchor_id, card.owner_id)
    card.anchor_id, card.owner_id,
    CASE WHEN history.rating = 4 THEN 'easy'
         WHEN history.rating = 3 THEN 'medium'
         ELSE 'hard' END AS difficulty
  FROM "lab"."fsrs_cards" AS card
  JOIN "lab"."review_history" AS history
    ON history.card_id = card.id AND history.owner_id = card.owner_id
  ORDER BY card.anchor_id, card.owner_id, history.created_at DESC, history.id DESC
) AS latest
WHERE anchor.id = latest.anchor_id AND anchor.owner_id = latest.owner_id;
