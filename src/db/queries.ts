import { asc, eq, getTableColumns, sql } from 'drizzle-orm'
import { getDb } from '.'
import { cards, comments, type Card } from './schema'

export type CardWithCount = Card & { commentCount: number }

/**
 * Nombre de messages, obtenu par jointure agrégée.
 *
 * À ne pas remplacer par une sous-requête corrélée du type
 * `(select count(*) from comments where comments.card_id = cards.id)` : dans un
 * template `sql`, Drizzle n'écrit le nom de la table devant la colonne que si la
 * requête comporte une jointure. Sans jointure, la condition devient
 * `"card_id" = "id"`, et à l'intérieur de la sous-requête `"id"` désigne
 * `comments.id` — le décompte vaut alors zéro pour toutes les cartes, sans la
 * moindre erreur SQL. La jointure force la qualification et évite le piège.
 *
 * `count(comments.id)` ignore les lignes nulles produites par le LEFT JOIN : une
 * carte sans message compte donc bien 0.
 */
const commentCount = sql<number>`count(${comments.id})::int`

/**
 * Toutes les cartes du tableau, avec le nombre de messages de chacune.
 *
 * Partagé entre le rendu serveur de la page et /api/cards : les deux doivent
 * renvoyer exactement la même forme, sinon le tableau change d'aspect au premier
 * rafraîchissement.
 */
export async function listCards(): Promise<CardWithCount[]> {
  return getDb()
    .select({ ...getTableColumns(cards), commentCount })
    .from(cards)
    .leftJoin(comments, eq(comments.cardId, cards.id))
    // `cards.id` étant la clé primaire, Postgres accepte les autres colonnes
    // sans les répéter ici.
    .groupBy(cards.id)
    .orderBy(asc(cards.position), asc(cards.createdAt))
}

/** Une carte seule, dans la même forme que `listCards`. */
export async function getCardWithCount(id: string): Promise<CardWithCount | undefined> {
  const [row] = await getDb()
    .select({ ...getTableColumns(cards), commentCount })
    .from(cards)
    .leftJoin(comments, eq(comments.cardId, cards.id))
    .where(eq(cards.id, id))
    .groupBy(cards.id)
  return row
}
