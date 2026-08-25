import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { getCardWithCount } from '@/db/queries'
import { STATUS_LABELS, cards } from '@/db/schema'
import { isAuthenticated } from '@/lib/auth'
import {
  LIMITS,
  isStatus,
  normalizeCount,
  normalizePriority,
  normalizeQuantity,
  normalizeText,
} from '@/lib/cards'
import { notify } from '@/lib/notify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(request: Request, { params }: Params) {
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

  const db = getDb()
  const [existing] = await db.select().from(cards).where(eq(cards.id, id))
  if (!existing) {
    return NextResponse.json({ error: 'Carte introuvable.' }, { status: 404 })
  }

  const updates: Partial<typeof cards.$inferInsert> = { updatedAt: new Date() }

  // Déplacement. Le client calcule la position à partir des cartes voisines
  // qu'il a déjà à l'écran (cf. positionBetween).
  if (isStatus(body.status)) updates.status = body.status
  if (typeof body.position === 'number' && Number.isFinite(body.position)) {
    updates.position = body.position
  }

  // On ne note « déplacé par » que si la carte change réellement de colonne :
  // réordonner à l'intérieur d'une colonne n'est pas un événement à afficher.
  const changedColumn = Boolean(updates.status && updates.status !== existing.status)
  if (changedColumn) {
    updates.lastMovedBy = normalizeText(body.movedBy, 60) ?? existing.lastMovedBy
    // Horodate l'entrée en « Fait », et l'efface si la carte en ressort : c'est
    // cette date qui décide de l'archivage.
    updates.doneAt = updates.status === 'done' ? new Date() : null
    /*
     * Renvoyée dans la file d'attente : le compte de pièces repart de zéro. Une
     * carte qui remonte de « Fait » vers « À imprimer » affichant « 3/3 pièces »
     * n'aurait aucun sens — on la refait, on recommence à compter.
     */
    if (updates.status === 'todo') updates.piecesDone = 0
  }

  // Édition des champs. `in` permet de distinguer « champ absent » (on ne
  // touche pas) de « champ vidé » (on efface).
  if ('title' in body) {
    const title = normalizeText(body.title, 300)
    if (!title) {
      return NextResponse.json({ error: 'Le titre est obligatoire.' }, { status: 400 })
    }
    updates.title = title
  }
  if ('url' in body) updates.url = normalizeText(body.url, 1000)
  if ('imageUrl' in body) updates.imageUrl = normalizeText(body.imageUrl, 1000)
  if ('author' in body) updates.author = normalizeText(body.author, 120)
  if ('source' in body) updates.source = normalizeText(body.source, 60)
  if ('color' in body) updates.color = normalizeText(body.color, 60)
  if ('notes' in body) updates.notes = normalizeText(body.notes)
  if ('quantity' in body) updates.quantity = normalizeQuantity(body.quantity)
  if ('priority' in body) updates.priority = normalizePriority(body.priority)
  if ('multiColor' in body) updates.multiColor = body.multiColor === true
  if ('colorCount' in body) updates.colorCount = normalizeCount(body.colorCount, LIMITS.colorCount)
  if ('printMinutes' in body)
    updates.printMinutes = normalizeCount(body.printMinutes, LIMITS.printMinutes)
  if ('filamentGrams' in body)
    updates.filamentGrams = normalizeCount(body.filamentGrams, LIMITS.filamentGrams)
  if ('material' in body) updates.material = normalizeText(body.material, 40)
  if ('fileCount' in body) updates.fileCount = normalizeCount(body.fileCount, LIMITS.fileCount)
  if ('pieceCount' in body) updates.pieceCount = normalizeCount(body.pieceCount, LIMITS.pieceCount)
  // La machine se trompera : le compte reste corrigeable à la main.
  if ('piecesDone' in body)
    updates.piecesDone = normalizeCount(body.piecesDone, LIMITS.piecesDone) ?? 0
  /*
   * Le refus. Une chaîne vide annule le refus, une raison le pose : il n'y a donc
   * pas de refus sans motif, ce qui est tout l'intérêt du champ.
   */
  if ('declinedReason' in body) updates.declinedReason = normalizeText(body.declinedReason, 200)

  const refusChange =
    'declinedReason' in body && (updates.declinedReason ?? null) !== existing.declinedReason

  const [updated] = await db.update(cards).set(updates).where(eq(cards.id, id)).returning()
  const withCount = (await getCardWithCount(id)) ?? { ...updated, commentCount: 0 }

  // Un refus se dit : c'est une réponse à une demande, pas une modification.
  if (refusChange && updated.declinedReason) {
    await notify({
      kind: 'declined',
      title: updated.title,
      by: normalizeText(body.movedBy, 60) ?? updated.lastMovedBy ?? updated.requestedBy,
      reason: updated.declinedReason,
    })
  }

  if (changedColumn) {
    await notify({
      kind: 'moved',
      title: updated.title,
      by: updated.lastMovedBy ?? updated.requestedBy,
      from: STATUS_LABELS[existing.status],
      to: STATUS_LABELS[updated.status],
    })
  }

  return NextResponse.json({ card: withCount })
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
  const deleted = await db.delete(cards).where(eq(cards.id, id)).returning({ id: cards.id })
  if (deleted.length === 0) {
    return NextResponse.json({ error: 'Carte introuvable.' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
