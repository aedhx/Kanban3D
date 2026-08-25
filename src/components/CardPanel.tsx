'use client'

import { useEffect, useRef, useState } from 'react'
import {
  PRIORITIES,
  PRIORITY_LABELS,
  STATUSES,
  STATUS_LABELS,
  type Priority,
  type Status,
} from '@/db/schema'
import type { BoardCard } from '@/lib/board'
import { formatFilamentCost, printCostParts } from '@/lib/printInfo'
import { CommentThread } from './CommentThread'
import { PhotoField } from './PhotoField'
import { IconClose, IconDeclined, IconDelete, IconExternalLink } from './icons'
import { Thumbnail } from './Thumbnail'

/**
 * Champ des données d'impression : plus étroit que les autres, mais aussi haut
 * — 40 px de cible tactile, comme le reste du panneau.
 */
const FIELD =
  'w-full rounded-lg border border-line bg-canvas px-2 py-2 text-sm outline-none focus:border-accent'

/** Valeur d'un `<input type="number">` : vide veut dire « pas renseigné ». */
function numberField(value: number | null): string {
  return value === null ? '' : String(value)
}

/** Lecture inverse : la chaîne du champ redevient un nombre, ou `null`. */
function numberValue(value: string): number | null {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

type Props = {
  card: BoardCard
  identity: string
  filamentPricePerKg: number | null
  onClose: () => void
  onSave: (id: string, changes: Record<string, unknown>) => Promise<void>
  onMove: (card: BoardCard, status: Status) => void
  onDelete: (card: BoardCard) => Promise<void>
  onCommentCount: (id: string, count: number) => void
  onPhotoChange: (id: string, photoAt: string | null) => void
}

/**
 * Détail d'une carte, en panneau latéral plutôt qu'en fenêtre modale : sur
 * grand écran il se pose à côté du tableau, qui reste visible et continue de se
 * rafraîchir pendant qu'on écrit. Sous `lg`, faute de place, il redevient une
 * feuille qui monte du bas.
 *
 * Volontairement non modal sur grand écran : pas de piège de focus, pas de
 * voile bloquant — on doit pouvoir déplacer une carte du tableau panneau ouvert.
 */
export function CardPanel({
  card,
  identity,
  filamentPricePerKg,
  onClose,
  onSave,
  onMove,
  onDelete,
  onCommentCount,
  onPhotoChange,
}: Props) {
  const [title, setTitle] = useState(card.title)
  const [quantity, setQuantity] = useState(card.quantity)
  const [color, setColor] = useState(card.color ?? '')
  const [notes, setNotes] = useState(card.notes ?? '')
  const [priority, setPriority] = useState<Priority>(card.priority)
  const [multiColor, setMultiColor] = useState(card.multiColor)
  const [colorCount, setColorCount] = useState(numberField(card.colorCount))
  // Champs d'impression en chaînes, et non en nombres : c'est le seul moyen de
  // laisser un champ vide (« pas renseigné ») sans le confondre avec zéro.
  const [printMinutes, setPrintMinutes] = useState(numberField(card.printMinutes))
  const [filamentGrams, setFilamentGrams] = useState(numberField(card.filamentGrams))
  const [material, setMaterial] = useState(card.material ?? '')
  const [pieceCount, setPieceCount] = useState(numberField(card.pieceCount))
  const [piecesDone, setPiecesDone] = useState(numberField(card.piecesDone))
  const [fileCount, setFileCount] = useState(numberField(card.fileCount))
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  /*
   * Le refus. `null` quand on ne refuse pas, une chaîne quand on est en train
   * d'écrire la raison — un refus sans motif ne servirait à personne, donc le
   * champ précède le bouton plutôt que l'inverse.
   */
  const [declining, setDeclining] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const panelRef = useRef<HTMLElement>(null)

  /*
   * Le panneau reste monté quand on passe d'une carte à l'autre : il faut donc
   * recharger les champs à chaque changement de carte.
   *
   * Uniquement sur `card.id`, et surtout pas sur la valeur des champs : le
   * tableau se rafraîchit toutes les 10 s, et réagir à chaque valeur ferait
   * écraser une saisie en cours dès qu'une écriture revient du serveur —
   * l'enregistrement effaçait ainsi son propre accusé « Enregistré ».
   */
  useEffect(() => {
    setTitle(card.title)
    setQuantity(card.quantity)
    setColor(card.color ?? '')
    setNotes(card.notes ?? '')
    setPriority(card.priority)
    setMultiColor(card.multiColor)
    setColorCount(numberField(card.colorCount))
    setPrintMinutes(numberField(card.printMinutes))
    setFilamentGrams(numberField(card.filamentGrams))
    setMaterial(card.material ?? '')
    setPieceCount(numberField(card.pieceCount))
    setFileCount(numberField(card.fileCount))
    setPiecesDone(numberField(card.piecesDone))
    setConfirmingDelete(false)
    setDeclining(null)
    setSaved(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- volontaire, cf. ci-dessus
  }, [card.id])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Ce que la carte affichera, recalculé pendant la saisie : on voit « 214 min »
  // devenir « 3 h 34 » avant même d'enregistrer.
  const summary = [
    ...printCostParts({
      printMinutes: numberValue(printMinutes),
      filamentGrams: numberValue(filamentGrams),
      material: material.trim() || null,
      fileCount: null,
      pieceCount: null,
    }),
    formatFilamentCost(numberValue(filamentGrams), filamentPricePerKg),
  ]
    .filter(Boolean)
    .join(' · ')

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    const trimmed = title.trim()
    if (!trimmed) return

    setBusy(true)
    try {
      await onSave(card.id, {
        title: trimmed,
        quantity,
        color: color.trim() || null,
        notes: notes.trim() || null,
        priority,
        multiColor,
        colorCount: multiColor ? colorCount || null : null,
        printMinutes: printMinutes || null,
        filamentGrams: filamentGrams || null,
        material: material.trim() || null,
        pieceCount: pieceCount || null,
        piecesDone: piecesDone || 0,
        fileCount: fileCount || null,
      })
      // On ne referme pas : le panneau doit pouvoir rester ouvert à côté du
      // tableau. Un accusé discret suffit.
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* Voile tactile uniquement : sur grand écran le panneau est dans le flux. */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        role="presentation"
      />

      <aside
        ref={panelRef}
        aria-label={`Détail de « ${card.title} »`}
        data-testid="card-panel"
        className="fixed inset-x-0 bottom-0 z-40 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface p-5 shadow-xl lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:max-h-none lg:w-[380px] lg:shrink-0 lg:rounded-none lg:border-t-0 lg:border-l lg:shadow-none xl:w-[420px]"
      >
        <div className="flex items-start gap-3">
          <Thumbnail
            src={card.imageUrl}
            label={card.title}
            size={192}
            className="h-16 w-16 shrink-0 rounded-lg border border-line object-cover text-xl"
          />
          <div className="min-w-0 flex-1 text-xs text-muted">
            <p>
              Demandé par <span className="font-medium text-ink">{card.requestedBy}</span>
            </p>
            {card.author && <p className="mt-0.5 truncate">Modèle de {card.author}</p>}
            {card.url && (
              <a
                href={card.url}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-1 inline-flex items-center gap-1 truncate text-accent underline underline-offset-2"
              >
                Ouvrir sur {card.source ?? 'la plateforme'}
                <IconExternalLink size={12} aria-hidden />
              </a>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le panneau"
            className="-mt-1 shrink-0 rounded p-1 text-muted hover:text-ink"
          >
            <IconClose size={18} aria-hidden />
          </button>
        </div>

        <form onSubmit={save} className="mt-4">
          <label htmlFor="m-title" className="mb-1 block text-xs font-medium text-muted">
            Titre
          </label>
          <input
            id="m-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent"
          />

          <div className="mt-3 flex gap-3">
            <div className="w-24">
              <label htmlFor="m-qty" className="mb-1 block text-xs font-medium text-muted">
                Quantité
              </label>
              <input
                id="m-qty"
                type="number"
                min={1}
                max={999}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="m-color" className="mb-1 block text-xs font-medium text-muted">
                Couleur
              </label>
              <input
                id="m-color"
                list="couleurs-courantes"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="Peu importe"
                className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
          </div>

          {/*
            Trois boutons plutôt qu'une liste déroulante : pour trois valeurs,
            c'est un geste au lieu de deux, et l'état se lit sans rien ouvrir.
            Enregistré au clic — attendre « Enregistrer » pour changer un rang
            n'aurait aucun sens quand c'est justement ce qu'on vient régler.
          */}
          <fieldset className="mt-3">
            <legend className="mb-1.5 text-xs font-medium text-muted">Priorité</legend>
            <div className="flex gap-1.5">
              {[...PRIORITIES].reverse().map((niveau) => (
                <button
                  key={niveau}
                  type="button"
                  data-testid={`priority-${niveau}`}
                  onClick={() => {
                    setPriority(niveau)
                    void onSave(card.id, { priority: niveau })
                  }}
                  aria-pressed={priority === niveau}
                  className={[
                    'flex-1 rounded-lg border px-2 py-2 text-xs transition-colors',
                    priority === niveau
                      ? 'border-accent bg-accent/10 font-medium text-accent-deep'
                      : 'border-line text-muted hover:border-accent',
                  ].join(' ')}
                >
                  {PRIORITY_LABELS[niveau]}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Multi-couleur : ce qui décide si le Canvas doit être monté. */}
          <div className="mt-3 flex items-center gap-3">
            <label className="inline-flex flex-1 items-center gap-2 text-sm">
              <input
                id="m-multicolor"
                type="checkbox"
                checked={multiColor}
                onChange={(e) => setMultiColor(e.target.checked)}
                data-keep-size
                className="h-4 w-4 accent-accent"
              />
              Multi-couleur <span className="text-xs text-muted">(Canvas)</span>
            </label>
            {multiColor && (
              <div className="w-28">
                <label htmlFor="m-color-count" className="sr-only">
                  Nombre de couleurs
                </label>
                <input
                  id="m-color-count"
                  type="number"
                  min={2}
                  max={16}
                  inputMode="numeric"
                  value={colorCount}
                  onChange={(e) => setColorCount(e.target.value)}
                  placeholder="couleurs"
                  className={FIELD}
                />
              </div>
            )}
          </div>

          <label htmlFor="m-notes" className="mt-3 mb-1 block text-xs font-medium text-muted">
            Remarque
          </label>
          <textarea
            id="m-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full resize-y rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent"
          />

          {/*
            Coût d'impression. Rempli tout seul quand la plateforme le publie
            (Printables, MakerWorld), à corriger à la main après un passage au
            trancheur — c'est Alexandre qui a le dernier mot, il a l'imprimante.
          */}
          <fieldset className="mt-4 rounded-lg border border-line p-3">
            <legend className="px-1 text-xs font-medium text-muted">Impression</legend>

            <div className="flex gap-2">
              <div className="w-24">
                <label
                  htmlFor="m-print-minutes"
                  className="mb-1 block text-[11px] font-medium text-muted"
                >
                  Durée (min)
                </label>
                <input
                  id="m-print-minutes"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={printMinutes}
                  onChange={(e) => setPrintMinutes(e.target.value)}
                  placeholder="—"
                  className={FIELD}
                />
              </div>
              <div className="w-24">
                <label
                  htmlFor="m-filament-grams"
                  className="mb-1 block text-[11px] font-medium text-muted"
                >
                  Filament (g)
                </label>
                <input
                  id="m-filament-grams"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={filamentGrams}
                  onChange={(e) => setFilamentGrams(e.target.value)}
                  placeholder="—"
                  className={FIELD}
                />
              </div>
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="m-material"
                  className="mb-1 block text-[11px] font-medium text-muted"
                >
                  Matière
                </label>
                <input
                  id="m-material"
                  list="matieres-courantes"
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  placeholder="PLA…"
                  className={FIELD}
                />
              </div>
            </div>

            <div className="mt-2 flex gap-2">
              <div className="w-24">
                <label
                  htmlFor="m-piece-count"
                  className="mb-1 block text-[11px] font-medium text-muted"
                >
                  Pièces
                </label>
                <input
                  id="m-piece-count"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={pieceCount}
                  onChange={(e) => setPieceCount(e.target.value)}
                  placeholder="—"
                  className={FIELD}
                />
              </div>
              {/*
                Le compte des pièces sorties n'a de sens qu'à partir de deux
                morceaux — et il n'apparaît qu'alors, pour ne pas ajouter un champ
                vide à toutes les autres cartes. L'imprimante le tient à jour ; ce
                champ est là pour la corriger.
              */}
              {Number(pieceCount) > 1 && (
                <div className="w-24">
                  <label
                    htmlFor="m-pieces-done"
                    className="mb-1 block text-[11px] font-medium text-muted"
                  >
                    Déjà faites
                  </label>
                  <input
                    id="m-pieces-done"
                    type="number"
                    min={0}
                    max={Number(pieceCount)}
                    inputMode="numeric"
                    value={piecesDone}
                    onChange={(e) => setPiecesDone(e.target.value)}
                    placeholder="0"
                    className={FIELD}
                  />
                </div>
              )}

              <div className="w-24">
                <label
                  htmlFor="m-file-count"
                  className="mb-1 block text-[11px] font-medium text-muted"
                >
                  Fichiers
                </label>
                <input
                  id="m-file-count"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={fileCount}
                  onChange={(e) => setFileCount(e.target.value)}
                  placeholder="—"
                  className={FIELD}
                />
              </div>
            </div>

            {summary && (
              <p className="mt-2 text-xs text-muted" data-testid="print-summary">
                {summary}
              </p>
            )}
          </fieldset>

          <fieldset className="mt-4">
            <legend className="mb-1.5 text-xs font-medium text-muted">Colonne</legend>
            <div className="flex gap-1.5">
              {STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => onMove(card, status)}
                  aria-pressed={card.status === status}
                  className={[
                    'flex-1 rounded-lg border px-2 py-2 text-xs transition-colors',
                    card.status === status
                      ? 'border-accent bg-accent/10 font-medium text-accent-deep'
                      : 'border-line text-muted hover:border-accent',
                  ].join(' ')}
                >
                  {STATUS_LABELS[status]}
                </button>
              ))}
            </div>
          </fieldset>

          {/*
            Refuser, c'est répondre — pas modifier. D'où un bloc à part, hors du
            formulaire d'édition : la raison part seule, tout de suite, et une
            notification l'annonce.
          */}
          <fieldset className="mt-4">
            <legend className="mb-1.5 text-xs font-medium text-muted">
              {card.declinedReason ? 'Refusée' : 'Pas possible ?'}
            </legend>

            {card.declinedReason ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2">
                <p className="text-sm text-amber-800 dark:text-amber-300">{card.declinedReason}</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      await onSave(card.id, { declinedReason: null })
                    } finally {
                      setBusy(false)
                    }
                  }}
                  className="mt-2 min-h-10 text-xs text-muted underline-offset-2 hover:text-accent hover:underline sm:min-h-0"
                >
                  Annuler le refus
                </button>
              </div>
            ) : declining === null ? (
              <button
                type="button"
                data-testid="decline"
                onClick={() => setDeclining('')}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-muted transition-colors hover:border-amber-500 hover:text-amber-700"
              >
                <IconDeclined size={15} aria-hidden />
                Refuser cette demande
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  id="m-decline"
                  autoFocus
                  value={declining}
                  onChange={(e) => setDeclining(e.target.value)}
                  placeholder="Pourquoi ? « plus de filament noir »…"
                  maxLength={200}
                  className={FIELD}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    data-testid="decline-confirm"
                    disabled={busy || !declining.trim()}
                    onClick={async () => {
                      setBusy(true)
                      try {
                        await onSave(card.id, { declinedReason: declining.trim() })
                        setDeclining(null)
                      } finally {
                        setBusy(false)
                      }
                    }}
                    className="rounded-lg border border-amber-500 px-3 py-2 text-sm font-medium text-amber-700 disabled:opacity-40 dark:text-amber-300"
                  >
                    Refuser
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeclining(null)}
                    className="rounded-lg px-3 py-2 text-sm text-muted hover:text-accent"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </fieldset>

          <div className="mt-5 flex items-center gap-2">
            <button
              type="submit"
              disabled={busy || !title.trim()}
              className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-40"
            >
              {busy ? 'Enregistrement…' : saved ? 'Enregistré' : 'Enregistrer'}
            </button>
            {confirmingDelete ? (
              <button
                type="button"
                onClick={async () => {
                  setBusy(true)
                  await onDelete(card)
                  onClose()
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white"
              >
                Confirmer
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                aria-label="Supprimer la demande"
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-muted hover:border-red-500 hover:text-red-500"
              >
                <IconDelete size={15} aria-hidden />
                Supprimer
              </button>
            )}
          </div>
        </form>

        {/* Suggestions des deux champs libres ci-dessus : on peut toujours taper
            autre chose, la liste ne fait que raccourcir la saisie. */}
        <datalist id="couleurs-courantes">
          {['Noir', 'Blanc', 'Gris', 'Rouge', 'Orange', 'Jaune', 'Vert', 'Bleu', 'Violet'].map(
            (name) => (
              <option key={name} value={name} />
            ),
          )}
        </datalist>
        <datalist id="matieres-courantes">
          {['PLA', 'PLA-CF', 'PETG', 'ABS', 'ASA', 'TPU', 'Résine'].map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <PhotoField
          cardId={card.id}
          photoAt={card.photoAt}
          onChange={(photoAt) => onPhotoChange(card.id, photoAt)}
        />

        <CommentThread
          cardId={card.id}
          author={identity}
          onCountChange={(count) => onCommentCount(card.id, count)}
        />
      </aside>
    </>
  )
}
