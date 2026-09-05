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

/** Une image prête à partir avec un message. */
export type Image = { mime: string; bytes: Buffer }

export type Transport = {
  name: string
  send: (message: string) => Promise<void>
  /**
   * Envoie le message **avec** l'image. Absent quand la destination ne sait pas
   * faire : on retombe alors sur `send()`, et le message dit qu'il y a une photo
   * plutôt que de la passer sous silence.
   */
  sendImage?: (message: string, image: Image) => Promise<void>
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
    case 'commented': {
      /*
       * Le message peut n'être qu'une photo. Dans ce cas on l'annonce, plutôt que
       * d'envoyer « X sur « … » : » suivi de rien — et l'annonce sert aussi aux
       * destinations qui ne savent pas recevoir l'image.
       */
      const texte = truncate(event.body, 200)
      const début = `💬 ${event.by} sur « ${event.title} »`
      if (!texte) return `📷 ${event.by} a envoyé une photo sur « ${event.title} »`
      return event.photo ? `${début} 📷 : ${texte}` : `${début} : ${texte}`
    }
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
  if (!estDiscord(propre)) return propre
  return propre.endsWith('/slack') ? propre : `${propre}/slack`
}

function estDiscord(url: string): boolean {
  return /discord(app)?\.com\/api\/webhooks\//i.test(url)
}

/**
 * L'adresse Discord **sans** son `/slack`, celle qui accepte une pièce jointe.
 *
 * Le suffixe `/slack` fait comprendre à Discord le format de message qu'on lui
 * envoie d'ordinaire, mais ce point d'entrée-là ne reçoit pas de fichier. Pour une
 * photo, on repasse donc par le webhook natif, qui attend un `payload_json` et le
 * fichier à côté.
 */
function discordNatif(url: string): string {
  return url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/slack$/, '')
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
      sendImage: async (message, image) => {
        const formulaire = new FormData()
        formulaire.set('chat_id', telegramChat)
        // Telegram coupe une légende à 1024 caractères ; nos messages sont bien
        // plus courts, mais autant ne pas dépendre de ça.
        formulaire.set('caption', message.slice(0, 1024))
        formulaire.set('photo', blob(image), nomDeFichier(image.mime))
        await postForm(`https://api.telegram.org/bot${telegramToken}/sendPhoto`, formulaire)
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
      sendImage: async (message, image) => {
        /*
         * ntfy attache le corps de la requête quand `Filename` est posé ; le texte
         * passe alors par l'en-tête `Message`. Un en-tête HTTP ne transporte que
         * de l'ASCII, et nos messages sont pleins d'accents et d'emojis : on les
         * encode donc selon la RFC 2047, que ntfy sait défaire.
         */
        await post(url, {
          headers: {
            'Content-Type': image.mime,
            Title: 'Kanban3D',
            Message: enTêteUtf8(message),
            Filename: nomDeFichier(image.mime),
          },
          body: new Uint8Array(image.bytes),
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
      /*
       * Discord seulement. Un webhook générique — Slack, n8n, Zapier — n'a pas de
       * façon commune de recevoir un fichier : `sendImage` reste alors absent, et
       * l'appelant retombe sur le message, qui annonce la photo.
       */
      ...(estDiscord(webhook)
        ? {
            sendImage: async (message: string, image: Image) => {
              const formulaire = new FormData()
              formulaire.set('payload_json', JSON.stringify({ content: message }))
              formulaire.set('files[0]', blob(image), nomDeFichier(image.mime))
              await postForm(discordNatif(webhook), formulaire)
            },
          }
        : {}),
    }
  }

  return null
}

function blob(image: Image): Blob {
  return new Blob([new Uint8Array(image.bytes)], { type: image.mime })
}

function nomDeFichier(mime: string): string {
  return `kanban3d.${mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'}`
}

/** RFC 2047 : la seule façon de mettre un accent dans un en-tête HTTP. */
function enTêteUtf8(valeur: string): string {
  if (/^[\x20-\x7E]*$/.test(valeur)) return valeur
  return `=?UTF-8?B?${Buffer.from(valeur, 'utf8').toString('base64')}?=`
}

/**
 * Un envoi multipart. Le `Content-Type` n'est **pas** posé à la main : c'est le
 * moteur qui l'écrit, avec la frontière qu'il vient de tirer au sort — l'imposer
 * produirait un corps que personne ne sait relire.
 */
async function postForm(url: string, formulaire: FormData): Promise<void> {
  await post(url, { body: formulaire })
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
          /*
           * L'image part avec le message quand la destination sait la recevoir.
           * Sinon on envoie le texte, qui l'annonce : mieux vaut « X a envoyé une
           * photo » qu'un message qui laisse croire qu'il n'y avait rien à voir.
           */
          const image = event.kind === 'commented' ? event.photo : undefined
          if (image && transport.sendImage) await transport.sendImage(message, image)
          else await transport.send(message)
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
