'use client'

import { useEffect, useRef, useState } from 'react'
import { STATUSES, STATUS_LABELS, type Status } from '@/db/schema'
import type { BoardCard } from '@/lib/board'
import { formatDate, formatDue } from '@/lib/dates'
import { CommentThread } from './CommentThread'
import { IconClose, IconDelete, IconExternalLink } from './icons'
import { Thumbnail } from './Thumbnail'

type Props = {
  card: BoardCard
  identity: string
  onClose: () => void
  onSave: (id: string, changes: Record<string, unknown>) => Promise<void>
  onMove: (card: BoardCard, status: Status) => void
  onDelete: (card: BoardCard) => Promise<void>
  onCommentCount: (id: string, count: number) => void
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
  onClose,
  onSave,
  onMove,
  onDelete,
  onCommentCount,
}: Props) {
  const [title, setTitle] = useState(card.title)
  const [quantity, setQuantity] = useState(card.quantity)
  const [color, setColor] = useState(card.color ?? '')
  const [notes, setNotes] = useState(card.notes ?? '')
  const [dueDate, setDueDate] = useState(card.dueDate ?? '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const panelRef = useRef<HTMLElement>(null)

  // Le panneau reste monté quand on passe d'une carte à l'autre : il faut donc
  // recharger les champs à chaque changement de carte.
  useEffect(() => {
    setTitle(card.title)
    setQuantity(card.quantity)
    setColor(card.color ?? '')
    setNotes(card.notes ?? '')
    setDueDate(card.dueDate ?? '')
    setConfirmingDelete(false)
    setSaved(false)
  }, [card.id, card.title, card.quantity, card.color, card.notes, card.dueDate])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
        dueDate: dueDate || null,
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

          <label htmlFor="m-due" className="mt-3 mb-1 block text-xs font-medium text-muted">
            Échéance souhaitée
          </label>
          <input
            id="m-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {dueDate && (
            <p className="mt-1 text-xs text-muted">
              {formatDate(dueDate)} · {formatDue(dueDate)}
            </p>
          )}

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
                      ? 'border-accent bg-accent/10 font-medium text-accent'
                      : 'border-line text-muted hover:border-accent',
                  ].join(' ')}
                >
                  {STATUS_LABELS[status]}
                </button>
              ))}
            </div>
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

        <CommentThread
          cardId={card.id}
          author={identity}
          onCountChange={(count) => onCommentCount(card.id, count)}
        />
      </aside>
    </>
  )
}
