import { relations } from 'drizzle-orm'
import {
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

/** Les trois colonnes du tableau, dans l'ordre. */
export const STATUSES = ['todo', 'printing', 'done'] as const
export type Status = (typeof STATUSES)[number]

export const STATUS_LABELS: Record<Status, string> = {
  todo: 'À imprimer',
  printing: 'En impression',
  done: 'Fait',
}

export const cards = pgTable('cards', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Position dans le tableau. `$type` restreint le `text` de Postgres aux trois
  // colonnes connues côté TypeScript.
  status: text('status').$type<Status>().notNull().default('todo'),
  /**
   * Ordre au sein d'une colonne. En flottant : pour insérer entre deux cartes
   * on prend la moyenne de leurs positions, ce qui évite de renuméroter
   * toute la colonne à chaque déplacement.
   */
  position: doublePrecision('position').notNull(),

  // Modèle d'origine (rempli automatiquement depuis l'URL quand c'est possible)
  url: text('url'),
  title: text('title').notNull(),
  imageUrl: text('image_url'),
  author: text('author'),
  source: text('source'),

  // Critères de la demande
  quantity: integer('quantity').notNull().default(1),
  color: text('color'),
  notes: text('notes'),
  /**
   * Échéance souhaitée. Une `date` sans heure ni fuseau : « pour le 12 » ne veut
   * pas dire « pour le 12 à 00:00 UTC », et un timestamp ferait basculer la date
   * affichée selon le fuseau du lecteur.
   */
  dueDate: date('due_date'),

  // Qui a fait quoi (simple étiquette, pas un compte)
  requestedBy: text('requested_by').notNull(),
  lastMovedBy: text('last_moved_by'),

  /**
   * Date de passage en « Fait ». Sert à archiver les vieilles cartes ; on ne peut
   * pas se servir de `updatedAt`, que la moindre modification remet à zéro.
   */
  doneAt: timestamp('done_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Les échanges autour d'une demande : questions, précisions, refus motivés. */
export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    author: text('author').notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('comments_card_id_idx').on(table.cardId)],
)

/**
 * Tentatives de connexion échouées, pour brider les essais en force brute.
 *
 * Le code d'accès est court et le site est public : sans ce garde-fou, les
 * combinaisons d'un code à cinq chiffres s'épuisent en quelques heures. La table
 * vit en base plutôt qu'en mémoire parce que chaque invocation de fonction
 * Netlify démarre dans une instance qui peut être neuve : un compteur local ne
 * compterait rien.
 */
export const authAttempts = pgTable(
  'auth_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ip: text('ip').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('auth_attempts_ip_created_idx').on(table.ip, table.createdAt)],
)

export const cardsRelations = relations(cards, ({ many }) => ({
  comments: many(comments),
}))

export const commentsRelations = relations(comments, ({ one }) => ({
  card: one(cards, { fields: [comments.cardId], references: [cards.id] }),
}))

export type Card = typeof cards.$inferSelect
export type NewCard = typeof cards.$inferInsert
export type Comment = typeof comments.$inferSelect
