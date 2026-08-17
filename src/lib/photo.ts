/**
 * Préparation d'une photo avant envoi, dans le navigateur.
 *
 * Une photo de téléphone pèse volontiers 4 Mo pour 4000 px de large, là où la
 * carte l'affiche en 56 px et le panneau en 380. La redimensionner ici plutôt que
 * sur le serveur épargne le forfait de données de celui qui la prend — c'est lui
 * qui est devant l'imprimante, souvent au garage, au bout du wifi.
 */

/** Côté le plus long après redimensionnement. */
const MAX_SIDE = 1600
const QUALITY = 0.82

export type PreparedPhoto = { blob: Blob; width: number; height: number }

/**
 * Redimensionne et recomprime en JPEG. Les métadonnées EXIF disparaissent au
 * passage — dont la position GPS, qu'on n'a aucune raison de stocker.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const bitmap = await loadBitmap(file)
  try {
    const ratio = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * ratio))
    const height = Math.max(1, Math.round(bitmap.height * ratio))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas indisponible')
    context.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALITY),
    )
    if (!blob) throw new Error('compression impossible')
    return { blob, width, height }
  } finally {
    if ('close' in bitmap) bitmap.close()
  }
}

/**
 * `createImageBitmap` gère l'orientation EXIF et ne bloque pas le fil principal.
 * Safari l'a tardivement ; d'où le repli sur une balise `img`, qui applique
 * l'orientation depuis Safari 13.
 */
async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Format exotique ou option non gérée : on tente la voie classique.
    }
  }

  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('image illisible'))
      image.src = url
    })
  } finally {
    // L'image est décodée, l'URL temporaire ne sert plus.
    URL.revokeObjectURL(url)
  }
}

/**
 * URL de la photo d'une carte. La date sert de numéro de version : une photo
 * remplacée change d'URL, ce qui contourne le cache d'un an posé par la route.
 */
export function photoUrl(cardId: string, photoAt: string): string {
  return `/api/cards/${cardId}/photo?v=${encodeURIComponent(photoAt)}`
}
