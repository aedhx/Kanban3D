import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { getDb } from '@/db'
import { authAttempts } from '@/db/schema'

/**
 * Bridage des essais de connexion — **désactivé par défaut**.
 *
 * Le tableau n'est protégé que par un code court, et l'adresse du site est
 * publique : sans bridage, toutes les combinaisons d'un code à cinq chiffres
 * s'épuisent en quelques heures. Le risque reste faible tant que personne ne
 * cherche l'URL, d'où le choix de ne rien imposer.
 *
 * Pour l'activer, poser `AUTH_RATE_LIMIT=on` dans les variables
 * d'environnement Netlify. Rien d'autre à faire : la table existe déjà, créée
 * par les migrations.
 *
 * Désactivé, le chemin de connexion ne touche pas du tout à la base.
 */
export function rateLimitEnabled(): boolean {
  const value = process.env.AUTH_RATE_LIMIT?.trim().toLowerCase()
  return value === 'on' || value === 'true' || value === '1'
}

/** Nombre d'essais ratés tolérés par adresse avant blocage temporaire. */
export const MAX_FAILURES = 8

/** Durée de la fenêtre glissante, et donc du blocage. */
export const WINDOW_MINUTES = 15

/**
 * Délai ajouté à chaque essai raté. Même adresses tournantes, il plafonne le
 * débit d'une attaque : sans lui, le seul coût d'un essai serait le réseau.
 */
const FAILURE_DELAY_MS = 400

/**
 * Adresse de l'appelant. Netlify pose `x-nf-client-connection-ip` ; on retient
 * `x-forwarded-for` en secours, et un seau commun quand rien n'est disponible —
 * mieux vaut brider trop large que ne rien brider.
 */
export function clientIp(request: Request): string {
  const netlify = request.headers.get('x-nf-client-connection-ip')
  if (netlify) return netlify

  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()

  return 'inconnue'
}

function windowStart(): Date {
  return new Date(Date.now() - WINDOW_MINUTES * 60_000)
}

export type LimitVerdict = { blocked: boolean; retryAfterSeconds: number }

/**
 * L'adresse a-t-elle épuisé ses essais ?
 *
 * En cas de panne de la base, on laisse passer : un problème de stockage ne doit
 * pas empêcher les deux utilisateurs légitimes d'entrer. Le code reste exigé de
 * toute façon.
 */
export async function checkLimit(ip: string): Promise<LimitVerdict> {
  if (!rateLimitEnabled()) return { blocked: false, retryAfterSeconds: 0 }

  try {
    const db = getDb()

    // Purge opportuniste : évite une tâche planifiée pour trois lignes.
    await db.delete(authAttempts).where(lt(authAttempts.createdAt, windowStart()))

    const [row] = await db
      .select({
        failures: sql<number>`count(*)::int`,
        oldest: sql<Date | null>`min(${authAttempts.createdAt})`,
      })
      .from(authAttempts)
      .where(and(eq(authAttempts.ip, ip), gte(authAttempts.createdAt, windowStart())))

    if (!row || row.failures < MAX_FAILURES) return { blocked: false, retryAfterSeconds: 0 }

    // Le blocage se lève quand l'essai le plus ancien sort de la fenêtre.
    const oldest = row.oldest ? new Date(row.oldest).getTime() : Date.now()
    const remaining = Math.ceil((oldest + WINDOW_MINUTES * 60_000 - Date.now()) / 1000)
    return { blocked: true, retryAfterSeconds: Math.max(1, remaining) }
  } catch (error) {
    console.warn(
      '[rateLimit] vérification impossible, on laisse passer :',
      error instanceof Error ? error.message : error,
    )
    return { blocked: false, retryAfterSeconds: 0 }
  }
}

/** Enregistre un essai raté, et fait patienter l'appelant. */
export async function recordFailure(ip: string): Promise<void> {
  if (!rateLimitEnabled()) return

  try {
    await getDb().insert(authAttempts).values({ ip })
  } catch {
    // Sans trace on ne bride plus, mais on refuse toujours le mauvais code.
  }
  await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS))
}

/** Efface l'ardoise après une connexion réussie : les fautes de frappe s'oublient. */
export async function clearFailures(ip: string): Promise<void> {
  if (!rateLimitEnabled()) return

  try {
    await getDb().delete(authAttempts).where(eq(authAttempts.ip, ip))
  } catch {
    // Sans conséquence : les lignes expireront d'elles-mêmes.
  }
}
