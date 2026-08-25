import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { printer, type Printer } from '@/db/schema'
import { isAuthenticated } from '@/lib/auth'
import { normalizeText } from '@/lib/cards'
import { probePrinter } from '@/lib/printer'
import { appliquerLecture } from '@/lib/printerSync'
import { printerToView } from '@/lib/printerView'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Au-delà de cet âge, on redemande son état à l'imprimante. */
const FRAICHEUR_MS = 20_000

/** L'unique ligne de la table. Créée par la migration, mais on ne parie pas. */
async function lireLaLigne(): Promise<Printer> {
  const db = getDb()
  const [ligne] = await db.select().from(printer).where(eq(printer.id, 1))
  if (ligne) return ligne
  const [créée] = await db.insert(printer).values({ id: 1 }).returning()
  return créée
}

export type { PrinterView } from '@/lib/printerView'

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }

  let ligne = await lireLaLigne()

  /*
   * Rafraîchit si l'état a vieilli. Le cache est ici pour de bon : le tableau se
   * recharge toutes les dix secondes, à deux, sur plusieurs onglets — sans lui,
   * le NAS d'Alexandre serait interrogé des dizaines de fois par minute.
   */
  const âge = ligne.seenAt ? Date.now() - ligne.seenAt.getTime() : Infinity
  if (ligne.statusUrl && âge > FRAICHEUR_MS) {
    const sonde = await probePrinter(ligne.statusUrl, ligne.statusSecret)
    const db = getDb()
    if (sonde.ok) {
      // C'est ici que le tableau s'avance : la lecture ne se contente pas d'être
      // rangée, elle est comparée à la précédente.
      ligne = await appliquerLecture(ligne, sonde.reading)
    } else {
      /*
       * L'échec est enregistré mais l'ancien état est conservé : « il y a 4 min,
       * 47 % » vaut mieux qu'un écran vide, et le bandeau affiche l'âge.
       */
      const [misÀJour] = await db
        .update(printer)
        .set({ lastError: sonde.error, updatedAt: new Date() })
        .where(eq(printer.id, 1))
        .returning()
      ligne = misÀJour
    }
  }

  return NextResponse.json({ printer: printerToView(ligne) })
}

/** Enregistre la configuration. Le secret n'est remplacé que s'il est fourni. */
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

  await lireLaLigne()
  const updates: Partial<typeof printer.$inferInsert> = { updatedAt: new Date() }

  if ('name' in body) updates.name = normalizeText(body.name, 60) ?? 'L’imprimante d’Alexandre'
  if ('statusUrl' in body) {
    updates.statusUrl = normalizeText(body.statusUrl, 500)
    // Changer d'adresse invalide l'état précédent : il venait d'ailleurs.
    updates.seenAt = null
    updates.lastError = null
    updates.printing = false
  }
  if ('autoAdvance' in body) updates.autoAdvance = body.autoAdvance === true
  // Chaîne vide = « efface le secret », champ absent = « n'y touche pas ».
  if ('statusSecret' in body) updates.statusSecret = normalizeText(body.statusSecret, 500)
  if ('webhookToken' in body) updates.webhookToken = normalizeText(body.webhookToken, 200)

  const db = getDb()
  const [ligne] = await db.update(printer).set(updates).where(eq(printer.id, 1)).returning()
  return NextResponse.json({ printer: printerToView(ligne) })
}
