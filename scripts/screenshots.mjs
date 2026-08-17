/*
 * Captures d'écran du README : une image par fonctionnalité, en thème clair et
 * sombre, sur desktop et sur téléphone.
 *
 *   npm run start                 # sur le port 3100, base locale peuplée
 *   node scripts/seed-demo.mjs    # jeu de démonstration
 *   node scripts/screenshots.mjs  # écrit dans docs/images/
 *
 * Playwright n'est pas une dépendance du projet — il ne sert qu'ici, et pèse
 * plus lourd que tout le reste réuni. Installez-le au besoin :
 *
 *   npm install --no-save playwright
 *
 * CHROMIUM peut désigner un binaire déjà présent, pour éviter le téléchargement.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = 'http://127.0.0.1:3100'
const OUT = new URL('../docs/images', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  // Les champs de date suivent la langue de l'interface du navigateur.
  args: ['--lang=fr-FR'],
})

/*
 * Le navigateur du bac à sable n'a pas d'accès réseau sortant, contrairement à
 * Node. On intercepte donc les images distantes et on les sert depuis ici :
 * ce sont exactement les octets que l'application afficherait en ligne.
 */
const cache = new Map()
async function serveRemoteImages(ctx) {
  await ctx.route('**/*', async (route) => {
    const req = route.request()
    const url = req.url()
    if (req.resourceType() !== 'image' || url.startsWith(BASE)) return route.continue()
    try {
      if (!cache.has(url)) {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/avif,image/webp,*/*' },
          signal: AbortSignal.timeout(20000),
        })
        if (!res.ok) throw new Error(String(res.status))
        cache.set(url, {
          body: Buffer.from(await res.arrayBuffer()),
          contentType: res.headers.get('content-type') ?? 'image/jpeg',
        })
      }
      const hit = cache.get(url)
      await route.fulfill({ body: hit.body, contentType: hit.contentType })
    } catch {
      await route.abort()
    }
  })
}

/** Une page connectée, thème et gabarit au choix. */
async function open({ dark = false, width = 1440, height = 900, identity = 'Antoine', mobile = false }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    locale: 'fr-FR',
    colorScheme: dark ? 'dark' : 'light',
    deviceScaleFactor: 2,
    isMobile: mobile,
    hasTouch: mobile,
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  await serveRemoteImages(ctx)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('#pin', '4242')
  await page.click('button[type=submit]')
  await page.waitForURL(`${BASE}/`)
  await page.evaluate((who) => localStorage.setItem('kanban3d.identity', who), identity)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  return { ctx, page }
}

const shot = async (page, name, opts = {}) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, ...opts })
  console.log(`  ${name}.png`)
}

/* ---------- Écran de code ---------- */
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'fr-FR',
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await shot(page, 'code-pin')
  await ctx.close()
}

/* ---------- Le tableau, clair et sombre ---------- */
for (const dark of [false, true]) {
  const { ctx, page } = await open({ dark })
  await shot(page, dark ? 'tableau-sombre' : 'tableau', { clip: { x: 0, y: 0, width: 1440, height: 620 } })
  await ctx.close()
}

/* ---------- Coller un lien : la carte provisoire, puis la vraie ---------- */
{
  const { ctx, page } = await open({})
  await page.locator('#add-url').focus()
  await page.evaluate(
    (t) => navigator.clipboard.writeText(t),
    'https://thangs.com/designer/Valeria%20Momo%20%26%20Mattia/3d-model/Customizable%20Alphabet%20Clicker%20%26%20Keychain-1501622',
  )
  await page.keyboard.press('ControlOrMeta+V')
  // La carte provisoire, puis la même une seconde plus tard : c'est toute
  // l'histoire du collage, et un gros plan la raconte mieux qu'une page entière.
  const provisoire = page.locator('li:has-text("Recherche des informations")')
  await provisoire.waitFor({ timeout: 4000 })
  await provisoire.screenshot({ path: `${OUT}/collage-en-cours.png` })
  console.log('  collage-en-cours.png')
  const finale = page.locator('li:has-text("Alphabet Clicker")')
  await finale.waitFor({ timeout: 20000 })
  await page.waitForTimeout(900)
  await finale.scrollIntoViewIfNeeded()
  await finale.screenshot({ path: `${OUT}/collage-termine.png` })
  console.log('  collage-termine.png')
  // On garde la carte : elle illustre le nombre de fichiers Thangs.
  await ctx.close()
}

/* ---------- Le panneau latéral, tableau visible à côté ---------- */
{
  const { ctx, page } = await open({})
  await page.locator('li:has-text("SKADIS Display Shelf") [data-testid="card-handle"]').click()
  await page.waitForSelector('[data-testid="card-panel"]')
  await page.waitForTimeout(600)
  await page.evaluate(() => {
    window.scrollTo(0, 0)
    document.querySelector('[data-testid="card-panel"]').scrollTop = 0
  })
  await page.waitForTimeout(200)
  await shot(page, 'panneau-lateral')

  // Gros plan sur le bloc « Impression »
  const bloc = page.locator('[data-testid="card-panel"] fieldset', { hasText: 'Impression' }).first()
  await bloc.scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  await bloc.screenshot({ path: `${OUT}/cout-impression.png` })
  console.log('  cout-impression.png')
  // Discussion
  const fil = page.locator('[data-testid="card-panel"] section', { hasText: 'Discussion' }).first()
  await fil.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await fil.screenshot({ path: `${OUT}/discussion.png` })
  console.log('  discussion.png')
  await ctx.close()
}

/* ---------- Le champ photo du panneau ---------- */
{
  const { ctx, page } = await open({})
  await page.locator('li:has-text("Exam Roulette") [data-testid="card-handle"]').click()
  await page.waitForSelector('[data-testid="card-panel"]')
  const photo = page.locator('[data-testid="card-panel"] section', { hasText: 'Photo du résultat' })
  await photo.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await photo.screenshot({ path: `${OUT}/photo.png` })
  console.log('  photo.png')
  await ctx.close()
}

/* ---------- Mobile : tableau + panneau en feuille ---------- */
for (const dark of [false, true]) {
  const { ctx, page } = await open({ dark, width: 390, height: 844, mobile: true })
  await shot(page, dark ? 'mobile-sombre' : 'mobile')
  if (!dark) {
    await page.locator('li:has-text("SKADIS Display Shelf") [data-testid="card-handle"]').click()
    await page.waitForSelector('[data-testid="card-panel"]')
    await page.waitForTimeout(600)
    await page.evaluate(() => {
      document.querySelector('[data-testid="card-panel"]').scrollTop = 0
    })
    await page.waitForTimeout(200)
    await shot(page, 'mobile-panneau')
  }
  await ctx.close()
}

/* ---------- Archive de la colonne « Fait » ---------- */
{
  const { ctx, page } = await open({})
  const fait = page.locator('section:has(h2:text-is("Fait"))')
  await fait.screenshot({ path: `${OUT}/archive-replie.png` })
  console.log('  archive-replie.png')
  await fait.locator('button:has-text("Voir")').click()
  await page.waitForTimeout(500)
  await fait.screenshot({ path: `${OUT}/archive.png` })
  console.log('  archive.png')
  await ctx.close()
}

await browser.close()
console.log('\nCaptures écrites dans', OUT)
