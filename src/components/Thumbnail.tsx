'use client'

import { useEffect, useState } from 'react'
import { thumbnailSrc } from '@/lib/images'

type Stage = 'cdn' | 'origin' | 'failed'

/** Teinte stable déduite du nom : deux cartes différentes ne se confondent pas. */
function hueFor(label: string): number {
  let hash = 0
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) % 360
  }
  return hash
}

/** Première lettre ou chiffre du nom — « #3DBenchy » donne donc « 3 », pas « # ». */
function initialFor(label: string): string {
  const match = label.match(/[\p{L}\p{N}]/u)
  return (match?.[0] ?? '?').toUpperCase()
}

/**
 * Vignette d'un modèle.
 *
 * Les images viennent de serveurs tiers sur lesquels on n'a aucune prise, et
 * certaines cartes n'en ont aucune (saisie manuelle, plateforme muette). On
 * tente donc l'Image CDN, puis l'URL d'origine, et à défaut on affiche une
 * pastille portant l'initiale du modèle : la carte garde une silhouette
 * régulière, et c'est le nom qui porte l'information.
 */
export function Thumbnail({
  src,
  label,
  size = 160,
  className = '',
}: {
  src?: string | null
  label: string
  size?: number
  className?: string
}) {
  const cdnSrc = src ? thumbnailSrc(src, size) : ''
  // Hors Netlify, thumbnailSrc renvoie l'URL telle quelle : il n'y a alors
  // qu'une seule tentative possible. Sans cette distinction, les deux étapes
  // porteraient la même URL, le navigateur ne rechargerait rien, et l'image
  // cassée resterait affichée faute d'un second onError.
  const hasCdn = Boolean(src) && cdnSrc !== src
  const firstStage: Stage = hasCdn ? 'cdn' : 'origin'

  const [stage, setStage] = useState<Stage>(firstStage)

  // Une carte peut changer d'image après une modification.
  useEffect(() => setStage(firstStage), [src, firstStage])

  if (!src || stage === 'failed') {
    return (
      <div
        aria-hidden="true"
        style={{ '--thumb-hue': hueFor(label) } as React.CSSProperties}
        className={`thumb-fallback flex items-center justify-center font-semibold select-none ${className}`}
      >
        {initialFor(label)}
      </div>
    )
  }

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
