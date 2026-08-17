import { relations } from 'drizzle-orm'
import {
  boolean,
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

/**
 * Priorité d'une demande, du plus calme au plus pressé.
 *
 * Trois niveaux, et pas cinq : au-delà, personne ne sait plus faire la différence
 * entre le 3 et le 4, et tout finit au maximum. Stockée en entier pour que la base
 * puisse trier dessus.
 */
export const PRIORITIES = [0, 1, 2] as const
export type Priority = (typeof PRIORITIES)[number]

export const PRIORITY_LABELS: Record<Priority, string> = {
  0: 'Tranquille',
  1: 'Normal',
  2: 'Urgent',
}

export const DEFAULT_PRIORITY: Priority = 1

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
   * Priorité, qui classe la colonne « À imprimer ». Les deux autres colonnes
   * gardent leur ordre manuel : il y raconte autre chose — l'ordre de passage sur
   * la machine, l'ordre de finition.
   */
  priority: integer('priority').$type<Priority>().notNull().default(DEFAULT_PRIORITY),
  /**
   * Impression multi-couleur, qui demande de monter le Canvas sur la Centauri
   * Carbon. `colorCount` dit combien de couleurs, quand on le sait.
   */
  multiColor: boolean('multi_color').notNull().default(false),
  colorCount: integer('color_count'),
  /**
   * Vestige : l'échéance a été retirée de l'interface au profit de la priorité,
   * qui répond mieux à la vraie question (« laquelle d'abord », pas « pour
   * quand »). La colonne reste — plus aucun écran ne l'écrit ni ne la lit — parce
   * qu'une migration destructrice ne se justifie pas pour gagner un champ nul.
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

/**
 * L'imprimante, et son dernier état connu.
 *
 * Une seule ligne, d'où la clé primaire fixe : il y a une machine, celle
 * d'Alexandre. Configuration et état vivent ensemble parce qu'ils se lisent
 * ensemble — le tableau demande « qu'est-ce qui imprime ? » et veut le nom de la
 * machine dans la même réponse.
 *
 * L'état est une copie : c'est OctoEverywhere qui détient la vérité, on ne garde
 * ici que la dernière valeur vue, avec son horodatage. Sans ce cache, chaque
 * ouverture du tableau irait interroger le NAS, et le rafraîchissement des dix
 * secondes le ferait quarante fois par minute à deux.
 */
export const printer = pgTable('printer', {
  // Toujours 1 : la contrainte dit qu'il ne peut pas y en avoir deux.
  id: integer('id').primaryKey().default(1),
  name: text('name').notNull().default('L’imprimante d’Alexandre'),
  /** Adresse OctoEverywhere : « Live Link » de préférence, Shared Connection sinon. */
  statusUrl: text('status_url'),
  /**
   * Jeton éventuel de cette URL, et jeton du webhook entrant. Ni l'un ni l'autre
   * ne repart vers le navigateur : l'API dit seulement s'ils sont configurés.
   */
  statusSecret: text('status_secret'),
  webhookToken: text('webhook_token'),

  // Dernier état connu
  /** Libellé brut renvoyé par OctoEverywhere, traduit à l'affichage. */
  state: text('state'),
  /** `g`, `y`, `r` ou `w` : la couleur que le site officiel donne à cet état. */
  statusColor: text('status_color'),
  /** Impression en cours ? Tranché côté serveur, à la lecture de l'état. */
  printing: boolean('printing').notNull().default(false),
  progress: doublePrecision('progress'),
  currentLayer: integer('current_layer'),
  totalLayers: integer('total_layers'),
  timeLeftSec: integer('time_left_sec'),
  durationSec: integer('duration_sec'),
  fileName: text('file_name'),
  nozzleTemp: doublePrecision('nozzle_temp'),
  bedTemp: doublePrecision('bed_temp'),
  /** Quand cet état a été lu — c'est lui qui dit si l'information est fraîche. */
  seenAt: timestamp('seen_at', { withTimezone: true }),
  /** Dernière erreur rencontrée en interrogeant la machine, pour le diagnostic. */
  lastError: text('last_error'),

  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
export type Printer = typeof printer.$inferSelect
