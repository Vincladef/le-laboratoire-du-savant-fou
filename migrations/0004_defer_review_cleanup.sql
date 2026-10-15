-- Both cards and study sessions cascade when their owner is deleted. Check the
-- cross-reference after all cascades complete, while keeping review history
-- protected against deletion of an individual session item.
ALTER TABLE "lab"."review_history"
  ALTER CONSTRAINT "review_session_item_owner" DEFERRABLE INITIALLY DEFERRED;
