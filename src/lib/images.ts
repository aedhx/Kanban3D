/**
 * Les plateformes servent leur image principale en pleine résolution : celle
 * d'un modèle Printables pèse volontiers 2 Mo, pour une vignette de 56 px.
 * Sur mobile, avec vingt cartes, c'est inacceptable.
 *
 * Une fois déployée sur Netlify, l'app fait passer ces images par l'Image CDN,
 * qui les redimensionne à la volée. Les hôtes autorisés sont listés dans
 * netlify.toml (`[images] remote_images`) ; pour tout autre hôte la requête
 * échoue et le composant Thumbnail se rabat sur l'URL d'origine.
 *
 * En local, l'Image CDN n'existe pas : on sert l'URL d'origine directement.
 */
const IMAGE_CDN_ENABLED = process.env.NEXT_PUBLIC_IMAGE_CDN === '1'

export function thumbnailSrc(src: string, size = 160): string {
  if (!IMAGE_CDN_ENABLED || !/^https:\/\//i.test(src)) return src
  return `/.netlify/images?url=${encodeURIComponent(src)}&w=${size}&h=${size}&fit=cover`
}
