/** Nombre de jours au-delà duquel une carte terminée passe en archive. */
export const ARCHIVE_AFTER_DAYS = 30

/** Jours restants avant l'échéance : 0 aujourd'hui, négatif si dépassée. */
export function daysUntil(isoDate: string, now = new Date()): number {
  // On compare des jours calendaires, pas des instants : « demain » reste
  // « demain » qu'il soit 8 h ou 23 h.
  const target = new Date(`${isoDate}T00:00:00`)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

export type DueState = 'overdue' | 'today' | 'soon' | 'later'

export function dueState(isoDate: string, now = new Date()): DueState {
  const days = daysUntil(isoDate, now)
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days <= 7) return 'soon'
  return 'later'
}

/** Formulation courte pour la carte : « en retard », « demain », « dans 5 j »… */
export function formatDue(isoDate: string, now = new Date()): string {
  const days = daysUntil(isoDate, now)
  if (days < -1) return `${-days} j de retard`
  if (days === -1) return 'hier'
  if (days === 0) return "aujourd'hui"
  if (days === 1) return 'demain'
  if (days <= 30) return `dans ${days} j`
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  })
}

/** Date absolue, pour la modale où l'on a la place. */
export function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

/** Horodatage relatif compact pour les messages : « il y a 2 h », « il y a 3 j ». */
export function timeAgo(iso: string, now = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return "à l'instant"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.round(hours / 24)
  if (days < 30) return `il y a ${days} j`
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/** Une carte terminée depuis assez longtemps pour sortir de la vue courante. */
export function isArchived(doneAt: string | null, now = new Date()): boolean {
  if (!doneAt) return false
  const days = (now.getTime() - new Date(doneAt).getTime()) / 86_400_000
  return days > ARCHIVE_AFTER_DAYS
}
