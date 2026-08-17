import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { cardPhotos, cards } from '@/db/schema'
import { isAuthenticated } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Formats acceptés, et taille maximale.
 *
 * Le navigateur redimensionne déjà l'image avant l'envoi (cf. `resizeImage`) :
 * ce plafond n'est donc pas une contrainte d'usage, c'est un garde-fou contre un
 * envoi direct qui remplirait la base.
 */
const MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 3_000_000

/**
 * La photo elle-même. Le tableau ne transporte jamais ces octets : il ne connaît
 * que `photoAt`, et le navigateur vient chercher l'image ici.
 */
export async function GET(_request: Request, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Carte introuvable.' }, { status: 404 })
  }

  const [photo] = await getDb().select().from(cardPhotos).where(eq(cardPhotos.cardId, id))
  if (!photo) {
    return NextResponse.json({ error: 'Aucune photo.' }, { status: 404 })
  }

  return new NextResponse(new Uint8Array(photo.bytes), {
    headers: {
      'Content-Type': photo.mime,
      'Content-Length': String(photo.bytes.length),
      /*
       * Immuable, parce que l'URL porte la date de la photo (`?v=`) : remplacer
       * la photo change l'URL, et le cache d'hier ne masque donc jamais l'image
       * d'aujourd'hui. `private` : c'est une photo derrière un code partagé, elle
       * n'a rien à faire dans un cache intermédiaire.
       */
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  })
}

/** Dépose ou remplace la photo. Une seule par carte. */
export async function POST(request: Request, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Carte introuvable.' }, { status: 404 })
  }

  const mime = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!MIMES.has(mime)) {
    return NextResponse.json(
      { error: 'Format non accepté. Attendu : JPEG, PNG ou WebP.' },
      { status: 415 },
    )
  }

  const bytes = Buffer.from(await request.arrayBuffer())
  if (bytes.length === 0) {
    return NextResponse.json({ error: 'Image vide.' }, { status: 400 })
  }
  if (bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: 'Image trop lourde (3 Mo maximum).' }, { status: 413 })
  }

  const db = getDb()
  const [card] = await db.select({ id: cards.id }).from(cards).where(eq(cards.id, id))
  if (!card) {
    return NextResponse.json({ error: 'Carte introuvable.' }, { status: 404 })
  }

  const photoAt = new Date()
  await db
    .insert(cardPhotos)
    .values({ cardId: id, mime, bytes, createdAt: photoAt })
    // Une photo par carte : la deuxième remplace la première.
    .onConflictDoUpdate({
      target: cardPhotos.cardId,
      set: { mime, bytes, createdAt: photoAt },
    })

  await db.update(cards).set({ photoAt, updatedAt: photoAt }).where(eq(cards.id, id))

  return NextResponse.json({ photoAt: photoAt.toISOString() }, { status: 201 })
}

export async function DELETE(_request: Request, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Carte introuvable.' }, { status: 404 })
  }

  const db = getDb()
  await db.delete(cardPhotos).where(eq(cardPhotos.cardId, id))
  await db.update(cards).set({ photoAt: null, updatedAt: new Date() }).where(eq(cards.id, id))

  return NextResponse.json({ ok: true })
}
