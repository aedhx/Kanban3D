import { NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { resolveTransport } from '@/lib/notify'
import { notificationConfig } from '@/lib/notifySettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Envoie un vrai message, et rapporte ce que le service répond.
 *
 * C'est la pièce qui manquait : jusqu'ici, une configuration fausse se
 * manifestait par une notification qui n'arrivait jamais, sans rien dire. Or les
 * échecs sont presque toujours les mêmes — un `chat_id` recopié sans son signe
 * moins, un bot jamais ajouté au groupe, un webhook Discord expiré — et le service
 * les explique très bien quand on veut bien répéter sa réponse.
 */
export async function POST() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }

  const config = await notificationConfig()
  const transport = resolveTransport(config)
  if (!transport) {
    return NextResponse.json({
      ok: false,
      error: 'Aucune destination configurée : choisissez-en une et enregistrez.',
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
