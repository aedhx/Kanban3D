import {
  doublePrecision,
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

  // Qui a fait quoi (simple étiquette, pas un compte)
  requestedBy: text('requested_by').notNull(),
  lastMovedBy: text('last_moved_by'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Card = typeof cards.$inferSelect
export type NewCard = typeof cards.$inferInsert
