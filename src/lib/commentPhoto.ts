/**
 * Ce qu'on accepte comme photo jointe à un message, et comment on la lit.
 *
 * Les mêmes règles que la photo de résultat, mises en commun parce qu'elles
 * doivent le rester : deux plafonds qui divergent, et l'un des deux écrans se met
 * un jour à refuser ce que l'autre accepte, sans que personne ne comprenne
 * pourquoi.
 */

export const PHOTO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])

/**
 * Le navigateur redimensionne déjà avant l'envoi (`preparePhoto`) : ce plafond
 * n'est pas une contrainte d'usage, c'est un garde-fou contre un envoi direct qui
 * remplirait la base.
 */
export const PHOTO_MAX_BYTES = 3_000_000

export type PhotoLue =
  { ok: true; mime: string; bytes: Buffer } | { ok: false; error: string; status: number }

/** Valide un fichier reçu dans un formulaire multipart. */
export async function lirePhoto(fichier: File): Promise<PhotoLue> {
  const mime = fichier.type.split(';')[0].trim().toLowerCase()
  if (!PHOTO_MIMES.has(mime)) {
    return { ok: false, error: 'Format non accepté. Attendu : JPEG, PNG ou WebP.', status: 415 }
  }

  const bytes = Buffer.from(await fichier.arrayBuffer())
  if (bytes.length === 0) {
    return { ok: false, error: 'Image vide.', status: 400 }
  }
  if (bytes.length > PHOTO_MAX_BYTES) {
    return { ok: false, error: 'Image trop lourde (3 Mo maximum).', status: 413 }
  }
  return { ok: true, mime, bytes }
}

/**
 * URL de la photo d'un message. La date sert de numéro de version, comme pour la
 * photo d'une carte — ce qui permet de poser un cache long sans risque.
 */
export function commentPhotoUrl(cardId: string, commentId: string, photoAt: string): string {
  return `/api/cards/${cardId}/comments/${commentId}/photo?v=${encodeURIComponent(photoAt)}`
}
