import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { printer } from '@/db/schema'
import { readWebhook } from '@/lib/printer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Reçoit les événements d'OctoEverywhere.
 *
 * Cette route est la seule de l'application à ne pas exiger le cookie de session :
 * elle est appelée par un service, pas par un navigateur. Son jeton en tient donc
 * lieu — jeton posé dans la page de réglages, et comparé en temps constant comme
 * le code d'accès.
 *
 * Voie de secours, pas voie principale : la lecture directe donne un état complet
 * à tout moment, là où un webhook ne parle qu'aux changements. Elle existe parce
 * qu'OctoEverywhere ne documente pas l'authentification de son API d'état, et que
 * si celle-ci nous reste fermée, il faut bien un chemin qui marche.
 */
export async function POST(request: Request) {
  const fourni = new URL(request.url).searchParams.get('token') ?? ''

  const db = getDb()
  const [ligne] = await db.select().from(printer).where(eq(printer.id, 1))
  const attendu = ligne?.webhookToken

  if (!attendu) {
    return NextResponse.json({ error: 'Aucun jeton de webhook configuré.' }, { status: 404 })
  }
  if (!mêmeJeton(fourni, attendu)) {
    return NextResponse.json({ error: 'Jeton invalide.' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps illisible.' }, { status: 400 })
  }

  const lecture = readWebhook(payload)
  if (!lecture) {
    return NextResponse.json({ error: 'Événement non reconnu.' }, { status: 422 })
  }

  /*
   * On ne remplace que ce que l'événement porte : un webhook de progression ne
   * dit rien des températures, et écraser les dernières connues par des `null`
   * ferait clignoter le bandeau à chaque appel.
   */
  const updates: Partial<typeof printer.$inferInsert> = {
    seenAt: new Date(),
    lastError: null,
    updatedAt: new Date(),
  }
  for (const [clé, valeur] of Object.entries(lecture)) {
    if (valeur !== null && valeur !== undefined) {
      Object.assign(updates, { [clé]: valeur })
    }
  }

  await db.update(printer).set(updates).where(eq(printer.id, 1))
  return NextResponse.json({ ok: true, state: lecture.state })
}

/** Comparaison en temps constant, sur des empreintes de longueur fixe. */
function mêmeJeton(fourni: string, attendu: string): boolean {
  const a = createHash('sha256').update(fourni).digest()
  const b = createHash('sha256').update(attendu).digest()
  return timingSafeEqual(a, b)
}
