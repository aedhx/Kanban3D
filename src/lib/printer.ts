/**
 * L'état de l'imprimante, lu chez OctoEverywhere.
 *
 * La Centauri Carbon n'expose pas de liaison série : OctoPrint ne sait pas lui
 * parler. OctoEverywhere, si — son compagnon tourne sur le NAS d'Alexandre et
 * publie l'état de la machine, imprimantes Elegoo comprises.
 *
 * ## Le « Live Link », voie principale
 *
 * Un Live Link est une page publique en lecture seule qu'OctoEverywhere crée pour
 * partager son imprimante : `https://octoeverywhere.com/live/<id>`. Cette page
 * s'alimente d'une API que l'on peut appeler directement :
 *
 *     GET https://octoeverywhere.com/api/live/status?id=-<id>
 *
 * Deux détails, tous deux relevés dans le code de la page elle-même :
 *
 * - l'identifiant est **préfixé** — d'un tiret pour un lien `/live/`, d'un point
 *   pour un lien `/view/` (la « vue rapide ») ;
 * - l'hôte générique **redirige** vers le serveur régional (`lon.` par exemple),
 *   ce qui oblige à suivre la redirection, donc à la valider.
 *
 * Aucune authentification : l'identifiant du lien *est* le sésame. C'est ce qui
 * rend cette voie utilisable depuis un hébergeur — rien à ouvrir sur le réseau
 * d'Alexandre, rien à installer, et le lien se révoque d'un clic chez lui.
 *
 * La réponse est celle qu'affiche le site officiel : un `Status` en clair
 * (« Printing », « Elegoo Connection Lost »…), une couleur, la progression, le
 * temps restant et les températures. On la traite comme lui : on montre le
 * libellé tel quel quand on ne le connaît pas, plutôt que de le remplacer par un
 * « état inconnu » qui n'apprendrait rien.
 *
 * ## Les deux autres voies, gardées par précaution
 *
 * - une « Shared Connection » (`https://<id>.octoeverywhere.com`), interrogée sur
 *   `/octoeverywhere-command-api/status`. Sa forme de réponse est différente et
 *   son authentification n'est pas documentée : acceptée, mais non vérifiée ;
 * - le **webhook** : OctoEverywhere pousse ses événements vers nous.
 *
 * Dans les trois cas, ce qui arrive ici est converti dans une seule forme, celle
 * que le tableau affiche.
 */
import { isPubliclyRoutable } from './metadata'

const TIMEOUT_MS = 6000

/** Hôte générique d'OctoEverywhere : il redirige vers le serveur régional. */
const OCTO_HOST = 'octoeverywhere.com'

/** L'API qui alimente la page d'un Live Link. */
const LIVE_STATUS_PATH = '/api/live/status'

/** L'API d'état d'une « Shared Connection ». */
const COMMAND_STATUS_PATH = '/octoeverywhere-command-api/status'

/**
 * L'aperçu et le flux d'une « Shared Connection ».
 *
 * Relevés sur le lien réel : contrairement au Live Link, dont l'aperçu CDN
 * répond `404`, ces deux-là répondent — 42 Ko de JPEG et du MJPEG sur la même
 * frontière `oestreamboundary`. Un partage de connexion proxifie en fait
 * l'interface web de l'imprimante, caméra comprise.
 */
const COMMAND_SNAPSHOT_PATH = '/octoeverywhere-command-api/webcam/snapshot'
const COMMAND_STREAM_PATH = '/octoeverywhere-command-api/webcam/stream'

/**
 * L'aperçu de la webcam. Servi par le CDN d'OctoEverywhere, sans authentification
 * — c'est la même adresse que la page de partage met dans sa propre balise
 * `og:image`. Elle répond 404 quand la machine est déconnectée ou n'a pas de
 * caméra, ce qui n'est pas une erreur : il n'y a simplement rien à montrer.
 */
const LIVE_SNAPSHOT_PATH = '/cdn-api/live/snapshot'

/**
 * Le flux vidéo de la webcam, en MJPEG (`multipart/x-mixed-replace`).
 *
 * C'est la voie qui marche, et l'aperçu fixe ci-dessus celle qui ne marche pas :
 * interrogé sur le lien réel, `/cdn-api/live/snapshot` répond `404` alors que
 * celui-ci rend 640×360 sans broncher. La vignette du bandeau s'alimentait donc
 * d'une source qui n'a jamais rien donné.
 *
 * On s'en sert des deux façons : le proxy de flux le relaie tel quel, et
 * `fetchFrame()` en extrait une seule image avant de raccrocher.
 *
 * OctoEverywhere coupe de lui-même au bout de `MaxStreamTimeSec` (180 s d'après
 * `/api/live/info`) : une reconnexion périodique est de toute façon nécessaire.
 */
const LIVE_STREAM_PATH = '/api/live/stream'

/** Une redirection est normale ici ; une chaîne de redirections ne l'est pas. */
const MAX_REDIRECTIONS = 3

/**
 * Les états qu'on sait dire en français.
 *
 * La clé est le libellé d'OctoEverywhere réduit à ses lettres : « Warming Up »
 * comme « warmingup ». Tout ce qui n'est pas dans cette liste est affiché tel
 * quel — c'est ce que fait le site officiel, et un libellé anglais reste plus
 * informatif qu'un « état inconnu ».
 */
export const PRINTER_STATE_LABELS: Record<string, string> = {
  idle: 'au repos',
  ready: 'prête',
  warmingup: 'en chauffe',
  preparing: 'préparation',
  printing: 'en impression',
  paused: 'en pause',
  pausing: 'mise en pause',
  resuming: 'reprend',
  complete: 'terminée',
  completed: 'terminée',
  cancelled: 'annulée',
  canceled: 'annulée',
  cancelling: 'annulation',
  error: 'en erreur',
  offline: 'hors ligne',
  connecting: 'connexion…',
  disconnected: 'déconnectée',
}

/** Traduit un état, ou le laisse tel quel si on ne le connaît pas. */
export function printerStateLabel(state: string | null): string {
  if (!state) return 'état inconnu'
  const clé = state.toLowerCase().replace(/[^a-z]/g, '')
  const connu = PRINTER_STATE_LABELS[clé]
  if (connu) return connu
  // « Elegoo Connection Lost », « Bambu Connection Lost »… : la marque varie, le
  // sens non.
  if (clé.includes('connectionlost')) return 'liaison perdue'
  if (clé.includes('notconnected')) return 'imprimante déconnectée'
  return state
}

/** L'état de la machine, dans la forme que l'application manipule. */
export type PrinterReading = {
  /** Libellé renvoyé par OctoEverywhere, brut. Traduit à l'affichage. */
  state: string | null
  /** `g`, `y`, `r` ou `w` : la couleur que le site officiel donne à cet état. */
  statusColor: string | null
  /** Une impression est-elle en cours ? Décidé ici, pas dans l'interface. */
  printing: boolean
  /** Pourcentage, de 0 à 100. */
  progress: number | null
  currentLayer: number | null
  totalLayers: number | null
  timeLeftSec: number | null
  durationSec: number | null
  fileName: string | null
  nozzleTemp: number | null
  bedTemp: number | null
  /**
   * Gadget, la détection d'échec par IA d'OctoEverywhere : un libellé et sa
   * couleur. Nuls quand Gadget n'est pas activé sur le compte.
   */
  gadgetStatus: string | null
  gadgetColor: string | null
  /** Filament consommé d'après la machine, en milligrammes. */
  filamentUsedMg: number | null
  /**
   * Image de l'impression terminée, quand OctoEverywhere en a gardé une. Publique
   * — sa propre page la charge sans cookie — donc utilisable comme photo de
   * résultat.
   */
  trackedImageUrl: string | null
}

export type PrinterProbe =
  | { ok: true; reading: PrinterReading; detail: string }
  | { ok: false; error: string; hint?: string }

const nombre = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const texte = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

/** Un identifiant de Live Link : ni point, ni barre oblique, ni espace. */
const ID_SEUL = /^[A-Za-z0-9_-]{6,40}$/

/**
 * Reconnaît un lien partagé et en tire l'identifiant **préfixé**, avec l'origine
 * où le demander.
 *
 * Le préfixe n'est pas décoratif : sans lui l'API répond « Invalid Id », et avec
 * le mauvais elle répond 401. Tiret pour un lien `/live/`, point pour un `/view/`.
 *
 * L'origine du lien collé est conservée : le serveur régional
 * (`lon.octoeverywhere.com`) répond aussi bien que l'hôte générique, et réécrire
 * l'hôte reviendrait à corriger l'utilisateur sans raison.
 */
function lienPartagé(saisi: string): { id: string; origine: string } | null {
  // L'identifiant seul, tel qu'on le lit à la fin d'un lien partagé.
  if (ID_SEUL.test(saisi) && !saisi.includes('.')) {
    return { id: `-${saisi}`, origine: `https://${OCTO_HOST}` }
  }

  let url: URL
  try {
    url = new URL(saisi)
  } catch {
    return null
  }

  // Une URL d'API déjà formée porte l'identifiant tout prêt.
  if (url.pathname.toLowerCase().startsWith(LIVE_STATUS_PATH)) {
    const id = url.searchParams.get('id')
    return id ? { id, origine: url.origin } : null
  }

  const lien = url.pathname.match(/^\/(live|view)\/([^/]+)\/?$/i)
  if (!lien) return null
  const [, type, id] = lien
  return {
    id: `${type.toLowerCase() === 'view' ? '.' : '-'}${decodeURIComponent(id)}`,
    origine: url.origin,
  }
}

/**
 * Construit l'URL d'état à partir de ce qu'a saisi l'utilisateur.
 *
 * On accepte l'adresse d'un Live Link, celle d'une vue rapide, l'identifiant tout
 * seul, l'URL d'API déjà formée, ou la racine d'une Shared Connection : deviner
 * est ici plus utile que corriger l'utilisateur.
 */
export function statusEndpoint(raw: string): URL | null {
  const saisi = raw.trim()
  if (!saisi) return null

  const partagé = lienPartagé(saisi)
  if (partagé) return urlLive(LIVE_STATUS_PATH, partagé)

  let url: URL
  try {
    url = new URL(saisi)
  } catch {
    return null
  }
  // Déjà l'URL d'API d'une Shared Connection : on n'y touche pas.
  if (url.pathname.includes(COMMAND_STATUS_PATH)) return url

  // Reste la racine d'une Shared Connection : on y ajoute le chemin de son API.
  return new URL(COMMAND_STATUS_PATH.slice(1), url.href.endsWith('/') ? url.href : `${url.href}/`)
}

/**
 * L'aperçu de la webcam, pour la même adresse.
 *
 * Rien pour une « Shared Connection » : son API d'aperçu n'est pas documentée, et
 * l'inventer donnerait une vignette cassée plutôt qu'une absence de vignette.
 */
export function snapshotEndpoint(raw: string): URL | null {
  const partagé = lienPartagé(raw.trim())
  if (partagé) return urlLive(LIVE_SNAPSHOT_PATH, partagé)
  return urlPartageConnexion(raw, COMMAND_SNAPSHOT_PATH)
}

/** Le flux vidéo, pour la même adresse. */
export function streamEndpoint(raw: string): URL | null {
  const partagé = lienPartagé(raw.trim())
  if (partagé) return urlLive(LIVE_STREAM_PATH, partagé)
  return urlPartageConnexion(raw, COMMAND_STREAM_PATH)
}

/**
 * La racine d'une « Shared Connection », si c'en est une.
 *
 * On la reconnaît à ce qu'elle est : une adresse dont on sait déduire l'API de
 * commande. Pas à son nom d'hôte — `shared-<jeton>.octoeverywhere.com` est la
 * forme d'aujourd'hui, et se lier à elle nous ferait rater celle de demain.
 */
function racinePartageConnexion(raw: string): URL | null {
  const saisi = raw.trim()
  if (!saisi || lienPartagé(saisi)) return null
  let url: URL
  try {
    url = new URL(saisi)
  } catch {
    return null
  }
  // On remonte à la racine, que l'adresse saisie pointe déjà sur l'API ou non.
  const chemin = url.pathname.toLowerCase()
  if (chemin !== '/' && !chemin.startsWith('/octoeverywhere-command-api')) return null
  return new URL(url.origin)
}

function urlPartageConnexion(raw: string, chemin: string): URL | null {
  const racine = racinePartageConnexion(raw)
  return racine ? new URL(`${racine.origin}${chemin}`) : null
}

/**
 * La page de partage elle-même, celle qu'ouvre le bouton « Voir chez
 * OctoEverywhere ».
 *
 * On la reconstruit à partir de l'identifiant plutôt que de renvoyer la saisie
 * telle quelle : l'utilisateur a pu coller une URL d'API, et c'est la page qu'on
 * veut lui montrer. Le préfixe (`-` ou `.`) dit de quel type de lien il s'agit.
 */
export function sharePageUrl(raw: string): URL | null {
  const partagé = lienPartagé(raw.trim())
  if (partagé) {
    const type = partagé.id.startsWith('.') ? 'view' : 'live'
    return new URL(`${partagé.origine}/${type}/${partagé.id.slice(1)}`)
  }
  // Une « Shared Connection » a aussi sa page : l'interface de l'imprimante
  // elle-même, que le partage proxifie.
  return racinePartageConnexion(raw)
}

function urlLive(chemin: string, { id, origine }: { id: string; origine: string }): URL {
  const url = new URL(`${origine}${chemin}`)
  url.searchParams.set('id', id)
  return url
}

/** Cette adresse, le serveur a-t-il le droit d'aller la chercher ? */
function autorisée(url: URL): boolean {
  return isPubliclyRoutable(url) || process.env.PRINTER_ALLOW_PRIVATE === '1'
}

/**
 * Suit les redirections à la main, en vérifiant chaque étape.
 *
 * Nécessaire dans les deux sens : l'hôte générique d'OctoEverywhere redirige vers
 * son serveur régional, donc il *faut* suivre ; et une redirection est le moyen
 * classique de faire pointer une URL publique vers une adresse privée, donc il
 * faut revalider à chaque saut. Le contrôle d'entrée ne suffit pas.
 */
async function fetchSuivi(
  départ: URL,
  headers: Record<string, string>,
  /*
   * Le délai est réglable, et le signal fourni de l'extérieur, parce qu'un flux
   * vidéo ne se lit pas comme un appel d'état : six secondes le couperaient en
   * pleine image, et il faut pouvoir raccrocher dès qu'on a ce qu'on est venu
   * chercher. Par défaut, le comportement d'avant.
   */
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<Response> {
  const délai = AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS)
  const signal = options.signal ? AbortSignal.any([délai, options.signal]) : délai

  let cible = départ
  for (let saut = 0; saut <= MAX_REDIRECTIONS; saut++) {
    if (!autorisée(cible)) {
      throw new Error(`redirection vers une adresse privée (${cible.host})`)
    }
    const res = await fetch(cible, {
      redirect: 'manual',
      signal,
      headers,
    })
    if (![301, 302, 303, 307, 308].includes(res.status)) return res
    const location = res.headers.get('location')
    if (!location) return res
    cible = new URL(location, cible)
  }
  throw new Error('trop de redirections')
}

/**
 * Interroge OctoEverywhere. N'échoue jamais par exception : renvoie toujours un
 * diagnostic lisible, c'est lui qu'affiche le bouton « Tester la connexion ».
 */
export async function probePrinter(rawUrl: string, secret?: string | null): Promise<PrinterProbe> {
  const url = statusEndpoint(rawUrl)
  if (!url) return { ok: false, error: 'Cette adresse n’est pas une URL valide.' }

  /*
   * Adresse privée : refusée par défaut, et ce n'est pas une précaution
   * théorique — c'est le serveur qui va chercher une URL saisie par
   * l'utilisateur, de quoi sonder le réseau de l'hébergeur.
   *
   * La dérogation existe pour un cas réel : héberger l'application chez soi, sur
   * le même réseau que l'imprimante. Elle est explicite, et jamais active par
   * défaut.
   */
  if (!autorisée(url)) {
    return {
      ok: false,
      error: 'Cette adresse est privée : elle n’est joignable que depuis chez vous.',
      hint:
        'L’application tourne sur Netlify, elle ne peut pas entrer sur votre réseau local. ' +
        'Utilisez l’adresse d’un « Live Link » OctoEverywhere, ou le webhook ci-dessous. ' +
        '(Si vous hébergez l’application vous-même sur ce réseau : PRINTER_ALLOW_PRIVATE=1.)',
    }
  }

  let res: Response
  try {
    res = await fetchSuivi(url, {
      Accept: 'application/json',
      // Un Live Link ne demande rien. Une Shared Connection, peut-être : son
      // authentification n'étant pas documentée, on envoie le jeton sous les deux
      // formes les plus courantes s'il y en a un. Sans effet là où rien n'est
      // attendu.
      ...(secret ? { Authorization: `Bearer ${secret}`, 'X-Api-Key': secret } : {}),
    })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return {
      ok: false,
      error: `Impossible de joindre l’imprimante (${message}).`,
      hint: 'Le lien est-il toujours valide, et le NAS allumé ?',
    }
  }

  const brut = await res.text()
  if (!res.ok) {
    return {
      ok: false,
      error: `OctoEverywhere a répondu ${res.status}.`,
      hint: brut.slice(0, 300) || undefined,
    }
  }

  let json: unknown
  try {
    json = JSON.parse(brut)
  } catch {
    return {
      ok: false,
      error: 'La réponse n’est pas du JSON.',
      hint: brut.slice(0, 200) || undefined,
    }
  }

  /*
   * OctoEverywhere met son propre code dans le corps, et répond parfois 200 avec
   * une erreur dedans. Le dire mot pour mot est ce qu'il y a de plus utile : un
   * lien mal recopié donne « Invalid Id », un mauvais préfixe donne 401.
   */
  const enveloppe = json as { Status?: unknown; Error?: unknown }
  if (typeof enveloppe?.Status === 'number' && enveloppe.Status !== 200) {
    return {
      ok: false,
      error: `OctoEverywhere refuse : ${texte(enveloppe.Error) ?? enveloppe.Status}.`,
      hint:
        enveloppe.Status === 400
          ? 'L’identifiant du lien semble incorrect. Recopiez l’adresse complète du Live Link.'
          : enveloppe.Status === 401
            ? 'Ce lien n’est plus partagé, ou il a été révoqué dans OctoEverywhere.'
            : undefined,
    }
  }

  const reading = readStatus(json)
  if (!reading) {
    return {
      ok: false,
      error: 'Réponse inattendue : aucun état d’impression dedans.',
      hint: brut.slice(0, 300),
    }
  }

  /*
   * Le détail complète l'état sans le répéter : le nom du fichier et l'avancement,
   * c'est-à-dire de quoi reconnaître qu'on lit bien la bonne machine.
   */
  const détail = [
    reading.fileName,
    reading.progress !== null ? `${Math.round(reading.progress)} %` : null,
    reading.currentLayer && reading.totalLayers
      ? `couche ${reading.currentLayer}/${reading.totalLayers}`
      : null,
    reading.nozzleTemp ? `buse ${Math.round(reading.nozzleTemp)}°` : null,
  ].filter(Boolean)

  return { ok: true, reading, detail: détail.join(' · ') || 'aucune impression en cours' }
}

/**
 * Convertit la réponse d'OctoEverywhere, dans l'une ou l'autre de ses formes.
 *
 * Live Link : tout est à plat dans `Result`. Shared Connection :
 * `Result.JobStatus.CurrentPrint`. On reconnaît la forme aux champs présents
 * plutôt qu'à l'URL appelée — c'est la réponse qui décide, pas notre supposition.
 */
export function readStatus(payload: unknown): PrinterReading | null {
  if (!payload || typeof payload !== 'object') return null
  const racine = payload as Record<string, unknown>
  const résultat = (racine.Result ?? racine.result ?? racine) as Record<string, unknown>
  if (!résultat || typeof résultat !== 'object') return null

  const job = (résultat.JobStatus ?? résultat.jobStatus) as Record<string, unknown> | undefined
  if (job) return depuisJobStatus(job)

  if (
    'IsInHostErrorState' in résultat ||
    'IsTimeFlowing' in résultat ||
    'StatusColor' in résultat
  ) {
    return depuisLiveLink(résultat)
  }
  return null
}

/** La forme du Live Link : un état en clair, et tout le reste à plat. */
function depuisLiveLink(r: Record<string, unknown>): PrinterReading {
  const state = texte(r.Status ?? r.status)
  const progress = nombre(r.Progress ?? r.progress)
  const timeLeftSec = nombre(r.TimeRemainSec ?? r.timeRemainSec)
  const elapsed = nombre(r.TimeElapsedSec ?? r.timeElapsedSec)
  const paused = r.IsPaused === true
  const erreurHôte = r.IsInHostErrorState === true

  return {
    state,
    statusColor: texte(r.StatusColor ?? r.statusColor),
    printing: estEnImpression({
      state,
      progress,
      paused,
      erreurHôte,
      tempsQuiCoule: r.IsTimeFlowing === true,
    }),
    progress,
    // Le Live Link ne compte pas les couches. Les champs restent : le webhook et
    // l'autre API, eux, les donnent.
    currentLayer: null,
    totalLayers: null,
    timeLeftSec,
    // Pas de durée totale non plus, mais elle se déduit : écoulé + restant.
    durationSec: elapsed !== null && timeLeftSec !== null ? elapsed + timeLeftSec : null,
    fileName: texte(r.FileName ?? r.fileName),
    nozzleTemp: nombre(r.HotendActual ?? r.hotendActual),
    bedTemp: nombre(r.BedActual ?? r.bedActual),
    gadgetStatus: texte(r.GadgetStatus ?? r.gadgetStatus),
    gadgetColor: texte(r.GadgetStatusColor ?? r.gadgetStatusColor),
    filamentUsedMg: nombre(r.EstTotalFilamentWeightMg ?? r.estTotalFilamentWeightMg),
    trackedImageUrl: texte(r.TrackedPrintCompleteImageUrl ?? r.trackedPrintCompleteImageUrl),
  }
}

/** La forme de l'API des Shared Connections. */
function depuisJobStatus(job: Record<string, unknown>): PrinterReading {
  const print = (job.CurrentPrint ?? job.currentPrint ?? {}) as Record<string, unknown>
  const temps = (print.Temps ?? print.temps ?? {}) as Record<string, unknown>
  const state = texte(job.State ?? job.state)
  const progress = nombre(print.Progress ?? print.progress)

  return {
    state,
    statusColor: null,
    printing: estEnImpression({ state, progress }),
    progress,
    currentLayer: nombre(print.CurrentLayer ?? print.currentLayer),
    totalLayers: nombre(print.TotalLayers ?? print.totalLayers),
    timeLeftSec: nombre(print.TimeLeftSec ?? print.timeLeftSec),
    durationSec: nombre(print.DurationSec ?? print.durationSec),
    fileName: texte(print.FileName ?? print.fileName),
    nozzleTemp: nombre(temps.HotendActual ?? temps.hotendActual),
    bedTemp: nombre(temps.BedActual ?? temps.bedActual),
    // Cette API-là ne parle ni de Gadget, ni de filament, ni d'image de fin.
    gadgetStatus: null,
    gadgetColor: null,
    filamentUsedMg: null,
    trackedImageUrl: null,
  }
}

/** Les états qui, seuls, veulent dire « la machine travaille ». */
const ÉTATS_ACTIFS = new Set(['printing', 'warmingup', 'resuming', 'preparing'])

/**
 * Décide s'il y a impression en cours.
 *
 * Ni le libellé ni le chronomètre ne suffisent seuls : le libellé peut être
 * inconnu (« Elegoo Connection Lost »), et un temps qui s'écoule ne dit pas si la
 * machine est en pause. On croise donc les deux, et une erreur d'hôte ou une pause
 * tranche dans tous les cas.
 */
function estEnImpression({
  state,
  progress,
  paused = false,
  erreurHôte = false,
  tempsQuiCoule = false,
}: {
  state: string | null
  progress: number | null
  paused?: boolean
  erreurHôte?: boolean
  tempsQuiCoule?: boolean
}): boolean {
  if (paused || erreurHôte) return false
  const clé = (state ?? '').toLowerCase().replace(/[^a-z]/g, '')
  if (ÉTATS_ACTIFS.has(clé)) return true
  // État inconnu : le chronomètre qui tourne fait foi, à condition qu'il y ait
  // bien une impression derrière.
  return tempsQuiCoule && progress !== null
}

/**
 * Ce que dit un webhook OctoEverywhere. Il porte moins que l'API d'état — pas de
 * températures, par exemple — donc on ne remplace que les champs présents.
 */
export function readWebhook(payload: unknown): Partial<PrinterReading> | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>

  // Un webhook peut aussi porter la même enveloppe que l'API d'état.
  const complet = readStatus(payload)
  if (complet?.state) return complet

  const event = texte(p.EventType ?? p.eventType ?? p.Event ?? p.event)
  if (!event) return null

  /*
   * Les événements ne disent pas un état, ils disent un changement. On en déduit
   * l'état, ce qui suffit au bandeau : « en impression » puis « terminée ».
   */
  const parÉvénement: Record<string, string> = {
    printstart: 'printing',
    printprogress: 'printing',
    printpaused: 'paused',
    printresumed: 'printing',
    printdone: 'complete',
    printfailed: 'error',
    printcancelled: 'cancelled',
    firstlayerdone: 'printing',
    filamentrunout: 'paused',
    filamentchange: 'paused',
    printerneedsattention: 'error',
  }
  const clé = event.toLowerCase().replace(/[^a-z]/g, '')
  const state = parÉvénement[clé] ?? event
  const progress = nombre(p.Progress ?? p.progress)

  return {
    state,
    printing: estEnImpression({ state, progress, tempsQuiCoule: true }),
    progress,
    currentLayer: nombre(p.CurrentLayer ?? p.currentLayer),
    totalLayers: nombre(p.TotalLayers ?? p.totalLayers),
    timeLeftSec: nombre(p.TimeRemainingSec ?? p.timeRemainingSec ?? p.TimeLeftSec),
    durationSec: nombre(p.DurationSec ?? p.durationSec ?? p.TotalDurationSec),
    fileName: texte(p.FileName ?? p.fileName ?? p.Filename),
  }
}

/** Ce qu'on accepte comme photo, et jusqu'à quel poids. */
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const IMAGE_MAX_BYTES = 3_000_000

/** Le temps qu'on s'accorde pour tirer une image du flux. Mesuré : ~2 s. */
const FRAME_TIMEOUT_MS = 8000

/**
 * Ce qu'on accepte de lire avant d'abandonner la recherche d'une image.
 *
 * Une image du flux pèse une quarantaine de kilo-octets ; ce plafond n'est donc
 * pas une limite de taille mais un garde-fou : sans lui, un flux qui ne
 * ressemblerait pas à du MJPEG nous ferait lire indéfiniment.
 */
const FRAME_MAX_BYTES = 2_000_000

/** Les bornes d'une image JPEG. `ff d8` l'ouvre, `ff d9` la ferme. */
const JPEG_DÉBUT = Buffer.from([0xff, 0xd8])
const JPEG_FIN = Buffer.from([0xff, 0xd9])

/**
 * Ouvre le flux vidéo et rend la réponse telle quelle, à charge de l'appelant de
 * la consommer — c'est ce dont la route de proxy a besoin.
 *
 * `null` quand il n'y a rien à ouvrir : adresse qui n'est pas un lien partagé,
 * adresse privée, ou refus d'OctoEverywhere.
 */
export async function openStream(
  statusUrl: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<Response | null> {
  const url = streamEndpoint(statusUrl)
  if (!url || !autorisée(url)) return null

  try {
    const res = await fetchSuivi(url, { Accept: 'multipart/x-mixed-replace, image/*' }, options)
    if (!res.ok || !res.body) return null
    return res
  } catch {
    return null
  }
}

/**
 * Tire **une seule** image du flux vidéo, puis raccroche.
 *
 * C'est la vignette du bandeau, et le repli de la photo de fin d'impression.
 * Raccrocher tout de suite n'est pas une politesse : le flux est continu, et le
 * laisser couler retiendrait une fonction serverless jusqu'à sa propre limite.
 *
 * On cherche les bornes du JPEG plutôt que de découper l'enveloppe multipart :
 * dans les données d'une image, un `ff` est toujours suivi d'un `00`, si bien
 * qu'un `ff d9` ne peut être que la fin. **Ne lève jamais.**
 */
export async function fetchFrame(
  statusUrl: string,
): Promise<{ mime: string; bytes: Buffer } | null> {
  const abandon = new AbortController()
  const res = await openStream(statusUrl, {
    timeoutMs: FRAME_TIMEOUT_MS,
    signal: abandon.signal,
  })
  if (!res?.body) return null

  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  // Certaines caméras répondent une image simple là où on attendait un flux.
  if (IMAGE_MIMES.has(type)) {
    try {
      const bytes = Buffer.from(await res.arrayBuffer())
      return bytes.length > 0 && bytes.length <= IMAGE_MAX_BYTES ? { mime: type, bytes } : null
    } catch {
      return null
    }
  }

  const reader = res.body.getReader()
  let tampon = Buffer.alloc(0)
  try {
    while (tampon.length < FRAME_MAX_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      tampon = Buffer.concat([tampon, Buffer.from(value)])

      const début = tampon.indexOf(JPEG_DÉBUT)
      if (début < 0) continue
      const fin = tampon.indexOf(JPEG_FIN, début + 2)
      if (fin < 0) continue

      // Recopiée : une vue sur le tampon en retiendrait tout le reste en mémoire.
      return { mime: 'image/jpeg', bytes: Buffer.from(tampon.subarray(début, fin + 2)) }
    }
  } catch {
    // Flux interrompu avant la première image complète : pas de vignette.
  } finally {
    abandon.abort()
  }
  return null
}

/**
 * Va chercher une image de l'impression, pour en faire la photo du résultat.
 *
 * Trois sources, dans l'ordre : celle qu'OctoEverywhere garde d'une impression
 * terminée, l'aperçu fixe de la webcam, puis une image tirée du flux vidéo. La
 * première est meilleure — elle est prise au bon moment et survit à l'extinction
 * de la machine — mais elle n'existe que si le suivi d'impression est actif sur
 * le compte.
 *
 * La troisième a été ajoutée après avoir constaté que la deuxième répond `404`
 * sur le lien réel : la photo automatique de fin d'impression n'avait donc, en
 * pratique, qu'une seule source sur deux.
 *
 * **Ne lève jamais.** Ne pas avoir de photo n'empêche rien : la carte garde
 * l'image du modèle, et quelqu'un peut toujours en prendre une à la main.
 */
export async function fetchImage(
  imageDeFin: string | null,
  statusUrl: string | null,
): Promise<{ mime: string; bytes: Buffer } | null> {
  const sources = [imageDeFin, statusUrl ? snapshotEndpoint(statusUrl)?.toString() : null].filter(
    (v): v is string => Boolean(v),
  )

  for (const source of sources) {
    let url: URL
    try {
      url = new URL(source)
    } catch {
      continue
    }
    if (!autorisée(url)) continue

    try {
      const res = await fetchSuivi(url, { Accept: 'image/*' })
      if (!res.ok) continue

      const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
      if (!IMAGE_MIMES.has(mime)) continue

      const bytes = Buffer.from(await res.arrayBuffer())
      // Rien à redimensionner ici : une image de webcam pèse peu, et se donner les
      // moyens de la réduire côté serveur demanderait une dépendance native.
      if (bytes.length === 0 || bytes.length > IMAGE_MAX_BYTES) continue

      return { mime, bytes }
    } catch {
      // Source injoignable : on essaie la suivante, sinon tant pis.
    }
  }

  // Dernier recours : une image tirée du flux vidéo, qui lui répond.
  return statusUrl ? await fetchFrame(statusUrl) : null
}

/**
 * Le fichier en cours d'impression correspond-il à cette carte ?
 *
 * On compare des noms écrits par des humains à des mois d'intervalle : le
 * trancheur ajoute une extension, parfois un préfixe de profil, l'un met des
 * tirets là où l'autre met des espaces. On réduit donc les deux à leurs lettres et
 * chiffres, et une inclusion dans un sens ou l'autre suffit.
 *
 * Le rapprochement est délibérément indicatif : au pire la progression ne
 * s'affiche pas sur la carte, ce qui n'empêche rien — le bandeau la montre déjà.
 */
export function looksLikeSameJob(fileName: string | null, title: string): boolean {
  if (!fileName) return false
  const réduire = (v: string) =>
    v
      .toLowerCase()
      .replace(/\.(gcode|3mf|stl|bgcode|gco)$/i, '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]/g, '')
  const a = réduire(fileName)
  const b = réduire(title)
  // Sous quatre caractères, l'inclusion devient du hasard.
  if (a.length < 4 || b.length < 4) return false
  return a.includes(b) || b.includes(a)
}
