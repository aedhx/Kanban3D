/**
 * Notifications.
 *
 * C'est le seul point où la messagerie faisait mieux que ce tableau : sans
 * notification, chacun doit penser à ouvrir l'app pour savoir que l'autre a
 * demandé ou imprimé quelque chose.
 *
 * Trois transports possibles — Telegram, ntfy, ou un webhook générique (Slack,
 * Discord…). Aucun configuré, aucune notification, et l'application fonctionne
 * normalement.
 *
 * **Deux sources de configuration, dans cet ordre.** La page Réglages d'abord, les
 * variables d'environnement ensuite. C'était l'inverse — c'est-à-dire uniquement
 * l'environnement — et le résultat observable, c'est que personne ne les a jamais
 * renseignées : il fallait redéployer pour changer une destination. Les variables
 * restent lues en repli pour ne pas casser en silence un déploiement qui marche.
 */

import { shouldSend, type NotificationEvent } from './notifyEvents'
import {
  environmentDestination,
  readDestinations,
  type Destination,
  type TransportConfig,
} from './notifySettings'

export type { NotificationEvent }

const TIMEOUT_MS = 4000

export type Transport = {
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
    case 'declined':
      return `🚫 ${event.by} ne peut pas imprimer « ${event.title} » : ${truncate(event.reason, 200)}`
    case 'printer':
      return event.text
  }
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

/* ------------------------------------------------------------------ */
/* Transports                                                          */
/* ------------------------------------------------------------------ */

/**
 * Une URL de webhook Discord attend `/slack` à la fin pour comprendre le format
 * qu'on envoie. L'ajouter soi-même vaut mieux que l'expliquer dans une note que
 * personne ne lit — et c'est le piège numéro un de cette configuration.
 */
export function normalizeWebhookUrl(url: string): string {
  const propre = url.trim().replace(/\/+$/, '')
  if (!/discord(app)?\.com\/api\/webhooks\//i.test(propre)) return propre
  return propre.endsWith('/slack') ? propre : `${propre}/slack`
}

export function resolveTransport(config: TransportConfig): Transport | null {
  const veut = (nom: string) => config.transport === null || config.transport === nom

  const telegramToken = config.telegramToken
  const telegramChat = config.telegramChat
  if (veut('telegram') && telegramToken && telegramChat) {
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

  const ntfyTopic = config.ntfyTopic
  if (veut('ntfy') && ntfyTopic) {
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

  const webhook = config.webhookUrl
  if (veut('webhook') && webhook) {
    // Échappatoire générique : Slack, Discord, Zapier, n8n… tous acceptent
    // un POST JSON avec un champ « text ».
    return {
      name: 'webhook',
      send: async (message) => {
        await post(normalizeWebhookUrl(webhook), {
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
/**
 * Qui doit être prévenu.
 *
 * On ne retient que les destinations réellement capables d'envoyer, et
 * l'environnement ne reprend la main que s'il n'en reste aucune. La nuance
 * compte : une destination à moitié remplie — quelqu'un a cliqué « ajouter »
 * puis refermé l'onglet — ferait autrement taire un déploiement qui notifiait
 * très bien par variables, sans le dire à personne.
 */
async function destinationsÀPrévenir(): Promise<Destination[]> {
  const enBase = (await readDestinations()).filter(
    (destination) => resolveTransport(destination) !== null,
  )
  return enBase.length > 0 ? enBase : [environmentDestination()]
}

export async function notify(event: NotificationEvent): Promise<void> {
  const destinations = await destinationsÀPrévenir()
  const message = compose(event)

  /*
   * Toutes en parallèle, et chacune isolée. C'est le risque propre au pluriel :
   * une destination morte — un webhook Discord révoqué, un serveur ntfy éteint —
   * ne doit pas empêcher les autres de recevoir. Le `allSettled` est la deuxième
   * ceinture ; la première est le `catch` de chaque envoi.
   */
  await Promise.allSettled(
    destinations
      .filter((destination) => shouldSend(event, destination.events))
      .map(async (destination) => {
        const transport = resolveTransport(destination)
        if (!transport) return
        try {
          await transport.send(message)
        } catch (error) {
          console.warn(
            `[notify] échec de l'envoi vers « ${destination.label} » (${transport.name}) :`,
            error instanceof Error ? error.message : error,
          )
        }
      }),
  )
}

/** Indique si au moins une destination est configurée — utile pour le diagnostic. */
export async function notificationsConfigured(): Promise<boolean> {
  const destinations = await destinationsÀPrévenir()
  return destinations.some((destination) => resolveTransport(destination) !== null)
}
