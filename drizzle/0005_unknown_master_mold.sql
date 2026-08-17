-- « IF NOT EXISTS » ajouté à la main, comme dans les migrations précédentes : le
-- déploiement ne doit pas échouer sur une base où ces objets existent déjà.
CREATE TABLE IF NOT EXISTS "printer" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text DEFAULT 'L’imprimante d’Alexandre' NOT NULL,
	"status_url" text,
	"status_secret" text,
	"webhook_token" text,
	"state" text,
	"status_color" text,
	"printing" boolean DEFAULT false NOT NULL,
	"progress" double precision,
	"current_layer" integer,
	"total_layers" integer,
	"time_left_sec" integer,
	"duration_sec" integer,
	"file_name" text,
	"nozzle_temp" double precision,
	"bed_temp" double precision,
	"seen_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Une seule imprimante : la ligne est créée ici, et l'identifiant fixé à 1 par la
-- contrainte de clé primaire. Le code peut donc toujours lire la ligne 1 sans
-- avoir à la créer au premier passage.
INSERT INTO "printer" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "priority" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "multi_color" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "color_count" integer;
