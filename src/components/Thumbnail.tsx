'use client'

import { useEffect, useState } from 'react'
import { thumbnailSrc } from '@/lib/images'

type Stage = 'cdn' | 'origin' | 'failed'

/**
 * Vignette d'un modèle. Les images viennent de serveurs tiers sur lesquels on
 * n'a aucune prise : plutôt que d'afficher une icône d'image cassée, on tente
 * l'Image CDN, puis l'URL d'origine, puis on n'affiche plus rien.
 */
export function Thumbnail({
  src,
  size = 160,
  className,
}: {
  src: string
  size?: number
  className?: string
}) {
  const cdnSrc = thumbnailSrc(src, size)
  // Hors Netlify, thumbnailSrc renvoie l'URL telle quelle : il n'y a alors
  // qu'une seule tentative possible. Sans cette distinction, les deux étapes
  // porteraient la même URL, le navigateur ne rechargerait rien, et l'image
  // cassée resterait affichée faute d'un second onError.
  const hasCdn = cdnSrc !== src
  const firstStage: Stage = hasCdn ? 'cdn' : 'origin'

  const [stage, setStage] = useState<Stage>(firstStage)

  // Une carte peut changer d'image après une modification.
  useEffect(() => setStage(firstStage), [src, firstStage])

  if (stage === 'failed') return null

  return (
    // Les hôtes d'images dépendent de la plateforme du modèle : impossible de
    // tous les déclarer dans les remotePatterns de next.config. Le
    // redimensionnement passe par l'Image CDN de Netlify (cf. thumbnailSrc).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={stage === 'cdn' ? cdnSrc : src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => setStage((current) => (current === 'cdn' ? 'origin' : 'failed'))}
      className={className}
    />
  )
}
