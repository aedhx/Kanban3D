import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kanban3D',
  description: 'Le tableau des impressions 3D à faire',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#f0761a',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-full font-sans antialiased">{children}</body>
    </html>
  )
}
