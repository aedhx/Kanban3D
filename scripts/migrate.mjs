/**
 * Applique les migrations en attente. Lancé automatiquement avant chaque build
 * Netlify, pour qu'il n'y ait aucune commande à taper au déploiement.
 *
 * Deux garde-fous :
 *
 * - Sans DATABASE_URL, on sort sans rien faire. Le build doit rester possible
 *   hors ligne, et une prévisualisation de déploiement sans base ne doit pas
 *   échouer pour autant.
 * - Si une migration échoue alors que la base est joignable, on fait échouer le
 *   build. Mieux vaut un déploiement rouge qu'un site en ligne dont le schéma ne
 *   correspond pas au code.
 *
 * Réexécuter cette commande ne coûte rien : Drizzle tient un journal des
 * migrations déjà appliquées.
 */
import { spawnSync } from 'node:child_process'

if (!process.env.DATABASE_URL) {
  console.log('[migrate] DATABASE_URL absente — aucune migration appliquée.')
  process.exit(0)
}

console.log('[migrate] application des migrations en attente…')
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
