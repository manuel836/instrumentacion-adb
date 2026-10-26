// Prueba de punta a punta del chat: el canal general muestra solo el día de hoy, los días
// anteriores quedan en el historial (solo para leer) y dos personas chatean en privado.
// Requiere el admin manuel@adb.test / Prueba1234 y los emuladores corriendo.
// Uso: node e2e/chat.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
const { createRequire } = require('module')
const S = process.argv[2] ?? 'e2e/salida'
const REPO = process.argv[3] ?? process.cwd()
const BASE = 'http://localhost:4173'
require('fs').mkdirSync(path.join(S, 'shots'), { recursive: true })
const shot = (p, n) => p.screenshot({ path: path.join(S, 'shots', n + '.png') })
const sufijo = Date.now().toString(36)

async function entrar(browser, email, pass) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror', email, e.message))
  await page.goto(`${BASE}/login`)
  await page.fill('#email', email)
  await page.fill('#pass', pass)
  await page.click('button:has-text("Entrar")')
  await page.waitForSelector('text=Menú')
  return { ctx, page }
}

async function escribir(page, texto) {
  await page.fill('textarea[placeholder="Escribe un mensaje"]', texto)
  await page.click('button:has-text("Enviar")')
}

/** Un mensaje de ayer en el canal general, escrito directo en el emulador. */
async function mensajeDeAyer(texto) {
  process.env.GCLOUD_PROJECT = 'demo-instrumentacion-adb'
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  const req = createRequire(path.resolve(REPO, 'functions/package.json'))
  const { initializeApp, getApps } = req('firebase-admin/app')
  const { getFirestore, Timestamp } = req('firebase-admin/firestore')
  if (!getApps().length) initializeApp({ projectId: 'demo-instrumentacion-adb' })
  const ayer = new Date()
  ayer.setDate(ayer.getDate() - 1)
  ayer.setHours(10, 0, 0, 0)
  await getFirestore()
    .collection('chat_general')
    .add({ autor: { uid: 'sistema-prueba', nombre: 'Manuel' }, texto, fotos: [], fecha: Timestamp.fromDate(ayer) })
}

;(async () => {
  const browser = await chromium.launch()
  const admin = await entrar(browser, 'manuel@adb.test', 'Prueba1234')
  const paula = { nombre: `Paula ${sufijo}`, email: `paula-${sufijo}@adb.test` }
  const rafa = { nombre: `Rafa ${sufijo}`, email: `rafa-${sufijo}@adb.test` }
  for (const [u, rol] of [
    [paula, 'operador'],
    [rafa, 'tecnico'],
  ]) {
    await admin.page.goto(`${BASE}/usuarios`)
    await admin.page.fill('input[placeholder="Nombre"]', u.nombre)
    await admin.page.fill('input[placeholder="Correo"]', u.email)
    await admin.page.fill('input[placeholder^="Contraseña"]', 'Prueba1234')
    await admin.page.locator('form select').first().selectOption(rol)
    await admin.page.click('button:has-text("Crear usuario")')
    await admin.page.waitForSelector(`text=Usuario ${u.email} creado.`, { timeout: 20000 })
  }
  console.log('usuarios creados ok')

  // ---------- Canal general: hoy e historial ----------
  const viejo = `Paro de caldera B ayer ${sufijo}`
  await mensajeDeAyer(viejo)
  const p = await entrar(browser, paula.email, 'Prueba1234')
  await p.page.click('nav >> text=Chat')
  await p.page.waitForSelector('h1:has-text("Canal general · hoy")')
  await escribir(p.page, `Buenos días equipo ${sufijo}`)
  await p.page.waitForSelector(`text=Buenos días equipo ${sufijo}`)
  if (await p.page.locator(`text=${viejo}`).count()) throw new Error('el canal de hoy muestra un mensaje de ayer')
  await shot(p.page, '130-canal-hoy')
  console.log('el canal general solo muestra hoy ok')

  await p.page.click('nav[aria-label="Chats"] >> text=Historial')
  const ayer = p.page.locator('li', { hasText: viejo })
  await ayer.waitFor({ timeout: 15000 })
  if (!(await ayer.innerText()).includes('Ayer')) throw new Error('el día no dice "Ayer"')
  if ((await p.page.locator(`li:has-text("Buenos días equipo ${sufijo}")`).count()) > 0) throw new Error('el historial incluye el día de hoy')
  await shot(p.page, '131-historial')
  await ayer.click()
  await p.page.waitForSelector(`text=${viejo}`)
  await p.page.waitForSelector('text=ya no se puede escribir')
  if (await p.page.locator('textarea').count()) throw new Error('en el historial se puede escribir')
  await shot(p.page, '132-historial-dia')
  console.log('historial por día, solo para leer ok')

  // ---------- Chat privado ----------
  await p.page.click('nav[aria-label="Chats"] >> text=Privados')
  await p.page.waitForSelector('text=Aún no tienes chats privados')
  await p.page.click('button:has-text("Nuevo chat privado")')
  await p.page.fill('input[placeholder="Buscar por nombre"]', 'rafa')
  await p.page.click(`a:has-text("${rafa.nombre}")`, { timeout: 20000 })
  await p.page.waitForSelector(`h1:has-text("${rafa.nombre}")`)
  await p.page.waitForSelector(`text=solo lo ven tú y ${rafa.nombre}`)
  await escribir(p.page, 'Rafa, ¿me ayudas con el PT-101?')
  await p.page.waitForSelector('text=Rafa, ¿me ayudas con el PT-101?')
  console.log('la operadora abre un chat privado con el técnico ok')

  const r = await entrar(browser, rafa.email, 'Prueba1234')
  await r.page.locator('nav a[href="/chat"] span.bg-red-600', { hasText: '1' }).waitFor({ timeout: 20000 })
  console.log('globo de privado sin leer en el técnico ok')
  await r.page.click('nav >> text=Chat')
  await r.page.locator('nav[aria-label="Chats"] >> text=Privados').locator('span.bg-red-600').waitFor()
  await r.page.click('nav[aria-label="Chats"] >> text=Privados')
  const conv = r.page.locator('li', { hasText: paula.nombre })
  await conv.locator('[aria-label="Sin leer"]').waitFor()
  await shot(r.page, '133-lista-privados')
  await conv.click()
  await r.page.waitForSelector('text=Rafa, ¿me ayudas con el PT-101?')
  await r.page.setInputFiles('input[type=file][multiple]', [path.join(REPO, 'public/icons/icon-192.png')])
  await escribir(r.page, 'Voy en 10 minutos')
  await p.page.waitForSelector('text=Voy en 10 minutos', { timeout: 30000 })
  await p.page.waitForFunction(() => document.querySelectorAll('ol img').length > 0, null, { timeout: 30000 })
  await shot(p.page, '134-conversacion-privada')
  console.log('la respuesta con foto llega en vivo ok')

  await r.page.goto(`${BASE}/catalogo`)
  await r.page.waitForSelector('text=instrumentos')
  await r.page.waitForTimeout(1500)
  if (await r.page.locator('nav a[href="/chat"] span.bg-red-600').count()) throw new Error('el globo no se apagó al leer')
  console.log('el globo se apaga al leer ok')

  await p.page.click('text=← Chats privados')
  await p.page.locator('li', { hasText: rafa.nombre }).locator('text=Voy en 10 minutos').waitFor()
  console.log('la lista muestra el último mensaje ok')

  // El admin no ve conversaciones ajenas.
  await admin.page.goto(`${BASE}/chat/privados`)
  await admin.page.waitForSelector('text=Aún no tienes chats privados')
  console.log('el admin no ve chats privados ajenos ok')

  await browser.close()
  process.exit(0)
})().catch((e) => {
  console.error('FALLO:', e.message)
  process.exit(1)
})
