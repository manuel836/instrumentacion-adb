// Prueba de punta a punta: refacciones. Alta con existencia inicial, entradas, salidas,
// conteo, uso en una falla, "por pedir", la ficha, el inventario en Excel y qué pasa
// al borrar un instrumento compatible. El operador solo consulta.
// Requiere el admin manuel@adb.test / Prueba1234 y los emuladores corriendo.
// Uso: node e2e/refacciones.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
const fs = require('fs')
const S = process.argv[2] ?? 'e2e/salida'
const BASE = 'http://localhost:4173'
const FS = 'http://127.0.0.1:8080/v1/projects/demo-instrumentacion-adb/databases/(default)/documents'
fs.mkdirSync(path.join(S, 'shots'), { recursive: true })
const shot = (p, n) => p.screenshot({ path: path.join(S, 'shots', n + '.png') })
const lote = Date.now().toString(36).slice(-4).toUpperCase()
const tag = `LV-${lote}`
const instId = `ref-${lote}`
const nombre = `Sello de diafragma ${lote}`

const valor = (v) =>
  v === null
    ? { nullValue: null }
    : v instanceof Date
      ? { timestampValue: v.toISOString() }
      : Array.isArray(v)
        ? { arrayValue: { values: v.map(valor) } }
        : typeof v === 'number'
          ? { integerValue: String(v) }
          : typeof v === 'object'
            ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, valor(x)])) } }
            : { stringValue: v }

async function sembrar(coleccion, id, datos) {
  const fields = Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, valor(v)]))
  const r = await fetch(`${FS}/${coleccion}?documentId=${id}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!r.ok) throw new Error(`no se pudo sembrar ${id}: ${await r.text()}`)
}

async function abrir(browser) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], acceptDownloads: true })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror', e.message))
  page.on('console', (m) => m.type() === 'error' || m.type() === 'warning' ? console.log('consola:', m.text().slice(0, 300)) : null)
  return page
}

async function login(page, email, pass) {
  await page.goto(`${BASE}/login`)
  await page.fill('#email', email)
  await page.fill('#pass', pass)
  await page.click('button:has-text("Entrar")')
  await page.waitForSelector('text=Menú')
}

/** Espera a que la existencia grande de la refacción muestre n. */
async function esperarExistencia(page, n, cuando) {
  await page
    .waitForFunction((n) => document.querySelector('main section span.text-4xl')?.textContent === String(n), n, { timeout: 10000 })
    .catch(async () => {
      throw new Error(`${cuando}: la existencia es ${await page.locator('main section span.text-4xl').innerText()} y no ${n}`)
    })
}

;(async () => {
  await sembrar('instrumentos', instId, {
    tagISA: tag,
    servicio: 'Válvula de control de vapor',
    area: 'Generación de vapor',
    ubicacionTexto: '',
    lazo: '',
    pid: '',
    marca: 'Fisher',
    modelo: '',
    serie: '',
    rangoMin: null,
    rangoMax: null,
    unidades: '',
    senal: '4-20 mA',
    alimentacion: '',
    nfcToken: null,
    estado: 'Con falla',
    proximaCalibracion: null,
    docs: [],
  })
  await sembrar('fallas', `${instId}-f`, {
    instrumentoId: instId,
    tagISA: tag,
    area: 'Generación de vapor',
    estado: 'Abierta',
    reportadoPor: { uid: 'op', nombre: 'Ana Operadora' },
    tecnicoAsignado: null,
    descripcion: 'Fuga por el sello',
    fotos: [],
    causaRaiz: '',
    accionCorrectiva: '',
    fechas: { creada: new Date(), tomada: null, cerrada: null },
  })

  const browser = await chromium.launch()
  const page = await abrir(browser)
  await login(page, 'manuel@adb.test', 'Prueba1234')

  // Alta desde el menú, con 3 en existencia y el instrumento compatible.
  await page.click('text=Menú')
  await page.click('a:has-text("Refacciones")')
  await page.waitForSelector('text=/\\d+ de \\d+ refacciones/')
  await page.click('a:has-text("Nueva")')
  await page.fill('input[placeholder="Sello de diafragma"]', nombre)
  await page.locator('label', { hasText: 'Número de parte' }).locator('input').fill('GE-12345')
  await page.locator('label', { hasText: 'Marca' }).locator('input').fill('Fisher')
  await page.locator('label', { hasText: 'Ubicación en almacén' }).locator('input').fill('Almacén A, anaquel 3')
  await page.fill('input[aria-label="Mínimo"]', '2')
  await page.fill('input[aria-label="Existencia inicial"]', '3')
  await page.fill('input[aria-label="Buscar instrumento compatible"]', tag)
  await page.click(`button:has-text("${tag}")`)
  await page.waitForSelector(`li:has-text("${tag}") >> button[aria-label^="Quitar"]`)
  await shot(page, '150-nueva-refaccion')
  await page.click('button:has-text("Dar de alta")')
  await page.waitForSelector(`h1:has-text("${nombre}")`)
  await page.waitForSelector('text=Existencia inicial')
  await esperarExistencia(page, 3, 'alta')
  console.log('alta con existencia inicial ok')

  // Salida para el instrumento: queda en 1 y aparece "Por pedir".
  await page.click('button:has-text("Salida")')
  await page.fill('input[aria-label="Cantidad"]', '5')
  await page.click('button:has-text("Registrar salida")')
  await page.waitForSelector('text=Solo hay 3 pza')
  await page.fill('input[aria-label="Cantidad"]', '2')
  await page.selectOption('select', { label: `${tag} · Válvula de control de vapor` })
  await page.fill('input[placeholder="Para qué se usó"]', 'Cambio preventivo')
  await page.click('button:has-text("Registrar salida")')
  await page.waitForSelector('text=Salida de 2 pza registrada.')
  await esperarExistencia(page, 1, 'salida')
  await page.waitForSelector('text=Por pedir')
  console.log('salida (no deja sacar más de lo que hay) y "por pedir" ok')

  await page.click('button:has-text("Entrada")')
  await page.fill('input[aria-label="Cantidad"]', '4')
  await page.fill('input[placeholder^="Orden de compra"]', 'OC 4512')
  await page.click('button:has-text("Registrar entrada")')
  await page.waitForSelector('text=Entrada de 4 pza registrada.')
  await esperarExistencia(page, 5, 'entrada')
  console.log('entrada ok')

  await page.click('button:has-text("Conteo")')
  await page.fill('input[aria-label="Cantidad"]', '4')
  await page.click('button:has-text("Ajustar existencia")')
  await page.waitForSelector('text=Existencia ajustada a 4 (-1).')
  await esperarExistencia(page, 4, 'conteo')
  const kardex = page.locator('section', { has: page.locator('h2:has-text("Movimientos")') }).locator('li')
  await page.waitForFunction(() => document.querySelectorAll('section li span.w-14').length >= 4)
  const textos = await kardex.allInnerTexts()
  if (!/-1[\s\S]*Ajuste por conteo/.test(textos[0]) || !/\+4[\s\S]*OC 4512/.test(textos[1]) || !/-2[\s\S]*Cambio preventivo/.test(textos[2]) || !/\+3[\s\S]*Existencia inicial/.test(textos[3]))
    throw new Error(`kardex raro: ${textos.join(' | ')}`)
  await shot(page, '151-refaccion-kardex')
  console.log('conteo y kardex ok')

  // En la falla del instrumento: se registra la refacción usada.
  await page.goto(`${BASE}/fallas/${instId}-f`)
  await page.click('section:has(h2:has-text("Refacciones usadas")) >> button:has-text("+ Registrar")')
  await page.selectOption('select[aria-label="Refacción usada"]', { label: `${nombre} (hay 4)` })
  await page.fill('input[aria-label="Cantidad usada"]', '2')
  await page.click('button:has-text("Registrar salida")')
  await page.locator('section', { has: page.locator('h2:has-text("Refacciones usadas")') }).locator(`a:has-text("${nombre}")`).waitFor()
  await shot(page, '152-falla-refaccion-usada')
  await page.click(`a:has-text("${nombre}")`)
  await page.waitForSelector(`h1:has-text("${nombre}")`)
  await esperarExistencia(page, 2, 'refacción usada en la falla')
  await page.waitForSelector(`a:has-text("falla de ${tag}")`)
  await page.waitForSelector('text=Por pedir')
  console.log('refacción usada en la falla, descontada y ligada ok')

  // En el servidor quedó lo mismo (ninguna escritura rechazada por las reglas).
  const refId = new URL(page.url()).pathname.split('/').pop()
  await page.waitForTimeout(1500)
  const enServidor = await (await fetch(`${FS}/refacciones/${refId}`, { headers: { Authorization: 'Bearer owner' } })).json()
  const movs = await (
    await fetch(`${FS}:runQuery`, {
      method: 'POST',
      headers: { Authorization: 'Bearer owner', 'content-type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: { from: [{ collectionId: 'movimientos' }], where: { fieldFilter: { field: { fieldPath: 'refaccionId' }, op: 'EQUAL', value: { stringValue: refId } } } },
      }),
    })
  ).json()
  const suma = movs.filter((r) => r.document).reduce((t, r) => t + Number(r.document.fields.cantidad.integerValue), 0)
  if (enServidor.fields.existencia.integerValue !== '2' || suma !== 2 || movs.filter((r) => r.document).length !== 5)
    throw new Error(`servidor: existencia ${enServidor.fields.existencia.integerValue}, suma de movimientos ${suma}`)
  console.log('servidor: existencia 2 = suma de sus 5 movimientos ok')

  // La ficha del instrumento la muestra; el inicio y la lista la cuentan "por pedir".
  await page.goto(`${BASE}/instrumentos/${instId}`)
  await page.locator('section', { has: page.locator('h2:has-text("Refacciones")') }).locator(`text=${nombre}`).waitFor()
  await page.locator('section', { has: page.locator('h2:has-text("Refacciones")') }).locator('text=2 pza').waitFor()
  await page.goto(`${BASE}/refacciones?filtro=por-pedir`)
  await page.waitForSelector(`a:has-text("${nombre}")`)
  await page.goto(`${BASE}/`)
  await page.waitForSelector('main a[data-cifra]:has-text("por pedir")')
  console.log('ficha, inicio y filtro "por pedir" ok')

  // Inventario en Excel.
  await page.click('text=Menú')
  await page.click('text=Exportar')
  await page.click('text=Inventario de refacciones')
  await page.waitForSelector('text=/\\d+ registros?/')
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Excel")')])
  const xlsx = path.join(S, await descarga.suggestedFilename())
  await descarga.saveAs(xlsx)
  if (!/^refacciones-.*\.xlsx$/.test(path.basename(xlsx)) || fs.statSync(xlsx).size < 2000) throw new Error('Excel raro')
  console.log(`inventario en Excel ok (${path.basename(xlsx)})`)

  // En la bitácora queda el alta.
  await page.goto(`${BASE}/bitacora`)
  await page.locator('li', { hasText: nombre }).filter({ hasText: 'Refacción' }).first().waitFor({ timeout: 20000 })
  console.log('alta en la bitácora ok')

  // Un operador consulta pero no registra.
  const email = `op-ref-${lote.toLowerCase()}@adb.test`
  await page.goto(`${BASE}/usuarios`)
  await page.fill('input[placeholder="Nombre"]', 'Olga Refacciones')
  await page.fill('input[placeholder="Correo"]', email)
  await page.fill('input[placeholder^="Contraseña"]', 'Prueba1234')
  await page.click('button:has-text("Crear usuario")')
  await page.waitForSelector(`text=Usuario ${email} creado.`, { timeout: 20000 })
  const op = await abrir(browser)
  await login(op, email, 'Prueba1234')
  await op.goto(`${BASE}/refacciones`)
  await op.waitForSelector(`a:has-text("${nombre}")`)
  if ((await op.locator('a:has-text("Nueva")').count()) !== 0) throw new Error('el operador puede dar de alta')
  await op.click(`a:has-text("${nombre}")`)
  await op.waitForSelector('text=Movimientos')
  if ((await op.locator('button:has-text("Salida")').count()) !== 0) throw new Error('el operador puede sacar refacciones')
  console.log('el operador solo consulta ok')

  // Al borrar el instrumento la refacción ya no lo lista, pero su kardex conserva el tag.
  await page.goto(`${BASE}/instrumentos/${instId}`)
  await page.click('button:has-text("Borrar instrumento")')
  await page.fill('input[aria-label="Escribe el tag para confirmar"]', tag)
  await page.click('button:has-text("Sí, borrar")')
  await page.waitForURL('**/catalogo', { timeout: 30000 })
  await page.goto(`${BASE}/refacciones`)
  await page.click(`a:has-text("${nombre}")`)
  await page.locator('section', { has: page.locator('h2:has-text("Instrumentos donde se usa")') }).locator('text=Ninguno registrado.').waitFor({ timeout: 20000 })
  await page.waitForSelector(`text=falla de ${tag}`)
  console.log('al borrar el instrumento la refacción lo suelta y el kardex conserva el tag ok')

  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
