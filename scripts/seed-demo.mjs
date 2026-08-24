/*
 * Jeu de démonstration, pour les captures du README.
 *
 * Chaque carte naît d'un lien réel, résolu par le serveur : aucune donnée n'est
 * écrite à la main, ce qu'on voit sur les captures est donc ce que l'application
 * produit vraiment.
 *
 * ATTENTION : commence par supprimer toutes les cartes existantes. À réserver à
 * une base locale.
 */
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3100'
const PIN = process.env.APP_PIN ?? '4242'

const auth = await fetch(`${BASE}/api/auth`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ pin: PIN }),
})
const cookie = auth.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
const H = { 'content-type': 'application/json', cookie }

// Table rase
const { cards: anciennes } = await (await fetch(`${BASE}/api/cards`, { headers: H })).json()
for (const c of anciennes) await fetch(`${BASE}/api/cards/${c.id}`, { method: 'DELETE', headers: H })

const DEMANDES = [
  {
    url: 'https://www.printables.com/model/133116-ikea-skadis-headphone-holder',
    par: 'Antoine',
    edits: {
      color: 'Noir',
      notes: 'Pour le casque du bureau, celui qui traîne toujours.',
      multiColor: true,
      colorCount: 3,
    },
  },
  {
    url: 'https://www.printables.com/model/430773-exam-roulette',
    par: 'Antoine',
    edits: { quantity: 2, color: 'Rouge', priority: 0 },
  },
  {
    url: 'https://www.printables.com/model/72753-ikea-skadis-display-shelf/files',
    par: 'Alexandre',
    edits: {
      color: 'Blanc',
      notes: 'Version large, celle avec le crochet renforcé.',
      priority: 2,
      printMinutes: 214,
      filamentGrams: 52,
      material: 'PETG',
      pieceCount: 4,
    },
  },
  {
    url: 'https://makerworld.com/en/models/25507',
    par: 'Antoine',
    // En cours, et en deux morceaux : de quoi montrer le compteur de pièces.
    edits: {
      color: 'PETG noir',
      notes: 'Deux batteries par support.',
      pieceCount: 2,
      piecesDone: 1,
      printMinutes: 94,
      filamentGrams: 52,
      material: 'PETG',
    },
    versColonne: 'printing',
  },
  {
    url: 'https://cults3d.com/en/3d-model/game/low-poly-pikachu',
    par: 'Antoine',
    edits: { color: 'Jaune' },
    versColonne: 'done',
  },
  {
    // Une demande à laquelle celui qui imprime a dit non, avec la raison.
    titre: 'Lampe champignon',
    par: 'Antoine',
    edits: {
      color: 'Blanc translucide',
      printMinutes: 320,
      filamentGrams: 180,
      declinedReason: 'Trop haut pour le plateau — il faudrait la couper en deux.',
    },
  },
  {
    titre: 'Boîte à vis M3',
    par: 'Alexandre',
    edits: { quantity: 4, color: 'Gris', printMinutes: 45, filamentGrams: 18, material: 'PLA' },
    versColonne: 'done',
    termineeDepuis: 48,
  },
]

const creees = []
for (const d of DEMANDES) {
  const res = await fetch(`${BASE}/api/cards`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify(d.titre ? { title: d.titre, requestedBy: d.par } : { url: d.url, requestedBy: d.par }),
  })
  const { card } = await res.json()
  if (!card) {
    console.log('ÉCHEC', d.url ?? d.titre, await res.text())
    continue
  }
  await fetch(`${BASE}/api/cards/${card.id}`, {
    method: 'PATCH',
    headers: H,
    body: JSON.stringify(d.edits),
  })
  if (d.versColonne) {
    await fetch(`${BASE}/api/cards/${card.id}`, {
      method: 'PATCH',
      headers: H,
      body: JSON.stringify({ status: d.versColonne, movedBy: 'Alexandre' }),
    })
  }
  creees.push({ ...card, ...d })
  console.log(
    `${(d.versColonne ?? 'todo').padEnd(9)} « ${card.title} »  image ${card.imageUrl ? 'oui' : 'NON'}  auteur ${card.author ?? '—'}`,
  )
}

/*
 * Une carte terminée il y a longtemps, pour illustrer l'archive. L'API ne permet
 * pas de reculer une date de fin — et c'est bien ainsi — donc cette dernière
 * touche se fait en SQL. La commande est écrite en clair : la deviner à partir
 * d'un identifiant seul faisait perdre cinq minutes à chaque fois.
 */
const vieille = creees.find((c) => c.termineeDepuis)
if (vieille) {
  console.log(`\nPour que « ${vieille.title} » tombe dans l'archive, à jouer sur la base :`)
  console.log(
    `  UPDATE cards SET done_at = now() - interval '${vieille.termineeDepuis} days' WHERE id = '${vieille.id}';`,
  )
}

// Un message sur la carte du panneau
const skadis = creees.find((c) => c.title?.includes('SKADIS Display'))
if (skadis) {
  await fetch(`${BASE}/api/cards/${skadis.id}/comments`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ body: 'Tu peux le faire en noir plutôt ? Le blanc jaunit.', author: 'Alexandre' }),
  })
  await fetch(`${BASE}/api/cards/${skadis.id}/comments`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ body: 'Oui, noir c’est mieux. Merci !', author: 'Antoine' }),
  })
  console.log('Deux messages ajoutés sur « ' + skadis.title + ' »')
}
