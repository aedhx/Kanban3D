-- « IF NOT EXISTS » ajouté à la main, comme dans les migrations précédentes : le
-- déploiement ne doit pas échouer sur une base où ces objets existent déjà.
CREATE TABLE IF NOT EXISTS "notification_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"transport" text NOT NULL,
	"telegram_token" text,
	"telegram_chat" text,
	"ntfy_topic" text,
	"webhook_url" text,
	"events" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- La destination déjà configurée passe de l'autre côté, étiquetée d'après son
-- transport — elle se renomme ensuite d'un clic. Sans cette recopie, la mise en
-- ligne ferait taire les notifications de quelqu'un sans rien lui dire, ce qui est
-- exactement la panne qu'on passe son temps à éviter ici.
--
-- Le « NOT EXISTS » rend l'opération sans effet si la table d'arrivée est déjà
-- peuplée : rejouer cette migration ne peut pas créer de doublon.
INSERT INTO "notification_targets" ("label", "transport", "telegram_token", "telegram_chat", "ntfy_topic", "webhook_url", "events")
SELECT
	CASE "transport"
		WHEN 'telegram' THEN 'Telegram'
		WHEN 'ntfy' THEN 'ntfy'
		ELSE 'Discord, Slack…'
	END,
	"transport", "telegram_token", "telegram_chat", "ntfy_topic", "webhook_url", "events"
FROM "notifications"
WHERE "transport" IS NOT NULL
	AND NOT EXISTS (SELECT 1 FROM "notification_targets");
--> statement-breakpoint
-- L'ancienne table n'est pas supprimée. Elle porte la seule configuration réelle
-- de quelqu'un, et recopier puis détruire d'un même geste ne laisse aucun recours
-- si la recopie se trompe. Elle n'est plus lue ; une migration ultérieure la
-- retirera quand la nouvelle aura fait ses preuves.
