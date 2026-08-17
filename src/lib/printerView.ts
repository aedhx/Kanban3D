import type { Printer } from '@/db/schema'

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
    statusUrl: ligne.statusUrl,
    hasSecret: Boolean(ligne.statusSecret),
    hasWebhookToken: Boolean(ligne.webhookToken),
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
    seenAt: ligne.seenAt?.toISOString() ?? null,
    lastError: ligne.lastError,
  }
}

export type PrinterView = ReturnType<typeof printerToView>
