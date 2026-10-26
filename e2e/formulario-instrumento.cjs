// Prueba de punta a punta del formulario de instrumento y sus documentos: unidades y
// alimentación de una lista, próxima calibración que se puede quitar, y documentos con
// la cámara, de la galería o de los archivos (PDF).
// Requiere el admin manuel@adb.test / Prueba1234 y los emuladores corriendo.
// Uso: node e2e/formulario-instrumento.cjs
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
const VIEJO = `PT-${n}`
const NUEVO = `FT-${n}`

function firestore() {
  process.env.GCLOUD_PROJECT = 'demo-instrumentacion-adb'
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  const req = createRequire(path.resolve(REPO, 'functions/package.json'))
  const { initializeApp, getApps } = req('firebase-admin/app')
  const { getFirestore } = req('firebase-admin/firestore')
  if (!getApps().length) initializeApp({ projectId: 'demo-instrumentacion-adb' })
  return getFirestore()
}

/** Una foto JPEG hecha en el navegador; con ruido pesa más de 3 MB, como las de la cámara. */
async function foto(page, ancho, alto, ruido) {
  const b64 = await page.evaluate(
    async ({ ancho, alto, ruido }) => {
      const c = document.createElement('canvas')
      c.width = ancho
      c.height = alto
      const ctx = c.getContext('2d')
      if (ruido) {
        const img = ctx.createImageData(ancho, alto)
        for (let i = 0; i < img.data.length; i++) img.data[i] = i % 4 === 3 ? 255 : Math.random() * 255
        ctx.putImageData(img, 0, 0)
      } else {
        ctx.fillStyle = '#0f766e'
        ctx.fillRect(0, 0, ancho, alto)
      }
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95))
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let s = ''
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      return btoa(s)
    },
    { ancho, alto, ruido },
  )
  return Buffer.from(b64, 'base64')
}

const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj ' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
)

const opciones = (page, sel) => page.locator(`${sel} option`).allInnerTexts()

;(async () => {
  // Un instrumento de antes, con unidades y alimentación escritas a mano.
  const db = firestore()
  const viejo = await db.collection('instrumentos').add({
    tagISA: VIEJO,
    servicio: 'Presión de vapor a cabezal',
    area: 'Generación de vapor',
    subArea: '',
    estado: 'Operando',
    nfcToken: null,
    docs: [],
    portadaMiniatura: null,
    rangoMin: 0,
    rangoMax: 20,
    unidades: 'Kg/cm2',
    senal: '4-20 mA',
    alimentacion: '24 VDC lazo',
    disparaCaldera: false,
    notaDisparo: '',
    proximaCalibracion: null,
  })

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...devices['Pixel 7'] })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror', e.message))
  await page.goto(`${BASE}/login`)
  await page.fill('#email', 'manuel@adb.test')
  await page.fill('#pass', 'Prueba1234')
  await page.click('button:has-text("Entrar")')
  await page.waitForSelector('text=Menú')

  // ---------- Alta ----------
  await page.goto(`${BASE}/instrumentos/nuevo`)
  await page.waitForSelector('text=Alta de instrumento')
  await page.fill('input[placeholder="PT-101"]', NUEVO)
  await page.fill('input[placeholder="Presión de vapor a cabezal"]', 'Flujo de agua de alimentación')
  await page.click('button:has-text("Más datos")')

  const alim = await opciones(page, 'label:has-text("Alimentación") select')
  if (JSON.stringify(alim) !== JSON.stringify(['Sin especificar', '24 VCD · corriente directa', '120 VCA · corriente alterna'])) {
    throw new Error(`alimentación con otras opciones: ${alim.join(' | ')}`)
  }
  console.log('alimentación solo con 24 VCD y 120 VCA ok')

  const unidades = await opciones(page, 'select[aria-label="Unidades"]')
  for (const u of ['kg/cm²', 'psi', '°C', '%', 'm³/h', 'pH', 'mA', 'Otra (escribirla)']) {
    if (!unidades.includes(u)) throw new Error(`falta la unidad ${u}`)
  }
  console.log(`${unidades.length - 2} unidades en la lista ok`)
  // "Otra" deja escribir una que no está; al volver a la lista se quita el campo.
  await page.selectOption('select[aria-label="Unidades"]', '__otra')
  await page.fill('input[aria-label="Otra unidad"]', 'gal/min')
  await page.selectOption('select[aria-label="Unidades"]', 'm³/h')
  if (await page.locator('input[aria-label="Otra unidad"]').count()) throw new Error('el campo de otra unidad no se quitó')
  await page.fill('label:has-text("Rango mínimo") input', '0')
  await page.fill('label:has-text("Rango máximo") input', '150')
  await page.selectOption('label:has-text("Alimentación") select', '120 VCA')

  // Una fecha puesta por error se quita con el botón.
  const fecha = page.locator('input[aria-label="Próxima calibración"]')
  if ((await fecha.inputValue()) !== '') throw new Error('la próxima calibración no empieza vacía')
  if (await page.locator('button:has-text("Quitar")').count()) throw new Error('Quitar aparece sin fecha')
  await fecha.fill('2026-10-26')
  await page.waitForSelector('text=Si la pusiste por error, toca Quitar.')
  await shot(page, '180-alta-con-fecha')
  await page.click('button:has-text("Quitar")')
  if ((await fecha.inputValue()) !== '') throw new Error('Quitar no vació la fecha')
  await page.waitForSelector('text=Sin fecha, el instrumento queda')
  await shot(page, '181-alta-sin-fecha')
  await page.click('button:has-text("Guardar sin tag ni fotos")')
  await page.waitForSelector(`h1:has-text("${NUEVO}")`)
  await page.waitForSelector('text=Próxima calibración: sin programar')
  await page.waitForSelector('dd:has-text("0 a 150 m³/h")')
  await page.waitForSelector('dd:has-text("120 VCA")')
  console.log('alta con unidad de la lista, 120 VCA y sin próxima calibración ok')

  // ---------- Editar uno de antes ----------
  await page.goto(`${BASE}/instrumentos/${viejo.id}/editar`)
  await page.waitForSelector(`h1:has-text("Editar ${VIEJO}")`)
  if ((await page.locator('select[aria-label="Unidades"]').inputValue()) !== 'kg/cm²') throw new Error('"Kg/cm2" no se acomodó a kg/cm²')
  if ((await page.locator('label:has-text("Alimentación") select').inputValue()) !== '24 VCD') throw new Error('"24 VDC lazo" no se acomodó a 24 VCD')
  await shot(page, '182-editar-de-antes')
  // Una unidad que no está en la lista se queda en "Otra" con lo escrito.
  await page.selectOption('select[aria-label="Unidades"]', '__otra')
  if ((await page.locator('input[aria-label="Otra unidad"]').inputValue()) !== '') throw new Error('Otra no empezó vacío')
  await page.fill('input[aria-label="Otra unidad"]', 'kg/cm² man.')
  await page.click('button:has-text("Guardar")')
  await page.waitForSelector(`h1:has-text("${VIEJO}")`)
  await page.waitForSelector('dd:has-text("24 VCD")')
  await page.waitForSelector('dd:has-text("0 a 20 kg/cm² man.")')
  await page.click('a:has-text("Editar")')
  await page.waitForSelector(`h1:has-text("Editar ${VIEJO}")`)
  if ((await page.locator('input[aria-label="Otra unidad"]').inputValue()) !== 'kg/cm² man.') throw new Error('la unidad escrita no se ve al editar')
  // Una fecha puesta por error al editar también se quita.
  await page.locator('input[aria-label="Próxima calibración"]').fill('2027-04-01')
  await page.click('button:has-text("Quitar")')
  await page.click('button:has-text("Guardar")')
  await page.waitForSelector('text=Próxima calibración: sin programar')
  const guardado = (await db.collection('instrumentos').doc(viejo.id).get()).data()
  if (guardado.alimentacion !== '24 VCD' || guardado.proximaCalibracion !== null) throw new Error(`se guardó mal: ${JSON.stringify(guardado)}`)
  console.log('editar uno de antes: 24 VDC lazo → 24 VCD, unidad escrita y fecha quitada ok')

  // ---------- Documentos ----------
  await page.goto(`${BASE}/instrumentos/${viejo.id}`)
  await page.waitForSelector('text=Sin hojas de datos, manuales ni fotos de placa.')
  const entradas = page.locator('section:has(h2:has-text("Documentos")) input[type=file]')
  const attrs = await entradas.evaluateAll((els) => els.map((e) => [e.accept, e.getAttribute('capture'), e.multiple]))
  const [camara, galeria, archivo] = attrs
  if (camara[0] !== 'image/*' || camara[1] !== 'environment') throw new Error(`la cámara no abre la cámara: ${camara}`)
  if (galeria[0] !== 'image/*' || galeria[1] !== null || !galeria[2]) throw new Error(`la galería no abre la galería: ${galeria}`)
  if (!archivo[0].includes('application/pdf') || archivo[0].includes('image') || archivo[1] !== null) throw new Error(`documento no abre archivos: ${archivo}`)
  await shot(page, '183-documentos-vacio')

  const grande = await foto(page, 3000, 2200, true)
  if (grande.length < 3 * 1024 * 1024) throw new Error(`la foto de prueba pesa poco: ${grande.length}`)
  // Tomar foto: el nombre que le pone la cámara se cambia por uno con fecha y hora.
  let chooser = page.waitForEvent('filechooser')
  await page.click('button:has-text("Tomar foto")')
  await (await chooser).setFiles({ name: '1730000000000.jpg', mimeType: 'image/jpeg', buffer: grande })
  // Galería: dos a la vez.
  const chica = await foto(page, 800, 600, false)
  chooser = page.waitForEvent('filechooser')
  await page.click('button:has-text("Galería")')
  await (await chooser).setFiles([
    { name: 'IMG_20261020_101500.jpg', mimeType: 'image/jpeg', buffer: chica },
    { name: 'IMG_20261020_101530.jpg', mimeType: 'image/jpeg', buffer: chica },
  ])
  chooser = page.waitForEvent('filechooser')
  await page.click('button:has-text("Documento")')
  await (await chooser).setFiles({ name: 'Hoja de datos 3051.pdf', mimeType: 'application/pdf', buffer: PDF })

  const docs = page.locator('section:has(h2:has-text("Documentos")) a')
  await page.waitForFunction(() => document.querySelectorAll('section a[href*="docs"]').length === 4, null, { timeout: 60_000 })
  const nombres = await docs.allInnerTexts()
  console.log('documentos:', nombres.join(' | '))
  if (!/^Foto \d{4}-\d\d-\d\d \d\d-\d\d-\d\d\.jpg$/.test(nombres[0])) throw new Error(`la foto de la cámara no tiene nombre con fecha: ${nombres[0]}`)
  if (!nombres.includes('IMG_20261020_101500.jpg') || !nombres.includes('IMG_20261020_101530.jpg')) throw new Error('falta una foto de la galería')
  if (!nombres.includes('Hoja de datos 3051.pdf')) throw new Error('falta el PDF')
  await shot(page, '184-documentos')

  // La foto de la cámara se sube completa (no se reduce como las de ubicación).
  const url = await docs.first().getAttribute('href')
  const r = await fetch(url)
  const subida = Buffer.from(await r.arrayBuffer())
  if (subida.length !== grande.length) throw new Error(`la foto se subió con otro tamaño: ${subida.length} de ${grande.length}`)
  const pdf = await (await fetch(await page.locator('a:has-text("Hoja de datos 3051.pdf")').getAttribute('href'))).text()
  if (!pdf.startsWith('%PDF')) throw new Error('el PDF no se subió bien')
  console.log(`foto de ${(grande.length / 1048576).toFixed(1)} MB subida completa y PDF ok`)

  await browser.close()
  process.exit(0)
})().catch((e) => {
  console.error('FALLO:', e.message)
  process.exit(1)
})
