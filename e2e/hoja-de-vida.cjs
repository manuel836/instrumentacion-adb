// Prueba de punta a punta: la hoja de vida de un instrumento junta datos, fotos,
// calibraciones, fallas y documentos, y sale bien como PDF.
// Requiere el admin manuel@adb.test / Prueba1234 y los emuladores corriendo.
// Uso: node e2e/hoja-de-vida.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
const fs = require('fs')
const S = process.argv[2] ?? 'e2e/salida'
const BASE = 'http://localhost:4173'
const FS = 'http://127.0.0.1:8080/v1/projects/demo-instrumentacion-adb/databases/(default)/documents'
fs.mkdirSync(path.join(S, 'shots'), { recursive: true })
const shot = (p, n, o = {}) => p.screenshot({ path: path.join(S, 'shots', n + '.png'), ...o })
const lote = Date.now().toString(36).slice(-4).toUpperCase()
const id = `hv-${lote}`
const tag = `PT-${lote}`

const valor = (v) =>
  v === null
    ? { nullValue: null }
    : v instanceof Date
      ? { timestampValue: v.toISOString() }
      : Array.isArray(v)
        ? { arrayValue: { values: v.map(valor) } }
        : typeof v === 'boolean'
          ? { booleanValue: v }
          : typeof v === 'number'
            ? Number.isInteger(v)
              ? { integerValue: String(v) }
              : { doubleValue: v }
            : typeof v === 'object'
              ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, valor(x)])) } }
              : { stringValue: v }

async function sembrar(ruta, docId, datos) {
  const fields = Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, valor(v)]))
  const r = await fetch(`${FS}/${ruta}?documentId=${docId}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!r.ok) throw new Error(`no se pudo sembrar ${ruta}/${docId}: ${await r.text()}`)
}

const hace = (dias, horas = 0) => new Date(Date.now() - dias * 86_400_000 - horas * 3_600_000)
const juan = { uid: 'tec-juan', nombre: 'Juan Técnico' }
const icono = `${BASE}/icons/icon-512.png`

;(async () => {
  await sembrar('instrumentos', id, {
    tagISA: tag,
    servicio: 'Presión de vapor a la turbina',
    area: 'Generación de vapor',
    ubicacionTexto: 'Cabezal de vapor, nivel 2',
    lazo: 'PIC-301',
    pid: 'DTI-GV-004',
    marca: 'Rosemount',
    modelo: '3051TG',
    serie: 'SN-778812',
    rangoMin: 0,
    rangoMax: 40,
    unidades: 'kg/cm²',
    senal: '4-20 mA + HART',
    alimentacion: '24 VCD',
    nfcToken: null,
    estado: 'Con falla',
    proximaCalibracion: hace(3),
    docs: [{ nombre: 'Manual 3051.pdf', ruta: `instrumentos/${id}/docs/manual.pdf`, url: null, tipo: 'application/pdf' }],
    portadaMiniatura: null,
  })
  const foto = (n, esPortada, pie) =>
    sembrar(`instrumentos/${id}/ubicacion`, `f${n}`, {
      ruta: `instrumentos/${id}/ubicacion/f${n}.jpg`,
      miniatura: `instrumentos/${id}/ubicacion/f${n}_min.jpg`,
      url: icono,
      miniaturaUrl: icono,
      pie,
      orden: n,
      esPortada,
      autor: 'Manuel',
      fecha: hace(100),
    })
  await foto(0, false, 'Vista desde la escalera')
  await foto(1, true, 'Junto a la válvula de bloqueo')
  await foto(2, false, 'Placa de datos')
  const cal = (n, dias, puntos, resultado, proxima, observaciones) =>
    sembrar(`instrumentos/${id}/calibraciones`, `c${n}`, {
      fecha: hace(dias),
      tecnico: juan,
      puntos,
      tolerancia: 0.5,
      rangoMin: 0,
      rangoMax: 40,
      unidades: 'kg/cm²',
      patron: 'Fluke 754 SN 4411',
      resultado,
      observaciones,
      proxima,
    })
  const p = (entrada, asFound, asLeft = null) => ({ entrada, asFound, asLeft })
  await cal(1, 400, [p(0, 0.04), p(20, 20.08), p(40, 40.1)], 'Aprobada sin ajuste', hace(35), '')
  await cal(2, 200, [p(0, 0.3, 0.02), p(20, 20.4, 20.04), p(40, 40.5, 40.06)], 'Ajustada', hace(3), 'Se ajustó el cero y el span.')
  await cal(3, 380, [p(0, 0.6, 0.5), p(40, 41, 40.4)], 'Fuera de tolerancia', null, 'Sensor dañado, se cambió.')
  const falla = (n, estado, dias, extra) =>
    sembrar('fallas', `${id}-f${n}`, {
      instrumentoId: id,
      tagISA: tag,
      area: 'Generación de vapor',
      estado,
      reportadoPor: { uid: 'op-ana', nombre: 'Ana Operadora' },
      tecnicoAsignado: null,
      descripcion: `Falla ${n} de prueba`,
      fotos: [],
      causaRaiz: '',
      accionCorrectiva: '',
      fechas: { creada: hace(dias), tomada: null, cerrada: null },
      ...extra,
    })
  await falla(1, 'Cerrada', 60, {
    tecnicoAsignado: juan,
    causaRaiz: 'Toma de impulso tapada',
    accionCorrectiva: 'Se sopló la toma',
    fechas: { creada: hace(60, 30), tomada: hace(60, 29), cerrada: hace(60) },
  })
  await falla(2, 'Abierta', 1, {})
  console.log(`sembrado ${tag} con 3 fotos, 3 calibraciones y 2 fallas`)

  const browser = await chromium.launch()
  const page = await (await browser.newContext({ ...devices['Pixel 7'] })).newPage()
  const errores = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.goto(`${BASE}/login`)
  await page.fill('#email', 'manuel@adb.test')
  await page.fill('#pass', 'Prueba1234')
  await page.click('button:has-text("Entrar")')
  await page.waitForSelector('h1:has-text("Hola")')

  await page.goto(`${BASE}/instrumentos/${id}`)
  await page.click('a:has-text("Hoja de vida")')
  await page.waitForURL(`**/instrumentos/${id}/hoja-de-vida`)
  await page.waitForSelector(`h1:has-text("Hoja de vida")`)
  if ((await page.title()) !== `Hoja de vida ${tag}`) throw new Error(`título: ${await page.title()}`)
  if ((await page.locator('nav').count()) !== 0) throw new Error('la hoja lleva el menú de la app')

  const texto = await page.locator('main').innerText()
  const debe = [
    tag,
    'Presión de vapor a la turbina',
    'Rosemount',
    '0 a 40 kg/cm²',
    '(vencida)',
    'Junto a la válvula de bloqueo',
    '3 calibraciones',
    '2 fallas: 1 cerrada, 1 abierta o en proceso',
    'Tiempo promedio para cerrar una falla: 30.0 horas',
    'Manual 3051.pdf',
    'Toma de impulso tapada',
    'Se ajustó el cero y el span.',
  ]
  for (const t of debe) if (!texto.includes(t)) throw new Error(`a la hoja le falta "${t}"`)

  const filas = (titulo) => page.locator('section', { has: page.locator(`h2:has-text("${titulo}")`) }).locator('tbody tr')
  if ((await filas('Calibraciones').count()) !== 3) throw new Error('faltan calibraciones')
  if ((await filas('Historial de fallas').count()) !== 2) throw new Error('faltan fallas')
  // La más reciente primero; error máximo antes/después del ajuste en % del span.
  const ajustada = (await filas('Calibraciones').nth(0).innerText()).split('\t').map((s) => s.trim())
  if (ajustada[1] !== 'Ajustada' || ajustada[2] !== '+1.25 %' || ajustada[3] !== '+0.15 %') throw new Error(`fila rara: ${ajustada.join(' | ')}`)
  const cerrada = await filas('Historial de fallas').nth(1).innerText()
  if (!cerrada.includes('30.0 h') || !cerrada.includes('Juan Técnico')) throw new Error(`falla cerrada rara: ${cerrada}`)
  if ((await page.locator('main figure').count()) !== 3) throw new Error('faltan fotos')
  console.log('la hoja trae datos, fotos, calibraciones, fallas y documentos ok')
  await shot(page, '130-hoja-de-vida', { fullPage: true })

  // Así sale el PDF (lo mismo que "Guardar como PDF" en el teléfono).
  await page.emulateMedia({ media: 'print' })
  if (await page.locator('button:has-text("Imprimir")').isVisible()) throw new Error('los botones salen en el PDF')
  const pdf = path.join(S, 'hoja-de-vida.pdf')
  await page.pdf({ path: pdf, format: 'Letter', printBackground: true, preferCSSPageSize: true })
  const paginas = (fs.readFileSync(pdf, 'latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
  console.log(`PDF de ${paginas} ${paginas === 1 ? 'página' : 'páginas'} (${Math.round(fs.statSync(pdf).size / 1024)} KB) ok`)
  await page.emulateMedia({ media: 'screen' })

  await page.click('button:has-text("Volver")')
  await page.waitForURL(`**/instrumentos/${id}`)
  console.log('volver regresa a la ficha ok')
  console.log('errores de página:', errores)
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
