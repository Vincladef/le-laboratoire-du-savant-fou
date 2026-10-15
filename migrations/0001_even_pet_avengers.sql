CREATE TABLE "lab"."auth_identities" (
	"subject" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_identities_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "lab"."auth_identities" ADD CONSTRAINT "auth_identities_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "lab"."user"("id") ON DELETE cascade ON UPDATE no action;