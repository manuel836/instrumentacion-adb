// Prueba de punta a punta: al cerrar una falla se cierra su chat, y lo que se habló
// (con fotos) se sigue viendo. Requiere el admin manuel@adb.test / Prueba1234 y los emuladores.
// Uso: node e2e/falla-cerrada.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
const { createRequire } = require('module')
const S = process.argv[2] ?? 'e2e/salida'
const REPO = process.argv[3] ?? process.cwd()
const BASE = 'http://localhost:4173'
require('fs').mkdirSync(path.join(S, 'shots'), { recursive: true })
const shot = (p, n) => p.screenshot({ path: path.join(S, 'shots', n + '.png') })
const tag = `FT-${Date.now() % 90000 + 10000}`

/** Un instrumento de prueba escrito directo en el emulador. */
async function instrumento() {
  process.env.GCLOUD_PROJECT = 'demo-instrumentacion-adb'
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  const req = createRequire(path.resolve(REPO, 'functions/package.json'))
  const { initializeApp, getApps } = req('firebase-admin/app')
  const { getFirestore } = req('firebase-admin/firestore')
  if (!getApps().length) initializeApp({ projectId: 'demo-instrumentacion-adb' })
  const ref = await getFirestore()
    .collection('instrumentos')
    .add({ tagISA: tag, servicio: 'Flujo de agua de alimentación', area: 'Generación de vapor', estado: 'Operando', nfcToken: null, docs: [], portadaMiniatura: null, rangoMin: 0, rangoMax: 50, proximaCalibracion: null })
  return ref.id
}

;(async () => {
  const id = await instrumento()
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...devices['Pixel 7'] })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror', e.message))
  await page.goto(`${BASE}/login`)
  await page.fill('#email', 'manuel@adb.test')
  await page.fill('#pass', 'Prueba1234')
  await page.click('button:has-text("Entrar")')
  await page.waitForSelector('text=Menú')

  await page.goto(`${BASE}/fallas/nueva?instrumento=${id}`)
  await page.fill('textarea', 'El transmisor marca cero con flujo')
  await page.click('button:has-text("Reportar")')
  await page.waitForURL(/\/fallas\/[^/]+$/)
  await page.waitForSelector('text=Chat de la falla')
  await page.setInputFiles('input[type=file][multiple]', [path.join(REPO, 'public/icons/icon-192.png')])
  await page.fill('textarea[placeholder="Escribe un mensaje"]', 'Se encontró el cable suelto en la caja de conexiones')
  await page.click('button:has-text("Enviar")')
  await page.waitForFunction(() => [...document.querySelectorAll('ol img')].some((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30000 })
  await page.waitForSelector('ol >> text=por enviar', { state: 'detached', timeout: 20000 })
  console.log('mensaje con foto en el chat de la falla ok')

  await page.click('button:has-text("Cerrar falla")')
  await page.fill('label:has-text("Causa raíz") textarea', 'Cable suelto en la caja de conexiones')
  await page.fill('label:has-text("Acción correctiva") textarea', 'Se reapretó la terminal y se probó el lazo')
  await page.click('form button:has-text("Cerrar")')
  await page.waitForSelector('text=El chat se cerró junto con la falla')
  if (await page.locator('textarea[placeholder="Escribe un mensaje"]').count()) throw new Error('con la falla cerrada todavía se puede escribir')
  await page.reload()
  await page.waitForSelector('text=Se encontró el cable suelto')
  await page.waitForFunction(() => [...document.querySelectorAll('ol img')].some((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30000 })
  await page.waitForSelector('h2:has-text("Chat de la falla") >> text=Cerrado')
  await shot(page, '140-falla-cerrada-chat')
  console.log('al cerrar la falla el chat se cierra y conserva mensajes y fotos ok')

  await browser.close()
  process.exit(0)
})().catch((e) => {
  console.error('FALLO:', e.message)
  process.exit(1)
})
