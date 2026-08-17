/**
 * Récupération des informations d'un modèle 3D à partir de son URL.
 *
 * Printables et MakerWorld servent leurs pages derrière Cloudflare : une simple
 * requête HTTP sur la page renvoie 403. En revanche leurs API publiques
 * répondent parfaitement, et avec des données plus propres que de l'OpenGraph.
 * Thingiverse et Cults3D, eux, se laissent lire normalement.
 *
 * Règle d'or : cette fonction n'échoue jamais. Si tout rate, on renvoie au
 * minimum un titre de repli et l'utilisateur complète à la main.
 */

export type ModelMetadata = {
  title: string
  imageUrl?: string
  author?: string
  description?: string
  /**
   * Coût d'impression, quand la plateforme le fournit. MakerWorld le calcule
   * depuis le trancheur et le donne presque toujours ; sur Printables il dépend
   * de l'auteur — un tiers des modèles environ, et jamais la matière. Ces champs
   * restent donc souvent vides, et l'interface les laisse modifier à la main.
   */
  printMinutes?: number
  filamentGrams?: number
  material?: string
  fileCount?: number
  pieceCount?: number
  /** Plateforme reconnue, sert à afficher un petit badge sur la carte. */
  source?: string
  /** Vrai si on a réellement obtenu des informations de la plateforme. */
  resolved: boolean
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/**
 * En-têtes qu'envoie un vrai navigateur en tapant une adresse. Les protections
 * anti-robots regardent l'ensemble, pas seulement le User-Agent : une requête
 * sans `Sec-Fetch-*` se repère au premier coup d'œil.
 */
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': BROWSER_UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
}

const TIMEOUT_MS = 8000
const MAX_DESCRIPTION = 300

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

/**
 * Bloque les adresses internes : l'URL vient de l'utilisateur et c'est le
 * serveur qui va la chercher. Sans ce garde-fou, on pourrait s'en servir pour
 * sonder le réseau privé de l'hébergeur.
 */
function isPubliclyRoutable(url: URL): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    host === 'localhost' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return false
  }

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if (a === 0 || a === 10 || a === 127) return false
    if (a === 169 && b === 254) return false // métadonnées cloud
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
    if (a >= 224) return false
  }

  // Adresses IPv6 privées / locales
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return false

  return true
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
    headers: { ...BROWSER_HEADERS, ...init?.headers },
  })
}

/** Les nombres de Printables arrivent en chaînes (« 3.24 », « 39.00 »). */
function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(n) ? n : 0
}

/** Un zéro signifie « non renseigné » sur ces plateformes, pas « gratuit ». */
function positive(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && value > 0 ? value : undefined
}

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

/** Transforme un fragment HTML en texte lisible, tronqué. */
function toPlainText(html: string | undefined | null): string | undefined {
  if (!html) return undefined
  const text = decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/p>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim()

  if (!text) return undefined
  return text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…` : text
}

/** Extrait les balises <meta> d'une page, indexées par name/property. */
function parseMetaTags(html: string): Map<string, string> {
  const head = html.split(/<\/head>/i)[0] ?? html
  const tags = new Map<string, string>()

  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = new Map<string, string>()
    const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g
    let m: RegExpExecArray | null
    while ((m = attrRe.exec(tag)) !== null) {
      attrs.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '')
    }

    const key = attrs.get('property') ?? attrs.get('name') ?? attrs.get('itemprop')
    const content = attrs.get('content')
    if (key && content && !tags.has(key.toLowerCase())) {
      tags.set(key.toLowerCase(), decodeEntities(content))
    }
  }

  return tags
}

/** Ce qu'on sait tirer d'un bloc schema.org. */
type JsonLd = { title?: string; author?: string; imageUrl?: string; description?: string }

/**
 * Beaucoup de sites décrivent leur contenu en schema.org plutôt qu'en
 * OpenGraph : Cults3D n'y met que l'auteur, MyMiniFactory y met tout et n'a
 * aucune balise `og:title`. C'est donc la deuxième source, systématiquement
 * consultée, et pas seulement pour le créateur.
 */
function parseJsonLd(html: string): JsonLd {
  const blocks = html.match(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )
  if (!blocks) return {}

  const found: JsonLd = {}

  /** Un même champ peut être une chaîne, un objet `{name}` ou une liste. */
  const firstName = (value: unknown): string | undefined => {
    const holder = Array.isArray(value) ? value[0] : value
    if (typeof holder === 'string' && holder.trim()) return holder.trim()
    if (holder && typeof holder === 'object') {
      const name = (holder as Record<string, unknown>).name
      if (typeof name === 'string' && name.trim()) return name.trim()
    }
    return undefined
  }

  for (const block of blocks) {
    const body = block.replace(/^[\s\S]*?>/, '').replace(/<\/script>$/i, '')
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      continue
    }

    // Un bloc peut être une liste, ou un graphe `@graph`.
    const queue: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed]
    while (queue.length > 0) {
      const entry = queue.shift()
      if (!entry || typeof entry !== 'object') continue
      const record = entry as Record<string, unknown>
      if (Array.isArray(record['@graph'])) queue.push(...(record['@graph'] as unknown[]))

      for (const key of ['creator', 'author', 'publisher']) {
        found.author ??= firstName(record[key])
      }
      if (typeof record.name === 'string' && record.name.trim()) {
        found.title ??= record.name.trim()
      }
      const image = firstName(record.image) ?? undefined
      if (image && /^https?:\/\//i.test(image)) found.imageUrl ??= image
      if (typeof record.description === 'string') {
        found.description ??= toPlainText(record.description)
      }
    }
  }

  return found
}

/**
 * Sépare le nom du modèle de ce que le site a collé autour.
 *
 * Les plateformes suffixent volontiers leur titre de page : « X - 3D model by
 * Alice on Thangs », « X by Alice » chez Thingiverse. Récupérer l'auteur au
 * passage évite une carte anonyme là où l'information était sous nos yeux.
 */
function splitTitle(rawTitle: string, host: string): { title: string; author?: string } {
  // « … - 3D model by Alice on Thangs » : formule commune à plusieurs sites.
  const modelBy = rawTitle.match(/^(.*?)\s*[-–—|·]\s*3d\s*model\s+by\s+(.+?)(?:\s+on\s+[^,]+)?$/i)
  if (modelBy?.[1]?.trim()) {
    return { title: modelBy[1].trim(), author: modelBy[2].trim() }
  }

  // Thingiverse écrit « Titre by Auteur ». Le titre lui-même peut contenir
  // « by » (« …torture-test by CreativeTools.se by CreativeTools ») : le
  // séparateur est donc le *dernier* « by », d'où la capture gourmande.
  if (host.includes('thingiverse.com')) {
    const by = rawTitle.match(/^(.*)\s+by\s+(\S.*)$/i)
    if (by?.[1]?.trim()) return { title: by[1].trim(), author: by[2].trim() }
  }

  return { title: rawTitle }
}

/**
 * Plateformes reconnues, dans l'ordre où on les rencontre en pratique.
 *
 * Les quatre premières ont un adaptateur dédié ; les suivantes passent par la
 * lecture de page, mais reconnaître leur domaine donne déjà le bon badge sur la
 * carte et un titre de repli lisible quand la page ne se laisse pas lire.
 */
const PLATFORMS: Array<{ host: RegExp; label: string }> = [
  { host: /(^|\.)printables\.com$/i, label: 'Printables' },
  { host: /(^|\.)makerworld\.com$/i, label: 'MakerWorld' },
  { host: /(^|\.)thingiverse\.com$/i, label: 'Thingiverse' },
  { host: /(^|\.)cults3d\.com$/i, label: 'Cults3D' },
  // than.gs est le raccourcisseur de Thangs, largement utilisé dans les
  // descriptions de modèles : un lien collé depuis là doit être reconnu.
  { host: /(^|\.)thangs\.com$/i, label: 'Thangs' },
  { host: /(^|\.)than\.gs$/i, label: 'Thangs' },
  { host: /(^|\.)myminifactory\.com$/i, label: 'MyMiniFactory' },
  { host: /(^|\.)crealitycloud\.com$/i, label: 'Creality Cloud' },
  { host: /(^|\.)pinshape\.com$/i, label: 'Pinshape' },
  { host: /(^|\.)fab365\.net$/i, label: 'Fab365' },
]

export function platformLabel(hostname: string): string | undefined {
  return PLATFORMS.find((platform) => platform.host.test(hostname))?.label
}

/**
 * Segments d'URL qui ne décrivent pas le modèle : mots de structure des sites et
 * codes de langue. Les sauter évite d'intituler une carte « Models ».
 */
const STRUCTURAL_SEGMENTS = new Set([
  'model',
  'models',
  '3d model',
  '3d models',
  'model detail',
  'thing',
  'things',
  'print',
  'prints',
  'design',
  'designs',
  'designer',
  'object',
  'objects',
  'item',
  'items',
  'product',
  'products',
  'download',
  'downloads',
  'file',
  'files',
  // Onglets d'une fiche modèle : ils suivent l'identifiant, jamais le nom.
  'comments',
  'remixes',
  'makes',
  'collections',
  'apps',
  'embed',
  'widget',
])

/**
 * Nom de repli quand la plateforme n'a rien voulu dire. C'est le champ qui
 * compte le plus : une carte sans nom lisible est inexploitable. On remonte donc
 * l'URL segment par segment, du plus précis au plus général, et on se rabat en
 * dernier recours sur « Plateforme 430773 » plutôt que sur un nom de domaine nu.
 */
function fallbackTitle(url: URL): string {
  const platform = platformLabel(url.hostname)
  const segments = url.pathname.split('/').filter(Boolean)
  let numericId: string | undefined

  for (let i = segments.length - 1; i >= 0; i--) {
    let raw: string
    try {
      raw = decodeURIComponent(segments[i])
    } catch {
      raw = segments[i] // séquence d'échappement invalide
    }

    const cleaned = raw
      .replace(/^thing:/i, '') // Thingiverse : /thing:763622
      .replace(/\.[a-z0-9]{2,4}$/i, '') // extension de fichier
      .replace(/^\d+[-_]/, '') // Printables : /model/430773-exam-roulette
      .replace(/[-_+]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (!cleaned) continue

    // Un identifiant seul ne fait pas un nom, mais on le garde sous la main.
    if (/^\d+$/.test(cleaned)) {
      numericId ??= cleaned
      continue
    }

    const lower = cleaned.toLowerCase()
    if (STRUCTURAL_SEGMENTS.has(lower) || /^[a-z]{2}$/.test(lower)) continue

    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
  }

  if (numericId) return platform ? `${platform} ${numericId}` : `Modèle ${numericId}`
  return platform ?? url.hostname.replace(/^www\./, '')
}

/* ------------------------------------------------------------------ */
/* Adaptateurs par plateforme                                          */
/* ------------------------------------------------------------------ */

/** Printables : API GraphQL publique. L'image arrive en chemin relatif. */
async function fromPrintables(url: URL): Promise<ModelMetadata | null> {
  const id = url.pathname.match(/\/model\/(\d+)/)?.[1]
  if (!id) return null

  const res = await fetchWithTimeout('https://api.printables.com/graphql/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query PrintDetail($id: ID!) {
        print(id: $id) {
          id name summary
          image { filePath }
          user { publicUsername handle }
          printDuration weight usedMaterial numPieces filesCount
        }
      }`,
      variables: { id },
    }),
  })
  if (!res.ok) return null

  const json = (await res.json()) as {
    data?: {
      print?: {
        name?: string
        summary?: string
        image?: { filePath?: string } | null
        user?: { publicUsername?: string; handle?: string } | null
        printDuration?: string | null
        weight?: string | null
        usedMaterial?: string | null
        numPieces?: number | null
        filesCount?: number | null
      } | null
    }
  }

  const print = json.data?.print
  if (!print?.name) return null

  const filePath = print.image?.filePath
  return {
    title: print.name,
    imageUrl: filePath ? `https://media.printables.com/${filePath.replace(/^\/+/, '')}` : undefined,
    author: print.user?.publicUsername || print.user?.handle || undefined,
    description: toPlainText(print.summary),
    // Attention à l'unité : Printables exprime la durée en heures décimales
    // (« 3.24 » vaut 3 h 14), là où MakerWorld compte en secondes.
    printMinutes: positive(Math.round(toNumber(print.printDuration) * 60)),
    filamentGrams: positive(Math.round(toNumber(print.weight))),
    material: print.usedMaterial?.trim() || undefined,
    pieceCount: positive(print.numPieces),
    fileCount: positive(print.filesCount),
    source: 'Printables',
    resolved: true,
  }
}

/** MakerWorld : API REST du service de design. */
async function fromMakerWorld(url: URL): Promise<ModelMetadata | null> {
  const id = url.pathname.match(/\/models\/(\d+)/)?.[1]
  if (!id) return null

  const res = await fetchWithTimeout(`https://makerworld.com/api/v1/design-service/design/${id}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) return null

  const json = (await res.json()) as {
    title?: string
    coverUrl?: string
    summary?: string
    designCreator?: { name?: string } | null
    instances?: Array<{
      extention?: {
        modelInfo?: {
          plates?: Array<{
            prediction?: number | null
            weight?: number | null
            filaments?: Array<{ type?: string | null }> | null
          }> | null
        } | null
      } | null
    }> | null
  }
  if (!json.title) return null

  return {
    title: json.title,
    imageUrl: json.coverUrl || undefined,
    author: json.designCreator?.name || undefined,
    description: toPlainText(json.summary),
    ...printProfile(json.instances),
    source: 'MakerWorld',
    resolved: true,
  }
}

/**
 * Coût d'impression d'un modèle MakerWorld, lu dans le premier profil publié.
 *
 * Ces valeurs viennent du trancheur — un modèle en plusieurs plateaux additionne
 * donc ses durées et ses poids. `prediction` est en secondes, contrairement aux
 * heures décimales de Printables.
 */
function printProfile(
  instances:
    | Array<{
        extention?: {
          modelInfo?: {
            plates?: Array<{
              prediction?: number | null
              weight?: number | null
              filaments?: Array<{ type?: string | null }> | null
            }> | null
          } | null
        } | null
      }>
    | null
    | undefined,
): Pick<ModelMetadata, 'printMinutes' | 'filamentGrams' | 'material'> {
  const plates = instances?.[0]?.extention?.modelInfo?.plates ?? []
  if (plates.length === 0) return {}

  let seconds = 0
  let grams = 0
  const materials = new Set<string>()
  for (const plate of plates) {
    seconds += plate.prediction ?? 0
    grams += plate.weight ?? 0
    for (const filament of plate.filaments ?? []) {
      if (filament.type?.trim()) materials.add(filament.type.trim())
    }
  }

  return {
    printMinutes: positive(Math.round(seconds / 60)),
    filamentGrams: positive(Math.round(grams)),
    material: materials.size ? [...materials].join(' + ') : undefined,
  }
}

/** Pages où l'on atterrit quand le modèle demandé n'existe pas ou est protégé. */
const LANDING_SEGMENTS = new Set([
  'index',
  'home',
  'models',
  'search',
  'login',
  'signin',
  'sign-in',
  'register',
  '404',
  'error',
])

/**
 * La page servie parle-t-elle encore du modèle demandé ?
 *
 * Un lien mort ne renvoie pas toujours 404 : Pinshape, par exemple, redirige
 * vers son accueil et répond 200 — on repartirait alors avec « Pinshape — 3D
 * Marketplace for Designers » comme titre de carte. Deux signaux suffisent à
 * l'écarter : l'atterrissage sur une page de service, et la disparition de
 * l'identifiant numérique en route.
 */
function keptItsIdentity(requested: URL, final: URL): boolean {
  if (requested.toString() === final.toString()) return true

  const segments = final.pathname.split('/').filter(Boolean)
  if (segments.length === 0) return false
  if (segments.length === 1 && LANDING_SEGMENTS.has(segments[0].toLowerCase())) return false

  // Les redirections légitimes gardent l'identifiant : than.gs/m/1501622 mène à
  // l'URL longue de Thangs, qui le contient toujours.
  const id = requested.pathname.match(/\d{3,}/)?.[0]
  if (id && !final.pathname.includes(id)) return false

  return true
}

/**
 * Thangs : API publique, sans clé ni jeton.
 *
 * Deux formes d'URL mènent au même modèle — la longue,
 * `/designer/<auteur>/3d-model/<nom>-<id>`, et le lien court `than.gs/m/<id>`
 * qu'on trouve dans les descriptions. L'identifiant est le nombre final.
 *
 * Thangs ne publie pas de coût d'impression. Son champ `profileWeight` est un
 * poids de classement, pas des grammes de filament : ne pas s'y tromper.
 */
async function fromThangs(url: URL): Promise<ModelMetadata | null> {
  const id =
    url.pathname.match(/\/3d-model\/.*?-(\d+)\/?$/)?.[1] ?? url.pathname.match(/\/m\/(\d+)/)?.[1]
  if (!id) return null

  const res = await fetchWithTimeout(`https://thangs.com/api/models/${id}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) return null

  const json = (await res.json()) as {
    name?: string
    description?: string
    owner?: { username?: string } | null
    attachments?: Array<{ imageUrl?: string }> | null
    parts?: Array<{ thumbnailUrl?: string; isPrimary?: boolean }> | null
  }
  if (!json.name) return null

  // L'illustration choisie par l'auteur d'abord ; à défaut, le rendu de la pièce
  // principale, que Thangs génère pour tous les modèles.
  const attachment = json.attachments?.find((a) => a.imageUrl)?.imageUrl
  const primary = json.parts?.find((p) => p.isPrimary && p.thumbnailUrl)?.thumbnailUrl
  const fallbackPart = json.parts?.find((p) => p.thumbnailUrl)?.thumbnailUrl

  return {
    title: json.name,
    imageUrl: attachment ?? primary ?? fallbackPart ?? undefined,
    author: json.owner?.username || undefined,
    description: toPlainText(json.description),
    fileCount: positive(json.parts?.length),
    source: 'Thangs',
    resolved: true,
  }
}

/**
 * Thingiverse par son API officielle, quand `THINGIVERSE_TOKEN` est configuré.
 *
 * Nécessaire en production : Cloudflare bloque les pages `/thing:*` vues depuis
 * les adresses des hébergeurs — la page d'accueil du même site répond, la fiche
 * modèle non. Depuis un poste de développement le HTML se lit très bien, ce qui
 * rend la panne invisible en local.
 *
 * Le jeton se crée en une minute sur https://www.thingiverse.com/apps/create
 * (c'est l'« App Token », gratuit). Sans lui, on retombe simplement sur la
 * lecture de page.
 */
async function fromThingiverseApi(url: URL): Promise<ModelMetadata | null> {
  const token = process.env.THINGIVERSE_TOKEN?.trim()
  if (!token) return null

  const id = url.pathname.match(/thing:(\d+)/)?.[1]
  if (!id) return null

  const res = await fetchWithTimeout(`https://api.thingiverse.com/things/${id}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null

  // Lecture volontairement tolérante : l'API nomme la vignette tantôt
  // `thumbnail`, tantôt `preview_image`, et le nombre de fichiers n'est pas
  // toujours renvoyé. Rien n'est obligatoire hors du nom.
  const json = (await res.json()) as {
    name?: string
    description?: string
    thumbnail?: string
    preview_image?: string
    default_image?: { url?: string; sizes?: Array<{ url?: string }> } | null
    creator?: { name?: string; first_name?: string } | null
    file_count?: number
  }
  if (!json.name) return null

  const image =
    json.default_image?.url ??
    json.default_image?.sizes?.find((s) => s.url)?.url ??
    json.thumbnail ??
    json.preview_image

  return {
    title: json.name,
    imageUrl: image && /^https?:\/\//i.test(image) ? image : undefined,
    author: json.creator?.name || json.creator?.first_name || undefined,
    description: toPlainText(json.description),
    fileCount: positive(json.file_count),
    source: 'Thingiverse',
    resolved: true,
  }
}

/**
 * Thingiverse, Cults3D et tout le reste : on lit la page.
 *
 * Deux sources dans la même page, dans cet ordre : les balises OpenGraph, puis
 * le JSON-LD. Aucune n'est garantie — MyMiniFactory n'a pas d'`og:title` mais un
 * JSON-LD complet, Thingiverse l'inverse. En consultant les deux, une plateforme
 * qui n'en publie qu'une marche quand même.
 */
async function fromOpenGraph(url: URL, source?: string): Promise<ModelMetadata | null> {
  const res = await fetchWithTimeout(url.toString(), {
    headers: { Accept: 'text/html,application/xhtml+xml' },
  })
  if (!res.ok) return null

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('html')) return null

  // Redirigé vers l'accueil ou une page de connexion : mieux vaut un titre déduit
  // de l'URL que le slogan de la plateforme.
  try {
    if (!keptItsIdentity(url, new URL(res.url))) return null
  } catch {
    // `res.url` illisible : on continue, ce n'est pas une raison d'échouer.
  }

  // On ne lit que le début de la page : les balises <meta> sont dans le <head>.
  const html = (await res.text()).slice(0, 512_000)
  const meta = parseMetaTags(html)
  const ld = parseJsonLd(html)

  const rawTitle =
    meta.get('og:title') ??
    meta.get('twitter:title') ??
    ld.title ??
    decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '')
  if (!rawTitle) return null

  const siteName = meta.get('og:site_name')
  const split = splitTitle(rawTitle, url.hostname)

  // Certains sites suffixent le titre par « | Nom du site ».
  const title = split.title.replace(/\s*[|·–—-]\s*[^|·–—-]{0,40}$/, (match) =>
    siteName && match.toLowerCase().includes(siteName.toLowerCase()) ? '' : match,
  )

  const image = meta.get('og:image') ?? meta.get('twitter:image') ?? ld.imageUrl

  return {
    title: title.trim() || rawTitle,
    imageUrl: image && /^https?:\/\//i.test(image) ? image : undefined,
    author: split.author ?? ld.author,
    description:
      toPlainText(meta.get('og:description') ?? meta.get('description')) ?? ld.description,
    source: source ?? siteName ?? url.hostname.replace(/^www\./, ''),
    resolved: true,
  }
}

/* ------------------------------------------------------------------ */
/* Point d'entrée                                                      */
/* ------------------------------------------------------------------ */

export async function fetchModelMetadata(rawUrl: string): Promise<ModelMetadata> {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    return { title: rawUrl.trim(), resolved: false }
  }

  if (!isPubliclyRoutable(url)) {
    return { title: fallbackTitle(url), source: platformLabel(url.hostname), resolved: false }
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '')

  // Chaque plateforme a sa stratégie, avec repli sur la lecture de page si elle
  // échoue. La dernière tentative marche sur n'importe quel site.
  const strategies: Array<() => Promise<ModelMetadata | null>> = []
  if (host.endsWith('printables.com')) {
    strategies.push(() => fromPrintables(url))
  } else if (host.endsWith('makerworld.com')) {
    strategies.push(() => fromMakerWorld(url))
  } else if (host.endsWith('thingiverse.com')) {
    strategies.push(() => fromThingiverseApi(url))
    strategies.push(() => fromOpenGraph(url, 'Thingiverse'))
  } else if (host.endsWith('cults3d.com')) {
    strategies.push(() => fromOpenGraph(url, 'Cults3D'))
  } else if (host.endsWith('thangs.com') || host.endsWith('than.gs')) {
    strategies.push(() => fromThangs(url))
    strategies.push(() => fromOpenGraph(url, 'Thangs'))
  } else {
    // Plateformes sans adaptateur : on force au moins le bon badge.
    const label = platformLabel(url.hostname)
    if (label) strategies.push(() => fromOpenGraph(url, label))
  }
  strategies.push(() => fromOpenGraph(url))

  for (const strategy of strategies) {
    try {
      const result = await strategy()
      if (result?.title) return result
    } catch {
      // Plateforme injoignable, en maintenance, format changé… on tente la suite.
    }
  }

  // Même sans réponse de la plateforme, on connaît son nom par le domaine : la
  // carte garde donc son badge « Printables », « Cults3D »…
  return { title: fallbackTitle(url), source: platformLabel(url.hostname), resolved: false }
}
