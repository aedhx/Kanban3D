-- « IF NOT EXISTS » ajouté à la main, comme dans les migrations précédentes : le
-- déploiement ne doit pas échouer sur une base où ces objets existent déjà.
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"transport" text,
	"telegram_token" text,
	"telegram_chat" text,
	"ntfy_topic" text,
	"webhook_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Une seule destination : la ligne est créée ici, l'identifiant fixé à 1 par la
-- clé primaire. Le code peut donc toujours lire la ligne 1 sans avoir à la créer.
INSERT INTO "notifications" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "pieces_done" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "declined_reason" text;--> statement-breakpoint
ALTER TABLE "printer" ADD COLUMN IF NOT EXISTS "auto_advance" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "printer" ADD COLUMN IF NOT EXISTS "gadget_status" text;--> statement-breakpoint
ALTER TABLE "printer" ADD COLUMN IF NOT EXISTS "gadget_color" text;--> statement-breakpoint
ALTER TABLE "printer" ADD COLUMN IF NOT EXISTS "filament_used_mg" integer;
