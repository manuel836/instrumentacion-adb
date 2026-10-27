// Prueba de punta a punta de la Fase 3 (chat y calibraciones) contra los emuladores y `vite preview`.
// Requiere haber corrido antes e2e/fase1.cjs (instrumento PT-101 y admin manuel@adb.test).
// Uso: node e2e/fase3.cjs
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

async function escribir(page, texto) {
  await page.fill('textarea[placeholder="Escribe un mensaje"]', texto)
  await page.click('button:has-text("Enviar")')
}


/** Abre PT-101 desde el catálogo (con cientos de instrumentos ya no cabe en pantalla: se busca). */
async function abrirPT101(page) {
  await page.fill('input[type=search]', 'PT-101')
  await page.locator('a', { hasText: 'PT-101' }).first().click()
}
;(async () => {
  const browser = await chromium.launch()

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

  // ---------- Chat de la falla ----------
  const op = await entrar(browser, `op-${sufijo}@adb.test`, 'Prueba1234')
  await abrirPT101(op.page)
  await op.page.click('text=Reportar falla')
  await op.page.fill('textarea', 'Indicador local marca diferente al DCS')
  await op.page.click('button:has-text("Reportar")')
  await op.page.waitForURL(/\/fallas\/[^/]+$/)
  await op.page.waitForSelector('text=Chat de la falla')
  const urlFalla = op.page.url()

  await op.ctx.setOffline(true)
  await escribir(op.page, 'Difieren como 0.5 kg/cm², sin señal en campo')
  await op.page.waitForSelector('text=por enviar')
  await shot(op.page, '20-chat-sin-senal')
  console.log('mensaje escrito sin señal queda por enviar ok')
  await op.ctx.setOffline(false)
  await op.page.waitForSelector('text=por enviar', { state: 'detached', timeout: 30000 })
  console.log('mensaje enviado al reconectar ok')

  const tec = await entrar(browser, `tec-${sufijo}@adb.test`, 'Prueba1234')
  await tec.page.goto(urlFalla)
  await tec.page.waitForSelector('text=Difieren como 0.5')
  await tec.page.setInputFiles('input[type=file][multiple]', [path.join(REPO, 'public/icons/icon-192.png')])
  await escribir(tec.page, 'Voy con el calibrador')
  // El teléfono del operador estuvo sin señal: Firestore reconecta su escucha con espera
  // creciente, así que puede tardar unos segundos más en llegar.
  await op.page.waitForSelector('text=Voy con el calibrador', { timeout: 45000 })
  await op.page.waitForSelector('text=Tomás Técnico')
  await tec.page.waitForFunction(() => document.querySelectorAll('ol img').length > 0, null, { timeout: 30000 })
  await shot(op.page, '21-chat-falla')
  console.log('el operador recibe la respuesta del técnico con foto en vivo ok')

  // ---------- Canal general ----------
  await op.page.goto(`${BASE}/catalogo`)
  await tec.page.click('nav >> text=Chat')
  await tec.page.waitForSelector('text=Canal general')
  await escribir(tec.page, 'Mañana paro de caldera B a las 7:00')
  await op.page.locator('nav a[href="/chat"] span.bg-red-600', { hasText: '1' }).waitFor({ timeout: 20000 })
  console.log('globo de no leídos en el operador ok')
  await op.page.click('nav >> text=Chat')
  await op.page.waitForSelector('text=Mañana paro de caldera B')
  await shot(op.page, '22-canal-general')
  await op.page.locator('nav a[href="/chat"] span.bg-red-600').waitFor({ state: 'detached' })
  await op.page.goto(`${BASE}/catalogo`)
  await op.page.waitForSelector('text=instrumentos')
  const globo = await op.page.locator('nav a[href="/chat"] span.bg-red-600').count()
  console.log('el globo se apaga al leer:', globo === 0)

  // ---------- Calibraciones ----------
  await abrirPT101(op.page)
  await op.page.waitForSelector('text=Calibraciones')
  console.log('operador sin botón de registrar calibración:', (await op.page.locator('text=+ Registrar').count()) === 0)

  await tec.page.goto(`${BASE}/catalogo`)
  await abrirPT101(tec.page)
  await tec.page.click('text=+ Registrar')
  await tec.page.waitForSelector('text=Registrar calibración')
  await tec.page.fill('input[placeholder="Fluke 754"]', 'Fluke 754 S/N 1234')
  const min = tec.page.locator('label:has-text("Rango mínimo") input')
  const max = tec.page.locator('label:has-text("Rango máximo") input')
  if (!(await min.inputValue())) await min.fill('0')
  if (!(await max.inputValue())) await max.fill('20')
  await tec.page.selectOption('select[aria-label="Unidades"]', 'kg/cm²')
  // Con el rango ya capturado, los puntos se escriben a mano.
  const filas = [
    ['0', '0.3', '0.02'],
    ['10', '10.2', '10.01'],
    ['20', '19.7', '19.98'],
  ]
  for (let i = 0; i < filas.length; i++) {
    await tec.page.fill(`input[aria-label="Entrada ${i + 1}"]`, filas[i][0])
    await tec.page.fill(`input[aria-label="As-Found ${i + 1}"]`, filas[i][1])
    await tec.page.fill(`input[aria-label="As-Left ${i + 1}"]`, filas[i][2])
  }
  while ((await tec.page.locator('input[aria-label^="Entrada"]').count()) > filas.length) {
    await tec.page.locator('button[aria-label="Quitar punto"]').last().click()
  }
  await tec.page.waitForSelector('option:has-text("Según tolerancia: Ajustada")', { state: 'attached' })
  console.log('resultado sugerido Ajustada ok')
  await tec.page.click('button:has-text("6 meses")')
  await shot(tec.page, '23-registrar-calibracion')
  await tec.ctx.setOffline(true)
  await tec.page.click('button:has-text("Guardar")')
  await tec.page.waitForURL(/\/instrumentos\/[^/]+$/)
  await tec.page.waitForSelector('li >> text=Ajustada')
  await tec.page.waitForSelector('li >> text=pendiente')
  console.log('calibración guardada sin señal ok')
  await tec.ctx.setOffline(false)
  await tec.page.waitForSelector('li >> text=pendiente', { state: 'detached', timeout: 30000 })
  const proxima = await tec.page.locator('p:has-text("Próxima calibración")').first().innerText()
  console.log('ficha:', proxima.replace(/\s+/g, ' '))
  if (/sin programar/.test(proxima)) throw new Error('la ficha no muestra la próxima calibración')
  await shot(tec.page, '24-ficha-calibraciones')

  await op.page.goto(`${BASE}/catalogo`)
  await abrirPT101(op.page)
  await op.page.click('li >> text=Ajustada')
  await op.page.waitForSelector('text=As-Found')
  await op.page.waitForSelector('text=Fluke 754 S/N 1234')
  await shot(op.page, '25-detalle-calibracion')
  console.log('el operador consulta el detalle de la calibración ok')

  await browser.close()
})().catch((e) => {
  console.error('FALLO:', e.message)
  process.exit(1)
})
