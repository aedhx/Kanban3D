/** Nombre de jours au-delà duquel une carte terminée passe en archive. */
export const ARCHIVE_AFTER_DAYS = 30

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
