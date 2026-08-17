import { NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { fetchModelMetadata } from '@/lib/metadata'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }

  let url = ''
  try {
    const body = (await request.json()) as { url?: unknown }
    url = typeof body.url === 'string' ? body.url.trim() : ''
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  if (!url) {
    return NextResponse.json({ error: 'URL manquante.' }, { status: 400 })
  }

  // fetchModelMetadata ne lève jamais : au pire elle renvoie resolved: false.
  return NextResponse.json(await fetchModelMetadata(url))
}
