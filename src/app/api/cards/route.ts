import { NextResponse } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '@/db'
import { listCards } from '@/db/queries'
import { cards } from '@/db/schema'
import { isAuthenticated } from '@/lib/auth'
import {
  POSITION_STEP,
  isStatus,
  normalizeDate,
  normalizeQuantity,
  normalizeText,
} from '@/lib/cards'
import { notify } from '@/lib/notify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }

  return NextResponse.json({ cards: await listCards() })
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
      dueDate: normalizeDate(body.dueDate),
      requestedBy,
      doneAt: status === 'done' ? new Date() : null,
    })
    .returning()

  await notify({
    kind: 'created',
    title: created.title,
    by: created.requestedBy,
    quantity: created.quantity,
    color: created.color,
  })

  // La carte vient de naître : aucun message, mais le champ doit être présent
  // pour que le navigateur reçoive toujours la même forme d'objet.
  return NextResponse.json({ card: { ...created, commentCount: 0 } }, { status: 201 })
}
