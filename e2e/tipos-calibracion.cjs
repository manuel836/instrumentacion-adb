// Prueba de punta a punta del tipo de instrumento: el formulario lo sugiere por el tag y pide
// los datos de su tipo, y Registrar calibración cambia la prueba según el tipo (válvula de corte,
// transmisor leído en mA, interruptor, válvula de control con señal invertida, válvulas de doble efecto).
// Requiere el admin manuel@adb.test / Prueba1234 y los emuladores corriendo.
// Uso: node e2e/tipos-calibracion.cjs
const { chromium, devices } = require('playwright')
const fs = require('fs')
const path = require('path')
const { createRequire } = require('module')
const S = process.argv[2] ?? 'e2e/salida'
const REPO = process.argv[3] ?? process.cwd()
const BASE = 'http://localhost:4173'
fs.mkdirSync(path.join(S, 'shots'), { recursive: true })
const shot = (p, n) => p.screenshot({ path: path.join(S, 'shots', n + '.png'), fullPage: true })
const n = (Date.now() % 9000) + 1000

function firestore() {
  process.env.GCLOUD_PROJECT = 'demo-instrumentacion-adb'
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  const req = createRequire(path.resolve(REPO, 'functions/package.json'))
  const { initializeApp, getApps } = req('firebase-admin/app')
  const { getFirestore } = req('firebase-admin/firestore')
  if (!getApps().length) initializeApp({ projectId: 'demo-instrumentacion-adb' })
  return getFirestore()
}

/** Un instrumento como los de antes (sin los campos de tipo), más lo que se le pase. */
async function instrumento(datos) {
  const ref = await firestore()
    .collection('instrumentos')
    .add({ area: 'Generación de vapor', estado: 'Operando', nfcToken: null, docs: [], portadaMiniatura: null, senal: '4-20 mA', ...datos })
  return ref.id
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
async function hasta(fn, que) {
  for (let i = 0; i < 40; i++) {
    const v = await fn()
    if (v) return v
    await esperar(250)
  }
  throw new Error(`no llegó: ${que}`)
}

async function calibraciones(id) {
  return (await firestore().collection(`instrumentos/${id}/calibraciones`).get()).docs.map((d) => d.data())
}

/** Marca todas las revisiones con Bien y, si se pide, una con Mal. */
async function revisar(page, mal) {
  const grupos = page.locator('ul [role="radiogroup"]')
  const total = await grupos.count()
  for (let i = 0; i < total; i++) await grupos.nth(i).locator('button:has-text("Bien")').click()
  if (mal) await page.locator(`[role="radiogroup"][aria-label="${mal}"] button:has-text("Mal")`).click()
  return total
}

const sugerencia = (page) => page.locator('label:has-text("Resultado *") select option').first().innerText()

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...devices['Pixel 7'] })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror', e.message))
  page.on('console', (m) => m.type() === 'error' && console.log('consola', m.text().slice(0, 300)))
  await page.goto(`${BASE}/login`)
  await page.fill('#email', 'manuel@adb.test')
  await page.fill('#pass', 'Prueba1234')
  await page.click('button:has-text("Entrar")')
  await page.waitForSelector('text=Menú')

  // ---------- Alta de una válvula de corte: el tipo sale del tag ----------
  const KV = `KV-${n}`
  await page.goto(`${BASE}/instrumentos/nuevo`)
  await page.fill('input[placeholder="PT-101"]', KV)
  const tipo = await page.locator('select[aria-label="Tipo de instrumento"]').inputValue()
  if (tipo !== 'Válvula de corte') throw new Error(`el tag ${KV} no sugirió válvula de corte: "${tipo}"`)
  await page.waitForSelector('text=Sugerido por el tag')
  await page.fill('input[placeholder="Presión de vapor a cabezal"]', 'Corte de gas a quemador')
  await page.click('[role="radiogroup"][aria-label="Acción"] button:has-text("Sin aire cierra")')
  await page.selectOption('select[aria-label="Finales de carrera"]', 'Solo cerrada')
  await page.selectOption('select[aria-label="Alimentación del solenoide"]', '120 VCA')
  await shot(page, '200-alta-valvula-corte')
  await page.click('button:has-text("Guardar sin tag ni fotos")')
  await page.waitForURL((u) => /\/instrumentos\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith('/nuevo'))
  const idKV = page.url().split('/').pop()
  await page.waitForSelector('text=Aire para abrir · sin aire cierra (falla cerrada)')
  await page.waitForSelector('dd:has-text("Solo cerrada")')
  const kvDoc = await hasta(async () => (await firestore().doc(`instrumentos/${idKV}`).get()).data(), 'la KV en el servidor')
  if (kvDoc.tipo !== 'Válvula de corte' || kvDoc.accionValvula !== 'Aire para abrir' || kvDoc.senal !== 'Discreta' || kvDoc.alimentacion !== '120 VCA')
    throw new Error(`la KV se guardó mal: ${JSON.stringify(kvDoc)}`)
  if (kvDoc.puntoAjuste !== null || kvDoc.sensor !== '') throw new Error('la KV guardó datos de otro tipo')
  await shot(page, '201-ficha-valvula-corte')
  console.log('alta de KV: tipo sugerido por el tag, acción y finales de carrera en la ficha ok')

  // ---------- Calibración de la válvula de corte: prueba funcional ----------
  await page.goto(`${BASE}/instrumentos/${idKV}/calibrar`)
  await page.waitForSelector('text=Revisiones')
  await page.waitForSelector('text=Sin aire cierra sola (posición segura)')
  if (await page.locator('text=Final de carrera abierta (ZSO) señaliza').count()) throw new Error('con solo final cerrada pidió el ZSO')
  if (await page.locator('text=Rango mínimo').count()) throw new Error('la válvula de corte pidió rango')
  await page.click('button:has-text("Guardar")')
  await page.waitForSelector('text=Marca Bien, Mal o No aplica en cada revisión.')
  const nRev = await revisar(page, 'Cierra completo')
  await page.fill('label:has-text("Tiempo para abrir (s)") input', '4,2')
  await page.fill('label:has-text("Tiempo para cerrar (s)") input', '3.1')
  const sugKV = await sugerencia(page)
  if (sugKV !== 'Según las revisiones: No pasó la prueba') throw new Error(`sugerencia de la KV: ${sugKV}`)
  await shot(page, '202-calibrar-valvula-corte')
  await page.click('button:has-text("Guardar")')
  await page.waitForURL(/\/instrumentos\/[^/]+$/)
  await page.waitForSelector('text=No pasó la prueba')
  const [calKV] = await hasta(async () => {
    const c = await calibraciones(idKV)
    return c.length ? c : null
  }, 'calibración de la KV')
  if (calKV.puntos.length !== 0 || calKV.revisiones.length !== nRev || calKV.tiempoApertura !== 4.2 || calKV.resultado !== 'Fuera de tolerancia')
    throw new Error(`calibración de KV mal guardada: ${JSON.stringify(calKV)}`)
  if ('lecturaEn' in calKV || 'pendiente' in calKV) throw new Error('la calibración guardó campos de otros tipos')
  await page.click('a:has-text("No pasó la prueba")')
  await page.waitForSelector('text=Tiempo para abrir')
  await page.waitForSelector('li:has-text("Cierra completo") >> text=Mal')
  await shot(page, '203-detalle-valvula-corte')
  await page.goto(`${BASE}/instrumentos/${idKV}/hoja-de-vida`)
  await page.waitForSelector('text=Revisiones: 6 bien, 1 mal (Cierra completo).')
  console.log(`calibración de KV: ${nRev} revisiones, tiempos y "No pasó la prueba" ok`)

  // ---------- Válvulas de doble efecto: abren y cierran con aire, sin resorte ----------
  const KV2 = `KV-${n + 1}`
  const idKV2 = await instrumento({ tagISA: KV2, servicio: 'Corte de vapor', tipo: 'Válvula de corte', accionValvula: 'Aire para abrir' })
  await page.goto(`${BASE}/instrumentos/${idKV2}/editar`)
  await page.click('[role="radiogroup"][aria-label="Acción"] button:has-text("Doble efecto")')
  await shot(page, '209-editar-doble-efecto')
  await page.click('button:has-text("Guardar")')
  await page.waitForURL(/\/instrumentos\/[^/]+$/)
  await page.waitForSelector('text=Aire para abrir y cerrar · doble efecto, sin resorte')
  await page.goto(`${BASE}/instrumentos/${idKV2}/calibrar`)
  await page.waitForSelector('text=Al desenergizar el solenoide va a su posición segura')
  await page.waitForSelector('text=Sin paso de aire entre cámaras (diafragma o pistón sano)')
  if (await page.locator('text=Sin aire cierra sola').count()) throw new Error('la de doble efecto pidió que cierre sola sin aire')
  const nRev2 = await revisar(page)
  await shot(page, '210-calibrar-doble-efecto')
  await page.click('button:has-text("Guardar")')
  await page.waitForURL(/\/instrumentos\/[^/]+$/)
  const [calKV2] = await hasta(() => calibraciones(idKV2).then((c) => (c.length ? c : null)), 'calibración de la KV de doble efecto')
  if (calKV2.revisiones.length !== nRev2 || !calKV2.revisiones.some((r) => r.nombre.startsWith('Sin paso de aire entre cámaras')))
    throw new Error(`calibración de la KV de doble efecto: ${JSON.stringify(calKV2.revisiones)}`)

  // La de control de doble efecto no tiene resorte: el campo se quita y se vacía al guardar.
  const FCV2 = `FCV-${n + 1}`
  const idFCV2 = await instrumento({ tagISA: FCV2, servicio: 'Agua a deareador', tipo: 'Válvula de control', accionValvula: 'Aire para abrir', rangoResorte: '3-15 psi', presionSuministro: '60 psi' })
  await page.goto(`${BASE}/instrumentos/${idFCV2}/editar`)
  await page.waitForSelector('text=Rango del resorte')
  await page.click('[role="radiogroup"][aria-label="Acción"] button:has-text("Doble efecto")')
  if (await page.locator('text=Rango del resorte').count()) throw new Error('la de doble efecto sigue pidiendo rango del resorte')
  await page.click('button:has-text("Guardar")')
  await page.waitForURL(/\/instrumentos\/[^/]+$/)
  const fcv2Doc = await hasta(async () => {
    const d = (await firestore().doc(`instrumentos/${idFCV2}`).get()).data()
    return d.accionValvula === 'Aire para abrir y cerrar' ? d : null
  }, 'la FCV de doble efecto en el servidor')
  if (fcv2Doc.rangoResorte !== '' || fcv2Doc.presionSuministro !== '60 psi') throw new Error(`la FCV de doble efecto se guardó mal: ${JSON.stringify(fcv2Doc)}`)
  await page.goto(`${BASE}/instrumentos/${idFCV2}/calibrar`)
  await page.waitForSelector('text=Al quitar la señal va a su posición segura')
  console.log(`doble efecto: KV con ${nRev2} revisiones propias y FCV sin resorte ok`)

  // ---------- Transmisor de antes, sin tipo: se sugiere al calibrar y se lee en mA ----------
  const PT = `PT-${n}`
  const idPT = await instrumento({ tagISA: PT, servicio: 'Presión de domo', rangoMin: 0, rangoMax: 20, unidades: 'kg/cm²' })
  await page.goto(`${BASE}/instrumentos/${idPT}/calibrar`)
  await page.waitForSelector('text=Este instrumento aún no tiene tipo')
  await page.click('button:has-text("Usar «Transmisor de presión» (según el tag)")')
  const leyendo = () => page.locator('[role="radiogroup"][aria-label="Leí la salida en"] [aria-checked="true"]').innerText()
  // La primera vez se lee como antes, en unidades de proceso; el técnico elige mA.
  if ((await leyendo()) !== 'Unidades de proceso') throw new Error(`no empezó en unidades de proceso: ${await leyendo()}`)
  await page.click('[role="radiogroup"][aria-label="Leí la salida en"] button:has-text("mA (4-20)")')
  await page.waitForSelector('text=debe dar 12.00 mA')
  const lecturas = ['4.01', '8.02', '12.03', '15.98', '20']
  for (let i = 0; i < lecturas.length; i++) await page.fill(`input[aria-label="As-Found ${i + 1}"]`, lecturas[i])
  const sugPT = await sugerencia(page)
  if (sugPT !== 'Según tolerancia: Aprobada sin ajuste') throw new Error(`sugerencia del PT: ${sugPT}`)
  await shot(page, '204-calibrar-transmisor-mA')
  await page.click('button:has-text("Guardar")')
  await page.waitForURL(/\/instrumentos\/[^/]+$/)
  const ptDoc = await hasta(async () => {
    const d = (await firestore().doc(`instrumentos/${idPT}`).get()).data()
    return d.tipo ? d : null
  }, 'tipo del PT en la ficha')
  if (ptDoc.tipo !== 'Transmisor de presión') throw new Error(`el PT quedó con tipo ${ptDoc.tipo}`)
  const [calPT] = await calibraciones(idPT)
  if (calPT.lecturaEn !== 'mA' || calPT.tipo !== 'Transmisor de presión' || calPT.puntos[2].asFound !== 12.03) throw new Error(`calibración del PT: ${JSON.stringify(calPT)}`)
  // La siguiente calibración del mismo transmisor ya empieza en mA.
  await page.goto(`${BASE}/instrumentos/${idPT}/calibrar`)
  await page.waitForSelector('text=debe dar 12.00 mA')
  if (await page.locator('text=Este instrumento aún no tiene tipo').count()) throw new Error('volvió a preguntar el tipo')
  console.log('transmisor sin tipo: tomó el sugerido, guardó el tipo en la ficha, evaluó en mA y lo recuerda ok')

  // ---------- Interruptor: disparo, reposición y diferencial ----------
  const PSH = `PSH-${n}`
  const idPS = await instrumento({ tagISA: PSH, servicio: 'Alta presión de vapor', tipo: 'Interruptor de presión', unidades: 'kg/cm²', puntoAjuste: 10, disparaAl: 'Al subir', contacto: 'NA', senal: 'Discreta' })
  await page.goto(`${BASE}/instrumentos/${idPS}/calibrar`)
  await page.waitForSelector('text=Punto de ajuste: 10 kg/cm²')
  if ((await page.getByLabel('Punto de ajuste *').inputValue()) !== '10') throw new Error('no trajo el punto de ajuste de la ficha')
  await page.getByLabel('Tolerancia ± kg/cm² *').fill('0.2')
  await page.fill('input[aria-label="Disparo As-Found"]', '10.4')
  await page.fill('input[aria-label="Reposición As-Found"]', '9.8')
  const sugPS1 = await sugerencia(page)
  if (sugPS1 !== 'Según tolerancia: Fuera de tolerancia') throw new Error(`sugerencia del PSH antes de ajustar: ${sugPS1}`)
  await page.fill('input[aria-label="Disparo As-Left"]', '10.1')
  await page.fill('input[aria-label="Reposición As-Left"]', '9.6')
  await page.waitForSelector('text=0.6 kg/cm²')
  await page.waitForSelector('text=0.5 kg/cm²')
  const sugPS = await sugerencia(page)
  if (sugPS !== 'Según tolerancia: Ajustada') throw new Error(`sugerencia del PSH: ${sugPS}`)
  await shot(page, '205-calibrar-interruptor')
  await page.click('button:has-text("Guardar")')
  await page.waitForURL(/\/instrumentos\/[^/]+$/)
  await page.click('a:has-text("Ajustada")')
  await page.waitForSelector('text=Diferencial')
  await page.waitForSelector('text=± 0.2 kg/cm²')
  await shot(page, '206-detalle-interruptor')
  console.log('interruptor: punto de ajuste de la ficha, diferencial y resultado ajustado ok')

  // ---------- Válvula de control con señal invertida ----------
  const FCV = `FCV-${n}`
  const idFCV = await instrumento({ tagISA: FCV, servicio: 'Vapor de atomización', tipo: 'Válvula de control', accionValvula: 'Aire para cerrar' })
  await page.goto(`${BASE}/instrumentos/${idFCV}/calibrar`)
  await page.waitForSelector('text=Prueba de carrera')
  await page.waitForSelector('text=Sin aire abre sola (posición segura)')
  await page.check('label:has-text("Señal invertida") input')
  await page.waitForSelector('text=debe quedar 75 %')
  const posiciones = ['100', '75.5', '50', '24', '0.5']
  for (let i = 0; i < posiciones.length; i++) await page.fill(`input[aria-label="As-Found ${i + 1}"]`, posiciones[i])
  await revisar(page)
  const sugFCV = await sugerencia(page)
  if (sugFCV !== 'Según tolerancia: Aprobada sin ajuste') throw new Error(`sugerencia de la FCV: ${sugFCV}`)
  await shot(page, '207-calibrar-valvula-control')
  await page.click('button:has-text("Guardar")')
  await page.waitForURL(/\/instrumentos\/[^/]+$/)
  const [calFCV] = await hasta(() => calibraciones(idFCV).then((c) => (c.length ? c : null)), 'calibración de la FCV')
  if (!calFCV.senalInvertida || calFCV.tolerancia !== 2 || calFCV.rangoMax !== 100) throw new Error(`calibración de la FCV: ${JSON.stringify(calFCV)}`)
  console.log('válvula de control: carrera con señal invertida y revisiones ok')

  // ---------- Editar uno de antes: botón para usar el tipo del tag ----------
  const TT = `TT-${n}`
  const idTT = await instrumento({ tagISA: TT, servicio: 'Temperatura agua de alimentación', rangoMin: 0, rangoMax: 150, unidades: '°C' })
  await page.goto(`${BASE}/instrumentos/${idTT}/editar`)
  await page.click('button:has-text("Usar «Transmisor de temperatura» (según el tag)")')
  await page.selectOption('select[aria-label="Sensor"]', 'RTD Pt100')
  await shot(page, '208-editar-transmisor-temperatura')
  await page.click('button:has-text("Guardar")')
  await page.waitForURL(/\/instrumentos\/[^/]+$/)
  await page.waitForSelector('dd:has-text("RTD Pt100")')
  console.log('edición: tomó el tipo sugerido y guardó el sensor ok')

  // ---------- Catálogo filtrado por tipo ----------
  await page.goto(`${BASE}/catalogo?tipo=${encodeURIComponent('Válvula de corte')}`)
  await page.waitForSelector(`text=${KV}`)
  if (await page.locator(`text=${PT}`).count()) throw new Error('el filtro de válvula de corte mostró el PT')
  await page.goto(`${BASE}/catalogo?q=${encodeURIComponent('interruptor de presión')}`)
  await page.waitForSelector(`text=${PSH}`)
  console.log('catálogo: filtro y búsqueda por tipo ok')

  await browser.close()
  process.exit(0)
})().catch((e) => {
  console.error('FALLO:', e.message)
  process.exit(1)
})
