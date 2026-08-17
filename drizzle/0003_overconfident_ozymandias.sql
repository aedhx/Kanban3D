-- « IF NOT EXISTS » ajouté à la main : la migration doit pouvoir passer sur une
-- base dont les colonnes existent déjà (schéma poussé à la main, ou déploiement
-- rejoué), sans faire échouer le build Netlify.
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "print_minutes" integer;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "filament_grams" integer;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "material" text;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "file_count" integer;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "piece_count" integer;
