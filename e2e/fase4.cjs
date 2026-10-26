// Prueba de punta a punta de la Fase 4 (bitácora y exportes) contra los emuladores y `vite preview`.
// Requiere haber corrido antes e2e/fase1.cjs, fase2.cjs y fase3.cjs.
// Uso: node e2e/fase4.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
const fs = require('fs')
const { execFileSync } = require('child_process')
const S = process.argv[2] ?? 'e2e/salida'
const BASE = 'http://localhost:4173'
fs.mkdirSync(path.join(S, 'shots'), { recursive: true })
const shot = (p, n) => p.screenshot({ path: path.join(S, 'shots', n + '.png') })
const sufijo = Date.now().toString(36)

async function entrar(browser, email, pass) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], acceptDownloads: true })
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

/** Texto de las hojas de un .xlsx (es un zip con XML adentro). */
function textoXlsx(archivo) {
  return execFileSync('unzip', ['-p', archivo, 'xl/sharedStrings.xml', 'xl/worksheets/*.xml']).toString()
}


/** Abre PT-101 desde el catálogo (con cientos de instrumentos ya no cabe en pantalla: se busca). */
async function abrirPT101(page) {
  await page.fill('input[type=search]', 'PT-101')
  await page.locator('a', { hasText: 'PT-101' }).first().click()
}
;(async () => {
  const browser = await chromium.launch()
  const admin = await entrar(browser, 'manuel@adb.test', 'Prueba1234')
  const page = admin.page

  // ---------- Bitácora ----------
  const servicio = `Presión de vapor a cabezal ${sufijo}`
  await abrirPT101(page)
  await page.click('text=Editar')
  const campo = page.locator('input[placeholder="Presión de vapor a cabezal"]')
  const anterior = await campo.inputValue()
  await campo.fill(servicio)
  await page.click('button:has-text("Guardar")')
  await page.waitForSelector(`text=${servicio}`)

  await page.click('text=Menú')
  await page.click('text=Bitácora de cambios')
  const entrada = page.locator('li', { hasText: servicio }).first()
  await entrada.waitFor({ timeout: 20000 })
  const texto = await entrada.innerText()
  if (!texto.includes(anterior)) throw new Error(`la bitácora no muestra el valor anterior: ${texto}`)
  if (!/Edición/.test(texto)) throw new Error('la entrada no es una edición')
  await shot(page, '30-bitacora')
  console.log('edición en la bitácora con valor anterior y nuevo ok')
  await page.waitForSelector('li:has-text("Usuario") >> text=Alta')
  console.log('altas de usuarios en la bitácora ok')
  await page.waitForSelector('li:has-text("Falla") >> text=Cerrada')
  console.log('cambios de estado de fallas en la bitácora ok')

  await page.goto(`${BASE}/catalogo`)
  await abrirPT101(page)
  await page.click('text=Ver bitácora de cambios de PT-101')
  await page.waitForSelector('text=Bitácora de')
  await page.waitForSelector('li:has-text("Calibración") >> text=Alta')
  await shot(page, '31-bitacora-instrumento')
  console.log('bitácora del instrumento con su calibración ok')

  // El operador no ve la bitácora ni los exportes.
  await page.goto(`${BASE}/usuarios`)
  await page.fill('input[placeholder="Nombre"]', 'Otto Operador')
  await page.fill('input[placeholder="Correo"]', `op4-${sufijo}@adb.test`)
  await page.fill('input[placeholder^="Contraseña"]', 'Prueba1234')
  await page.locator('form select').first().selectOption('operador')
  await page.click('button:has-text("Crear usuario")')
  await page.waitForSelector(`text=Usuario op4-${sufijo}@adb.test creado.`, { timeout: 20000 })
  const op = await entrar(browser, `op4-${sufijo}@adb.test`, 'Prueba1234')
  console.log('operador sin menú:', (await op.page.locator('text=Menú').count()) === 0)
  await op.page.goto(`${BASE}/bitacora`)
  await op.page.waitForURL(`${BASE}/`)
  await op.page.goto(`${BASE}/exportar`)
  await op.page.waitForURL(`${BASE}/`)
  console.log('operador redirigido fuera de bitácora y exportes ok')

  // ---------- Exportes ----------
  await page.goto(`${BASE}/catalogo`)
  await page.click('text=Menú')
  await page.click('text=Exportar Excel / PDF')
  for (const [tipo, busca] of [
    ['Listado de instrumentos', servicio],
    ['Fallas por periodo', 'Lectura congelada'],
    ['Calibraciones', 'Ajustada'],
  ]) {
    await page.click(`label:has-text("${tipo}")`)
    await page.waitForSelector('text=/\\d+ registros?/')
    const [descarga] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Descargar Excel")')])
    const archivo = path.join(S, descarga.suggestedFilename())
    await descarga.saveAs(archivo)
    const xml = textoXlsx(archivo)
    if (!xml.includes(busca)) throw new Error(`${tipo}: el Excel no trae "${busca}"`)
    console.log(`${tipo}: Excel ${descarga.suggestedFilename()} ok (${fs.statSync(archivo).size} bytes)`)
  }
  await shot(page, '32-exportar')

  await page.click('text=Ver para PDF')
  await page.waitForURL(/\/imprimir\?/)
  await page.waitForSelector('table >> text=Ajustada')
  await shot(page, '33-imprimir')
  await page.emulateMedia({ media: 'print' })
  const pdf = path.join(S, 'calibraciones.pdf')
  await page.pdf({ path: pdf, landscape: true, printBackground: true })
  console.log('PDF generado desde la vista de impresión:', fs.statSync(pdf).size, 'bytes')
  await browser.close()
})().catch((e) => {
  console.error('FALLO:', e.message)
  process.exit(1)
})
