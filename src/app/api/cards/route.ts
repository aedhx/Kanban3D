import { NextResponse } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '@/db'
import { listCards } from '@/db/queries'
import { cards } from '@/db/schema'
import { isAuthenticated } from '@/lib/auth'
import {
  LIMITS,
  POSITION_STEP,
  isStatus,
  normalizeCount,
  normalizeDate,
  normalizeQuantity,
  normalizeText,
} from '@/lib/cards'
import { fetchModelMetadata } from '@/lib/metadata'
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

  const url = normalizeText(body.url, 1000)
  let title = normalizeText(body.title, 300)

  // Coller un lien suffit à créer une carte : c'est le serveur qui va chercher
  // titre, image et auteur. Le faire ici plutôt que dans le navigateur évite un
  // aller-retour, et garantit qu'une carte n'arrive jamais sans nom.
  let resolved: Awaited<ReturnType<typeof fetchModelMetadata>> | null = null
  if (url && !title) {
    resolved = await fetchModelMetadata(url)
    title = normalizeText(resolved.title, 300)
  }

  if (!title) {
    return NextResponse.json(
      { error: 'Donnez un titre, ou collez le lien d’un modèle.' },
      { status: 400 },
    )
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
      url,
      imageUrl: normalizeText(body.imageUrl, 1000) ?? resolved?.imageUrl ?? null,
      author: normalizeText(body.author, 120) ?? resolved?.author ?? null,
      source: normalizeText(body.source, 60) ?? resolved?.source ?? null,
      quantity: normalizeQuantity(body.quantity),
      color: normalizeText(body.color, 60),
      notes: normalizeText(body.notes),
      dueDate: normalizeDate(body.dueDate),
      // Ce que coûte l'impression : la saisie prime, la plateforme complète.
      printMinutes:
        normalizeCount(body.printMinutes, LIMITS.printMinutes) ?? resolved?.printMinutes ?? null,
      filamentGrams:
        normalizeCount(body.filamentGrams, LIMITS.filamentGrams) ?? resolved?.filamentGrams ?? null,
      material: normalizeText(body.material, 40) ?? resolved?.material ?? null,
      fileCount: normalizeCount(body.fileCount, LIMITS.fileCount) ?? resolved?.fileCount ?? null,
      pieceCount:
        normalizeCount(body.pieceCount, LIMITS.pieceCount) ?? resolved?.pieceCount ?? null,
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
