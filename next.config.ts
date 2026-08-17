import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Réécrit `import { X } from '@phosphor-icons/react'` vers le module de
    // l'icône seule : sans cela, le barrel de la bibliothèque (plusieurs
    // milliers d'icônes) ralentit fortement la compilation en développement.
    optimizePackageImports: ['@phosphor-icons/react'],
  },
  env: {
    // Netlify définit NETLIFY=true pendant la construction. On s'en sert pour
    // n'activer l'Image CDN (/.netlify/images) que là où il existe réellement ;
    // en local, les vignettes restent servies par la plateforme d'origine.
    NEXT_PUBLIC_IMAGE_CDN: process.env.NETLIFY === 'true' ? '1' : '',
  },
}

export default nextConfig
