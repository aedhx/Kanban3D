import { relations } from 'drizzle-orm'
import {
  customType,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

/** Octets bruts. Drizzle n'a pas de type `bytea` tout fait. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
})

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

  /**
   * Ce que coûte l'impression. Rempli automatiquement quand la plateforme le
   * fournit, saisissable à la main sinon — ce qui est le cas le plus fréquent :
   * MakerWorld calcule ces valeurs depuis le trancheur, mais sur Printables
   * seul un tiers des auteurs les renseigne, et jamais la matière. Celui qui
   * imprime connaît les vrais chiffres après avoir tranché.
   */
  printMinutes: integer('print_minutes'),
  filamentGrams: integer('filament_grams'),
  material: text('material'),

  /** Nombre de fichiers et de pièces : prévient qu'il y a un assemblage. */
  fileCount: integer('file_count'),
  pieceCount: integer('piece_count'),

  // Qui a fait quoi (simple étiquette, pas un compte)
  requestedBy: text('requested_by').notNull(),
  lastMovedBy: text('last_moved_by'),

  /**
   * Date de passage en « Fait ». Sert à archiver les vieilles cartes ; on ne peut
   * pas se servir de `updatedAt`, que la moindre modification remet à zéro.
   */
  doneAt: timestamp('done_at', { withTimezone: true }),

  /**
   * Date de la photo du résultat, s'il y en a une. Les octets vivent dans
   * `card_photos` : ils n'ont rien à faire ici, où chaque colonne repart au
   * navigateur toutes les dix secondes. Cette date suffit à savoir qu'une photo
   * existe, et sert de numéro de version dans l'URL de l'image — sans quoi une
   * photo remplacée resterait cachée derrière l'ancienne.
   */
  photoAt: timestamp('photo_at', { withTimezone: true }),

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
 * La photo de ce qui est sorti de l'imprimante.
 *
 * Table à part, et non colonne de `cards` : le tableau se rafraîchit toutes les
 * dix secondes, et transporter les octets à chaque fois coûterait des mégaoctets
 * pour une image qu'on ne regarde presque jamais. Ici, `cards.photo_at` voyage
 * seul, et la photo se télécharge par son URL, mise en cache par le navigateur.
 *
 * Une photo par carte : la clé primaire est la carte elle-même.
 */
export const cardPhotos = pgTable('card_photos', {
  cardId: uuid('card_id')
    .primaryKey()
    .references(() => cards.id, { onDelete: 'cascade' }),
  mime: text('mime').notNull(),
  bytes: bytea('bytes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const cardsRelations = relations(cards, ({ many }) => ({
  comments: many(comments),
}))

export const commentsRelations = relations(comments, ({ one }) => ({
  card: one(cards, { fields: [comments.cardId], references: [cards.id] }),
}))

export type Card = typeof cards.$inferSelect
export type NewCard = typeof cards.$inferInsert
export type Comment = typeof comments.$inferSelect
