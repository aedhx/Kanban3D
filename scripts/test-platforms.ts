/**
 * Diagnostic des adaptateurs de plateformes.
 *
 *   npm run test:platforms
 *
 * Les API de Printables et MakerWorld ne sont pas documentées publiquement :
 * elles peuvent changer sans préavis. L'application ne casse pas pour autant
 * (elle se rabat sur un titre déduit de l'URL), mais la dégradation est
 * silencieuse. Cette commande dit en une ligne laquelle a bougé.
 *
 * Aucune base de données requise.
 */
import { fetchModelMetadata } from '../src/lib/metadata.ts'

type Attente = {
  plateforme: string
  url: string
  /** Le titre doit correspondre : c'est le champ qui porte la carte. */
  titre: RegExp
  /** Les autres champs sont utiles mais non bloquants. */
  auteur?: RegExp
  imageAttendue: boolean
  /**
   * Certaines plateformes filtrent les requêtes selon l'adresse IP appelante.
   * On les signale sans faire échouer la commande.
   */
  filtrageFrequent?: boolean
}

const ATTENTES: Attente[] = [
  {
    plateforme: 'Printables',
    url: 'https://www.printables.com/model/430773-exam-roulette',
    titre: /^Exam Roulette$/i,
    auteur: /kasprowicz|danielk/i,
    imageAttendue: true,
  },
  {
    plateforme: 'MakerWorld',
    url: 'https://makerworld.com/en/models/25507',
    titre: /canon lp e6/i,
    auteur: /bula87/i,
    imageAttendue: true,
  },
  {
    plateforme: 'Thingiverse',
    url: 'https://www.thingiverse.com/thing:763622',
    titre: /3dbenchy/i,
    auteur: /creativetools/i,
    imageAttendue: true,
  },
  {
    plateforme: 'Cults3D',
    url: 'https://cults3d.com/en/3d-model/game/low-poly-pikachu',
    titre: /pikachu/i,
    auteur: /flowalistik/i,
    imageAttendue: true,
    filtrageFrequent: true,
  },
  {
    plateforme: 'Site quelconque (OpenGraph)',
    url: 'https://example.com/',
    titre: /example domain/i,
    imageAttendue: false,
  },
]

const OK = '[32m✓[0m'
const KO = '[31m✗[0m'
const WARN = '[33m![0m'

let echecs = 0
let avertissements = 0

console.log('\nAdaptateurs de plateformes — interrogation réelle des sites\n')

for (const attente of ATTENTES) {
  const debut = Date.now()
  const meta = await fetchModelMetadata(attente.url)
  const duree = Date.now() - debut

  const titreOk = attente.titre.test(meta.title)
  const auteurOk = !attente.auteur || (meta.author ? attente.auteur.test(meta.author) : false)
  const imageOk = !attente.imageAttendue || Boolean(meta.imageUrl)
  const complet = titreOk && auteurOk && imageOk

  let symbole: string
  if (complet) {
    symbole = OK
  } else if (attente.filtrageFrequent) {
    symbole = WARN
    avertissements++
  } else {
    symbole = KO
    echecs++
  }

  console.log(`${symbole} ${attente.plateforme}  [2m(${duree} ms)[0m`)
  console.log(`    titre   ${titreOk ? '' : '→ ATTENDU ' + attente.titre + ' '}« ${meta.title} »`)
  if (attente.auteur) {
    console.log(`    auteur  ${auteurOk ? '' : '→ ATTENDU ' + attente.auteur + ' '}${meta.author ?? '—'}`)
  }
  if (attente.imageAttendue) {
    console.log(`    image   ${meta.imageUrl ? 'présente' : 'ABSENTE'}`)
  }
  if (!complet && attente.filtrageFrequent) {
    console.log(
      `    [2mCe site filtre parfois selon l'adresse IP. L'application se rabat`,
    )
    console.log(`    proprement sur un titre déduit de l'URL — rien n'est cassé.[0m`)
  }
  console.log()
}

if (echecs > 0) {
  console.log(
    `${KO} ${echecs} adaptateur(s) à revoir : la plateforme a probablement changé son API.`,
  )
  console.log('   Voir src/lib/metadata.ts.\n')
  process.exit(1)
}

if (avertissements > 0) {
  console.log(`${WARN} ${avertissements} plateforme(s) injoignable(s), probablement un filtrage temporaire.`)
  console.log('   Réessayez plus tard ; le repli fonctionne en attendant.\n')
  process.exit(0)
}

console.log(`${OK} Tous les adaptateurs répondent comme prévu.\n`)
