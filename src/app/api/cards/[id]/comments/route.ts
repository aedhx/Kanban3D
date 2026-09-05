import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { cards, commentPhotos, comments } from '@/db/schema'
import { isAuthenticated } from '@/lib/auth'
import { normalizeText } from '@/lib/cards'
import { lirePhoto } from '@/lib/commentPhoto'
import { notify } from '@/lib/notify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_request: Request, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Carte introuvable.' }, { status: 404 })
  }

  const rows = await getDb()
    .select()
    .from(comments)
    .where(eq(comments.cardId, id))
    .orderBy(asc(comments.createdAt))

  return NextResponse.json({ comments: rows })
}

/**
 * Ajoute un message, avec ou sans photo.
 *
 * Deux formes acceptées : du JSON, comme avant, et un formulaire multipart quand
 * il y a une image. **Un seul aller-retour dans les deux cas**, et c'est le point
 * qui a décidé de la forme : découper en « crée le message » puis « attache la
 * photo » aurait laissé la notification partir avant l'image, ou pas du tout si le
 * second appel échouait.
 *
 * Avec une photo, le texte devient facultatif — montrer, c'est déjà dire quelque
 * chose.
 */
export async function POST(request: Request, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Carte introuvable.' }, { status: 404 })
  }

  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()

  let message: string | null
  let auteur: string | null
  let photo: { mime: string; bytes: Buffer } | null = null

  if (type === 'multipart/form-data') {
    let formulaire: FormData
    try {
      formulaire = await request.formData()
    } catch {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
    }
    message = normalizeText(formulaire.get('body'), 2000)
    auteur = normalizeText(formulaire.get('author'), 60)

    const fichier = formulaire.get('photo')
    if (fichier instanceof File && fichier.size > 0) {
      const lue = await lirePhoto(fichier)
      if (!lue.ok) return NextResponse.json({ error: lue.error }, { status: lue.status })
      photo = { mime: lue.mime, bytes: lue.bytes }
    }
  } else {
    let body: Record<string, unknown>
    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
    }
    message = normalizeText(body.body, 2000)
    auteur = normalizeText(body.author, 60)
  }

  if (!message && !photo) {
    return NextResponse.json({ error: 'Le message est vide.' }, { status: 400 })
  }

  const db = getDb()

  // On vérifie la carte pour renvoyer 404 plutôt qu'une violation de clé
  // étrangère, et pour disposer de son titre dans la notification.
  const [card] = await db.select({ title: cards.title }).from(cards).where(eq(cards.id, id))
  if (!card) {
    return NextResponse.json({ error: 'Carte introuvable.' }, { status: 404 })
  }

  const photoAt = photo ? new Date() : null
  const [created] = await db
    .insert(comments)
    .values({
      cardId: id,
      author: auteur ?? 'Quelqu’un',
      body: message ?? '',
      photoAt,
    })
    .returning()

  if (photo && photoAt) {
    await db.insert(commentPhotos).values({
      commentId: created.id,
      mime: photo.mime,
      bytes: photo.bytes,
      createdAt: photoAt,
    })
  }

  await notify({
    kind: 'commented',
    title: card.title,
    by: created.author,
    body: created.body,
    // L'image part avec le message quand la destination sait la recevoir ;
    // sinon elle est simplement annoncée. Voir `resolveTransport()`.
    photo: photo ?? undefined,
  })

  return NextResponse.json({ comment: created }, { status: 201 })
}
