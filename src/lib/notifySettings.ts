/**
 * Où lire la configuration des notifications.
 *
 * Ce fichier existe pour une raison de dépendances : `notify.ts` est appelé depuis
 * les routes de cartes, et lui faire importer la base directement mêlerait la mise
 * en forme des messages à l'accès aux données. Ici, une seule fonction, un seul
 * rôle : dire où envoyer.
 *
 * La base d'abord, l'environnement en repli — voir l'en-tête de `notify.ts`.
 */
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { notifications, type NotificationSettings } from '@/db/schema'

/** Ce qu'il faut savoir pour envoyer. Vient de la base, ou de l'environnement. */
export type TransportConfig = {
  transport: string | null
  telegramToken: string | null
  telegramChat: string | null
  ntfyTopic: string | null
  webhookUrl: string | null
}

/** La configuration telle que les variables d'environnement la donnent. */
export function configFromEnv(): TransportConfig {
  return {
    // L'environnement ne nomme pas de transport : il se déduit de ce qui est posé,
    // dans l'ordre historique — Telegram, puis ntfy, puis le webhook.
    transport: null,
    telegramToken: process.env.TELEGRAM_BOT_TOKEN ?? null,
    telegramChat: process.env.TELEGRAM_CHAT_ID ?? null,
    ntfyTopic: process.env.NTFY_TOPIC ?? null,
    webhookUrl: process.env.NOTIFY_WEBHOOK_URL ?? null,
  }
}

/** La ligne unique, créée par la migration mais on ne parie pas. */
export async function readNotificationRow(): Promise<NotificationSettings> {
  const db = getDb()
  const [ligne] = await db.select().from(notifications).where(eq(notifications.id, 1))
  if (ligne) return ligne
  const [créée] = await db.insert(notifications).values({ id: 1 }).returning()
  return créée
}

/**
 * La configuration effective.
 *
 * Une ligne de base « vide » (aucun transport nommé) laisse la main à
 * l'environnement : c'est ce qui permet à un déploiement configuré par variables
 * de continuer à fonctionner sans que personne n'ouvre la page de réglages.
 */
export async function notificationConfig(): Promise<TransportConfig> {
  let ligne: NotificationSettings | null = null
  try {
    ligne = await readNotificationRow()
  } catch {
    // Base injoignable : une notification manquante ne doit pas faire échouer
    // l'action qui l'a déclenchée. On se rabat sur l'environnement.
  }

  if (!ligne?.transport) return configFromEnv()

  return {
    transport: ligne.transport,
    telegramToken: ligne.telegramToken,
    telegramChat: ligne.telegramChat,
    ntfyTopic: ligne.ntfyTopic,
    webhookUrl: ligne.webhookUrl,
  }
}

/** Ce que le navigateur a le droit de savoir : jamais les jetons. */
export function notificationsToView(ligne: NotificationSettings) {
  return {
    transport: ligne.transport,
    hasTelegramToken: Boolean(ligne.telegramToken),
    telegramChat: ligne.telegramChat,
    ntfyTopic: ligne.ntfyTopic,
    webhookUrl: ligne.webhookUrl,
  }
}

export type NotificationsView = ReturnType<typeof notificationsToView>
