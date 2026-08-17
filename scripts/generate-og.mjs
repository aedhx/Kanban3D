/*
 * Régénère l'image de partage, public/og.png (1200×630).
 *
 *   npm install --no-save playwright
 *   node scripts/generate-og.mjs
 *
 * C'est ce que voient iMessage, WhatsApp, Slack ou Signal quand on partage le
 * lien. Le PNG est versionné : ce script ne tourne ni au build ni au
 * déploiement, seulement quand le nom, la description ou la palette changent.
 *
 * Le rendu passe par Chromium plutôt que par Pillow (comme
 * `generate-icons.py`) pour deux raisons : l'interlettrage, le dégradé radial et
 * l'alignement optique tiennent en trois lignes de CSS, et le texte est alors
 * dessiné par le même moteur que l'application elle-même.
 *
 * CHROMIUM peut désigner un binaire déjà présent, pour éviter le téléchargement.
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const RACINE = new URL('..', import.meta.url).pathname
const SORTIE = `${RACINE}public/og.png`

/*
 * Doivent rester alignés sur src/app/globals.css (thème sombre) : l'image est
 * une extension de l'interface, pas une affiche à part.
 */
const ACCENT = '#f0761a'
const FOND = '#101216'
const ENCRE = '#eceef2'
const ATTENUE = '#9099a8'

const NOM = 'Kanban3D'
const DESCRIPTION = ['Collez un lien, la carte se crée.', 'Le tableau d’impressions 3D partagé à deux.']
const SIGNATURE = 'ADX Corp'

/**
 * Le cube de Phosphor, lu là où `generate-icons.py` le lit déjà : l'icône de
 * l'application et l'image de partage montrent ainsi le même pictogramme, sans
 * qu'un tracé recopié puisse diverger.
 */
function tracéDuCube() {
  const source = `${RACINE}node_modules/@phosphor-icons/core/assets/bold/cube-bold.svg`
  let svg
  try {
    svg = readFileSync(source, 'utf8')
  } catch {
    throw new Error(`${source} est absent — lancez npm install au préalable.`)
  }
  const tracé = svg.match(/<path d="([^"]+)"/)?.[1]
  if (!tracé) throw new Error(`Aucun tracé trouvé dans ${source}.`)
  return tracé
}

/*
 * Mise en page : tout reste à plus de 80 px des bords, et le cube comme le nom
 * tiennent dans le carré central — les plateformes rognent, en 1:1 comme en
 * 1.91:1, et l'essentiel doit survivre au rognage.
 */
const gabarit = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    background: ${FOND};
    /*
     * Liberation Sans, métriquement identique à Arial et à Helvetica : le PNG
     * étant commité, ce qui compte est que le rendu soit le même d'une machine
     * à l'autre le jour où on le refait. « system-ui » ne le garantit pas — il
     * donne DejaVu Sans sur une machine Linux nue, sensiblement plus épais.
     */
    font-family: 'Liberation Sans', Arial, Helvetica, sans-serif;
    color: ${ENCRE};
    /* Une lueur d'accent derrière le cube : un aplat pur fait « page d'erreur ». */
    background-image: radial-gradient(ellipse 620px 420px at 50% 38%, ${ACCENT}1f, transparent 70%);
    overflow: hidden;
  }
  .cube { width: 92px; height: 92px; margin-bottom: 36px; }
  h1 {
    font-size: 104px; font-weight: 700; letter-spacing: -0.025em; line-height: 1;
  }
  .description {
    margin-top: 28px; text-align: center;
    /* 30 px, et non 34 : la ligne la plus longue tient alors dans le carré
       central, et survit donc aussi à un rognage en 1:1. */
    font-size: 30px; line-height: 1.55; color: ${ATTENUE};
  }
  /* Ancrée au bas de l'image plutôt que posée dans le flux : elle reste ainsi à
     distance constante du bord, quel que soit le nombre de lignes au-dessus. */
  .signature {
    position: absolute; bottom: 74px;
    font-size: 19px; letter-spacing: 0.24em; text-transform: uppercase; color: ${ATTENUE};
    opacity: 0.8;
  }
</style></head>
<body>
  <svg class="cube" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
    <path d="${tracéDuCube()}" fill="${ACCENT}"/>
  </svg>
  <h1>${NOM}</h1>
  <p class="description">${DESCRIPTION.join('<br>')}</p>
  <p class="signature">${SIGNATURE}</p>
</body></html>`

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(gabarit, { waitUntil: 'load' })
await page.screenshot({ path: SORTIE, type: 'png' })
await browser.close()

console.log('écrit public/og.png (1200×630)')
