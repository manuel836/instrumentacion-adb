// Prueba de punta a punta: la pantalla de inicio. Cada número lleva a una lista con
// exactamente esa cantidad (en todas las áreas y en una sola).
// Requiere el admin manuel@adb.test / Prueba1234 y datos de las otras pruebas.
// Uso: node e2e/inicio.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
const S = process.argv[2] ?? 'e2e/salida'
const BASE = 'http://localhost:4173'
require('fs').mkdirSync(path.join(S, 'shots'), { recursive: true })
const shot = (p, n) => p.screenshot({ path: path.join(S, 'shots', n + '.png') })

;(async () => {
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ ...devices['Pixel 7'] })).newPage()
  const errores = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.goto(`${BASE}/login`)
  await page.fill('#email', 'manuel@adb.test')
  await page.fill('#pass', 'Prueba1234')
  await page.click('button:has-text("Entrar")')
  await page.waitForURL(`${BASE}/`)
  await page.waitForSelector('h1:has-text("Hola")')
  await page.waitForSelector('text=/Catálogo: \\d+ instrumentos?/')
  await shot(page, '100-inicio')
  console.log('inicio abre después de entrar ok')

  /** Lee cada número del inicio, lo toca y compara con lo que muestra la lista. */
  async function revisarCifras(etiqueta) {
    const cifras = page.locator('main a[data-cifra]')
    const total = await cifras.count()
    if (total < 10) throw new Error(`esperaba al menos 10 cifras y hay ${total}`)
    for (let i = 0; i < total; i++) {
      const c = cifras.nth(i)
      const n = Number(await c.locator('span.text-2xl').innerText())
      const texto = (await c.locator('span.text-xs').innerText()).trim()
      const href = await c.getAttribute('href')
      await c.click()
      if (href.startsWith('/fallas')) {
        await page.waitForSelector('button.bg-white.shadow-sm')
        await page.waitForTimeout(300)
        const activo = await page.locator('button.bg-white.shadow-sm').innerText()
        const m = /\((\d+)\)/.exec(activo)
        const visto = m ? Number(m[1]) : 0
        // "Cerradas en 30 días" es un subconjunto de todas las cerradas.
        const ok = texto.includes('30 días') ? visto >= n : visto === n
        if (!ok) throw new Error(`${etiqueta}: "${texto}" dice ${n} y la lista muestra ${visto}`)
      } else {
        await page.waitForSelector('text=/\\d+ de \\d+ instrumentos/')
        await page.waitForTimeout(300)
        const visto = Number((await page.locator('text=/\\d+ de \\d+ instrumentos/').innerText()).split(' ')[0])
        if (visto !== n) throw new Error(`${etiqueta}: "${texto}" dice ${n} y el catálogo muestra ${visto}`)
      }
      console.log(`  ${etiqueta}: ${texto} = ${n} ok`)
      await page.goBack()
      await page.waitForSelector('h1:has-text("Hola")')
      await page.waitForSelector('text=/Catálogo: \\d+ instrumentos?/')
    }
  }

  await revisarCifras('todas las áreas')
  await page.selectOption('select[aria-label="Área del resumen"]', 'Tratamiento de agua')
  await page.waitForTimeout(300)
  await shot(page, '101-inicio-area')
  await revisarCifras('Tratamiento de agua')

  // Los atajos llevan a su pantalla.
  await page.click('a:has-text("Reportar falla")')
  await page.waitForURL('**/fallas/nueva')
  await page.goBack()
  await page.click('a:has-text("Importar Excel")')
  await page.waitForURL('**/instrumentos/importar')
  console.log('atajos ok')

  // Usuarios ahora está en el menú.
  await page.click('text=Menú')
  await page.click('a:has-text("Usuarios")')
  await page.waitForURL('**/usuarios')
  console.log('Usuarios desde el menú ok')

  console.log('errores de página:', errores)
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
