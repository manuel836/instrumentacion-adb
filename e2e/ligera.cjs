// Prueba de punta a punta: la app arranca sin bajar las pantallas que se usan poco, las
// baja al abrirlas y, si una ya no existe (se publicó una versión nueva), recarga sola.
// También revisa que la barra de abajo use los íconos propios.
// Requiere el admin manuel@adb.test / Prueba1234.
// Uso: node e2e/ligera.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
const S = process.argv[2] ?? 'e2e/salida'
const BASE = 'http://localhost:4173'
require('fs').mkdirSync(path.join(S, 'shots'), { recursive: true })
const shot = (p, n) => p.screenshot({ path: path.join(S, 'shots', n + '.png') })

;(async () => {
  const browser = await chromium.launch()
  // Sin service worker para ver cada archivo que pide la app.
  const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block' })
  const page = await ctx.newPage()
  const errores = []
  page.on('pageerror', (e) => errores.push(e.message))
  const bajados = []
  page.on('request', (r) => {
    const m = /\/assets\/([\w.]+?)-[\w-]{8}\.js$/.exec(r.url())
    if (m) bajados.push(m[1])
  })

  await page.goto(`${BASE}/login`)
  await page.fill('#email', 'manuel@adb.test')
  await page.fill('#pass', 'Prueba1234')
  await page.click('button:has-text("Entrar")')
  await page.waitForSelector('text=/Catálogo: \\d+ instrumentos?/')
  console.log('al arrancar bajó:', [...new Set(bajados)].join(', '))
  for (const raro of ['Usuarios', 'Importar', 'HojaDeVida', 'Bitacora', 'Exportar', 'index.esm'])
    if (bajados.includes(raro)) throw new Error(`al arrancar bajó ${raro}`)
  for (const base of ['index', 'react', 'firebase']) if (!bajados.includes(base)) throw new Error(`no bajó ${base}`)
  console.log('arranca sin las pantallas raras ok')

  // Íconos propios en la barra de abajo, sin emojis.
  const nav = page.locator('nav')
  if ((await nav.locator('svg').count()) !== 5) throw new Error('la barra no tiene 5 íconos')
  if (/[←-⯿\u{1F300}-\u{1FAFF}]/u.test(await nav.innerText())) throw new Error('la barra todavía tiene emojis')
  await shot(page, '140-iconos-inicio')
  console.log('íconos propios ok')

  await page.click('text=Menú')
  await page.click('a:has-text("Usuarios")')
  await page.waitForSelector('text=Nuevo usuario')
  if (!bajados.includes('Usuarios')) throw new Error('Usuarios no se bajó al abrirla')
  console.log('baja una pantalla al abrirla ok')

  // Versión nueva publicada: el archivo viejo de la bitácora ya no está la primera vez.
  let veces = 0
  await page.route(/\/assets\/Bitacora-[\w-]{8}\.js$/, (r) => (veces++ === 0 ? r.fulfill({ status: 404, body: 'no existe' }) : r.continue()))
  let cargas = 0
  page.on('load', () => cargas++)
  await page.click('text=Menú')
  await page.click('text=Bitácora de cambios')
  await page.waitForSelector('h1:has-text("Bitácora de cambios")', { timeout: 15000 })
  if (cargas < 1) throw new Error('no recargó')
  console.log(`archivo viejo: recargó sola y abrió la bitácora ok (${veces} intentos)`)

  // Si de plano no se puede bajar (sin señal), avisa en vez de quedarse en blanco.
  await page.route(/\/assets\/Exportar-[\w-]{8}\.js$/, (r) => r.fulfill({ status: 404, body: 'no existe' }))
  await page.click('text=Menú')
  await page.click('text=Exportar')
  await page.waitForSelector('text=No se pudo abrir esta pantalla', { timeout: 15000 })
  await shot(page, '141-pantalla-no-disponible')
  await page.unroute(/\/assets\/Exportar-[\w-]{8}\.js$/)
  await page.click('button:has-text("Reintentar")')
  await page.waitForSelector('h1:has-text("Exportar")', { timeout: 15000 })
  console.log('sin poder bajarla avisa y "Reintentar" funciona ok')

  console.log('errores de página:', errores.filter((e) => !/dynamically imported module|Importing a module script failed/.test(e)))
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
