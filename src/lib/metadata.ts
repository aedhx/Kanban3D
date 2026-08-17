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
  /** Plateforme reconnue, sert à afficher un petit badge sur la carte. */
  source?: string
  /** Vrai si on a réellement obtenu des informations de la plateforme. */
  resolved: boolean
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

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
    headers: {
      'User-Agent': BROWSER_UA,
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      ...init?.headers,
    },
  })
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

/**
 * Beaucoup de sites (dont Cults3D) déclarent l'auteur en schema.org plutôt
 * qu'en OpenGraph, qui n'a pas de champ pour ça. On y pioche donc le créateur.
 */
function parseJsonLdAuthor(html: string): string | undefined {
  const blocks = html.match(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )
  if (!blocks) return undefined

  for (const block of blocks) {
    const body = block.replace(/^[\s\S]*?>/, '').replace(/<\/script>$/i, '')
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      continue
    }

    const candidates = Array.isArray(parsed) ? parsed : [parsed]
    for (const entry of candidates) {
      if (!entry || typeof entry !== 'object') continue
      const record = entry as Record<string, unknown>
      for (const key of ['creator', 'author', 'publisher']) {
        const value = record[key]
        const holder = Array.isArray(value) ? value[0] : value
        if (typeof holder === 'string' && holder.trim()) return holder.trim()
        if (holder && typeof holder === 'object') {
          const name = (holder as Record<string, unknown>).name
          if (typeof name === 'string' && name.trim()) return name.trim()
        }
      }
    }
  }

  return undefined
}

/** Titre de repli quand on n'a rien pu récupérer : mieux que d'afficher l'URL brute. */
function fallbackTitle(url: URL): string {
  const lastSegment = url.pathname.split('/').filter(Boolean).pop()
  if (lastSegment) {
    const cleaned = decodeURIComponent(lastSegment)
      .replace(/\.[a-z0-9]{2,4}$/i, '')
      .replace(/^thing:/, '')
      .replace(/^\d+[-_]/, '')
      .replace(/[-_]+/g, ' ')
      .trim()
    if (cleaned && !/^\d+$/.test(cleaned)) {
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
    }
  }
  return url.hostname.replace(/^www\./, '')
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
      query:
        'query PrintDetail($id: ID!) { print(id: $id) { id name summary image { filePath } user { publicUsername handle } } }',
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
    source: 'Printables',
    resolved: true,
  }
}

/** MakerWorld : API REST du service de design. */
async function fromMakerWorld(url: URL): Promise<ModelMetadata | null> {
  const id = url.pathname.match(/\/models\/(\d+)/)?.[1]
  if (!id) return null

  const res = await fetchWithTimeout(
    `https://makerworld.com/api/v1/design-service/design/${id}`,
    { headers: { Accept: 'application/json' } },
  )
  if (!res.ok) return null

  const json = (await res.json()) as {
    title?: string
    coverUrl?: string
    summary?: string
    designCreator?: { name?: string } | null
  }
  if (!json.title) return null

  return {
    title: json.title,
    imageUrl: json.coverUrl || undefined,
    author: json.designCreator?.name || undefined,
    description: toPlainText(json.summary),
    source: 'MakerWorld',
    resolved: true,
  }
}

/** Thingiverse, Cults3D et tout le reste : balises OpenGraph de la page. */
async function fromOpenGraph(url: URL, source?: string): Promise<ModelMetadata | null> {
  const res = await fetchWithTimeout(url.toString(), {
    headers: { Accept: 'text/html,application/xhtml+xml' },
  })
  if (!res.ok) return null

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('html')) return null

  // On ne lit que le début de la page : les balises <meta> sont dans le <head>.
  const html = (await res.text()).slice(0, 512_000)
  const meta = parseMetaTags(html)

  const rawTitle =
    meta.get('og:title') ??
    meta.get('twitter:title') ??
    decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '')
  if (!rawTitle) return null

  const siteName = meta.get('og:site_name')

  // Thingiverse écrit « Titre by Auteur » dans og:title. Le titre lui-même peut
  // contenir « by » (« ...torture-test by CreativeTools.se by CreativeTools ») :
  // le séparateur est donc le *dernier* « by », d'où la capture gourmande.
  let title = rawTitle
  let author: string | undefined
  const byMatch = rawTitle.match(/^(.*)\s+by\s+(\S.*)$/i)
  if (url.hostname.includes('thingiverse.com') && byMatch) {
    title = byMatch[1].trim()
    author = byMatch[2].trim()
  }

  // Certains sites suffixent le titre par « | Nom du site ».
  title = title.replace(/\s*[|·–—-]\s*[^|·–—-]{0,40}$/, (match) =>
    siteName && match.toLowerCase().includes(siteName.toLowerCase()) ? '' : match,
  )

  const image = meta.get('og:image') ?? meta.get('twitter:image')

  return {
    title: title.trim() || rawTitle,
    imageUrl: image && /^https?:\/\//i.test(image) ? image : undefined,
    author: author ?? parseJsonLdAuthor(html),
    description: toPlainText(meta.get('og:description') ?? meta.get('description')),
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
    return { title: fallbackTitle(url), resolved: false }
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '')

  // Chaque plateforme a sa stratégie, avec repli sur OpenGraph si elle échoue.
  const strategies: Array<() => Promise<ModelMetadata | null>> = []
  if (host.endsWith('printables.com')) {
    strategies.push(() => fromPrintables(url))
  } else if (host.endsWith('makerworld.com')) {
    strategies.push(() => fromMakerWorld(url))
  } else if (host.endsWith('thingiverse.com')) {
    strategies.push(() => fromOpenGraph(url, 'Thingiverse'))
  } else if (host.endsWith('cults3d.com')) {
    strategies.push(() => fromOpenGraph(url, 'Cults3D'))
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

  return { title: fallbackTitle(url), resolved: false }
}
