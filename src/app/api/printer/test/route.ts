import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { printer } from '@/db/schema'
import { isAuthenticated } from '@/lib/auth'
import { normalizeText } from '@/lib/cards'
import { printerStateLabel, probePrinter, statusEndpoint } from '@/lib/printer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Interroge l'imprimante sans rien enregistrer, et renvoie le diagnostic brut.
 *
 * Un lien d'OctoEverywhere peut échouer de plusieurs façons qui se ressemblent de
 * loin — lien révoqué, identifiant mal recopié, NAS éteint — et l'API répond
 * parfois 200 avec l'erreur dans le corps. Ce bouton montre donc ce qui a été
 * appelé et ce qui a répondu, mot pour mot : c'est ce qui distingue « le lien est
 * mauvais » de « l'imprimante est éteinte ».
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

  const url = normalizeText(body.statusUrl, 500)
  if (!url) {
    return NextResponse.json({ ok: false, error: 'Donnez d’abord une adresse.' })
  }

  /*
   * Secret : celui qu'on vient de taper, ou celui déjà en base si le champ est
   * resté vide — sans quoi tester après avoir enregistré demanderait de retaper
   * une clé qu'on ne nous renvoie jamais.
   */
  let secret = normalizeText(body.statusSecret, 500)
  if (!secret) {
    const [ligne] = await getDb()
      .select({ statusSecret: printer.statusSecret })
      .from(printer)
      .where(eq(printer.id, 1))
    secret = ligne?.statusSecret ?? null
  }

  const sonde = await probePrinter(url, secret)
  const appelée = statusEndpoint(url)?.toString() ?? url

  if (!sonde.ok) {
    return NextResponse.json({ ok: false, url: appelée, error: sonde.error, hint: sonde.hint })
  }

  return NextResponse.json({
    ok: true,
    url: appelée,
    state: sonde.reading.state,
    stateLabel: printerStateLabel(sonde.reading.state),
    detail: sonde.detail,
    reading: sonde.reading,
  })
}
