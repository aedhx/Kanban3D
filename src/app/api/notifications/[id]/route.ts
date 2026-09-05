import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { notificationTargets } from '@/db/schema'
import { isAuthenticated } from '@/lib/auth'
import { lireLesChamps, readTarget, targetToView } from '@/lib/notifySettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Modifie une destination.
 *
 * Le jeton Telegram suit la même règle que les secrets de l'imprimante : champ
 * vide, on n'y touche pas ; il ne ressort jamais. Le sujet ntfy et l'URL de
 * webhook ne sont pas des secrets au même titre — ils s'affichent en clair,
 * puisqu'il faut pouvoir les relire pour les corriger.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }

  const { id } = await params
  if (!(await readTarget(id))) {
    return NextResponse.json({ error: 'Destination inconnue.' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const champs: Partial<typeof notificationTargets.$inferInsert> = { updatedAt: new Date() }
  const erreur = lireLesChamps(body, champs)
  if (erreur) return NextResponse.json({ error: erreur }, { status: 400 })

  const [ligne] = await getDb()
    .update(notificationTargets)
    .set(champs)
    .where(eq(notificationTargets.id, id))
    .returning()
  return NextResponse.json({ target: targetToView(ligne) })
}

/** Supprime une destination. Les autres continuent d'être prévenues. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }

  const { id } = await params
  const supprimées = await getDb()
    .delete(notificationTargets)
    .where(eq(notificationTargets.id, id))
    .returning({ id: notificationTargets.id })
  if (supprimées.length === 0) {
    return NextResponse.json({ error: 'Destination inconnue.' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
