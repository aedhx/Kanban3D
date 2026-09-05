import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { printer } from '@/db/schema'
import { isAuthenticated } from '@/lib/auth'
import { openStream } from '@/lib/printer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Au-delà, la plateforme couperait elle-même, et moins proprement. Next.js le
 * transmet à l'hébergeur ; la coupure volontaire ci-dessous reste en deçà.
 */
export const maxDuration = 30

/**
 * Au bout de combien de temps on raccroche de notre propre chef.
 *
 * Trois limites se superposent, et il vaut mieux être celui qui coupe :
 * OctoEverywhere ferme à 180 s (`MaxStreamTimeSec`), l'hébergeur ferme une
 * fonction au bout de quelques dizaines de secondes, et nous voici. Le navigateur
 * relance de toute façon un peu avant, donc la reprise ne se voit pas.
 */
const DURÉE_MAX_MS = 25_000

/**
 * La webcam en direct, relayée par nous.
 *
 * OctoEverywhere sert un flux MJPEG (`multipart/x-mixed-replace`) qu'un
 * navigateur affiche tel quel dans une balise `img`. On pourrait donc y envoyer
 * le navigateur directement — mais il faudrait lui confier le lien, et un « Live
 * Link » est un sésame : le posséder suffit à voir l'imprimante. Il ne quitte pas
 * le serveur, et ce relais fait l'aller-retour.
 *
 * Le flux amont est lu au rythme où le navigateur consomme : sans ça, un onglet
 * lent ferait gonfler une file d'images en mémoire dans la fonction.
 */
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }

  const [ligne] = await getDb()
    .select({ statusUrl: printer.statusUrl })
    .from(printer)
    .where(eq(printer.id, 1))
  if (!ligne?.statusUrl) {
    return NextResponse.json({ error: 'Aucune imprimante configurée.' }, { status: 404 })
  }

  // Notre propre poignée pour raccrocher chez OctoEverywhere : ni la fin du
  // délai, ni l'onglet qu'on ferme ne doivent laisser une connexion ouverte.
  const abandon = new AbortController()
  const amont = await openStream(ligne.statusUrl, {
    timeoutMs: DURÉE_MAX_MS + 5000,
    signal: abandon.signal,
  })
  if (!amont?.body) {
    abandon.abort()
    return NextResponse.json({ error: 'Aucun flux disponible.' }, { status: 404 })
  }

  const lecteur = amont.body.getReader()
  const échéance = Date.now() + DURÉE_MAX_MS

  const flux = new ReadableStream<Uint8Array>({
    async pull(contrôle) {
      if (Date.now() >= échéance) {
        contrôle.close()
        abandon.abort()
        return
      }
      try {
        const { done, value } = await lecteur.read()
        if (done) {
          contrôle.close()
          abandon.abort()
          return
        }
        contrôle.enqueue(value)
      } catch {
        // Amont coupé : on ferme sans bruit, le navigateur relancera.
        contrôle.close()
        abandon.abort()
      }
    },
    cancel() {
      // L'onglet s'est fermé, ou la balise a été remontée.
      abandon.abort()
    },
  })

  return new NextResponse(flux, {
    headers: {
      // Recopié tel quel : c'est lui qui porte la frontière entre les images.
      'Content-Type': amont.headers.get('content-type') ?? 'multipart/x-mixed-replace',
      'Cache-Control': 'no-store, max-age=0',
      // Un intermédiaire qui met en tampon transformerait le direct en diaporama.
      'X-Accel-Buffering': 'no',
    },
  })
}
