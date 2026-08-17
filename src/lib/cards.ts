import { STATUSES, type Status } from '@/db/schema'

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

/** Nettoie une quantité saisie par l'utilisateur. */
export function normalizeQuantity(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n)) return 1
  return Math.min(999, Math.max(1, Math.trunc(n)))
}

/**
 * Échéance au format `AAAA-MM-JJ`. On refuse tout le reste plutôt que de laisser
 * Postgres interpréter une chaîne ambiguë comme « 03/04/2026 ».
 */
export function normalizeDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  // Écarte les dates inexistantes (31 février…), que le format seul laisse passer.
  const parsed = new Date(`${trimmed}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    return null
  }
  return trimmed
}

/** Champ texte optionnel : chaîne vide et espaces seuls deviennent null. */
export function normalizeText(value: unknown, maxLength = 2000): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}
