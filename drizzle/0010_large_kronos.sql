-- « IF NOT EXISTS » ajouté à la main, comme dans les migrations précédentes : le
-- déploiement ne doit pas échouer sur une base où ces colonnes existent déjà.
--
-- Les deux arrivent nulles, et c'est tout ce qu'il faut : une installation qui
-- n'a qu'une adresse continue de fonctionner exactement comme avant, et la
-- température de chambre reste vide tant qu'aucune connexion partagée ne la donne.
ALTER TABLE "printer" ADD COLUMN IF NOT EXISTS "alt_status_url" text;
--> statement-breakpoint
ALTER TABLE "printer" ADD COLUMN IF NOT EXISTS "chamber_temp" double precision;
