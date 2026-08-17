/**
 * Réglages qui n'ont pas mérité un écran.
 *
 * Ce sont des variables d'environnement : à deux utilisateurs, une page de
 * préférences coûterait plus cher à maintenir qu'elle ne rapporte, et ces
 * valeurs ne changent pas d'une semaine à l'autre.
 */

/**
 * Prix du kilo de filament, pour estimer ce qu'une impression coûte.
 *
 * Absent, aucun prix n'est affiché : mieux vaut ne rien dire qu'avancer un
 * chiffre tiré d'une moyenne inventée. Accepte la virgule décimale.
 */
export function filamentPricePerKg(): number | null {
  const raw = process.env.FILAMENT_PRICE_PER_KG?.trim()
  if (!raw) return null
  const value = Number.parseFloat(raw.replace(',', '.'))
  return Number.isFinite(value) && value > 0 ? value : null
}
