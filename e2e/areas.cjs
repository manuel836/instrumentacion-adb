// Prueba de punta a punta: el admin asigna el área de cada usuario. Con eso los avisos de
// fallas nuevas solo les llegan a los técnicos de esa área (o a los que ven todas).
// Requiere el admin manuel@adb.test / Prueba1234 y los emuladores corriendo.
// Uso: node e2e/areas.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
const S = process.argv[2] ?? 'e2e/salida'
const BASE = 'http://localhost:4173'
require('fs').mkdirSync(path.join(S, 'shots'), { recursive: true })
const shot = (p, n) => p.screenshot({ path: path.join(S, 'shots', n + '.png') })
const sufijo = Date.now().toString(36)

async function abrir(browser) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror', e.message))
  return { ctx, page }
}

async function login(page, email, pass) {
  await page.goto(`${BASE}/login`)
  await page.fill('#email', email)
  await page.fill('#pass', pass)
  await page.click('button:has-text("Entrar")')
}

/** La misma función que usan los avisos de fallas, contra el emulador. */
async function tecnicosDe(area) {
  process.env.GCLOUD_PROJECT = 'demo-instrumentacion-adb'
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  const { tecnicos } = await import(path.resolve('functions/lib/index.js'))
  return tecnicos(area)
}

;(async () => {
  const browser = await chromium.launch()
  const admin = await abrir(browser)
  await login(admin.page, 'manuel@adb.test', 'Prueba1234')
  await admin.page.waitForSelector('text=Menú')
  await admin.page.goto(`${BASE}/usuarios`)

  // Dos técnicos: uno de Tratamiento de agua y otro que ve todas las áreas.
  const agua = `agua-${sufijo}@adb.test`
  const todas = `todas-${sufijo}@adb.test`
  for (const [nombre, email] of [
    ['Ana Agua', agua],
    ['Toño Todas', todas],
  ]) {
    await admin.page.fill('input[placeholder="Nombre"]', nombre)
    await admin.page.fill('input[placeholder="Correo"]', email)
    await admin.page.fill('input[placeholder^="Contraseña"]', 'Prueba1234')
    await admin.page.selectOption('form select >> nth=0', 'tecnico')
    await admin.page.click('button:has-text("Crear usuario")')
    await admin.page.waitForSelector(`text=Usuario ${email} creado.`, { timeout: 20000 })
  }

  const tarjeta = admin.page.locator('.tarjeta', { hasText: agua })
  const select = tarjeta.locator('select[aria-label^="Área de"]')
  if ((await select.inputValue()) !== '') throw new Error('el área inicial no es "Todas"')
  await tarjeta.locator('text=de todas las áreas').waitFor()
  await select.selectOption('Tratamiento de agua')
  await admin.page.waitForSelector('text=Área de Ana Agua: Tratamiento de agua.')
  await tarjeta.locator('text=solo de Tratamiento de agua').waitFor()
  await shot(admin.page, '110-area-usuario')
  console.log('el admin asigna el área ok')

  await admin.page.reload()
  await admin.page.locator('.tarjeta', { hasText: agua }).locator('select[aria-label^="Área de"]').waitFor()
  const guardada = await admin.page.locator('.tarjeta', { hasText: agua }).locator('select[aria-label^="Área de"]').inputValue()
  if (guardada !== 'Tratamiento de agua') throw new Error(`después de recargar el área es "${guardada}"`)
  console.log('el área se guarda ok')

  // A quién le llega el aviso de una falla nueva, según el área de la falla.
  const areas = await admin.page.evaluate(async () => {
    const r = {}
    for (const t of document.querySelectorAll('.tarjeta')) {
      const m = /[\w.-]+@adb\.test/.exec(t.textContent ?? '')
      if (m) r[m[0]] = t.querySelector('select[aria-label^="Área de"]')?.value
    }
    return r
  })
  if (areas[agua] !== 'Tratamiento de agua' || areas[todas] !== '') throw new Error(`áreas raras: ${JSON.stringify(areas)}`)
  const { getAuth } = await import(path.resolve('functions/node_modules/firebase-admin/lib/esm/auth/index.js'))
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
  const deAgua = await tecnicosDe('Tratamiento de agua')
  const deVapor = await tecnicosDe('Generación de vapor')
  const uidAgua = (await getAuth().getUserByEmail(agua)).uid
  const uidTodas = (await getAuth().getUserByEmail(todas)).uid
  if (!deAgua.includes(uidAgua) || !deAgua.includes(uidTodas)) throw new Error('falla de agua: faltan técnicos')
  if (deVapor.includes(uidAgua)) throw new Error('falla de vapor: le llegaría a la técnica de agua')
  if (!deVapor.includes(uidTodas)) throw new Error('falla de vapor: no le llegaría al que ve todas')
  console.log('avisos solo a su área (y a quien ve todas) ok')

  // La técnica entra y su inicio abre en su área.
  const tec = await abrir(browser)
  await login(tec.page, agua, 'Prueba1234')
  await tec.page.waitForSelector('h1:has-text("Hola")')
  // El área llega con su perfil, un instante después de entrar.
  await tec.page
    .waitForFunction(() => document.querySelector('select[aria-label="Área del resumen"]')?.value === 'Tratamiento de agua', null, { timeout: 10000 })
    .catch(async () => {
      throw new Error(`el inicio abre en "${await tec.page.locator('select[aria-label="Área del resumen"]').inputValue()}"`)
    })
  await shot(tec.page, '111-inicio-de-su-area')
  console.log('su inicio abre en su área ok')

  // Queda en la bitácora.
  await admin.page.click('text=Menú')
  await admin.page.click('text=Bitácora de cambios')
  await admin.page.locator('li', { hasText: 'Ana Agua' }).filter({ hasText: 'Área' }).first().waitFor({ timeout: 20000 })
  await shot(admin.page, '112-bitacora-area')
  console.log('cambio de área en la bitácora ok')

  await browser.close()
  process.exit(0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
