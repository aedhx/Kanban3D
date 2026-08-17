import type { CardWithCount } from '@/db/queries'
import type { Status } from '@/db/schema'
import { isStatus, positionBetween } from './cards'

/**
 * Une carte telle que la manipule le navigateur : identique à la ligne en base,
 * mais avec les horodatages en chaînes ISO — c'est ce que produit la
 * sérialisation JSON, aussi bien depuis le rendu serveur que depuis /api/cards.
 * (`dueDate` est déjà une chaîne « AAAA-MM-JJ » côté Drizzle.)
 */
export type BoardCard = Omit<CardWithCount, 'createdAt' | 'updatedAt' | 'doneAt'> & {
  createdAt: string
  updatedAt: string
  doneAt: string | null
}

export function toBoardCard(card: CardWithCount): BoardCard {
  return {
    ...card,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
    doneAt: card.doneAt?.toISOString() ?? null,
  }
}

/** Les cartes d'une colonne, dans l'ordre d'affichage. */
export function columnCards(cards: BoardCard[], status: Status): BoardCard[] {
  return cards
    .filter((card) => card.status === status)
    .sort((a, b) =>
      a.position !== b.position
        ? a.position - b.position
        : a.createdAt.localeCompare(b.createdAt),
    )
}

function arrayMove<T>(items: T[], from: number, to: number): T[] {
  const copy = items.slice()
  copy.splice(to, 0, copy.splice(from, 1)[0])
  return copy
}

/**
 * Où atterrit la carte relâchée ?
 *
 * `overId` est soit l'identifiant d'une autre carte, soit celui d'une colonne
 * (quand on lâche dans une zone vide). Renvoie `null` si le déplacement ne
 * change rien, pour éviter un appel réseau inutile.
 */
export function resolveDrop(
  cards: BoardCard[],
  activeId: string,
  overId: string,
): { status: Status; position: number } | null {
  const active = cards.find((card) => card.id === activeId)
  if (!active) return null

  const overCard = cards.find((card) => card.id === overId)
  const targetStatus: Status | undefined = overCard?.status ?? (isStatus(overId) ? overId : undefined)
  if (!targetStatus) return null

  const column = columnCards(cards, targetStatus)

  if (targetStatus === active.status) {
    // Réordonnancement au sein d'une colonne : on reproduit exactement le
    // déplacement prévisualisé par dnd-kit, puis on lit les nouveaux voisins.
    const from = column.findIndex((card) => card.id === activeId)
    const to = overCard ? column.findIndex((card) => card.id === overCard.id) : column.length - 1
    if (from === -1 || to === -1 || from === to) return null

    const reordered = arrayMove(column, from, to)
    return {
      status: targetStatus,
      position: positionBetween(reordered[to - 1]?.position, reordered[to + 1]?.position),
    }
  }

  // Changement de colonne : on s'insère devant la carte survolée, ou en fin de
  // colonne si on a lâché sur la colonne elle-même.
  const index = overCard ? column.findIndex((card) => card.id === overCard.id) : column.length
  const insertAt = index === -1 ? column.length : index

  return {
    status: targetStatus,
    position: positionBetween(column[insertAt - 1]?.position, column[insertAt]?.position),
  }
}

/** Colonne voisine, pour les boutons ‹ › des cartes. */
export function adjacentStatus(
  status: Status,
  direction: -1 | 1,
  statuses: readonly Status[],
): Status | null {
  const index = statuses.indexOf(status) + direction
  return statuses[index] ?? null
}
