-- Migration initiale.
--
-- Les gardes « IF NOT EXISTS » et le bloc DO ne sont pas produits par
-- drizzle-kit : ils ont été ajoutés à la main. Cette migration s'exécute au
-- déploiement, et une base créée auparavant avec `drizzle-kit push` possède déjà
-- ces tables sans posséder le journal des migrations. Sans ces gardes, le
-- premier déploiement échouerait sur « relation "cards" already exists ».
--
-- Les migrations suivantes, générées normalement, n'ont pas besoin de cette
-- précaution : le journal existera alors.

CREATE TABLE IF NOT EXISTS "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"position" double precision NOT NULL,
	"url" text,
	"title" text NOT NULL,
	"image_url" text,
	"author" text,
	"source" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"color" text,
	"notes" text,
	"due_date" date,
	"requested_by" text NOT NULL,
	"last_moved_by" text,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"author" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "comments" ADD CONSTRAINT "comments_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comments_card_id_idx" ON "comments" USING btree ("card_id");
