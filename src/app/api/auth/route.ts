import { NextResponse } from 'next/server'
import { SESSION_COOKIE, isValidPin, sessionCookieOptions, sessionToken } from '@/lib/auth'
import { checkLimit, clearFailures, clientIp, recordFailure } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const ip = clientIp(request)

  // Le code d'accès est court et l'adresse du site est publique : sans plafond,
  // toutes les combinaisons y passeraient en quelques heures.
  const limit = await checkLimit(ip)
  if (limit.blocked) {
    return NextResponse.json(
      {
        error: `Trop d'essais. Réessayez dans ${Math.ceil(limit.retryAfterSeconds / 60)} min.`,
      },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  let pin = ''
  try {
    const body = (await request.json()) as { pin?: unknown }
    pin = typeof body.pin === 'string' ? body.pin.trim() : ''
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  if (!pin) {
    return NextResponse.json({ error: 'Entrez le code.' }, { status: 400 })
  }

  try {
    if (!isValidPin(pin)) {
      await recordFailure(ip)
      return NextResponse.json({ error: 'Code incorrect.' }, { status: 401 })
    }

    await clearFailures(ip)
    const response = NextResponse.json({ ok: true })
    response.cookies.set(SESSION_COOKIE, sessionToken(), sessionCookieOptions)
    return response
  } catch {
    // Configuration incomplète : on ne compte pas cet essai comme une faute.
    return NextResponse.json(
      { error: "L'application n'est pas configurée (APP_PIN / APP_SECRET)." },
      { status: 500 },
    )
  }
}

/** Déconnexion : utile pour tester, et pour reprendre la main sur un appareil prêté. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions, maxAge: 0 })
  return response
}
