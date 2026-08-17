import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { cards, comments } from '@/db/schema'
import { isAuthenticated } from '@/lib/auth'
import { normalizeText } from '@/lib/cards'
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

export async function POST(request: Request, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Carte introuvable.' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const message = normalizeText(body.body, 2000)
  if (!message) {
    return NextResponse.json({ error: 'Le message est vide.' }, { status: 400 })
  }

  const db = getDb()

  // On vérifie la carte pour renvoyer 404 plutôt qu'une violation de clé
  // étrangère, et pour disposer de son titre dans la notification.
  const [card] = await db
    .select({ title: cards.title })
    .from(cards)
    .where(eq(cards.id, id))
  if (!card) {
    return NextResponse.json({ error: 'Carte introuvable.' }, { status: 404 })
  }

  const [created] = await db
    .insert(comments)
    .values({
      cardId: id,
      author: normalizeText(body.author, 60) ?? 'Quelqu’un',
      body: message,
    })
    .returning()

  await notify({
    kind: 'commented',
    title: card.title,
    by: created.author,
    body: created.body,
  })

  return NextResponse.json({ comment: created }, { status: 201 })
}
