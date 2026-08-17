/**
 * Où trouver la chaîne de connexion Postgres.
 *
 * Netlify a changé de nom de variable au fil de ses versions, et le nom dépend
 * donc de la date à laquelle la base a été provisionnée :
 *
 * - `NETLIFY_DB_URL` — Netlify Database, version actuelle (disponibilité
 *   générale depuis avril 2026), disponible aux builds comme aux fonctions ;
 * - `NETLIFY_DATABASE_URL` — l'ancienne extension « Netlify DB », encore en
 *   service sur les sites configurés à l'époque de la bêta ;
 * - `DATABASE_URL` — la convention générale, utilisée en local et par la
 *   plupart des autres hébergeurs.
 *
 * On accepte les trois, en donnant la priorité à `DATABASE_URL` : posée
 * explicitement, elle traduit une intention et doit pouvoir servir à pointer
 * ailleurs le temps d'un essai.
 */
export const DATABASE_URL_VARIABLES = [
  'DATABASE_URL',
  'NETLIFY_DB_URL',
  'NETLIFY_DATABASE_URL',
] as const

export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  for (const name of DATABASE_URL_VARIABLES) {
    const value = env[name]?.trim()
    if (value) return value
  }
  return undefined
}

/** Message d'erreur commun, qui nomme les variables réellement examinées. */
export function missingDatabaseUrlMessage(): string {
  return (
    `Aucune chaîne de connexion trouvée. Variables examinées : ` +
    `${DATABASE_URL_VARIABLES.join(', ')}. Sur Netlify, activez la base dans ` +
    `Project configuration → Database ; en local, renseignez DATABASE_URL dans .env.local.`
  )
}
