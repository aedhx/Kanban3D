'use client'

import { useCallback, useEffect, useState } from 'react'
import type { PrinterView } from '@/lib/printerView'
import { timeAgo } from '@/lib/dates'
import { formatPrintTime } from '@/lib/printInfo'
import { printerStateLabel } from '@/lib/printer'
import { IconPrinter, IconSettings } from './icons'

/** Le serveur ne rappelle l'imprimante qu'au bout de 20 s : inutile d'aller plus vite. */
const REFRESH_MS = 20_000

/** Au-delà, l'information n'est plus fraîche et il faut le dire. */
const PÉRIMÉ_MS = 90_000

export function PrinterStrip({
  initial,
  onPrinting,
}: {
  initial: PrinterView | null
  /** Remonte l'impression en cours, pour que la carte concernée l'affiche aussi. */
  onPrinting: (job: { fileName: string | null; progress: number } | null) => void
}) {
  const [printer, setPrinter] = useState(initial)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/printer', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { printer: PrinterView }
      setPrinter(data.printer)
      const p = data.printer
      onPrinting(
        p.printing && p.progress !== null ? { fileName: p.fileName, progress: p.progress } : null,
      )
    } catch {
      // Hors ligne : on garde le dernier état affiché, son horodatage le dira.
    }
  }, [onPrinting])

  useEffect(() => {
    /*
     * Une demande immédiate à l'arrivée : le premier rendu vient de la base, et
     * l'état qui y dort peut avoir plusieurs minutes. Attendre le premier tour
     * d'horloge afficherait « terminée » sur une impression en cours. Côté
     * serveur, le cache de 20 s absorbe la rafale des onglets.
     */
    refresh()
    const timer = setInterval(refresh, REFRESH_MS)
    const onFocus = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [refresh])

  // Rien de configuré : pas de bandeau. L'accès aux réglages passe par l'en-tête.
  if (!printer?.configured) return null

  const enCours = printer.printing
  const label = printerStateLabel(printer.state)
  const progress = enCours && printer.progress !== null ? Math.round(printer.progress) : null

  /*
   * La couleur suit celle qu'OctoEverywhere donne à l'état : rouge quand la
   * liaison est perdue, jaune pour ce qui demande de l'attention. Impression en
   * cours : la couleur d'accent, comme le reste de ce qui bouge dans le tableau.
   */
  const teinte = enCours
    ? 'font-medium text-accent-deep'
    : printer.statusColor === 'r'
      ? 'text-rose-700 dark:text-rose-400'
      : printer.statusColor === 'y'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-muted'
  const vieux = printer.seenAt ? Date.now() - new Date(printer.seenAt).getTime() > PÉRIMÉ_MS : true

  const détails = [
    progress !== null ? `${progress} %` : null,
    printer.currentLayer && printer.totalLayers
      ? `couche ${printer.currentLayer}/${printer.totalLayers}`
      : null,
    // Le temps restant vient du firmware : on l'arrondit à la minute, il n'est
    // pas plus précis que ça.
    enCours && printer.timeLeftSec
      ? `${formatPrintTime(Math.round(printer.timeLeftSec / 60))} restantes`
      : null,
    enCours && printer.nozzleTemp ? `buse ${Math.round(printer.nozzleTemp)}°` : null,
    enCours && printer.bedTemp ? `plateau ${Math.round(printer.bedTemp)}°` : null,
  ].filter(Boolean)

  return (
    <section
      data-testid="printer-strip"
      aria-label={`État de ${printer.name}`}
      className="rounded-xl border border-line bg-surface px-3 py-2 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <IconPrinter size={15} className={enCours ? 'text-accent' : 'text-muted'} aria-hidden />
        <span className="font-medium">{printer.name}</span>
        <span className={teinte}>{label}</span>

        {printer.fileName && (
          <span className="min-w-0 truncate text-muted" title={printer.fileName}>
            {printer.fileName}
          </span>
        )}
        {détails.length > 0 && <span className="text-muted">{détails.join(' · ')}</span>}

        {/* L'âge de l'information n'est montré que quand il compte. */}
        {vieux && printer.seenAt && (
          <span className="text-muted" title="Dernier état reçu">
            ({timeAgo(printer.seenAt)})
          </span>
        )}
        {printer.lastError && (
          <span className="truncate text-amber-700 dark:text-amber-400" title={printer.lastError}>
            injoignable
          </span>
        )}

        <a
          href="/reglages"
          aria-label="Réglages de l’imprimante"
          className="ml-auto inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded text-muted transition-colors hover:text-accent sm:min-h-6 sm:min-w-6"
        >
          <IconSettings size={14} aria-hidden />
        </a>
      </div>

      {progress !== null && (
        <div
          className="mt-1.5 h-1 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
    </section>
  )
}
