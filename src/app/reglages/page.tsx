import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { printer, type Printer } from '@/db/schema'
import { isAuthenticated } from '@/lib/auth'
import { printerToView } from '@/lib/printerView'
import { PrinterSettings } from '@/components/PrinterSettings'

export const dynamic = 'force-dynamic'

/** Ligne d'imprimante vide, au cas — improbable — où la migration n'ait rien posé. */
const DÉFAUTS: Printer = {
  id: 1,
  name: 'L’imprimante d’Alexandre',
  statusUrl: null,
  statusSecret: null,
  webhookToken: null,
  state: null,
  statusColor: null,
  printing: false,
  progress: null,
  currentLayer: null,
  totalLayers: null,
  timeLeftSec: null,
  durationSec: null,
  fileName: null,
  nozzleTemp: null,
  bedTemp: null,
  seenAt: null,
  lastError: null,
  updatedAt: new Date(),
}

export default async function ReglagesPage() {
  if (!(await isAuthenticated())) redirect('/login')

  const db = getDb()
  const [ligne] = await db.select().from(printer).where(eq(printer.id, 1))

  /*
   * L'origine sert à afficher l'adresse complète du webhook, celle qu'on ira
   * coller dans OctoEverywhere. Elle est lue dans les en-têtes plutôt que devinée :
   * l'application vit aussi bien en local qu'en ligne.
   */
  const en = await headers()
  const host = en.get('x-forwarded-host') ?? en.get('host') ?? 'localhost:3000'
  const protocole = en.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')

  return (
    <main className="mx-auto w-full max-w-xl p-4 sm:p-6">
      <header className="mb-6 flex items-center gap-2">
        {/*
          Un chevron en texte plutôt que l'icône Phosphor : ce fichier est un
          composant serveur, et @phosphor-icons/react s'appuie sur un contexte
          React — l'importer ici casse la construction avec un « createContext is
          not a function » assez énigmatique.
        */}
        <Link
          href="/"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs text-muted transition-colors hover:border-accent hover:text-accent sm:min-h-0 sm:py-1"
        >
          <span aria-hidden>‹</span>
          Le tableau
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">Réglages</h1>
      </header>

      <h2 className="mb-1 text-sm font-semibold">L’imprimante</h2>
      <p className="mb-4 text-xs text-muted">
        Pour voir l’état de l’impression sur le tableau. La Centauri Carbon n’expose pas de liaison
        série — OctoPrint ne sait donc pas lui parler, contrairement à OctoEverywhere, qui tourne
        sur le NAS.
      </p>

      <PrinterSettings
        /*
         * Les réglages d'une imprimante qui n'a jamais été configurée : la ligne
         * est créée par la migration, mais la page ne doit pas dépendre de ça.
         */
        initial={printerToView(ligne ?? DÉFAUTS)}
        origin={`${protocole}://${host}`}
      />
    </main>
  )
}
