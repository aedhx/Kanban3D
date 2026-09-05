import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { printer } from '@/db/schema'
import { isAuthenticated } from '@/lib/auth'
import { sharePageUrl } from '@/lib/printer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Emmène chez OctoEverywhere, sur la page de partage de l'imprimante.
 *
 * Le bouton « Voir en direct » a besoin de ce lien, et c'est précisément ce qu'on
 * évite de mettre dans le HTML : un Live Link ne demande aucune authentification,
 * donc le poser dans le tableau reviendrait à le donner à quiconque l'ouvre — ou
 * à tout ce qui lit une page, d'une extension à une capture d'écran.
 *
 * Une redirection règle ça sans rien perdre : l'adresse n'existe que dans la
 * réponse à un clic, et seulement pour qui a déjà passé le code.
 */
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }

  const [ligne] = await getDb()
    .select({ statusUrl: printer.statusUrl })
    .from(printer)
    .where(eq(printer.id, 1))

  const page = ligne?.statusUrl ? sharePageUrl(ligne.statusUrl) : null
  if (!page) {
    return NextResponse.json({ error: 'Aucune page de partage connue.' }, { status: 404 })
  }

  const res = NextResponse.redirect(page, 302)
  // Sans ça, un navigateur peut garder la redirection et continuer d'emmener vers
  // l'ancienne imprimante après un changement de lien.
  res.headers.set('Cache-Control', 'no-store, max-age=0')
  return res
}
