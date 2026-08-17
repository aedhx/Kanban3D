/**
 * Les icônes de l'application, rassemblées ici.
 *
 * Un seul endroit à modifier pour changer un pictogramme, et les composants
 * portent des noms qui disent l'usage (`IconOverdue`) plutôt que la forme
 * (`Warning`).
 *
 * Jeu d'icônes : Phosphor Icons (https://phosphoricons.com), licence MIT.
 * `next.config.ts` réécrit ces imports vers les modules individuels
 * (`optimizePackageImports`) pour ne pas embarquer la bibliothèque entière.
 */
export {
  ArrowRight as IconMovedBy,
  ArrowSquareOut as IconExternalLink,
  CalendarBlank as IconDueDate,
  CaretLeft as IconPrevious,
  CaretRight as IconNext,
  ChatCircleText as IconComments,
  Clock as IconPrintTime,
  CloudSlash as IconOffline,
  PaperPlaneRight as IconSend,
  Plus as IconAdd,
  PuzzlePiece as IconPieces,
  Trash as IconDelete,
  UserSwitch as IconIdentity,
  Warning as IconOverdue,
  X as IconClose,
} from '@phosphor-icons/react'
