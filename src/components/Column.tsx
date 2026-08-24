'use client'

import { useMemo, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { STATUS_LABELS, type Status } from '@/db/schema'
import type { BoardCard } from '@/lib/board'
import { ARCHIVE_AFTER_DAYS, isArchived } from '@/lib/dates'
import { columnTotals, formatEta, queueEta } from '@/lib/printInfo'
import { looksLikeSameJob } from '@/lib/printer'
import { CardTile } from './CardTile'
import { Thumbnail } from './Thumbnail'

type Props = {
  status: Status
  cards: BoardCard[]
  selectedId: string | null
  filamentPricePerKg: number | null
  /** Impression en cours sur la machine, s'il y en a une dans cette colonne. */
  printing: { fileName: string | null; progress: number; timeLeftSec: number | null } | null
  /** Temps restant sur la machine : le point de départ de la file d'attente. */
  queueStartSec: number | null
  onOpen: (card: BoardCard) => void
  onMove: (card: BoardCard, status: Status) => void
}

export function Column({
  status,
  cards,
  selectedId,
  filamentPricePerKg,
  printing,
  queueStartSec,
  onOpen,
  onMove,
}: Props) {
  // La colonne est elle-même une cible de dépôt : sans cela, impossible de
  // déposer une carte dans une colonne vide.
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const [showArchived, setShowArchived] = useState(false)

  // « Fait » s'accumule indéfiniment. Au-delà d'un mois, les cartes passent
  // derrière un lien : l'historique reste consultable sans encombrer la vue.
  const { visible, archived, pending, declined } = useMemo(() => {
    const visible: BoardCard[] = []
    const archived: BoardCard[] = []
    const pending: BoardCard[] = []
    const declined: BoardCard[] = []
    for (const card of cards) {
      if (card.pending) pending.push(card)
      // Une carte refusée sort de la liste triable, comme une carte provisoire :
      // elle n'a pas de rang dans une file qu'elle ne rejoindra pas. C'est aussi
      // ce qui empêche de la prendre pour cible d'un glisser, donc de calculer une
      // position d'après une bande de tri différente.
      else if (card.declinedReason) declined.push(card)
      else if (isArchived(card.doneAt)) archived.push(card)
      else visible.push(card)
    }
    return { visible, archived, pending, declined }
  }, [cards])

  const shown = showArchived ? [...archived, ...visible] : visible

  // Ce que la colonne représente en temps machine et en filament. Sur les
  // cartes visibles seulement : l'historique replié n'est plus du travail à
  // faire. Quantités comprises, contrairement aux lignes des cartes.
  const totaux = useMemo(
    () => columnTotals(visible, filamentPricePerKg).join(' · '),
    [visible, filamentPricePerKg],
  )

  /*
   * Quand chaque carte sera prête, si tout s'enchaîne. `visible` est déjà dans
   * l'ordre de passage — priorité puis position — donc le cumul suit exactement
   * ce que montre la colonne.
   *
   * « À imprimer » seulement : une carte déjà sur la machine a sa progression
   * réelle, et une carte terminée n'attend plus rien.
   */
  const eta = useMemo(
    () => (status === 'todo' ? queueEta(visible, queueStartSec) : new Map<string, number>()),
    [status, visible, queueStartSec],
  )

  return (
    <section
      className="flex min-w-[280px] flex-1 snap-start flex-col sm:min-w-0"
      aria-label={STATUS_LABELS[status]}
    >
      <header className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className="text-sm font-semibold tracking-wide uppercase">{STATUS_LABELS[status]}</h2>
        <span className="text-xs text-muted">{visible.length + pending.length}</span>
        {declined.length > 0 && (
          <span className="text-xs text-amber-700 dark:text-amber-400">
            {declined.length} refusée{declined.length > 1 ? 's' : ''}
          </span>
        )}
        {totaux && (
          <span className="truncate text-xs text-muted" data-testid="column-totals">
            {totaux}
          </span>
        )}
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
            // `min-h-10` sur mobile : au doigt, 28 px de haut se rate une fois sur deux.
            className="mb-2 min-h-10 w-full rounded-lg px-2 py-1.5 text-xs text-muted transition-colors hover:text-accent sm:min-h-0"
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
                filamentPricePerKg={filamentPricePerKg}
                printProgress={
                  printing && looksLikeSameJob(printing.fileName, card.title)
                    ? printing.progress
                    : null
                }
                eta={eta.has(card.id) ? formatEta(eta.get(card.id)!) : null}
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

        {/* Les refusées, au bas de la colonne : encore là, mais hors de la file. */}
        {declined.length > 0 && (
          <ul className="mt-2 flex flex-col gap-2" data-testid="declined-cards">
            {declined.map((card) => (
              <li
                key={card.id}
                className="rounded-xl border border-line bg-surface/50 opacity-70 transition-opacity hover:opacity-100"
              >
                <button
                  type="button"
                  onClick={() => onOpen(card)}
                  className="w-full text-left"
                  aria-label={`Ouvrir « ${card.title} », refusée`}
                >
                  <DeclinedTile card={card} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {shown.length === 0 && pending.length === 0 && declined.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted">Rien ici</p>
        )}
      </div>
    </section>
  )
}

/**
 * Carte refusée : le titre, la raison, et rien d'autre.
 *
 * Pas de coût, pas de priorité, pas de boutons de déplacement — tout cela parle
 * d'un travail à faire, et celui-là ne se fera pas tant que le refus tient. Un
 * clic ouvre le panneau, d'où l'on peut annuler le refus.
 */
function DeclinedTile({ card }: { card: BoardCard }) {
  return (
    <div className="flex items-center gap-3 p-3">
      <Thumbnail
        src={card.imageUrl}
        label={card.title}
        size={120}
        className="h-10 w-10 shrink-0 rounded-lg border border-line object-cover text-sm grayscale"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium line-through decoration-1">{card.title}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-amber-800 dark:text-amber-300">
          {card.declinedReason}
        </p>
      </div>
    </div>
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
