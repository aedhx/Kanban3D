'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PrinterView } from '@/lib/printerView'
import { timeAgo } from '@/lib/dates'
import { formatPrintTime } from '@/lib/printInfo'
import { printerStateLabel } from '@/lib/printer'
import { IconExternalLink, IconNoCamera, IconPrinter, IconSettings } from './icons'

/** Le serveur ne rappelle l'imprimante qu'au bout de 20 s : inutile d'aller plus vite. */
const REFRESH_MS = 20_000

/** Au-delà, l'information n'est plus fraîche et il faut le dire. */
const PÉRIMÉ_MS = 90_000

/** La webcam bouge plus vite que l'état : on la redemande plus souvent. */
const SNAPSHOT_MS = 10_000

/**
 * Hors impression, la caméra reste allumée mais rien ne bouge vite.
 *
 * Elle était auparavant masquée dès que la machine n'imprimait pas. C'est
 * précisément le moment où l'on veut regarder : en chauffe, en pause, ou pour
 * vérifier que le plateau est libre avant de lancer quelque chose.
 */
const REPOS_MS = 60_000

/** Après un échec, on n'insiste pas : une machine sans caméra répond toujours non. */
const RETRY_MS = 120_000

/**
 * Le rythme de l'aperçu fixe quand il remplace la vidéo, faute de mieux.
 *
 * Une image toutes les deux secondes n'est pas du direct, mais on y voit la tête
 * bouger — ce qui est tout ce qu'on demande à cette vue.
 */
const REPLI_MS = 2000

/**
 * On relance la vidéo un peu avant que le relais ne raccroche (25 s).
 *
 * Une balise `img` qui affiche du MJPEG ne prévient de rien quand le flux se
 * termine : elle garde simplement la dernière image, indéfiniment. Plutôt que de
 * guetter un événement qui n'existe pas, on la remonte à intervalle fixe.
 */
const CYCLE_MS = 23_000

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
  /*
   * La vue agrandie montre-t-elle la vraie vidéo, ou l'aperçu fixe rafraîchi ?
   * On commence toujours par le direct, et on ne retombe sur l'autre qu'après un
   * échec constaté : le relais d'un flux continu dépend de l'hébergeur, et ça se
   * découvre à l'usage plutôt qu'à la construction.
   */
  const [direct, setDirect] = useState(true)
  /** Numéro de reprise de la vidéo : le changer remonte la balise. */
  const [cycle, setCycle] = useState(0)
  /** La dernière image demandée a-t-elle échoué ? Espace les suivantes. */
  const [échec, setÉchec] = useState(false)
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
   * Le rythme de l'aperçu fixe, du plus soutenu au plus économe. Un échec ne
   * masque la vignette que jusqu'au prochain essai : une caméra qui revient — le
   * NAS qu'on rallume — se remet à s'afficher toute seule.
   */
  useEffect(() => {
    if (!printer?.configured) return
    const rythme = échec
      ? RETRY_MS
      : agrandi && !direct
        ? REPLI_MS
        : printer.printing
          ? SNAPSHOT_MS
          : REPOS_MS
    setSnapshot(Date.now())
    const timer = setInterval(() => setSnapshot(Date.now()), rythme)
    return () => clearInterval(timer)
  }, [printer?.configured, printer?.printing, agrandi, direct, échec])

  /*
   * La reprise de la vidéo. Elle ne tourne que pendant que la vue est ouverte :
   * fermer la fenêtre démonte la balise, ce qui coupe la connexion au relais, qui
   * raccroche à son tour chez OctoEverywhere. Rien ne reste ouvert dans le dos.
   */
  useEffect(() => {
    if (!agrandi || !direct) return
    const timer = setInterval(() => setCycle((n) => n + 1), CYCLE_MS)
    return () => clearInterval(timer)
  }, [agrandi, direct])

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
   * Pas d'image, alors qu'il devrait y en avoir une. `hasSharePage` est le
   * meilleur indice dont on dispose : c'est un lien de partage, donc une caméra
   * est plausible. On n'affiche cette case que là — promettre une image à qui
   * n'en a pas serait pire que le silence.
   */
  const caméraMuette = printer.hasSharePage && snapshot === null

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
          La webcam. Quand l'image manque, la vignette ne disparaît pas en
          silence : elle laisse une case barrée, cliquable, qui mène à
          l'explication. Une image qui s'évanouit sans rien dire fait douter de
          l'application ; une case vide dit qu'on sait, et pourquoi.

          Elle n'apparaît que si une caméra est plausible, c'est-à-dire pour un
          lien de partage — une « Shared Connection » n'expose pas d'aperçu, et
          promettre une image qui n'existe pas serait pire que de ne rien dire.
        */}
        {caméraMuette && (
          <button
            type="button"
            onClick={() => {
              setDirect(true)
              setCycle((n) => n + 1)
              setAgrandi(true)
            }}
            data-testid="webcam-vide"
            aria-label="Pas d’image de la webcam — voir pourquoi"
            className="flex h-[44px] w-[59px] shrink-0 items-center justify-center rounded border border-dashed border-line text-muted transition-colors hover:border-accent hover:text-accent sm:h-[54px] sm:w-[72px]"
          >
            <IconNoCamera size={18} aria-hidden />
          </button>
        )}

        {snapshot !== null && (
          <button
            type="button"
            onClick={() => {
              // On retente le direct à chaque ouverture : un échec passé ne doit
              // pas condamner la vidéo pour le reste de la session.
              setDirect(true)
              setCycle((n) => n + 1)
              setAgrandi(true)
            }}
            data-testid="webcam"
            aria-label="Voir la webcam en direct"
            /*
              Visible sur téléphone aussi. Elle y était masquée du temps où elle
              ne montrait rien — l'aperçu d'OctoEverywhere répondait 404 — et
              c'était donc de la place perdue. Maintenant qu'il y a une image, le
              téléphone est justement l'écran depuis lequel on veut jeter un œil
              au plateau. Un peu plus petite en portrait, où la largeur compte.
            */
            className="block shrink-0 overflow-hidden rounded border border-line"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/printer/snapshot?t=${snapshot}`}
              alt=""
              width={96}
              height={72}
              className="h-[44px] w-[59px] object-cover sm:h-[54px] sm:w-[72px]"
              onLoad={() => setÉchec(false)}
              onError={() => {
                setSnapshot(null)
                setÉchec(true)
              }}
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
        </div>

        {/*
          Les deux commandes, calées en haut à droite plutôt qu'au bout du texte.
          Dans le flux, elles se repliaient sur une ligne à elles dès que le texte
          en occupait plusieurs — c'est-à-dire sur un téléphone en portrait — et
          creusaient un vide au milieu du bandeau.
        */}
        <div className="flex shrink-0 items-center gap-0.5">
          {/*
            Chez OctoEverywhere : leur lecteur, leur bande passante, et tout ce
            que le nôtre ne montre pas — les commandes, l'historique. Le lien
            n'est pas ici : la redirection va le chercher au moment du clic.
          */}
          {printer.hasSharePage && (
            <a
              href="/api/printer/live"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="voir-octoeverywhere"
              aria-label="Voir l’imprimante chez OctoEverywhere"
              /*
                `min-w-10` sur mobile : le libellé y est masqué, et il ne reste
                qu'une icône de 14 px — mesurée à 22 px de large, sous le seuil
                que le reste du tableau respecte.
              */
              className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1 rounded text-muted transition-colors hover:text-accent sm:min-h-6 sm:min-w-0 sm:px-1"
            >
              <IconExternalLink size={14} aria-hidden />
              <span className="hidden sm:inline">OctoEverywhere</span>
            </a>
          )}

          <a
            href="/reglages"
            aria-label="Réglages de l’imprimante"
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded text-muted transition-colors hover:text-accent sm:min-h-6 sm:min-w-6"
          >
            <IconSettings size={14} aria-hidden />
          </a>
        </div>
      </div>

      {/* La webcam en grand, et en direct quand le flux passe. */}
      <dialog
        ref={dialogue}
        onClose={() => setAgrandi(false)}
        onClick={() => setAgrandi(false)}
        className="m-auto max-w-[90vw] rounded-xl border border-line bg-surface p-2 backdrop:bg-black/60"
      >
        {agrandi && (
          <div onClick={(e) => e.stopPropagation()}>
            {snapshot === null ? (
              /*
                Rien à montrer. Le cas arrive plus souvent qu'on ne croit — NAS
                éteint, imprimante débranchée du compagnon, partage sans caméra —
                et il se manifestait jusqu'ici par une fenêtre vide, ce qui laisse
                penser que l'application est cassée. On dit donc ce qu'on sait, et
                on propose l'endroit où aller voir.
              */
              <div
                data-testid="webcam-aucune-image"
                className="flex min-h-48 w-[min(80vw,32rem)] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line px-6 text-center"
              >
                <IconNoCamera size={28} className="text-muted" aria-hidden />
                <p className="text-sm font-medium">Pas d’image en ce moment</p>
                <p className="text-xs text-muted">
                  La caméra ne répond pas. Le NAS est peut-être éteint, l’imprimante déconnectée du
                  compagnon OctoEverywhere, ou le partage ne contient pas de caméra. Le reste du
                  tableau continue de fonctionner.
                </p>
              </div>
            ) : (
              <div className="relative">
                {/*
                  L'aperçu fixe, dessous. Il sert deux fois : il donne sa taille au
                  cadre, et il garde la dernière image sous les yeux pendant les
                  deux secondes où la vidéo se relance — sans lui, la reprise
                  clignoterait sur du vide toutes les vingt-trois secondes.
                */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/printer/snapshot?t=${snapshot}`}
                  alt={`Webcam de ${printer.name}`}
                  className="max-h-[80vh] w-auto rounded-lg"
                  onError={() => {
                    setSnapshot(null)
                    setÉchec(true)
                  }}
                />
                {direct && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    key={cycle}
                    src={`/api/printer/stream?t=${cycle}`}
                    alt=""
                    data-testid="webcam-direct"
                    className="absolute inset-0 h-full w-full rounded-lg object-cover"
                    onError={() => setDirect(false)}
                  />
                )}
              </div>
            )}

            <div className="mt-2 flex items-center gap-2 px-1 text-xs">
              <span
                className={
                  snapshot === null
                    ? 'text-muted'
                    : direct
                      ? 'font-medium text-accent-deep'
                      : 'text-muted'
                }
              >
                {snapshot === null
                  ? 'Nouvel essai dans deux minutes'
                  : direct
                    ? 'En direct'
                    : 'Aperçu, une image toutes les 2 s'}
              </span>
              {printer.hasSharePage && (
                <a
                  href="/api/printer/live"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex min-h-10 items-center gap-1 rounded text-muted transition-colors hover:text-accent sm:min-h-6"
                >
                  <IconExternalLink size={14} aria-hidden />
                  Voir chez OctoEverywhere
                </a>
              )}
              <button
                type="button"
                onClick={() => setAgrandi(false)}
                className="inline-flex min-h-10 items-center rounded border border-line px-2 text-muted transition-colors hover:border-accent hover:text-accent sm:min-h-6"
              >
                Fermer
              </button>
            </div>
          </div>
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
