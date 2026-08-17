import { DEFAULT_PRIORITY, PRIORITIES, STATUSES, type Priority, type Status } from '@/db/schema'

export const POSITION_STEP = 1000

export function isStatus(value: unknown): value is Status {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value)
}

/**
 * Calcule la position d'une carte insérée entre deux voisines.
 *
 * Les positions sont des flottants : glisser une carte entre deux autres se
 * résume à prendre leur moyenne, donc une seule écriture en base au lieu de
 * renuméroter la colonne entière.
 */
export function positionBetween(before?: number, after?: number): number {
  if (before === undefined && after === undefined) return POSITION_STEP
  if (before === undefined) return after! - POSITION_STEP
  if (after === undefined) return before + POSITION_STEP
  return (before + after) / 2
}

export function isPriority(value: unknown): value is Priority {
  return typeof value === 'number' && (PRIORITIES as readonly number[]).includes(value)
}

/**
 * Priorité reçue du navigateur. Tout ce qui n'est pas un des trois niveaux connus
 * retombe sur « Normal » : une valeur farfelue ne doit pas rendre une carte
 * inclassable.
 */
export function normalizePriority(value: unknown): Priority {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  return isPriority(n) ? n : DEFAULT_PRIORITY
}

/** Nettoie une quantité saisie par l'utilisateur. */
export function normalizeQuantity(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n)) return 1
  return Math.min(999, Math.max(1, Math.trunc(n)))
}

/**
 * Compteur optionnel : durée, poids, nombre de fichiers ou de pièces.
 *
 * Zéro devient `null` : sur ces cartes, « 0 minute » ne veut rien dire, c'est
 * « pas renseigné ». Les plateformes emploient d'ailleurs zéro dans ce sens.
 */
export function normalizeCount(value: unknown, max: number): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.min(max, Math.trunc(n))
}

/** Bornes hautes, larges mais finies, pour écarter les saisies absurdes. */
export const LIMITS = {
  colorCount: 16,
  printMinutes: 100_000, // ~69 jours
  filamentGrams: 100_000, // 100 kg
  fileCount: 10_000,
  pieceCount: 10_000,
} as const

/** Champ texte optionnel : chaîne vide et espaces seuls deviennent null. */
export function normalizeText(value: unknown, maxLength = 2000): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}
