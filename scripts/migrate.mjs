/**
 * Applique les migrations en attente. Lancé automatiquement avant chaque build
 * Netlify, pour qu'il n'y ait aucune commande à taper au déploiement.
 *
 * Deux garde-fous :
 *
 * - Sans chaîne de connexion, on sort sans rien faire. Le build doit rester
 *   possible hors ligne, et une prévisualisation de déploiement sans base ne
 *   doit pas échouer pour autant.
 * - Si une migration échoue alors que la base est joignable, on fait échouer le
 *   build. Mieux vaut un déploiement rouge qu'un site en ligne dont le schéma ne
 *   correspond pas au code.
 *
 * Réexécuter cette commande ne coûte rien : Drizzle tient un journal des
 * migrations déjà appliquées.
 */
import { spawnSync } from 'node:child_process'

// Mêmes variables que src/lib/databaseUrl.ts, dans le même ordre. Netlify a
// changé de nom au fil de ses versions : NETLIFY_DB_URL aujourd'hui,
// NETLIFY_DATABASE_URL pour l'ancienne extension.
const VARIABLES = ['DATABASE_URL', 'NETLIFY_DB_URL', 'NETLIFY_DATABASE_URL']

const trouvee = VARIABLES.find((nom) => process.env[nom]?.trim())

if (!trouvee) {
  console.log(
    `[migrate] aucune chaîne de connexion (${VARIABLES.join(', ')}) — aucune migration appliquée.`,
  )
  process.exit(0)
}

console.log(`[migrate] connexion lue depuis ${trouvee}, application des migrations en attente…`)

const result = spawnSync('npx', ['drizzle-kit', 'migrate'], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
})

if (result.error) {
  console.error('[migrate] impossible de lancer drizzle-kit :', result.error.message)
  process.exit(1)
}

if (result.status !== 0) {
  console.error(`[migrate] échec (code ${result.status}). Le déploiement est interrompu.`)
  process.exit(result.status ?? 1)
}

console.log('[migrate] schéma à jour.')
