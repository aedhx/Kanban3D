import { NextResponse } from 'next/server'
import { asc, eq, sql } from 'drizzle-orm'
import { getDb } from '@/db'
import { cards } from '@/db/schema'
import { isAuthenticated } from '@/lib/auth'
import { POSITION_STEP, isStatus, normalizeQuantity, normalizeText } from '@/lib/cards'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }

  const db = getDb()
  const rows = await db.select().from(cards).orderBy(asc(cards.position), asc(cards.createdAt))
  return NextResponse.json({ cards: rows })
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const title = normalizeText(body.title, 300)
  if (!title) {
    return NextResponse.json({ error: 'Le titre est obligatoire.' }, { status: 400 })
  }

  const requestedBy = normalizeText(body.requestedBy, 60) ?? 'Quelqu’un'
  const status = isStatus(body.status) ? body.status : 'todo'

  const db = getDb()

  // La nouvelle carte se place en fin de colonne.
  const [{ max }] = await db
    .select({ max: sql<number | null>`max(${cards.position})` })
    .from(cards)
    .where(eq(cards.status, status))

  const [created] = await db
    .insert(cards)
    .values({
      title,
      status,
      position: (max ?? 0) + POSITION_STEP,
      url: normalizeText(body.url, 1000),
      imageUrl: normalizeText(body.imageUrl, 1000),
      author: normalizeText(body.author, 120),
      source: normalizeText(body.source, 60),
      quantity: normalizeQuantity(body.quantity),
      color: normalizeText(body.color, 60),
      notes: normalizeText(body.notes),
      requestedBy,
    })
    .returning()

  return NextResponse.json({ card: created }, { status: 201 })
}
