import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

export const SESSION_COOKIE = 'kanban3d_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // un an

/**
 * Comparaison à temps constant. On passe les deux valeurs au hachage avant de
 * comparer : `timingSafeEqual` exige des longueurs identiques, et hacher évite
 * de divulguer la longueur du PIN.
 */
function safeEquals(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

function requireEnv(): { pin: string; secret: string } {
  const pin = process.env.APP_PIN
  const secret = process.env.APP_SECRET
  if (!pin || !secret) {
    throw new Error(
      'APP_PIN et APP_SECRET doivent être définies. Voir .env.example.',
    )
  }
  return { pin, secret }
}

/**
 * Jeton de session : la signature du PIN par le secret du serveur. Le PIN
 * lui-même ne quitte jamais le serveur, et changer le PIN invalide
 * automatiquement toutes les sessions ouvertes — sans rien stocker en base.
 */
export function sessionToken(): string {
  const { pin, secret } = requireEnv()
  return createHmac('sha256', secret).update(pin).digest('hex')
}

export function isValidPin(candidate: string): boolean {
  const { pin } = requireEnv()
  return safeEquals(candidate, pin)
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies()
  const value = store.get(SESSION_COOKIE)?.value
  if (!value) return false
  try {
    return safeEquals(value, sessionToken())
  } catch {
    // Configuration incomplète : on refuse plutôt que de laisser passer.
    return false
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: COOKIE_MAX_AGE,
}
