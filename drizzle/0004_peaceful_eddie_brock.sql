-- « IF NOT EXISTS » et le bloc d'exception sont ajoutés à la main, comme dans
-- 0000 : la migration doit pouvoir passer sur une base où ces objets existent
-- déjà, sans faire échouer le build.
CREATE TABLE IF NOT EXISTS "card_photos" (
	"card_id" uuid PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "photo_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "card_photos" ADD CONSTRAINT "card_photos_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
