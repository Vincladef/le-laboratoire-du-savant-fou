ALTER TABLE "lab"."study_items" ADD CONSTRAINT "study_items_id_owner" UNIQUE("id","owner_id");--> statement-breakpoint
ALTER TABLE "lab"."review_history" ADD CONSTRAINT "review_session_item_owner" FOREIGN KEY ("session_item_id","owner_id") REFERENCES "lab"."study_items"("id","owner_id") ON DELETE no action ON UPDATE no action;
