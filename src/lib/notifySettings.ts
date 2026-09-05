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
import { asc, eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { notificationTargets, type NotificationTarget } from '@/db/schema'
import { normalizeText } from './cards'
import { TRIGGER_KEYS } from './notifyEvents'

/** Ce qu'il faut savoir pour envoyer. Vient de la base, ou de l'environnement. */
export type TransportConfig = {
  transport: string | null
  telegramToken: string | null
  telegramChat: string | null
  ntfyTopic: string | null
  webhookUrl: string | null
  /** Événements retenus ; `null` = tous. Voir `shouldSend()`. */
  events: string[] | null
}

/** Une destination : de quoi envoyer, plus de quoi la nommer dans un journal. */
export type Destination = TransportConfig & { id: string; label: string }

/**
 * L'identifiant de la destination déduite des variables d'environnement.
 *
 * Elle n'existe pas en base, donc elle ne s'édite pas : c'est un repli, pas une
 * ligne. Le préfixe la distingue d'un vrai identifiant, qui est un UUID.
 */
export const ID_ENVIRONNEMENT = 'environnement'

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
    // L'environnement n'a jamais su exprimer ce choix : il prévient de tout.
    events: null,
  }
}

/** Les destinations enregistrées, dans l'ordre où elles ont été ajoutées. */
export async function readTargets(): Promise<NotificationTarget[]> {
  return getDb().select().from(notificationTargets).orderBy(asc(notificationTargets.createdAt))
}

/** Une destination précise, ou `undefined`. */
export async function readTarget(id: string): Promise<NotificationTarget | undefined> {
  const [ligne] = await getDb()
    .select()
    .from(notificationTargets)
    .where(eq(notificationTargets.id, id))
  return ligne
}

/** La forme qu'attend l'envoi, à partir d'une ligne de base. */
export function targetToConfig(ligne: NotificationTarget): Destination {
  return {
    id: ligne.id,
    label: ligne.label,
    transport: ligne.transport,
    telegramToken: ligne.telegramToken,
    telegramChat: ligne.telegramChat,
    ntfyTopic: ligne.ntfyTopic,
    webhookUrl: ligne.webhookUrl,
    events: parseEvents(ligne.events),
  }
}

/**
 * Les destinations enregistrées, prêtes à l'envoi.
 *
 * Rend une liste vide plutôt que de lever : une base injoignable ne doit pas
 * faire échouer l'action qui a déclenché la notification. C'est `notify()` qui
 * décide alors de se rabattre sur l'environnement — lui seul sait ce qui compte
 * comme destination utilisable.
 */
export async function readDestinations(): Promise<Destination[]> {
  try {
    return (await readTargets()).map(targetToConfig)
  } catch {
    return []
  }
}

/** La destination de repli, celle que décrivent les variables d'environnement. */
export function environmentDestination(): Destination {
  return { id: ID_ENVIRONNEMENT, label: 'Variables d’environnement', ...configFromEnv() }
}

/**
 * `NULL` → tous ; une chaîne → la liste, même vide.
 *
 * La distinction compte : `null` est « on n'a jamais choisi », `''` est « on a
 * choisi de tout taire ». Les confondre ferait reparler une destination qu'on
 * venait délibérément de faire taire.
 */
export function parseEvents(brut: string | null): string[] | null {
  if (brut === null) return null
  return brut
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

/** Ce que le navigateur a le droit de savoir : jamais les jetons. */
export function targetToView(ligne: NotificationTarget) {
  return {
    id: ligne.id,
    label: ligne.label,
    transport: ligne.transport,
    hasTelegramToken: Boolean(ligne.telegramToken),
    telegramChat: ligne.telegramChat,
    ntfyTopic: ligne.ntfyTopic,
    webhookUrl: ligne.webhookUrl,
    events: parseEvents(ligne.events),
  }
}

export type NotificationTargetView = ReturnType<typeof targetToView>

/* ------------------------------------------------------------------ */
/* Ce qu'on accepte d'écrire                                           */
/* ------------------------------------------------------------------ */

/** Les transports connus. Tout autre nom est refusé plutôt qu'ignoré. */
export const TRANSPORTS = new Set(['telegram', 'ntfy', 'webhook'])

/** Au-delà, ce n'est plus une étiquette mais un paragraphe. */
const LABEL_MAX = 60

/**
 * Lit et valide les champs d'une destination, et rend le premier reproche.
 *
 * Partagée par la création et la modification, délibérément : une règle
 * appliquée à l'une mais pas à l'autre est une règle qu'on contourne en deux
 * requêtes. Elle vit ici plutôt que dans une route parce qu'un fichier `route.ts`
 * n'est pas censé exporter autre chose que des verbes HTTP.
 */
export function lireLesChamps(
  body: Record<string, unknown>,
  champs: Partial<typeof notificationTargets.$inferInsert>,
): string | null {
  if ('label' in body) {
    const label = normalizeText(body.label, LABEL_MAX)
    if (!label) return 'Cette destination a besoin d’un nom.'
    champs.label = label
  }

  if ('transport' in body) {
    const nom = normalizeText(body.transport, 20)
    if (!nom || !TRANSPORTS.has(nom)) return 'Transport inconnu.'
    champs.transport = nom
  }

  // Chaîne vide = « efface », champ absent = « n'y touche pas ».
  if ('telegramToken' in body) champs.telegramToken = normalizeText(body.telegramToken, 200)
  if ('telegramChat' in body) champs.telegramChat = normalizeText(body.telegramChat, 60)
  if ('ntfyTopic' in body) champs.ntfyTopic = normalizeText(body.ntfyTopic, 200)
  if ('webhookUrl' in body) champs.webhookUrl = normalizeText(body.webhookUrl, 500)

  /*
   * Les événements retenus. `null` rend le choix — donc « tous » ; un tableau,
   * même vide, l'exprime. Une clé inconnue est refusée plutôt qu'ignorée : sans
   * quoi une faute de frappe ferait taire un événement en silence, exactement ce
   * que ce réglage est censé rendre visible.
   */
  if ('events' in body) {
    if (body.events === null) {
      champs.events = null
    } else if (Array.isArray(body.events)) {
      const clés = body.events.map(String)
      const inconnue = clés.find((clé) => !TRIGGER_KEYS.includes(clé))
      if (inconnue) return `Événement inconnu : ${inconnue}.`
      champs.events = [...new Set(clés)].join(',')
    } else {
      return 'Événements invalides.'
    }
  }

  return null
}
