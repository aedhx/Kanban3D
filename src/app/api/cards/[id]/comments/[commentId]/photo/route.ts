import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { commentPhotos, comments } from '@/db/schema'
import { isAuthenticated } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; commentId: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * La photo jointe à un message.
 *
 * Le fil ne transporte jamais ces octets : il ne connaît que `photoAt`, et le
 * navigateur vient chercher l'image ici — même partage du travail que pour la
 * photo d'une carte.
 *
 * La carte est vérifiée en plus du message, alors que l'identifiant du message
 * suffirait à retrouver l'image. C'est voulu : l'URL dit « la photo de ce
 * message-là, sur cette carte-là », et une adresse qui ment sur l'une des deux ne
 * doit pas répondre.
 */
export async function GET(_request: Request, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }

  const { id, commentId } = await params
  if (!UUID_RE.test(id) || !UUID_RE.test(commentId)) {
    return NextResponse.json({ error: 'Message introuvable.' }, { status: 404 })
  }

  const [photo] = await getDb()
    .select({ mime: commentPhotos.mime, bytes: commentPhotos.bytes })
    .from(commentPhotos)
    .innerJoin(comments, eq(comments.id, commentPhotos.commentId))
    .where(and(eq(commentPhotos.commentId, commentId), eq(comments.cardId, id)))

  if (!photo) {
    return NextResponse.json({ error: 'Aucune photo.' }, { status: 404 })
  }

  return new NextResponse(new Uint8Array(photo.bytes), {
    headers: {
      'Content-Type': photo.mime,
      'Content-Length': String(photo.bytes.length),
      /*
       * Immuable : un message ne se modifie pas, sa photo non plus, et l'URL porte
       * en plus la date (`?v=`). `private`, parce que c'est une image derrière un
       * code partagé — elle n'a rien à faire dans un cache intermédiaire.
       */
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  })
}
