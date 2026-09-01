/**
 * Ce que le tableau fait de lui-même quand l'imprimante change d'état.
 *
 * Le tableau savait déjà *afficher* ce que fait la machine ; il ne s'en servait
 * pas. Ici, il s'en sert : quand une impression démarre, la carte correspondante
 * passe en « En impression » ; quand elle se termine, la carte passe en « Fait »,
 * reçoit le filament réellement consommé, et une photo si OctoEverywhere en a une.
 *
 * **Un seul endroit pour deux appelants.** La lecture directe (`GET /api/printer`)
 * et le webhook écrivent tous deux la ligne `printer` ; si chacun détectait les
 * transitions de son côté, une impression suivie par les deux voies serait comptée
 * deux fois. Tout passe donc par `appliquerLecture()`.
 *
 * ## Ce qui est délibérément prudent
 *
 * Rapprocher un nom de fichier d'un titre de carte est une heuristique, pas une
 * vérité. Elle se trompera. Les garde-fous sont donc là pour que se tromper ne
 * coûte rien :
 *
 * - il faut **exactement une** carte candidate — zéro ou deux, on ne touche à rien ;
 * - une carte refusée n'est jamais déplacée ;
 * - `cancelled` et `error` ne remplissent jamais « Fait » : une impression ratée
 *   n'est pas un travail terminé, et le bandeau le dit déjà ;
 * - une photo prise par un humain n'est jamais écrasée ;
 * - et tout cela se coupe d'un interrupteur dans les réglages.
 *
 * Au pire, une carte se retrouve dans la mauvaise colonne — ce qu'un clic corrige.
 */
import { and, desc, eq, isNull } from 'drizzle-orm'
import { getDb } from '@/db'
import { STATUS_LABELS, cardPhotos, cards, printer, type Printer } from '@/db/schema'
import { positionBetween } from './cards'
import { notify } from './notify'
import { fetchImage, looksLikeSameJob, type PrinterReading } from './printer'

/** Les états qui disent qu'une impression s'est bien terminée. */
const TERMINÉ = new Set(['complete', 'completed', 'printdone'])

/** Ceux qui disent qu'elle s'est mal terminée : à signaler, pas à ranger. */
const ÉCHOUÉ = new Set(['error', 'printfailed', 'printerneedsattention'])

const clé = (state: string | null) => (state ?? '').toLowerCase().replace(/[^a-z]/g, '')

/**
 * Applique une nouvelle lecture à la ligne d'imprimante, et fait avancer le
 * tableau si l'état l'exige.
 *
 * Renvoie la ligne mise à jour, celle que l'appelant renverra au navigateur.
 */
export async function appliquerLecture(
  avant: Printer,
  lecture: Partial<PrinterReading>,
  { partiel = false }: { partiel?: boolean } = {},
): Promise<Printer> {
  const db = getDb()

  /*
   * Deux régimes, et la différence compte.
   *
   * Une **lecture complète** fait autorité : elle décrit l'état entier de la
   * machine, donc un champ absent veut dire « il n'y en a plus ». Sans quoi une
   * alerte Gadget resterait affichée pour toujours, la machine ayant beau être
   * revenue au vert.
   *
   * Un **webhook** est partiel : un événement de progression ne dit rien des
   * températures, et écraser les dernières connues par des `null` ferait clignoter
   * le bandeau à chaque appel.
   */
  const champs: Partial<typeof printer.$inferInsert> = {
    seenAt: new Date(),
    lastError: null,
    updatedAt: new Date(),
  }
  for (const [nom, valeur] of Object.entries(lecture)) {
    // `trackedImageUrl` ne va pas en base : il ne sert qu'ici, tout de suite.
    if (nom === 'trackedImageUrl') continue
    if (valeur === undefined) continue
    if (partiel && valeur === null) continue
    Object.assign(champs, { [nom]: valeur })
  }

  const [après] = await db.update(printer).set(champs).where(eq(printer.id, 1)).returning()

  if (avant.autoAdvance) {
    await avancerLeTableau(avant, après, lecture)
  }
  await signalerLesEnnuis(avant, après)

  return après
}

/** Départ et fin d'impression, vus comme des déplacements de cartes. */
async function avancerLeTableau(
  avant: Printer,
  après: Printer,
  lecture: Partial<PrinterReading>,
): Promise<void> {
  const nouveauFichier = après.fileName
  const changementDeFichier = nouveauFichier !== avant.fileName

  // --- Départ : la machine se met à imprimer quelque chose de nouveau.
  if (après.printing && nouveauFichier && (!avant.printing || changementDeFichier)) {
    const carte = await carteUnique(nouveauFichier, 'todo')
    if (carte) await déplacer(carte, 'printing', après.name)
    return
  }

  /*
   * --- Fin : on imprimait, et c'est terminé. Le nom du fichier est celui d'avant
   * quand la machine l'a déjà oublié — c'est fréquent, l'état passe à « terminée »
   * en même temps que le fichier disparaît.
   */
  const fini = TERMINÉ.has(clé(après.state))
  if (fini && avant.printing) {
    const fichier = nouveauFichier ?? avant.fileName
    if (!fichier) return
    const carte = await carteUnique(fichier, 'printing')
    if (!carte) return

    /*
     * Un objet en plusieurs morceaux s'imprime en plusieurs fois. Le classer en
     * « Fait » à la première pièce serait un mensonge — et c'est exactement ce que
     * ferait un rapprochement par nom de fichier, les trois fichiers d'un même
     * objet ressemblant tous à son titre. On compte donc les pièces, et on ne
     * classe qu'à la dernière.
     *
     * Une carte, pas trois : une carte maître et des sous-cartes fausseraient tous
     * les comptes du tableau — le décompte des colonnes, les totaux, la priorité.
     */
    const total = carte.pieceCount ?? 1
    const faites = Math.min(total, carte.piecesDone + 1)
    const terminé = faites >= total

    /*
     * Le filament tel que la machine l'a compté. Il l'emporte sur la valeur
     * déclarée : celle de la plateforme est l'estimation d'un auteur, celle-ci sort
     * de la buse. Sur plusieurs pièces on cumule — mais seulement à partir du
     * moment où c'est nous qui comptons, pour ne pas ajouter une mesure à une
     * estimation.
     */
    const mesuré = après.filamentUsedMg ? Math.round(après.filamentUsedMg / 1000) : null
    const filament =
      mesuré === null
        ? {}
        : { filamentGrams: carte.piecesDone === 0 ? mesuré : (carte.filamentGrams ?? 0) + mesuré }

    if (!terminé) {
      // La carte reste en « En impression » : il reste des morceaux à sortir.
      await avancerLesPièces(carte, faites, filament)
      return
    }

    await déplacer(carte, 'done', après.name, { ...filament, piecesDone: faites })
    await photographier(carte.id, lecture.trackedImageUrl ?? null, après.statusUrl)
  }
}

/**
 * Une pièce de plus, sans quitter la colonne.
 *
 * Pas de notification : ce n'est pas un déplacement, et prévenir à chaque morceau
 * d'un objet en dix pièces ferait dix messages pour un seul objet.
 */
async function avancerLesPièces(
  carte: { id: string },
  faites: number,
  extra: Partial<typeof cards.$inferInsert>,
): Promise<void> {
  await getDb()
    .update(cards)
    .set({ piecesDone: faites, updatedAt: new Date(), ...extra })
    .where(eq(cards.id, carte.id))
}

/** La carte de cette colonne qui correspond à ce fichier — s'il n'y en a qu'une. */
async function carteUnique(
  fileName: string,
  status: 'todo' | 'printing',
): Promise<{
  id: string
  title: string
  status: string
  pieceCount: number | null
  piecesDone: number
  filamentGrams: number | null
} | null> {
  const db = getDb()
  const candidates = await db
    .select({
      id: cards.id,
      title: cards.title,
      status: cards.status,
      pieceCount: cards.pieceCount,
      piecesDone: cards.piecesDone,
      filamentGrams: cards.filamentGrams,
    })
    .from(cards)
    // Une carte refusée reste où elle est : la machine n'a pas à contredire un non.
    .where(and(eq(cards.status, status), isNull(cards.declinedReason)))

  const correspond = candidates.filter((c) => looksLikeSameJob(fileName, c.title))
  // Deux cartes qui se ressemblent, c'est une ambiguïté : on préfère ne rien faire
  // plutôt que d'en déplacer une au hasard.
  return correspond.length === 1 ? correspond[0] : null
}

/** Déplace la carte, comme le ferait une main — notification comprise. */
async function déplacer(
  carte: { id: string; title: string; status: string },
  vers: 'printing' | 'done',
  parQui: string,
  extra: Partial<typeof cards.$inferInsert> = {},
): Promise<void> {
  const db = getDb()

  /*
   * En fin de colonne d'arrivée : la dernière lancée est la dernière de la file.
   * `positionBetween(max, undefined)` donne la même chose qu'un dépôt tout en bas
   * à la main — c'est la fonction que le glisser-déposer utilise déjà.
   */
  const [dernière] = await db
    .select({ position: cards.position })
    .from(cards)
    .where(eq(cards.status, vers))
    .orderBy(desc(cards.position))
    .limit(1)

  await db
    .update(cards)
    .set({
      status: vers,
      position: positionBetween(dernière?.position, undefined),
      lastMovedBy: parQui,
      doneAt: vers === 'done' ? new Date() : null,
      updatedAt: new Date(),
      ...extra,
    })
    .where(eq(cards.id, carte.id))

  await notify({
    kind: 'moved',
    // C'est la machine qui décide, pas une main : ça se tait séparément.
    byPrinter: true,
    title: carte.title,
    by: parQui,
    from: STATUS_LABELS[carte.status as keyof typeof STATUS_LABELS] ?? carte.status,
    to: STATUS_LABELS[vers],
  })
}

/**
 * La photo de ce qui vient de sortir.
 *
 * D'abord l'image qu'OctoEverywhere garde d'une impression terminée ; à défaut, la
 * webcam, prise maintenant — la pièce est encore sur le plateau.
 *
 * Silencieux en cas d'échec : ne pas avoir de photo n'empêche rien, et la carte
 * garde l'image du modèle.
 */
async function photographier(
  cardId: string,
  imageDeFin: string | null,
  statusUrl: string | null,
): Promise<void> {
  const db = getDb()

  // Une photo prise par un humain est délibérée : on ne passe pas devant.
  const [déjà] = await db
    .select({ cardId: cardPhotos.cardId })
    .from(cardPhotos)
    .where(eq(cardPhotos.cardId, cardId))
  if (déjà) return

  const image = await fetchImage(imageDeFin, statusUrl)
  if (!image) return

  await db
    .insert(cardPhotos)
    .values({ cardId, mime: image.mime, bytes: image.bytes })
    .onConflictDoNothing()
  await db.update(cards).set({ photoAt: new Date() }).where(eq(cards.id, cardId))
}

/**
 * Ce que l'imprimante signale et qu'aucun déplacement de carte ne porte : une
 * impression échouée, un doute de Gadget.
 *
 * Le départ et la fin sont déjà annoncés par le déplacement de la carte — le
 * répéter ferait deux messages pour un événement.
 */
async function signalerLesEnnuis(avant: Printer, après: Printer): Promise<void> {
  const nom = après.fileName ?? avant.fileName

  if (ÉCHOUÉ.has(clé(après.state)) && !ÉCHOUÉ.has(clé(avant.state))) {
    await notify({
      kind: 'printer',
      text: `🔴 Impression interrompue${nom ? ` : « ${nom} »` : ''} — ${après.state}`,
    })
    return
  }

  /*
   * Gadget passe à l'orange ou au rouge : c'est le moment où quelqu'un doit aller
   * regarder. On ne le redit pas tant que la couleur ne change pas.
   */
  const alerte = après.gadgetColor === 'y' || après.gadgetColor === 'r'
  if (alerte && après.gadgetColor !== avant.gadgetColor) {
    await notify({
      kind: 'printer',
      text: `🟡 Gadget signale ${après.gadgetStatus ?? 'quelque chose'}${nom ? ` sur « ${nom} »` : ''}`,
    })
  }
}
