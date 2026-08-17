import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kanban3D',
  description: 'Le tableau des impressions 3D à faire',
  robots: { index: false, follow: false },
  applicationName: 'Kanban3D',
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'Kanban3D',
    // Barre de statut assortie au fond sombre quand l'app est lancée depuis
    // l'écran d'accueil iOS.
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Laisse la place au contenu sous l'encoche des iPhone en plein écran.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f5f7' },
    { media: '(prefers-color-scheme: dark)', color: '#101216' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-full font-sans antialiased">{children}</body>
    </html>
  )
}
