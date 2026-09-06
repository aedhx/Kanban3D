import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { printer } from '@/db/schema'
import { isAuthenticated } from '@/lib/auth'
import { fetchImage } from '@/lib/printer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * L'aperçu de la webcam, servi par nous.
 *
 * Le navigateur pourrait aller le chercher directement chez OctoEverywhere —
 * l'adresse est publique — mais il faudrait alors lui confier le lien, et un
 * « Live Link » est un sésame : le posséder suffit à voir l'imprimante et sa
 * caméra. Il ne quitte donc pas le serveur, et cette route fait l'aller-retour.
 *
 * `404` quand il n'y a rien à montrer, ce qui est le cas le plus courant : machine
 * déconnectée, pas de caméra, ou compte sans webcam partagée. Ce n'est pas une
 * erreur, et le bandeau se contente alors de ne pas afficher de vignette.
 */
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }

  const [ligne] = await getDb()
    .select({ statusUrl: printer.statusUrl, altStatusUrl: printer.altStatusUrl })
    .from(printer)
    .where(eq(printer.id, 1))
  if (!ligne?.statusUrl && !ligne?.altStatusUrl) {
    return NextResponse.json({ error: 'Aucune imprimante configurée.' }, { status: 404 })
  }

  // Les deux adresses : une seule des deux sert la caméra, et laquelle dépend de
  // ce qui est configuré. `fetchImage` prend la première qui répond.
  const image = await fetchImage(null, [ligne.statusUrl, ligne.altStatusUrl])
  if (!image) {
    return NextResponse.json({ error: 'Aucun aperçu disponible.' }, { status: 404 })
  }

  return new NextResponse(new Uint8Array(image.bytes), {
    headers: {
      'Content-Type': image.mime,
      'Content-Length': String(image.bytes.length),
      /*
       * Jamais de cache : c'est une image en direct, et la mettre en cache la
       * figerait pendant toute l'impression. La vignette du bandeau ajoute déjà un
       * horodatage à son URL, mais un intermédiaire pourrait l'ignorer.
       */
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
