CREATE TABLE "lab"."document_shares" (
	"token" text PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"mode" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab"."shared_copies" (
	"key" text PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"owner_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lab"."document_shares" ADD CONSTRAINT "document_shares_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "lab"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab"."document_shares" ADD CONSTRAINT "document_shares_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "lab"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab"."shared_copies" ADD CONSTRAINT "shared_copies_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "lab"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab"."shared_copies" ADD CONSTRAINT "shared_copies_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "lab"."user"("id") ON DELETE cascade ON UPDATE no action;