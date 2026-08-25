import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { notifications } from '@/db/schema'
import { isAuthenticated } from '@/lib/auth'
import { normalizeText } from '@/lib/cards'
import { notificationsToView, readNotificationRow } from '@/lib/notifySettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Les transports connus. Tout autre nom est refusé plutôt qu'ignoré. */
const TRANSPORTS = new Set(['telegram', 'ntfy', 'webhook'])

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }
  return NextResponse.json({ notifications: notificationsToView(await readNotificationRow()) })
}

/**
 * Enregistre la destination.
 *
 * Le jeton Telegram suit la même règle que les secrets de l'imprimante : champ
 * vide, on n'y touche pas ; il ne ressort jamais. Le sujet ntfy et l'URL de webhook
 * ne sont pas des secrets au même titre — ils s'affichent en clair, puisqu'il faut
 * pouvoir les relire pour les corriger.
 */
export async function PATCH(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  await readNotificationRow()
  const updates: Partial<typeof notifications.$inferInsert> = { updatedAt: new Date() }

  if ('transport' in body) {
    const nom = normalizeText(body.transport, 20)
    if (nom && !TRANSPORTS.has(nom)) {
      return NextResponse.json({ error: 'Transport inconnu.' }, { status: 400 })
    }
    updates.transport = nom
  }
  // Chaîne vide = « efface », champ absent = « n'y touche pas ».
  if ('telegramToken' in body) updates.telegramToken = normalizeText(body.telegramToken, 200)
  if ('telegramChat' in body) updates.telegramChat = normalizeText(body.telegramChat, 60)
  if ('ntfyTopic' in body) updates.ntfyTopic = normalizeText(body.ntfyTopic, 200)
  if ('webhookUrl' in body) updates.webhookUrl = normalizeText(body.webhookUrl, 500)

  const [ligne] = await getDb()
    .update(notifications)
    .set(updates)
    .where(eq(notifications.id, 1))
    .returning()
  return NextResponse.json({ notifications: notificationsToView(ligne) })
}
