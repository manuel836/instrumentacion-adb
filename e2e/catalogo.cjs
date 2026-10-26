// Prueba de punta a punta: el catálogo busca en más campos, tiene filtros extra y al
// regresar de una ficha conserva la búsqueda, los filtros y la posición.
// Requiere el admin manuel@adb.test / Prueba1234 creado con functions/scripts/crear-admin.mjs.
// Uso: node e2e/catalogo.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
const S = process.argv[2] ?? 'e2e/salida'
const BASE = 'http://localhost:4173'
const FS = 'http://127.0.0.1:8080/v1/projects/demo-instrumentacion-adb/databases/(default)/documents'
require('fs').mkdirSync(path.join(S, 'shots'), { recursive: true })
const shot = (p, n) => p.screenshot({ path: path.join(S, 'shots', n + '.png') })
const lote = Date.now().toString(36).slice(-4).toUpperCase()

const valor = (v) =>
  v === null
    ? { nullValue: null }
    : v instanceof Date
      ? { timestampValue: v.toISOString() }
      : Array.isArray(v)
        ? { arrayValue: { values: v.map(valor) } }
        : typeof v === 'number'
          ? { doubleValue: v }
          : { stringValue: v }

/** Crea un instrumento directo en el emulador (como si ya existiera en el catálogo). */
async function sembrar(id, datos) {
  const fields = Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, valor(v)]))
  const r = await fetch(`${FS}/instrumentos?documentId=${id}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!r.ok) throw new Error(`no se pudo sembrar ${id}: ${await r.text()}`)
}

const dias = (n) => new Date(Date.now() + n * 86_400_000)

;(async () => {
  // 40 instrumentos: los pares son Rosemount; 5 con calibración vencida, 3 por vencer.
  for (let n = 0; n < 40; n++) {
    const tag = `LT-${lote}${String(n).padStart(2, '0')}`
    await sembrar(`cat-${lote}-${n}`, {
      tagISA: tag,
      servicio: `Nivel de tanque ${n}`,
      area: n < 30 ? 'Tratamiento de agua' : 'Generación de vapor',
      ubicacionTexto: n === 7 ? `Azotea del clarificador ${lote}` : '',
      lazo: '',
      pid: '',
      marca: n % 2 === 0 ? 'Rosemount' : 'Endress+Hauser',
      modelo: '',
      serie: `SN${lote}-${n}`,
      rangoMin: null,
      rangoMax: null,
      unidades: '',
      senal: '4-20 mA',
      alimentacion: '',
      nfcToken: null,
      estado: 'Operando',
      proximaCalibracion: n < 5 ? dias(-10) : n < 8 ? dias(15) : dias(200),
      docs: [],
      portadaMiniatura: null,
    })
  }
  console.log('40 instrumentos sembrados, lote', lote)

  const browser = await chromium.launch()
  const page = await (await browser.newContext({ ...devices['Pixel 7'] })).newPage()
  const errores = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.goto(`${BASE}/login`)
  await page.fill('#email', 'manuel@adb.test')
  await page.fill('#pass', 'Prueba1234')
  await page.click('button:has-text("Entrar")')
  await page.waitForSelector('text=Menú')
  await page.goto(`${BASE}/catalogo`)
  await page.waitForSelector('text=/de \\d+ instrumentos/')

  const conteo = async () => Number((await page.locator('text=/\\d+ de \\d+ instrumentos/').innerText()).split(' ')[0])
  const buscar = page.locator('input[aria-label="Buscar"]')

  // Busca por número de serie, marca y ubicación (antes solo tag, servicio, área y lazo).
  await buscar.fill(`sn${lote}-17`)
  await page.waitForTimeout(400)
  if ((await conteo()) !== 1) throw new Error('la búsqueda por serie no funcionó')
  await buscar.fill(`clarificador ${lote}`)
  await page.waitForTimeout(400)
  if ((await conteo()) !== 1) throw new Error('la búsqueda por ubicación no funcionó')
  await buscar.fill(`rosemount nivel`)
  await page.waitForTimeout(400)
  await buscar.fill(`LT-${lote}`)
  await page.waitForTimeout(400)
  if ((await conteo()) !== 40) throw new Error(`esperaba 40 del lote y hay ${await conteo()}`)
  console.log('búsqueda por serie, ubicación y tag ok')

  await page.selectOption('select[aria-label="Otros filtros"]', 'vencidas')
  await page.waitForTimeout(300)
  if ((await conteo()) !== 5) throw new Error(`esperaba 5 vencidas y hay ${await conteo()}`)
  await page.selectOption('select[aria-label="Otros filtros"]', 'por-vencer')
  await page.waitForTimeout(300)
  if ((await conteo()) !== 3) throw new Error(`esperaba 3 por vencer y hay ${await conteo()}`)
  await page.selectOption('select[aria-label="Otros filtros"]', '')
  await page.selectOption('select[aria-label="Área"]', 'Generación de vapor')
  await page.waitForTimeout(300)
  if ((await conteo()) !== 10) throw new Error(`esperaba 10 de Generación de vapor y hay ${await conteo()}`)
  await page.selectOption('select[aria-label="Área"]', '')
  console.log('filtros extra ok')

  // Bajar en la lista, abrir una ficha y regresar.
  await page.mouse.wheel(0, 1800)
  await page.waitForTimeout(600)
  const y = await page.evaluate(() => window.scrollY)
  if (y < 1000) throw new Error(`no bajó la lista (scrollY ${y})`)
  const fila = page.locator('a[href^="/instrumentos/"]', { hasText: `LT-${lote}` }).nth(8)
  const tagFila = (await fila.locator('.font-mono').innerText()).trim()
  await fila.click()
  await page.waitForURL(/\/instrumentos\/cat-/)
  await page.waitForSelector(`h1:has-text("${tagFila}")`)
  const yFicha = await page.evaluate(() => window.scrollY)
  // Playwright acomoda la fila antes de tocarla: la altura buena es la del momento del toque.
  const yToque = Number(await page.evaluate(() => sessionStorage.getItem('catalogo-scroll')))
  if (yToque < 500) throw new Error(`altura guardada muy baja (${yToque})`)
  if (yFicha !== 0) throw new Error(`la ficha no abrió desde arriba (scrollY ${yFicha})`)
  console.log('la ficha abre desde arriba ok')

  await page.goBack()
  await page.waitForSelector('text=/de \\d+ instrumentos/')
  await page.waitForTimeout(800)
  if ((await buscar.inputValue()) !== `LT-${lote}`) throw new Error('se perdió la búsqueda')
  const yVuelta = await page.evaluate(() => window.scrollY)
  if (Math.abs(yVuelta - yToque) > 5) throw new Error(`no regresó a la misma altura (${yToque} → ${yVuelta})`)
  if (!(await page.locator(`text=${tagFila}`).isVisible())) throw new Error('la fila abierta no está a la vista')
  await shot(page, '70-catalogo-al-regresar')
  console.log(`al regresar conserva búsqueda y posición ok (${yToque} → ${yVuelta})`)

  await page.click('button:has-text("Quitar filtros")')
  await page.waitForTimeout(300)
  if ((await buscar.inputValue()) !== '') throw new Error('Quitar filtros no limpió la búsqueda')
  console.log('quitar filtros ok')

  console.log('errores de página:', errores)
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
