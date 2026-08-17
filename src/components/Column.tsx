'use client'

import { useMemo, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { STATUS_LABELS, type Status } from '@/db/schema'
import type { BoardCard } from '@/lib/board'
import { ARCHIVE_AFTER_DAYS, isArchived } from '@/lib/dates'
import { CardTile } from './CardTile'

type Props = {
  status: Status
  cards: BoardCard[]
  onOpen: (card: BoardCard) => void
  onMove: (card: BoardCard, status: Status) => void
}

export function Column({ status, cards, onOpen, onMove }: Props) {
  // La colonne est elle-même une cible de dépôt : sans cela, impossible de
  // déposer une carte dans une colonne vide.
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const [showArchived, setShowArchived] = useState(false)

  // « Fait » s'accumule indéfiniment. Au-delà d'un mois, les cartes passent
  // derrière un lien : l'historique reste consultable sans encombrer la vue.
  const { visible, archived } = useMemo(() => {
    const visible: BoardCard[] = []
    const archived: BoardCard[] = []
    for (const card of cards) {
      ;(isArchived(card.doneAt) ? archived : visible).push(card)
    }
    return { visible, archived }
  }, [cards])

  const shown = showArchived ? [...archived, ...visible] : visible

  return (
    <section
      className="flex min-w-[280px] flex-1 snap-start flex-col sm:min-w-0"
      aria-label={STATUS_LABELS[status]}
    >
      <header className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className="text-sm font-semibold tracking-wide uppercase">{STATUS_LABELS[status]}</h2>
        <span className="text-xs text-muted">{visible.length}</span>
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
        <SortableContext items={shown.map((card) => card.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2">
            {shown.map((card) => (
              <CardTile key={card.id} card={card} onOpen={onOpen} onMove={onMove} />
            ))}
          </ul>
        </SortableContext>

        {shown.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted">Rien ici</p>}
      </div>
    </section>
  )
}
