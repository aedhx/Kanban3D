import type { CardWithCount } from '@/db/queries'
import { DEFAULT_PRIORITY, type Priority, type Status } from '@/db/schema'
import { isStatus, positionBetween } from './cards'

/**
 * Une carte telle que la manipule le navigateur : identique à la ligne en base,
 * mais avec les horodatages en chaînes ISO — c'est ce que produit la
 * sérialisation JSON, aussi bien depuis le rendu serveur que depuis /api/cards.
 * (`dueDate` est déjà une chaîne « AAAA-MM-JJ » côté Drizzle.)
 */
export type BoardCard = Omit<CardWithCount, 'createdAt' | 'updatedAt' | 'doneAt' | 'photoAt'> & {
  createdAt: string
  updatedAt: string
  doneAt: string | null
  photoAt: string | null
  /**
   * Carte affichée avant que le serveur ne l'ait créée : le temps qu'il aille
   * chercher les informations du modèle, on montre déjà quelque chose. Champ
   * purement local, jamais renvoyé par l'API.
   */
  pending?: boolean
}

/** Carte provisoire affichée dès le collage d'un lien. */
export function pendingCard(id: string, title: string, requestedBy: string): BoardCard {
  const now = new Date().toISOString()
  return {
    id,
    status: 'todo',
    position: Number.MAX_SAFE_INTEGER,
    url: null,
    title,
    imageUrl: null,
    author: null,
    source: null,
    quantity: 1,
    color: null,
    notes: null,
    priority: DEFAULT_PRIORITY,
    multiColor: false,
    colorCount: null,
    dueDate: null,
    printMinutes: null,
    filamentGrams: null,
    material: null,
    fileCount: null,
    pieceCount: null,
    requestedBy,
    lastMovedBy: null,
    doneAt: null,
    photoAt: null,
    createdAt: now,
    updatedAt: now,
    commentCount: 0,
    pending: true,
  }
}

export function toBoardCard(card: CardWithCount): BoardCard {
  return {
    ...card,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
    doneAt: card.doneAt?.toISOString() ?? null,
    photoAt: card.photoAt?.toISOString() ?? null,
  }
}

/**
 * Les cartes d'une colonne, dans l'ordre d'affichage.
 *
 * « À imprimer » se classe par priorité décroissante, puis par position : le
 * glisser-déposer garde donc tout son sens **à l'intérieur** d'un niveau, au lieu
 * d'être neutralisé par le tri. Les deux autres colonnes gardent leur ordre
 * manuel, qui y raconte autre chose — l'ordre de passage sur la machine, l'ordre
 * de finition.
 */
export function columnCards(cards: BoardCard[], status: Status): BoardCard[] {
  const byPriority = status === 'todo'

  return cards
    .filter((card) => card.status === status)
    .sort((a, b) => {
      if (byPriority && a.priority !== b.priority) return b.priority - a.priority
      if (a.position !== b.position) return a.position - b.position
      return a.createdAt.localeCompare(b.createdAt)
    })
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
 *
 * Le principe : reconstruire la liste telle qu'elle sera après le lâcher, puis y
 * lire les voisins de la carte déplacée. C'est plus sûr que de raisonner sur des
 * index, et c'est indispensable depuis que « À imprimer » est trié par priorité —
 * voir la note sur les bandes, plus bas.
 */
export function resolveDrop(
  cards: BoardCard[],
  activeId: string,
  overId: string,
): { status: Status; position: number; priority?: Priority } | null {
  const active = cards.find((card) => card.id === activeId)
  if (!active) return null

  const overCard = cards.find((card) => card.id === overId)
  const targetStatus: Status | undefined =
    overCard?.status ?? (isStatus(overId) ? overId : undefined)
  if (!targetStatus) return null

  const column = columnCards(cards, targetStatus)

  /*
   * Dans « À imprimer », la carte prend la priorité de celle auprès de laquelle
   * elle atterrit : lâcher une carte au milieu du bloc « Urgent » la rend urgente.
   * Sans cela, le tri la renverrait aussitôt à sa place — le déplacement
   * semblerait annulé sous l'œil, défaut classique d'une colonne triée.
   */
  const niveau =
    targetStatus === 'todo' && overCard ? overCard.priority : (active.priority as Priority)
  const changeDeNiveau = niveau !== active.priority

  // La carte telle qu'elle sera après le lâcher.
  const déplacée: BoardCard = { ...active, status: targetStatus, priority: niveau }

  let après: BoardCard[]
  if (targetStatus === active.status) {
    // Réordonnancement : on reproduit exactement ce que dnd-kit a prévisualisé.
    const from = column.findIndex((card) => card.id === activeId)
    const to = overCard ? column.findIndex((card) => card.id === overCard.id) : column.length - 1
    if (from === -1 || to === -1) return null
    if (from === to && !changeDeNiveau) return null
    après = arrayMove(
      column.map((card) => (card.id === activeId ? déplacée : card)),
      from,
      to,
    )
  } else {
    // Changement de colonne : on s'insère devant la carte survolée, ou en fin de
    // colonne si on a lâché sur la colonne elle-même.
    const index = overCard ? column.findIndex((card) => card.id === overCard.id) : column.length
    const insertAt = index === -1 ? column.length : index
    après = [...column.slice(0, insertAt), déplacée, ...column.slice(insertAt)]
  }

  /*
   * Les voisins qui comptent sont ceux **du même niveau**.
   *
   * Dans une colonne triée par priorité, la position ne se compare qu'à
   * l'intérieur d'une bande : prendre les voisins affichés donnerait une position
   * bornée par des cartes d'un autre niveau, et la carte reviendrait à sa place au
   * premier tri — c'est exactement le bug que ce détour évite.
   */
  const bande = targetStatus === 'todo' ? après.filter((c) => c.priority === niveau) : après
  const i = bande.findIndex((card) => card.id === activeId)

  return {
    status: targetStatus,
    position: positionBetween(bande[i - 1]?.position, bande[i + 1]?.position),
    ...(changeDeNiveau ? { priority: niveau } : {}),
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
