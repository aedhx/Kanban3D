'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { STATUSES, STATUS_LABELS, type Status } from '@/db/schema'
import { adjacentStatus, type BoardCard } from '@/lib/board'
import { Thumbnail } from './Thumbnail'

/** Petite pastille colorée devinée à partir du nom de couleur saisi. */
const COLOR_SWATCHES: Record<string, string> = {
  noir: '#1b1b1b',
  blanc: '#f2f2f2',
  gris: '#9aa0a6',
  rouge: '#d93b30',
  orange: '#f0761a',
  jaune: '#f2c744',
  vert: '#3ba55d',
  bleu: '#3b82f6',
  violet: '#8b5cf6',
  rose: '#ec4899',
  marron: '#8b5e3c',
  beige: '#e3d5b8',
  transparent: '#d9e6ee',
  argent: '#c0c5ce',
  or: '#d4af37',
}

function swatchFor(color: string | null): string | null {
  if (!color) return null
  // On retire les accents pour que « doré » retrouve « or », « vert clair » → vert…
  const key = color.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  for (const [name, hex] of Object.entries(COLOR_SWATCHES)) {
    if (key.includes(name)) return hex
  }
  return null
}

/** Partie haute de la carte : c'est elle qu'on saisit pour glisser. */
function CardContent({ card }: { card: BoardCard }) {
  const swatch = swatchFor(card.color)

  return (
    <div className="flex gap-3 p-3">
      <Thumbnail
        src={card.imageUrl}
        label={card.title}
        size={160}
        className="h-14 w-14 shrink-0 rounded-lg border border-line object-cover text-lg"
      />

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm leading-snug font-medium">{card.title}</p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {card.quantity > 1 && (
            <span className="rounded bg-accent/15 px-1.5 py-0.5 font-semibold text-accent">
              ×{card.quantity}
            </span>
          )}
          {card.color && (
            <span className="inline-flex items-center gap-1">
              {swatch && (
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full border border-line"
                  style={{ background: swatch }}
                />
              )}
              {card.color}
            </span>
          )}
          {card.source && <span className="truncate">{card.source}</span>}
        </div>

        {card.notes && <p className="mt-1.5 line-clamp-2 text-xs text-muted">{card.notes}</p>}
      </div>
    </div>
  )
}

/**
 * Pied de carte : qui a demandé, et les deux boutons de déplacement.
 * Volontairement placé *hors* de la zone de glisser, sinon un appui sur ‹ ou ›
 * démarrerait un déplacement au lieu d'activer le bouton.
 */
function CardFooter({
  card,
  onMove,
  interactive,
}: {
  card: BoardCard
  onMove: (card: BoardCard, status: Status) => void
  interactive: boolean
}) {
  const previous = adjacentStatus(card.status, -1, STATUSES)
  const next = adjacentStatus(card.status, 1, STATUSES)

  return (
    <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-1.5">
      <span className="truncate text-[11px] text-muted">
        {card.requestedBy}
        {card.lastMovedBy && card.lastMovedBy !== card.requestedBy && ` · ↦ ${card.lastMovedBy}`}
      </span>

      <div className="flex shrink-0 gap-1">
        <MoveButton
          label={previous ? `Déplacer vers « ${STATUS_LABELS[previous]} »` : ''}
          disabled={!previous || !interactive}
          onClick={() => previous && onMove(card, previous)}
        >
          ‹
        </MoveButton>
        <MoveButton
          label={next ? `Déplacer vers « ${STATUS_LABELS[next]} »` : ''}
          disabled={!next || !interactive}
          onClick={() => next && onMove(card, next)}
        >
          ›
        </MoveButton>
      </div>
    </div>
  )
}

export function CardTile({
  card,
  onOpen,
  onMove,
}: {
  card: BoardCard
  onOpen: (card: BoardCard) => void
  onMove: (card: BoardCard, status: Status) => void
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: card.id,
  })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={[
        'rounded-xl border border-line bg-surface shadow-sm',
        isDragging ? 'opacity-30' : '',
      ].join(' ')}
    >
      <div
        {...attributes}
        {...listeners}
        data-dragging={isDragging ? 'true' : 'false'}
        data-testid="card-handle"
        onClick={() => onOpen(card)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onOpen(card)
          }
        }}
        className="cursor-grab rounded-t-xl active:cursor-grabbing"
        aria-label={`${card.title} — ouvrir le détail`}
      >
        <CardContent card={card} />
      </div>

      <CardFooter card={card} onMove={onMove} interactive />
    </li>
  )
}

/** Aperçu affiché dans le DragOverlay : mêmes pixels, aucune interaction. */
export function CardPreview({ card }: { card: BoardCard }) {
  return (
    <div className="rotate-2 rounded-xl border border-line bg-surface shadow-xl">
      <CardContent card={card} />
      <CardFooter card={card} onMove={() => {}} interactive={false} />
    </div>
  )
}

function MoveButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded border border-line text-sm leading-none text-muted transition-colors hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-25"
    >
      {children}
    </button>
  )
}
