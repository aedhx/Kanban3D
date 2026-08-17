-- Retrait de la table des tentatives de connexion : le bridage a été supprimé.
--
-- La migration 0001 qui l'avait créée est conservée plutôt que supprimée :
-- l'historique des migrations est ajout seulement, et cette table peut déjà
-- exister dans une base déployée entre-temps. La création puis la suppression
-- se suivent donc dans l'historique, ce qui est sans conséquence.
--
-- « IF EXISTS » n'est pas produit par drizzle-kit : ajouté à la main pour que
-- la migration passe aussi sur une base où la table aurait été retirée à la
-- main.

DROP TABLE IF EXISTS "auth_attempts" CASCADE;
