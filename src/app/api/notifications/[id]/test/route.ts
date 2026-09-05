import { NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { resolveTransport } from '@/lib/notify'
import { readTarget, targetToConfig } from '@/lib/notifySettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Envoie un vrai message vers **une** destination, et rapporte ce que le service
 * répond.
 *
 * C'est la pièce qui manquait : jusqu'ici, une configuration fausse se
 * manifestait par une notification qui n'arrivait jamais, sans rien dire. Or les
 * échecs sont presque toujours les mêmes — un `chat_id` recopié sans son signe
 * moins, un bot jamais ajouté au groupe, un webhook Discord expiré — et le service
 * les explique très bien quand on veut bien répéter sa réponse.
 *
 * Le test ignore volontairement le choix des événements : c'est la destination
 * qu'on éprouve, pas le filtre. Une destination dont toutes les cases sont
 * décochées doit donc pouvoir être testée — sinon on ne saurait plus distinguer
 * « je l'ai fait taire » de « elle est cassée ».
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }

  const { id } = await params
  const ligne = await readTarget(id)
  if (!ligne) {
    return NextResponse.json({ error: 'Destination inconnue.' }, { status: 404 })
  }

  const transport = resolveTransport(targetToConfig(ligne))
  if (!transport) {
    return NextResponse.json({
      ok: false,
      error: 'Cette destination est incomplète : il lui manque de quoi envoyer.',
    })
  }

  try {
    await transport.send('🔔 Test depuis Kanban3D — si vous lisez ceci, c’est branché.')
    return NextResponse.json({ ok: true, transport: transport.name })
  } catch (cause) {
    return NextResponse.json({
      ok: false,
      transport: transport.name,
      error: `${transport.name} a refusé l’envoi.`,
      hint: (cause instanceof Error ? cause.message : String(cause)).slice(0, 300),
    })
  }
}
