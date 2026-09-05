import type { Printer } from '@/db/schema'
import { sharePageUrl } from './printer'

/**
 * Ce que le navigateur a le droit de savoir de l'imprimante.
 *
 * Ce mappage vit seul dans son fichier parce qu'il a deux appelants — la route
 * `/api/printer` et le premier rendu de la page — et qu'un champ ajouté d'un côté
 * seulement se voit tard : le bandeau se peuple bien au chargement, puis change
 * d'avis vingt secondes plus tard, au premier rafraîchissement.
 *
 * Les deux secrets n'en font pas partie : on dit seulement s'ils sont posés. Une
 * clé qui repart vers le navigateur finit dans un cache, une capture d'écran ou un
 * journal — autant ne jamais la laisser sortir.
 */
export function printerToView(ligne: Printer) {
  return {
    name: ligne.name,
    configured: Boolean(ligne.statusUrl),
    /*
     * L'adresse elle-même ne sort pas d'ici. Un « Live Link » ne demande aucune
     * authentification : le posséder suffit à lire l'imprimante et sa webcam.
     * C'est donc un secret comme un autre, et il n'a rien à faire dans la réponse
     * que le tableau reçoit toutes les vingt secondes. La page de réglages, qui en
     * a besoin pour l'afficher, va le chercher côté serveur.
     */
    hasSecret: Boolean(ligne.statusSecret),
    hasWebhookToken: Boolean(ligne.webhookToken),
    /*
     * Y a-t-il une page OctoEverywhere où envoyer ? On dit oui ou non, jamais
     * l'adresse : c'est `/api/printer/live` qui l'emmène, par une redirection.
     * Faux pour une Shared Connection, qui n'a pas de page de partage.
     */
    hasSharePage: Boolean(ligne.statusUrl && sharePageUrl(ligne.statusUrl)),
    autoAdvance: ligne.autoAdvance,
    state: ligne.state,
    statusColor: ligne.statusColor,
    printing: ligne.printing,
    progress: ligne.progress,
    currentLayer: ligne.currentLayer,
    totalLayers: ligne.totalLayers,
    timeLeftSec: ligne.timeLeftSec,
    durationSec: ligne.durationSec,
    fileName: ligne.fileName,
    nozzleTemp: ligne.nozzleTemp,
    bedTemp: ligne.bedTemp,
    gadgetStatus: ligne.gadgetStatus,
    gadgetColor: ligne.gadgetColor,
    seenAt: ligne.seenAt?.toISOString() ?? null,
    lastError: ligne.lastError,
  }
}

export type PrinterView = ReturnType<typeof printerToView>
