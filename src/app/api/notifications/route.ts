import { NextResponse } from 'next/server'
import { getDb } from '@/db'
import { notificationTargets } from '@/db/schema'
import { isAuthenticated } from '@/lib/auth'
import { lireLesChamps, readTargets, targetToView } from '@/lib/notifySettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** La liste des destinations. Les jetons n'en font jamais partie. */
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }
  return NextResponse.json({ targets: (await readTargets()).map(targetToView) })
}

/**
 * Ajoute une destination.
 *
 * Le nom et le transport sont obligatoires : une destination sans transport
 * n'enverrait rien, et trois webhooks Discord sans étiquette sont
 * indiscernables — on ne saurait pas lequel on est en train de faire taire.
 */
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

  const champs: Partial<typeof notificationTargets.$inferInsert> = {}
  const erreur = lireLesChamps(body, champs)
  if (erreur) return NextResponse.json({ error: erreur }, { status: 400 })
  if (!champs.label || !champs.transport) {
    return NextResponse.json({ error: 'Un nom et une destination sont requis.' }, { status: 400 })
  }

  const [ligne] = await getDb()
    .insert(notificationTargets)
    .values({ ...champs, label: champs.label, transport: champs.transport })
    .returning()
  return NextResponse.json({ target: targetToView(ligne) }, { status: 201 })
}
