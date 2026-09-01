/**
 * Ce qui peut déclencher une notification, et sous quelle case ça se coche.
 *
 * Ce fichier ne dépend de rien — ni de la base, ni du réseau. C'est ce qui lui
 * permet d'être importé par la page de réglages, qui tourne dans le navigateur :
 * `notify.ts` y traîne `notifySettings.ts`, donc le pilote Postgres, et le
 * paquet refuse alors de se construire (« Can't resolve 'net' »).
 */

export type NotificationEvent =
  | { kind: 'created'; title: string; by: string; quantity: number; color: string | null }
  /**
   * `byPrinter` sépare le déplacement fait à la main de celui que la machine
   * décide. Le message est le même — c'est bien un déplacement — mais on ne se
   * tait pas sur les deux pour les mêmes raisons : les siens sont prévisibles,
   * ceux de la machine annoncent qu'une impression a commencé ou fini.
   */
  | { kind: 'moved'; title: string; by: string; from: string; to: string; byPrinter?: boolean }
  | { kind: 'commented'; title: string; by: string; body: string }
  | { kind: 'declined'; title: string; by: string; reason: string }
  /**
   * Ce que l'imprimante signale et qu'aucune carte ne porte : une impression
   * échouée, ou un doute de Gadget. Un déplacement de carte couvre déjà le départ
   * et la fin — inutile de le dire deux fois.
   */
  | { kind: 'printer'; text: string }

/**
 * Les six événements qui peuvent partir, et le libellé sous lequel on les propose.
 *
 * Une seule liste, deux usages — le filtre à l'envoi et les cases dans les
 * réglages. En tenir deux reviendrait à ce qu'un jour l'une propose de taire
 * quelque chose que l'autre ne sait pas taire.
 *
 * L'ordre est celui de la page : ce qui vient des gens d'abord, la machine ensuite.
 */
export const TRIGGERS = [
  { key: 'created', label: 'Une demande arrive' },
  { key: 'moved', label: 'Une carte est déplacée à la main' },
  { key: 'printerMoved', label: 'L’imprimante fait avancer une carte' },
  { key: 'commented', label: 'Un message dans une discussion' },
  { key: 'declined', label: 'Une demande est refusée' },
  { key: 'printer', label: 'Un problème sur l’imprimante' },
] as const

export type TriggerKey = (typeof TRIGGERS)[number]['key']

export const TRIGGER_KEYS: readonly string[] = TRIGGERS.map((t) => t.key)

/** Sous quelle clé cet événement se coche dans les réglages. */
export function triggerKey(event: NotificationEvent): TriggerKey {
  if (event.kind === 'moved') return event.byPrinter ? 'printerMoved' : 'moved'
  return event.kind
}

/**
 * Cet événement doit-il partir ?
 *
 * `null` veut dire « tous » — l'état d'avant ce réglage, et celui d'une base qui
 * n'a jamais vu la page. Une liste vide, elle, veut dire « aucun » : on peut tout
 * taire délibérément sans effacer la destination.
 */
export function shouldSend(event: NotificationEvent, events: string[] | null): boolean {
  return events === null || events.includes(triggerKey(event))
}
