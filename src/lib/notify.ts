/**
 * Notifications.
 *
 * C'est le seul point où la messagerie faisait mieux que ce tableau : sans
 * notification, chacun doit penser à ouvrir l'app pour savoir que l'autre a
 * demandé ou imprimé quelque chose.
 *
 * Trois transports possibles, choisis par les variables d'environnement
 * présentes — aucune variable, aucune notification, et l'app fonctionne
 * normalement. Voir .env.example pour la configuration.
 */

const TIMEOUT_MS = 4000

export type NotificationEvent =
  | { kind: 'created'; title: string; by: string; quantity: number; color: string | null }
  | { kind: 'moved'; title: string; by: string; from: string; to: string }
  | { kind: 'commented'; title: string; by: string; body: string }

type Transport = {
  name: string
  send: (message: string) => Promise<void>
}

/* ------------------------------------------------------------------ */
/* Rédaction du message                                                */
/* ------------------------------------------------------------------ */

function compose(event: NotificationEvent): string {
  switch (event.kind) {
    case 'created': {
      const details = [event.quantity > 1 ? `×${event.quantity}` : null, event.color].filter(
        Boolean,
      )
      const suffix = details.length ? ` (${details.join(', ')})` : ''
      return `🖨️ ${event.by} demande « ${event.title} »${suffix}`
    }
    case 'moved':
      return `📦 ${event.by} a déplacé « ${event.title} » : ${event.from} → ${event.to}`
    case 'commented':
      return `💬 ${event.by} sur « ${event.title} » : ${truncate(event.body, 200)}`
  }
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

/* ------------------------------------------------------------------ */
/* Transports                                                          */
/* ------------------------------------------------------------------ */

function resolveTransport(): Transport | null {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN
  const telegramChat = process.env.TELEGRAM_CHAT_ID
  if (telegramToken && telegramChat) {
    return {
      name: 'telegram',
      send: async (message) => {
        await post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramChat,
            text: message,
            disable_web_page_preview: true,
          }),
        })
      },
    }
  }

  const ntfyTopic = process.env.NTFY_TOPIC
  if (ntfyTopic) {
    // Un « topic » ntfy suffit : pas de compte, l'app mobile s'y abonne.
    const url = /^https?:\/\//i.test(ntfyTopic) ? ntfyTopic : `https://ntfy.sh/${ntfyTopic}`
    return {
      name: 'ntfy',
      send: async (message) => {
        await post(url, {
          headers: { 'Content-Type': 'text/plain; charset=utf-8', Title: 'Kanban3D' },
          body: message,
        })
      },
    }
  }

  const webhook = process.env.NOTIFY_WEBHOOK_URL
  if (webhook) {
    // Échappatoire générique : Slack, Discord, Zapier, n8n… tous acceptent
    // un POST JSON avec un champ « text ».
    return {
      name: 'webhook',
      send: async (message) => {
        await post(webhook, {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: message, content: message }),
        })
      },
    }
  }

  return null
}

async function post(url: string, init: RequestInit): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...init,
  })
  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text().catch(() => '')}`.trim())
  }
}

/* ------------------------------------------------------------------ */
/* Point d'entrée                                                      */
/* ------------------------------------------------------------------ */

/**
 * Envoie une notification. **Ne lève jamais** : une panne du service de
 * notification ne doit pas empêcher d'ajouter ou de déplacer une carte.
 *
 * L'appel est attendu volontairement. En serverless, l'instance est gelée dès la
 * réponse renvoyée : un envoi laissé en arrière-plan serait perdu la moitié du
 * temps. Le coût est de quelques centaines de millisecondes, invisibles pour
 * l'utilisateur puisque l'interface applique déjà le changement sans attendre.
 */
export async function notify(event: NotificationEvent): Promise<void> {
  const transport = resolveTransport()
  if (!transport) return

  try {
    await transport.send(compose(event))
  } catch (error) {
    console.warn(
      `[notify] échec de l'envoi via ${transport.name} :`,
      error instanceof Error ? error.message : error,
    )
  }
}

/** Indique si un transport est configuré — utile pour le diagnostic. */
export function notificationsConfigured(): boolean {
  return resolveTransport() !== null
}
