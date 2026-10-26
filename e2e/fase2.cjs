// Prueba de punta a punta de la Fase 2 (fallas) contra los emuladores y `vite preview`.
// Requiere haber corrido antes e2e/fase1.cjs (instrumento PT-101 y admin manuel@adb.test).
// Uso: node e2e/fase2.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
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
  // Después de entrar se abre el inicio; las pruebas trabajan desde el catálogo.
  await page.goto(`${BASE}/catalogo`)
  await page.waitForSelector('text=/de \\d+ instrumentos/')
  return { ctx, page }
}

/** Espera a que el catálogo muestre el estado esperado (la caché local puede ir un paso atrás). */
async function esperarEstado(page, tag, estado) {
  await page.goto(`${BASE}/catalogo`)
  const fila = page.locator('a', { hasText: tag }).first()
  await fila.locator('span.rounded-full', { hasText: estado }).first().waitFor({ timeout: 20000 })
  return estado
}


/** Abre PT-101 desde el catálogo (con cientos de instrumentos ya no cabe en pantalla: se busca). */
async function abrirPT101(page) {
  await page.fill('input[type=search]', 'PT-101')
  await page.locator('a', { hasText: 'PT-101' }).first().click()
}
;(async () => {
  const browser = await chromium.launch()

  // El admin da de alta a un operador y a un técnico.
  const admin = await entrar(browser, 'manuel@adb.test', 'Prueba1234')
  for (const [nombre, email, rol] of [
    ['Olga Operadora', `op-${sufijo}@adb.test`, 'operador'],
    ['Tomás Técnico', `tec-${sufijo}@adb.test`, 'tecnico'],
  ]) {
    await admin.page.goto(`${BASE}/usuarios`)
    await admin.page.fill('input[placeholder="Nombre"]', nombre)
    await admin.page.fill('input[placeholder="Correo"]', email)
    await admin.page.fill('input[placeholder^="Contraseña"]', 'Prueba1234')
    await admin.page.locator('form select').first().selectOption(rol)
    await admin.page.click('button:has-text("Crear usuario")')
    await admin.page.waitForSelector(`text=Usuario ${email} creado.`, { timeout: 20000 })
  }
  console.log('usuarios creados ok')

  // El operador reporta sin señal desde la ficha.
  const op = await entrar(browser, `op-${sufijo}@adb.test`, 'Prueba1234')
  await op.page.waitForSelector('text=PT-101')
  await op.page.evaluate(() => navigator.serviceWorker.ready)
  const alta = await op.page.locator('a[href="/instrumentos/nuevo"]').count()
  console.log('operador sin botón de alta:', alta === 0)
  await abrirPT101(op.page)
  await op.page.waitForSelector('text=Historial de fallas')
  await op.ctx.setOffline(true)
  await op.page.click('text=Reportar falla')
  await op.page.fill('textarea', 'Lectura congelada en 0 kg/cm², sin variación desde el arranque')
  await op.page.setInputFiles('input[type=file]', [path.join(REPO, 'public/icons/icon-192.png')])
  await shot(op.page, '10-reportar-offline')
  await op.page.click('button:has-text("Reportar")')
  await op.page.waitForURL(/\/fallas\/[^/]+$/)
  await op.page.waitForSelector('text=pendiente')
  await op.page.waitForSelector('text=Tomar falla', { state: 'detached' })
  await shot(op.page, '11-falla-pendiente')
  const urlFalla = op.page.url()
  console.log('operador reportó sin señal; sin botones de técnico ok')
  await op.ctx.setOffline(false)
  await op.page.waitForSelector('text=pendiente', { state: 'detached', timeout: 30000 })
  console.log('falla sincronizada al reconectar ok')

  // La Function marca el instrumento "Con falla".
  console.log('estado del instrumento tras reportar:', await esperarEstado(admin.page, 'PT-101', 'Con falla'))

  // El técnico la ve en la lista, la toma y la cierra.
  const tec = await entrar(browser, `tec-${sufijo}@adb.test`, 'Prueba1234')
  await tec.page.click('nav >> text=Fallas')
  await tec.page.waitForSelector('text=Lectura congelada')
  await shot(tec.page, '12-lista-fallas')
  await tec.page.click('text=Lectura congelada')
  await tec.page.click('button:has-text("Tomar falla")')
  await tec.page.waitForSelector('text=Tomada')
  await tec.page.click('button:has-text("Cerrar falla")')
  await tec.page.click('form button:has-text("Cerrar")')
  await tec.page.waitForSelector('text=son obligatorias')
  const [causa, accion] = await tec.page.locator('form textarea').all()
  await causa.fill('Toma de impulso tapada por incrustación')
  await accion.fill('Se sopló la línea y se purgó el transmisor')
  await tec.page.click('form button:has-text("Cerrar")')
  await tec.page.waitForSelector('text=Causa raíz')
  await shot(tec.page, '13-falla-cerrada')
  console.log('técnico tomó y cerró con causa raíz ok')

  console.log('estado del instrumento tras cerrar:', await esperarEstado(admin.page, 'PT-101', 'Operando'))

  await op.page.goto(urlFalla)
  await op.page.waitForSelector('text=Toma de impulso tapada')
  console.log('el operador ve el cierre ok')

  await admin.page.goto(`${BASE}/catalogo`)
  await abrirPT101(admin.page)
  await admin.page.waitForSelector('text=Lectura congelada')
  await shot(admin.page, '14-ficha-historial')
  console.log('historial en la ficha ok')
  await browser.close()
})().catch((e) => {
  console.error('FALLO:', e.message)
  process.exit(1)
})
