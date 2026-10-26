// Prueba de punta a punta: al registrar una calibración, la próxima es opcional.
// Requiere el admin manuel@adb.test / Prueba1234 y los emuladores corriendo.
// Uso: node e2e/calibracion-opcional.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
const { createRequire } = require('module')
const S = process.argv[2] ?? 'e2e/salida'
const REPO = process.argv[3] ?? process.cwd()
const BASE = 'http://localhost:4173'
require('fs').mkdirSync(path.join(S, 'shots'), { recursive: true })
const shot = (p, n) => p.screenshot({ path: path.join(S, 'shots', n + '.png') })
const tag = `PT-${(Date.now() % 90000) + 10000}`

/** Un instrumento con su calibración programada para dentro de 10 días. */
async function instrumento() {
  process.env.GCLOUD_PROJECT = 'demo-instrumentacion-adb'
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  const req = createRequire(path.resolve(REPO, 'functions/package.json'))
  const { initializeApp, getApps } = req('firebase-admin/app')
  const { getFirestore, Timestamp } = req('firebase-admin/firestore')
  if (!getApps().length) initializeApp({ projectId: 'demo-instrumentacion-adb' })
  const pronto = new Date(Date.now() + 10 * 86_400_000)
  const ref = await getFirestore().collection('instrumentos').add({
    tagISA: tag,
    servicio: 'Presión de domo',
    area: 'Generación de vapor',
    estado: 'Operando',
    nfcToken: null,
    docs: [],
    portadaMiniatura: null,
    rangoMin: 0,
    rangoMax: 20,
    unidades: 'kg/cm²',
    proximaCalibracion: Timestamp.fromDate(pronto),
  })
  return ref.id
}

async function calibrar(page, id, antesDeGuardar) {
  await page.goto(`${BASE}/instrumentos/${id}/calibrar`)
  await page.waitForSelector('text=Registrar calibración')
  const filas = [
    ['0', '0.02'],
    ['10', '10.01'],
    ['20', '19.98'],
  ]
  for (let i = 0; i < filas.length; i++) {
    await page.fill(`input[aria-label="Entrada ${i + 1}"]`, filas[i][0])
    await page.fill(`input[aria-label="As-Found ${i + 1}"]`, filas[i][1])
  }
  while ((await page.locator('input[aria-label^="Entrada"]').count()) > filas.length) {
    await page.locator('button[aria-label="Quitar punto"]').last().click()
  }
  await antesDeGuardar()
  await page.click('button:has-text("Guardar")')
  await page.waitForURL(/\/instrumentos\/[^/]+$/)
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

  await calibrar(page, id, async () => {
    const vacia = await page.locator('input[aria-label="Próxima calibración"]').inputValue()
    if (vacia !== '') throw new Error(`la próxima calibración no empieza vacía: ${vacia}`)
    await page.waitForSelector('text=Sin fecha, el instrumento queda')
    await shot(page, '150-calibracion-sin-proxima')
  })
  await page.waitForSelector('text=Próxima calibración: sin programar')
  console.log('se registra sin próxima calibración y la ficha queda sin programar ok')

  await calibrar(page, id, async () => {
    await page.click('button:has-text("12 meses")')
    const v = await page.locator('input[aria-label="Próxima calibración"]').inputValue()
    if (!v) throw new Error('el atajo de 12 meses no puso la fecha')
    await page.click('button:has-text("Quitar")')
    if (await page.locator('input[aria-label="Próxima calibración"]').inputValue()) throw new Error('Quitar no vació la fecha')
    await page.click('button:has-text("6 meses")')
  })
  const texto = await page.locator('p:has-text("Próxima calibración")').first().innerText()
  if (/sin programar/.test(texto)) throw new Error('con fecha, la ficha sigue sin programar')
  console.log('con el atajo de 6 meses la ficha muestra la fecha ok:', texto.replace(/\s+/g, ' '))

  await browser.close()
  process.exit(0)
})().catch((e) => {
  console.error('FALLO:', e.message)
  process.exit(1)
})
