// Prueba de punta a punta: se marca que un instrumento puede disparar la caldera y el aviso
// se ve en el catálogo, la ficha, la falla, la calibración y la vista del tag sin cuenta.
// Requiere el admin manuel@adb.test / Prueba1234 y los emuladores corriendo.
// Uso: node e2e/dispara-caldera.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
const { createRequire } = require('module')
const S = process.argv[2] ?? 'e2e/salida'
const REPO = process.argv[3] ?? process.cwd()
const BASE = 'http://localhost:4173'
require('fs').mkdirSync(path.join(S, 'shots'), { recursive: true })
const shot = (p, n) => p.screenshot({ path: path.join(S, 'shots', n + '.png') })
const TAG = `LSLL-${(Date.now() % 9000) + 1000}`
const TOKEN = `Disparo${Date.now().toString(36)}abc`.slice(0, 18)
const NOTA = 'Poner en bypass el disparo por muy bajo nivel antes de desconectar'

function firestore() {
  process.env.GCLOUD_PROJECT = 'demo-instrumentacion-adb'
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  const req = createRequire(path.resolve(REPO, 'functions/package.json'))
  const { initializeApp, getApps } = req('firebase-admin/app')
  const { getFirestore } = req('firebase-admin/firestore')
  if (!getApps().length) initializeApp({ projectId: 'demo-instrumentacion-adb' })
  return getFirestore()
}

;(async () => {
  // Un instrumento de antes (sin la marca) y con tag NFC.
  const db = firestore()
  const ref = await db.collection('instrumentos').add({
    tagISA: TAG,
    servicio: 'Nivel muy bajo del domo',
    area: 'Generación de vapor',
    estado: 'Operando',
    nfcToken: TOKEN,
    docs: [],
    portadaMiniatura: null,
    rangoMin: 0,
    rangoMax: 100,
    unidades: '%',
    proximaCalibracion: null,
  })

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...devices['Pixel 7'] })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror', e.message))
  await page.goto(`${BASE}/login`)
  await page.fill('#email', 'manuel@adb.test')
  await page.fill('#pass', 'Prueba1234')
  await page.click('button:has-text("Entrar")')
  await page.waitForSelector('text=Menú')

  await page.goto(`${BASE}/instrumentos/${ref.id}`)
  await page.waitForSelector(`h1:has-text("${TAG}")`)
  if (await page.locator('text=Puede disparar la caldera').count()) throw new Error('un instrumento sin marca muestra el aviso')
  await page.click('a:has-text("Editar")')
  await page.check('label:has-text("Puede disparar la caldera") input[type=checkbox]')
  await page.fill('textarea[placeholder^="Avisar a operación"]', NOTA)
  await shot(page, '170-marcar-disparo')
  await page.click('button:has-text("Guardar")')
  await page.waitForURL(/\/instrumentos\/[^/]+$/)
  await page.waitForSelector('[role=alert] >> text=Puede disparar la caldera')
  await page.waitForSelector(`[role=alert] >> text=${NOTA}`)
  await shot(page, '171-ficha-disparo')
  console.log('se marca en el formulario y la ficha muestra el aviso con la nota ok')

  await page.goto(`${BASE}/catalogo?filtro=dispara-caldera`)
  const fila = page.locator('a', { hasText: TAG })
  await fila.waitFor()
  await fila.locator('[title="Puede disparar la caldera"]').waitFor()
  await fila.locator('text=Dispara caldera').waitFor()
  await shot(page, '172-catalogo-disparo')
  console.log('el catálogo la marca y la filtra ok')

  await page.goto(`${BASE}/instrumentos/${ref.id}/calibrar`)
  await page.waitForSelector('[role=alert] >> text=Puede disparar la caldera')
  console.log('aviso al registrar una calibración ok')

  await page.goto(`${BASE}/fallas/nueva?instrumento=${ref.id}`)
  await page.fill('textarea', 'Retroaviso intermitente')
  await page.click('button:has-text("Reportar")')
  await page.waitForURL(/\/fallas\/[^/]+$/)
  await page.waitForSelector('[role=alert] >> text=Puede disparar la caldera')
  console.log('aviso en la falla ok')

  // La vista pública la escribe una Function: se espera a que traiga la marca.
  for (let i = 0; i < 40; i++) {
    const pub = await db.doc(`publico/${TOKEN}`).get()
    if (pub.get('disparaCaldera') === true) break
    await new Promise((r) => setTimeout(r, 500))
  }
  const invitado = await browser.newContext({ ...devices['Pixel 7'] })
  const p2 = await invitado.newPage()
  await p2.goto(`${BASE}/t/${TOKEN}`)
  await p2.waitForSelector('[role=alert] >> text=Puede disparar la caldera')
  await p2.waitForSelector(`text=${NOTA}`)
  await shot(p2, '173-tag-invitado-disparo')
  console.log('quien escanea el tag sin cuenta también ve el aviso ok')

  await browser.close()
  process.exit(0)
})().catch((e) => {
  console.error('FALLO:', e.message)
  process.exit(1)
})
