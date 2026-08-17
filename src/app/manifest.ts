import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kanban3D — impressions 3D',
    short_name: 'Kanban3D',
    description: 'Le tableau des impressions 3D à faire, partagé à deux.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#101216',
    theme_color: '#f0761a',
    lang: 'fr',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Version « maskable » : Android rogne l'icône selon la forme du système,
      // celle-ci garde donc de la marge autour du cube.
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
