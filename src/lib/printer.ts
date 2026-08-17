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
 * Construit l'URL d'état à partir de ce qu'a saisi l'utilisateur.
 *
 * On accepte l'adresse d'un Live Link, celle d'une vue rapide, l'identifiant tout
 * seul, l'URL d'API déjà formée, ou la racine d'une Shared Connection : deviner
 * est ici plus utile que corriger l'utilisateur.
 */
export function statusEndpoint(raw: string): URL | null {
  const saisi = raw.trim()
  if (!saisi) return null

  // L'identifiant seul, tel qu'on le lit à la fin d'un lien partagé.
  if (ID_SEUL.test(saisi) && !saisi.includes('.')) return urlLiveLink(`-${saisi}`)

  let url: URL
  try {
    url = new URL(saisi)
  } catch {
    return null
  }

  // Déjà une URL d'API : on n'y touche pas.
  if (url.pathname.toLowerCase().startsWith(LIVE_STATUS_PATH)) return url
  if (url.pathname.includes(COMMAND_STATUS_PATH)) return url

  /*
   * Un lien partagé. Le préfixe de l'identifiant dépend du type de lien, et il
   * n'est pas décoratif : sans lui l'API répond « Invalid Id », et avec le mauvais
   * elle répond 401.
   */
  const lien = url.pathname.match(/^\/(live|view)\/([^/]+)\/?$/i)
  if (lien) {
    const [, type, id] = lien
    // L'origine du lien collé est conservée : le serveur régional
    // (`lon.octoeverywhere.com`) répond aussi bien que l'hôte générique, et
    // réécrire l'hôte reviendrait à corriger l'utilisateur sans raison.
    return urlLiveLink(
      `${type.toLowerCase() === 'view' ? '.' : '-'}${decodeURIComponent(id)}`,
      url.origin,
    )
  }

  // Reste la racine d'une Shared Connection : on y ajoute le chemin de son API.
  return new URL(COMMAND_STATUS_PATH.slice(1), url.href.endsWith('/') ? url.href : `${url.href}/`)
}

function urlLiveLink(idPréfixé: string, origine = `https://${OCTO_HOST}`): URL {
  const url = new URL(`${origine}${LIVE_STATUS_PATH}`)
  url.searchParams.set('id', idPréfixé)
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
async function fetchSuivi(départ: URL, headers: Record<string, string>): Promise<Response> {
  let cible = départ
  for (let saut = 0; saut <= MAX_REDIRECTIONS; saut++) {
    if (!autorisée(cible)) {
      throw new Error(`redirection vers une adresse privée (${cible.host})`)
    }
    const res = await fetch(cible, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
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
