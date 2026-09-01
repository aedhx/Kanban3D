-- « IF NOT EXISTS » ajouté à la main, comme dans les migrations précédentes.
--
-- La colonne reste NULL sur les bases existantes, et NULL veut dire « tous les
-- événements » : une destination déjà configurée continue donc de prévenir de
-- tout, sans que personne ait à rouvrir les réglages.
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "events" text;
