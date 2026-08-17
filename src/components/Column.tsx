'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { STATUS_LABELS, type Status } from '@/db/schema'
import type { BoardCard } from '@/lib/board'
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

  return (
    <section
      className="flex min-w-[280px] flex-1 snap-start flex-col sm:min-w-0"
      aria-label={STATUS_LABELS[status]}
    >
      <header className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className="text-sm font-semibold tracking-wide uppercase">{STATUS_LABELS[status]}</h2>
        <span className="text-xs text-muted">{cards.length}</span>
      </header>

      <div
        ref={setNodeRef}
        className={[
          'flex-1 rounded-2xl border border-dashed p-2 transition-colors',
          isOver ? 'border-accent bg-accent/5' : 'border-line bg-surface/40',
        ].join(' ')}
      >
        <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2">
            {cards.map((card) => (
              <CardTile key={card.id} card={card} onOpen={onOpen} onMove={onMove} />
            ))}
          </ul>
        </SortableContext>

        {cards.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted">Rien ici</p>
        )}
      </div>
    </section>
  )
}
