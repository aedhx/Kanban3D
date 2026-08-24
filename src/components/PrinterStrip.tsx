'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PrinterView } from '@/lib/printerView'
import { timeAgo } from '@/lib/dates'
import { formatPrintTime } from '@/lib/printInfo'
import { printerStateLabel } from '@/lib/printer'
import { IconPrinter, IconSettings } from './icons'

/** Le serveur ne rappelle l'imprimante qu'au bout de 20 s : inutile d'aller plus vite. */
const REFRESH_MS = 20_000

/** Au-delà, l'information n'est plus fraîche et il faut le dire. */
const PÉRIMÉ_MS = 90_000

/** La webcam bouge plus vite que l'état : on la redemande plus souvent. */
const SNAPSHOT_MS = 10_000

export function PrinterStrip({
  initial,
  onPrinting,
}: {
  initial: PrinterView | null
  /** Remonte l'impression en cours, pour que la carte concernée l'affiche aussi. */
  onPrinting: (
    job: { fileName: string | null; progress: number; timeLeftSec: number | null } | null,
  ) => void
}) {
  const [printer, setPrinter] = useState(initial)
  /*
   * L'horodatage de la vignette. Il sert de numéro de version dans l'URL : sans
   * lui, le navigateur garderait la première image pendant toute l'impression.
   * `null` tant qu'on ne sait pas s'il y a une caméra — la vignette n'apparaît
   * qu'une fois une image réellement reçue.
   */
  const [snapshot, setSnapshot] = useState<number | null>(null)
  const [agrandi, setAgrandi] = useState(false)
  const dialogue = useRef<HTMLDialogElement>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/printer', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { printer: PrinterView }
      setPrinter(data.printer)
      const p = data.printer
      onPrinting(
        p.printing && p.progress !== null
          ? { fileName: p.fileName, progress: p.progress, timeLeftSec: p.timeLeftSec }
          : null,
      )
    } catch {
      // Hors ligne : on garde le dernier état affiché, son horodatage le dira.
    }
  }, [onPrinting])

  /*
   * La vignette se rafraîchit avec le reste. On ne la demande que pendant une
   * impression : au repos elle montrerait un plateau vide, et interroger le NAS
   * pour ça n'a pas de sens.
   */
  useEffect(() => {
    if (!printer?.printing) {
      setSnapshot(null)
      return
    }
    setSnapshot(Date.now())
    const timer = setInterval(() => setSnapshot(Date.now()), SNAPSHOT_MS)
    return () => clearInterval(timer)
  }, [printer?.printing])

  useEffect(() => {
    const dlg = dialogue.current
    if (!dlg) return
    if (agrandi && !dlg.open) dlg.showModal()
    if (!agrandi && dlg.open) dlg.close()
  }, [agrandi])

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

  /*
   * Gadget, la détection d'échec par IA d'OctoEverywhere. On ne l'affiche que
   * quand il s'inquiète : au vert, il n'apprend rien, et une pastille permanente
   * cesserait vite d'être lue.
   */
  const gadget =
    printer.gadgetColor === 'y' || printer.gadgetColor === 'r'
      ? {
          texte: printer.gadgetStatus ?? 'un problème possible',
          rouge: printer.gadgetColor === 'r',
        }
      : null

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
      <div className="flex items-start gap-2">
        {/*
          La webcam, si OctoEverywhere en sert une. Elle disparaît sans bruit
          quand l'image manque — machine déconnectée, pas de caméra — et le
          bandeau redevient exactement ce qu'il était.
        */}
        {snapshot !== null && (
          <button
            type="button"
            onClick={() => setAgrandi(true)}
            data-testid="webcam"
            aria-label="Agrandir l’aperçu de la webcam"
            className="hidden shrink-0 overflow-hidden rounded border border-line sm:block"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/printer/snapshot?t=${snapshot}`}
              alt=""
              width={96}
              height={72}
              className="h-[54px] w-[72px] object-cover"
              onError={() => setSnapshot(null)}
            />
          </button>
        )}

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
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
          {gadget && (
            <span
              data-testid="gadget"
              title="Gadget, la surveillance d’OctoEverywhere"
              className={[
                'rounded px-1.5 py-0.5 font-medium',
                gadget.rouge
                  ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                  : 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
              ].join(' ')}
            >
              Gadget : {gadget.texte}
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
      </div>

      {/* L'aperçu en grand, à la demande. */}
      <dialog
        ref={dialogue}
        onClose={() => setAgrandi(false)}
        onClick={() => setAgrandi(false)}
        className="m-auto max-w-[90vw] rounded-xl border border-line bg-surface p-2 backdrop:bg-black/60"
      >
        {agrandi && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`/api/printer/snapshot?t=${snapshot}`}
            alt={`Webcam de ${printer.name}`}
            className="max-h-[80vh] w-auto rounded-lg"
          />
        )}
      </dialog>

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
