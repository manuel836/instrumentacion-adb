// Prueba de punta a punta: el aviso semanal de calibraciones. Cada técnico recibe solo su
// área (o todas si no tiene) y los números del aviso son los mismos del inicio y del catálogo.
// El emulador no corre funciones programadas: se llama directo a la lógica que usa la función.
// Requiere el admin manuel@adb.test / Prueba1234 y datos de las otras pruebas (e2e/areas.cjs).
// Uso: node e2e/aviso-calibraciones.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
const S = process.argv[2] ?? 'e2e/salida'
const BASE = 'http://localhost:4173'
const FS = 'http://127.0.0.1:8080/v1/projects/demo-instrumentacion-adb/databases/(default)/documents'
require('fs').mkdirSync(path.join(S, 'shots'), { recursive: true })
const shot = (p, n) => p.screenshot({ path: path.join(S, 'shots', n + '.png') })
const lote = Date.now().toString(36).slice(-4).toUpperCase()
const AMONIACO = 'Almacenamiento de amoniaco'

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
            ? { doubleValue: v }
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

/** Mediodía en la planta, n días desde hoy (así guarda la app las fechas). */
function dia(n) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())
  return new Date(new Date(`${ymd}T12:00:00-06:00`).getTime() + n * 86_400_000)
}

const instrumento = (tag, proxima) => ({
  tagISA: tag,
  servicio: 'Prueba del aviso de calibraciones',
  area: AMONIACO,
  ubicacionTexto: '',
  lazo: '',
  pid: '',
  marca: '',
  modelo: '',
  serie: '',
  rangoMin: null,
  rangoMax: null,
  unidades: '',
  senal: '4-20 mA',
  alimentacion: '',
  nfcToken: null,
  estado: 'Operando',
  proximaCalibracion: proxima,
  docs: [],
})

const numero = (cuerpo, re) => Number(re.exec(cuerpo)?.[1] ?? 0)

;(async () => {
  // Bordes: ayer (vencida), hoy y el día 30 (por vencer), el día 31 (todavía no).
  const tags = { ayer: `PI-${lote}A`, hoy: `PI-${lote}B`, d30: `PI-${lote}C`, d31: `PI-${lote}D` }
  await sembrar('instrumentos', `cal-${lote}-a`, instrumento(tags.ayer, dia(-1)))
  await sembrar('instrumentos', `cal-${lote}-b`, instrumento(tags.hoy, dia(0)))
  await sembrar('instrumentos', `cal-${lote}-c`, instrumento(tags.d30, dia(30)))
  await sembrar('instrumentos', `cal-${lote}-d`, instrumento(tags.d31, dia(31)))
  // Un técnico de amoniaco y uno dado de baja (a ese no le llega nada).
  await sembrar('usuarios', `tec-amoniaco-${lote}`, { nombre: 'Tere Amoniaco', email: '', rol: 'tecnico', area: AMONIACO, activo: true, tokensFCM: [] })
  await sembrar('usuarios', `baja-amoniaco-${lote}`, { nombre: 'Beto Baja', email: '', rol: 'tecnico', area: AMONIACO, activo: false, tokensFCM: [] })
  await sembrar('usuarios', `op-amoniaco-${lote}`, { nombre: 'Olga Operadora', email: '', rol: 'operador', area: AMONIACO, activo: true, tokensFCM: [] })

  process.env.GCLOUD_PROJECT = 'demo-instrumentacion-adb'
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  const { avisosDeCalibracion } = await import(path.resolve('functions/lib/index.js'))
  const avisos = await avisosDeCalibracion(new Date())
  for (const a of avisos) console.log(`  [${a.area || 'Todas'}] ${a.uids.length} personas · ${a.aviso.titulo}: ${a.aviso.cuerpo}`)

  const amoniaco = avisos.find((a) => a.area === AMONIACO)
  if (!amoniaco) throw new Error('no hay aviso para amoniaco')
  const uids = amoniaco.uids
  if (!uids.includes(`tec-amoniaco-${lote}`)) throw new Error('al técnico de amoniaco no le llega')
  if (uids.includes(`baja-amoniaco-${lote}`) || uids.includes(`op-amoniaco-${lote}`)) throw new Error('le llega a alguien que no debe')
  const c = amoniaco.aviso.cuerpo
  if (!c.includes(tags.ayer) && !/\d+ más/.test(c)) throw new Error('falta la vencida de ayer')
  if (c.includes(tags.d31)) throw new Error('el día 31 no debe avisarse')
  if (!amoniaco.aviso.ruta.includes('filtro=vencidas')) throw new Error(`ruta rara: ${amoniaco.aviso.ruta}`)
  if (avisos.some((a) => a.area && a.area !== AMONIACO && a.aviso.cuerpo.includes(tags.ayer))) throw new Error('el aviso de otra área trae amoniaco')
  const todas = avisos.find((a) => a.area === '')
  if (!todas || !todas.aviso.cuerpo.match(/vencidas?/)) throw new Error('a quien ve todas no le llega el aviso')
  console.log('cada quien recibe solo su área ok')

  // Los números del aviso son los del inicio y los del catálogo (con la hora de la planta).
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ ...devices['Pixel 7'], timezoneId: 'America/Mexico_City' })).newPage()
  await page.goto(`${BASE}/login`)
  await page.fill('#email', 'manuel@adb.test')
  await page.fill('#pass', 'Prueba1234')
  await page.click('button:has-text("Entrar")')
  await page.waitForSelector('h1:has-text("Hola")')
  const cifra = (texto) => page.locator('main a[data-cifra]').filter({ has: page.getByText(texto, { exact: true }) }).locator('span.text-2xl')

  for (const a of avisos) {
    const vencidas = numero(a.aviso.cuerpo, /(\d+) vencidas?:/)
    const porVencer = numero(a.aviso.cuerpo, /(\d+) vencen? en 30 días/)
    await page.goto(`${BASE}/?area=${encodeURIComponent(a.area || 'todas')}`)
    await page.waitForSelector('text=/Catálogo: \\d+ instrumentos?/')
    const enInicio = [Number(await cifra('vencidas').innerText()), Number(await cifra('vencen en 30 días').innerText())]
    if (enInicio[0] !== vencidas || enInicio[1] !== porVencer)
      throw new Error(`[${a.area || 'Todas'}] aviso ${vencidas}/${porVencer}, inicio ${enInicio.join('/')}`)
    // Tocar la notificación abre el catálogo ya filtrado.
    await page.goto(`${BASE}${a.aviso.ruta}`)
    await page.waitForSelector('text=/\\d+ de \\d+ instrumentos/')
    await page.waitForTimeout(300)
    const enCatalogo = Number((await page.locator('text=/\\d+ de \\d+ instrumentos/').innerText()).split(' ')[0])
    const esperado = a.aviso.ruta.includes('vencidas') ? vencidas : porVencer
    if (enCatalogo !== esperado) throw new Error(`[${a.area || 'Todas'}] el catálogo muestra ${enCatalogo} y el aviso dice ${esperado}`)
    console.log(`  [${a.area || 'Todas'}] ${vencidas} vencidas, ${porVencer} por vencer = inicio = catálogo ok`)
  }
  await page.goto(`${BASE}${amoniaco.aviso.ruta}`)
  await page.waitForSelector(`text=${tags.ayer}`)
  await shot(page, '120-aviso-calibraciones-catalogo')
  console.log('números del aviso iguales al inicio y al catálogo ok')

  await browser.close()
  process.exit(0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
