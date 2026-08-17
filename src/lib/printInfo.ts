/**
 * Mise en forme du coût d'impression : durée, filament, matière, découpage.
 *
 * Ces valeurs arrivent des plateformes quand elles les publient (voir
 * `metadata.ts`) et restent modifiables à la main — la mise en forme doit donc
 * traiter aussi bien « 3 h 14 » venu de Printables qu'un chiffre rond saisi
 * après un passage au trancheur.
 */

/** Durée compacte : « 45 min », « 3 h 14 », « 35 h 33 ». */
export function formatPrintTime(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  // Minutes sur deux chiffres : « 3 h 04 » se lit sans ambiguïté, « 3 h 4 » non.
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`
}

/** Filament : « 52 g », et en kilos dès que le gramme n'apporte plus rien. */
export function formatFilament(grams: number | null): string | null {
  if (!grams || grams <= 0) return null
  if (grams < 1000) return `${grams} g`
  return `${(grams / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kg`
}

type PrintFields = {
  printMinutes: number | null
  filamentGrams: number | null
  material: string | null
  fileCount: number | null
  pieceCount: number | null
}

/**
 * Ce que le filament coûte, au prix du kilo donné. Rien sans les deux.
 *
 * Toujours pour **une** pièce, comme la durée et le poids affichés à côté : les
 * quantités sont prises en compte dans les totaux de colonne, où le mot
 * « total » lève l'ambiguïté.
 */
export function formatFilamentCost(grams: number | null, pricePerKg: number | null): string | null {
  if (!grams || grams <= 0 || !pricePerKg || pricePerKg <= 0) return null
  return formatEuros((grams / 1000) * pricePerKg)
}

/**
 * Montant en euros, précédé d'un tilde : c'est une estimation, calculée sur un
 * poids que la plateforme arrondit et un prix moyen. Autant le dire.
 */
export function formatEuros(amount: number): string {
  // Sous dix centimes, deux décimales ne veulent plus rien dire.
  const arrondi = amount < 0.1 ? 0.1 : amount
  return `~${arrondi.toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: arrondi < 10 ? 2 : 0,
  })}`
}

/**
 * Ce que représente une colonne : combien de modèles, et le temps machine et le
 * filament que ça demande — quantités comprises, cette fois.
 */
export function columnTotals(
  cards: Array<PrintFields & { quantity: number; multiColor?: boolean }>,
  pricePerKg: number | null,
): string[] {
  let minutes = 0
  let grams = 0
  let canvas = 0
  for (const card of cards) {
    minutes += (card.printMinutes ?? 0) * card.quantity
    grams += (card.filamentGrams ?? 0) * card.quantity
    if (card.multiColor) canvas += 1
  }

  const parts: string[] = []
  const time = formatPrintTime(minutes)
  if (time) parts.push(time)
  const filament = formatFilament(grams)
  if (filament) parts.push(filament)
  const cost = formatFilamentCost(grams, pricePerKg)
  if (cost) parts.push(cost)
  // Prévient qu'il faudra monter le Canvas avant de lancer la série.
  if (canvas > 0) parts.push(canvas === 1 ? '1 en multi-couleur' : `${canvas} en multi-couleur`)
  return parts
}

/**
 * Le coût d'impression en une ligne : « 1 h 33 · 52 g · PETG ».
 *
 * Renvoie une liste plutôt qu'une chaîne : l'appelant choisit son séparateur et
 * sait, sur une liste vide, qu'il n'a rien à afficher du tout.
 */
export function printCostParts(card: PrintFields): string[] {
  const parts: string[] = []
  const time = formatPrintTime(card.printMinutes)
  if (time) parts.push(time)
  const filament = formatFilament(card.filamentGrams)
  if (filament) parts.push(filament)
  if (card.material) parts.push(card.material)
  return parts
}

/** « 8 pièces », pour prévenir qu'il y a un assemblage. Tait la pièce unique. */
export function formatPieces(pieceCount: number | null): string | null {
  if (!pieceCount || pieceCount <= 1) return null
  return `${pieceCount} pièces`
}

/** « 22 fichiers ». Tait le fichier unique, qui va de soi. */
export function formatFiles(fileCount: number | null): string | null {
  if (!fileCount || fileCount <= 1) return null
  return `${fileCount} fichiers`
}

/** Y a-t-il quoi que ce soit à afficher ? */
export function hasPrintInfo(card: PrintFields): boolean {
  return printCostParts(card).length > 0 || Boolean(formatPieces(card.pieceCount))
}
