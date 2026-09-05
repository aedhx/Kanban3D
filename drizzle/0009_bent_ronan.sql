-- « IF NOT EXISTS » ajouté à la main, comme dans les migrations précédentes : le
-- déploiement ne doit pas échouer sur une base où ces objets existent déjà.
CREATE TABLE IF NOT EXISTS "comment_photos" (
	"comment_id" uuid PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "photo_at" timestamp with time zone;
--> statement-breakpoint
-- La contrainte, elle, n'a pas de « IF NOT EXISTS » en PostgreSQL 16 : on la pose
-- dans un bloc qui avale la seule erreur qui nous intéresse, celle du doublon.
DO $$ BEGIN
	ALTER TABLE "comment_photos" ADD CONSTRAINT "comment_photos_comment_id_comments_id_fk"
		FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
