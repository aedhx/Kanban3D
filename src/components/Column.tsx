'use client'

import { useMemo, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { STATUS_LABELS, type Status } from '@/db/schema'
import type { BoardCard } from '@/lib/board'
import { ARCHIVE_AFTER_DAYS, isArchived } from '@/lib/dates'
import { CardTile } from './CardTile'
import { Thumbnail } from './Thumbnail'

type Props = {
  status: Status
  cards: BoardCard[]
  selectedId: string | null
  onOpen: (card: BoardCard) => void
  onMove: (card: BoardCard, status: Status) => void
}

export function Column({ status, cards, selectedId, onOpen, onMove }: Props) {
  // La colonne est elle-même une cible de dépôt : sans cela, impossible de
  // déposer une carte dans une colonne vide.
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const [showArchived, setShowArchived] = useState(false)

  // « Fait » s'accumule indéfiniment. Au-delà d'un mois, les cartes passent
  // derrière un lien : l'historique reste consultable sans encombrer la vue.
  const { visible, archived, pending } = useMemo(() => {
    const visible: BoardCard[] = []
    const archived: BoardCard[] = []
    const pending: BoardCard[] = []
    for (const card of cards) {
      if (card.pending) pending.push(card)
      else if (isArchived(card.doneAt)) archived.push(card)
      else visible.push(card)
    }
    return { visible, archived, pending }
  }, [cards])

  const shown = showArchived ? [...archived, ...visible] : visible

  return (
    <section
      className="flex min-w-[280px] flex-1 snap-start flex-col sm:min-w-0"
      aria-label={STATUS_LABELS[status]}
    >
      <header className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className="text-sm font-semibold tracking-wide uppercase">{STATUS_LABELS[status]}</h2>
        <span className="text-xs text-muted">{visible.length + pending.length}</span>
      </header>

      <div
        ref={setNodeRef}
        className={[
          'flex-1 rounded-2xl border border-dashed p-2 transition-colors',
          isOver ? 'border-accent bg-accent/5' : 'border-line bg-surface/40',
        ].join(' ')}
      >
        {archived.length > 0 && (
          <button
            type="button"
            onClick={() => setShowArchived((current) => !current)}
            className="mb-2 w-full rounded-lg px-2 py-1.5 text-xs text-muted transition-colors hover:text-accent"
          >
            {showArchived
              ? 'Masquer l’historique'
              : `Voir ${archived.length} carte${archived.length > 1 ? 's' : ''} de plus de ${ARCHIVE_AFTER_DAYS} jours`}
          </button>
        )}

        {/* Le SortableContext ne liste que les cartes réellement affichées :
            inclure les archives masquées casserait le calcul des positions. */}
        <SortableContext
          items={shown.map((card) => card.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-2">
            {shown.map((card) => (
              <CardTile
                key={card.id}
                card={card}
                selected={card.id === selectedId}
                onOpen={onOpen}
                onMove={onMove}
              />
            ))}
          </ul>
        </SortableContext>

        {/* Cartes dont le serveur cherche encore les informations : hors du
            SortableContext, elles n'ont pas encore d'identifiant réel. */}
        {pending.length > 0 && (
          <ul className="mt-2 flex flex-col gap-2">
            {pending.map((card) => (
              <PendingTile key={card.id} card={card} />
            ))}
          </ul>
        )}

        {shown.length === 0 && pending.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted">Rien ici</p>
        )}
      </div>
    </section>
  )
}

/** Carte provisoire, le temps que le serveur résolve le lien collé. */
function PendingTile({ card }: { card: BoardCard }) {
  return (
    <li className="animate-pulse rounded-xl border border-dashed border-line bg-surface/60">
      <div className="flex items-center gap-3 p-3">
        <Thumbnail
          src={null}
          label={card.title}
          className="h-14 w-14 shrink-0 rounded-lg border border-line text-lg"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{card.title}</p>
          <p className="mt-1 text-xs text-muted">Recherche des informations…</p>
        </div>
      </div>
    </li>
  )
}
