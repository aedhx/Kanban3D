import type { Metadata, Viewport } from 'next'
import './globals.css'

/**
 * Adresse du site, pour que les balises de partage portent des URL absolues —
 * la plupart des aperçus de liens refusent une URL relative. Netlify expose
 * `URL` de lui-même ; le repli sert au développement local et aux autres hôtes.
 */
const SITE = process.env.URL ?? 'https://kanban3d.netlify.app'

const DESCRIPTION = 'Collez un lien, la carte se crée. Le tableau d’impressions 3D partagé à deux.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: 'Kanban3D',
  description: DESCRIPTION,
  applicationName: 'Kanban3D',
  authors: [{ name: 'ADX Corp' }],
  /*
   * Le tableau est privé, derrière un code : il n'a rien à faire dans un moteur
   * de recherche. Cela n'empêche pas les aperçus de liens ci-dessous — iMessage,
   * WhatsApp ou Slack ne consultent pas robots.txt avant de déplier un lien.
   */
  robots: { index: false, follow: false },
  /*
   * Ce que voit celui à qui on envoie l'adresse. Sans ces balises, iMessage
   * n'affiche qu'un titre et un domaine, et le lien a l'air mort.
   * L'image est un fichier statique de public/ : les robots d'aperçu n'ont pas
   * de session, elle doit donc rester accessible sans cookie.
   */
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    siteName: 'Kanban3D',
    title: 'Kanban3D',
    description: DESCRIPTION,
    url: '/',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Kanban3D — le tableau d’impressions 3D partagé à deux, par ADX Corp',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kanban3D',
    description: DESCRIPTION,
    images: ['/og.png'],
  },
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
