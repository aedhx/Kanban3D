'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { PRIORITY_LABELS, STATUSES, STATUS_LABELS, type Priority, type Status } from '@/db/schema'
import { adjacentStatus, type BoardCard } from '@/lib/board'
import { photoUrl } from '@/lib/photo'
import { formatFilamentCost, formatPieces, formatPrintTime, printCostParts } from '@/lib/printInfo'
import {
  IconComments,
  IconMovedBy,
  IconNext,
  IconPieces,
  IconPrevious,
  IconPrintTime,
  IconUrgent,
  IconMultiColor,
  IconDeclined,
  IconEta,
} from './icons'
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
  const key = color
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
  for (const [name, hex] of Object.entries(COLOR_SWATCHES)) {
    if (key.includes(name)) return hex
  }
  return null
}

/**
 * Le niveau normal n'a pas de badge : un badge sur chaque carte ne distinguerait
 * plus rien. Seuls les deux écarts se signalent.
 */
const PRIORITY_STYLES: Record<Priority, string | null> = {
  2: 'bg-red-500/15 text-red-700 dark:text-red-300 font-semibold',
  1: null,
  0: 'text-muted',
}

/** Partie haute de la carte : c'est elle qu'on saisit pour glisser. */
function CardContent({
  card,
  filamentPricePerKg,
  printProgress,
  eta,
}: {
  card: BoardCard
  filamentPricePerKg: number | null
  /** Avancement, si c'est cette carte que la machine est en train d'imprimer. */
  printProgress?: number | null
  /** Quand elle sera prête, si la file s'enchaîne. */
  eta?: string | null
}) {
  const swatch = swatchFor(card.color)
  // Une priorité n'a plus rien à dire sur une carte déjà terminée.
  const priorityStyle = card.status === 'done' ? null : PRIORITY_STYLES[card.priority]
  // Ce que l'impression va coûter, et s'il y a un assemblage à prévoir.
  // L'horloge n'annonce que la durée : sans durée, « 52 g » se passe d'icône.
  // Le prix rejoint la ligne, sur la même base qu'elle : pour une pièce.
  const cost = [...printCostParts(card), formatFilamentCost(card.filamentGrams, filamentPricePerKg)]
    .filter(Boolean)
    .join(' · ')
  const timed = formatPrintTime(card.printMinutes) !== null
  const pieces = formatPieces(card.pieceCount, card.piecesDone)

  return (
    <div className="flex gap-3 p-3">
      <Thumbnail
        // La photo du résultat passe devant l'image du modèle : sur une carte
        // terminée, ce qui compte est ce qui est sorti de l'imprimante.
        src={card.photoAt ? photoUrl(card.id, card.photoAt) : card.imageUrl}
        label={card.title}
        size={160}
        className="h-14 w-14 shrink-0 rounded-lg border border-line object-cover text-lg"
      />

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm leading-snug font-medium">{card.title}</p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {card.quantity > 1 && (
            <span className="rounded bg-accent/15 px-1.5 py-0.5 font-semibold text-accent-deep">
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

          {priorityStyle && (
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${priorityStyle}`}
            >
              {card.priority === 2 && <IconUrgent size={12} weight="fill" aria-hidden />}
              {PRIORITY_LABELS[card.priority]}
            </span>
          )}

          {card.declinedReason && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-800 dark:text-amber-300">
              <IconDeclined size={12} aria-hidden />
              Refusée
            </span>
          )}

          {card.multiColor && (
            <span
              className="inline-flex items-center gap-1"
              title="Demande le Canvas, l’unité multi-couleur"
            >
              <IconMultiColor size={13} aria-hidden />
              {card.colorCount ? `${card.colorCount} couleurs` : 'multi-couleur'}
            </span>
          )}

          {card.commentCount > 0 && (
            <span
              className="inline-flex items-center gap-1"
              title={`${card.commentCount} message${card.commentCount > 1 ? 's' : ''}`}
            >
              <IconComments size={13} aria-hidden />
              {card.commentCount}
            </span>
          )}
        </div>

        {(cost || pieces) && (
          <div
            className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted"
            data-testid="print-info"
          >
            {cost && (
              <span className="inline-flex items-center gap-1">
                {timed && <IconPrintTime size={13} aria-hidden />}
                {cost}
              </span>
            )}
            {pieces && (
              <span
                className={[
                  'inline-flex items-center gap-1',
                  // En cours d'assemblage : c'est une information qui bouge, elle
                  // se distingue du simple « 4 pièces » posé à la création.
                  card.piecesDone > 0 ? 'font-medium text-accent-deep' : '',
                ].join(' ')}
                title={card.piecesDone > 0 ? 'Pièces déjà sorties de l’imprimante' : undefined}
              >
                <IconPieces size={13} aria-hidden />
                {pieces}
              </span>
            )}
          </div>
        )}

        {/* Ce que le demandeur veut savoir : quand il l'aura. Au conditionnel —
            l'estimation suppose que les impressions s'enchaînent. */}
        {eta && (
          <p
            className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted"
            data-testid="card-eta"
            title="Si les impressions s’enchaînent"
          >
            <IconEta size={13} aria-hidden />
            {eta}
          </p>
        )}

        {/* La machine imprime cette carte : on la suit ici aussi, pas seulement
            dans le bandeau du haut. */}
        {printProgress !== null && printProgress !== undefined && (
          <div className="mt-2" data-testid="card-progress">
            <div className="flex items-center justify-between text-[11px] text-accent-deep">
              <span className="font-medium">sur l’imprimante</span>
              <span>{Math.round(printProgress)} %</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full bg-accent transition-[width]"
                style={{ width: `${Math.round(printProgress)}%` }}
              />
            </div>
          </div>
        )}

        {/* La raison prend la place de la remarque : sur une carte refusée,
            c'est elle qu'on vient lire. */}
        {card.declinedReason ? (
          <p className="mt-1.5 line-clamp-2 text-xs text-amber-800 dark:text-amber-300">
            {card.declinedReason}
          </p>
        ) : (
          card.notes && <p className="mt-1.5 line-clamp-2 text-xs text-muted">{card.notes}</p>
        )}
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
      <span className="inline-flex min-w-0 items-center gap-1 truncate text-[11px] text-muted">
        {card.requestedBy}
        {card.lastMovedBy && card.lastMovedBy !== card.requestedBy && (
          <>
            <IconMovedBy size={11} aria-hidden />
            {card.lastMovedBy}
          </>
        )}
      </span>

      <div className="flex shrink-0 gap-1">
        <MoveButton
          label={previous ? `Déplacer vers « ${STATUS_LABELS[previous]} »` : ''}
          disabled={!previous || !interactive}
          onClick={() => previous && onMove(card, previous)}
        >
          <IconPrevious size={14} aria-hidden />
        </MoveButton>
        <MoveButton
          label={next ? `Déplacer vers « ${STATUS_LABELS[next]} »` : ''}
          disabled={!next || !interactive}
          onClick={() => next && onMove(card, next)}
        >
          <IconNext size={14} aria-hidden />
        </MoveButton>
      </div>
    </div>
  )
}

export function CardTile({
  card,
  selected = false,
  filamentPricePerKg,
  printProgress,
  eta,
  onOpen,
  onMove,
}: {
  card: BoardCard
  /** Carte actuellement ouverte dans le panneau latéral. */
  selected?: boolean
  filamentPricePerKg: number | null
  printProgress?: number | null
  eta?: string | null
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
        'rounded-xl border bg-surface shadow-sm transition-colors',
        // Le panneau restant ouvert à côté du tableau, il faut voir de quelle
        // carte il parle.
        selected ? 'border-accent ring-1 ring-accent' : 'border-line',
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
        aria-current={selected ? 'true' : undefined}
        aria-label={`${card.title} — ouvrir le détail`}
      >
        <CardContent
          card={card}
          filamentPricePerKg={filamentPricePerKg}
          printProgress={printProgress}
          eta={eta}
        />
      </div>

      <CardFooter card={card} onMove={onMove} interactive />
    </li>
  )
}

/** Aperçu affiché dans le DragOverlay : mêmes pixels, aucune interaction. */
export function CardPreview({
  card,
  filamentPricePerKg,
}: {
  card: BoardCard
  filamentPricePerKg: number | null
}) {
  return (
    <div className="rotate-2 rounded-xl border border-line bg-surface shadow-xl">
      <CardContent card={card} filamentPricePerKg={filamentPricePerKg} />
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
      className="flex h-10 w-10 items-center justify-center rounded border border-line text-muted transition-colors hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-25 sm:h-6 sm:w-6"
    >
      {children}
    </button>
  )
}
