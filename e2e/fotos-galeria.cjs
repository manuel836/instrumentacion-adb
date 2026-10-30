// Prueba de punta a punta de las fotos de ubicación elegidas de la galería:
// - junto a "Tomar foto" está "Galería", que abre la galería (sin cámara);
// - lo que el navegador no abre como foto se avisa y no se agrega;
// - si se eligen más de las que caben, se agregan las que caben y se avisa;
// - al guardar se reducen como las de la cámara y se suben.
// Requiere el admin manuel@adb.test / Prueba1234 y los emuladores corriendo.
// Uso: node e2e/fotos-galeria.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
const { createRequire } = require('module')
const S = process.argv[2] ?? 'e2e/salida'
const REPO = process.argv[3] ?? process.cwd()
const BASE = 'http://localhost:4173'
const BUCKET = 'demo-instrumentacion-adb.appspot.com'
require('fs').mkdirSync(path.join(S, 'shots'), { recursive: true })
const shot = (p, n) => p.screenshot({ path: path.join(S, 'shots', n + '.png') })
const tag = `FG-${(Date.now() % 900) + 100}`

process.env.GCLOUD_PROJECT = 'demo-instrumentacion-adb'
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199'
const req = createRequire(path.resolve(REPO, 'functions/package.json'))
const { initializeApp } = req('firebase-admin/app')
const { getFirestore } = req('firebase-admin/firestore')
const { getStorage } = req('firebase-admin/storage')
initializeApp({ projectId: 'demo-instrumentacion-adb', storageBucket: BUCKET })
const db = getFirestore()

/** Una foto grande como las del teléfono (4000 px), hecha en el navegador. */
async function fotoDeGaleria(page, nombre, color) {
  const datos = await page.evaluate(async (color) => {
    const c = new OffscreenCanvas(4000, 3000)
    const ctx = c.getContext('2d')
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 4000, 3000)
    ctx.fillStyle = '#fff'
    ctx.font = '400px sans-serif'
    ctx.fillText('Ubicación', 600, 1600)
    const b = await c.convertToBlob({ type: 'image/jpeg', quality: 0.95 })
    return Array.from(new Uint8Array(await b.arrayBuffer()))
  }, color)
  return { name: nombre, mimeType: 'image/jpeg', buffer: Buffer.from(datos) }
}

;(async () => {
  const inst = await db.collection('instrumentos').add({
    tagISA: tag,
    servicio: 'Válvula de control',
    area: 'Generación de vapor',
    subArea: 'Turbogenerador',
    ubicacionTexto: 'Primera planta del turbogenerador',
    estado: 'Operando',
    tipo: 'Otro',
    nfcToken: null,
    docs: [],
    portadaMiniatura: null,
    proximaCalibracion: null,
  })

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...devices['Galaxy S8'] })
  const page = await ctx.newPage()
  const errores = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.goto(`${BASE}/login`)
  await page.fill('#email', 'manuel@adb.test')
  await page.fill('#pass', 'Prueba1234')
  await page.click('button:has-text("Entrar")')
  await page.waitForSelector('text=Menú')

  await page.goto(`${BASE}/instrumentos/${inst.id}`)
  const seccion = page.locator('section', { hasText: 'Ubicación en campo' })
  await seccion.locator('button:has-text("Agregar fotos")').click()
  await seccion.locator('button:has-text("Tomar foto")').waitFor()
  await seccion.locator('button:has-text("Galería")').waitFor()
  await seccion.locator('text=Puedes agregar hasta 6 fotos.').waitFor()
  await seccion.scrollIntoViewIfNeeded()
  await shot(page, '500-botones-camara-galeria')

  // La cámara abre la cámara trasera; la galería no pide cámara.
  const entradas = seccion.locator('input[type=file]')
  if ((await entradas.nth(0).getAttribute('capture')) !== 'environment') throw new Error('Tomar foto ya no abre la cámara')
  if ((await entradas.nth(1).getAttribute('capture')) !== null) throw new Error('Galería abre la cámara en vez de la galería')
  console.log('botones Tomar foto y Galería ok')

  // Se eligen 2 fotos y un archivo que el navegador no abre (como un HEIC en Chrome).
  const roja = await fotoDeGaleria(page, 'IMG_20261029_101500.jpg', '#a33')
  const azul = await fotoDeGaleria(page, 'IMG_20261029_101512.jpg', '#33a')
  const heic = { name: 'IMG_0042.HEIC', mimeType: 'image/heic', buffer: Buffer.from('no es una foto que Chrome abra') }
  const [selector] = await Promise.all([page.waitForEvent('filechooser'), seccion.locator('button:has-text("Galería")').click()])
  if (selector.isMultiple() !== true) throw new Error('la galería no deja elegir varias fotos')
  await selector.setFiles([roja, heic, azul])
  await seccion.locator('text=No se pudo abrir “IMG_0042.HEIC” como foto').waitFor()
  await seccion.locator('text=2 de 6 fotos').waitFor()
  if ((await seccion.locator('img').count()) !== 2) throw new Error('no se ven las 2 fotos elegidas')
  await seccion.locator('text=No se pudo abrir').scrollIntoViewIfNeeded()
  await shot(page, '501-galeria-con-aviso')
  console.log('archivo que no es foto: se avisa y no se agrega ok')

  // Se eligen 5 más pero solo caben 4.
  const mas = await Promise.all(['#3a3', '#aa3', '#3aa', '#a3a', '#555'].map((c, i) => fotoDeGaleria(page, `IMG_extra_${i + 1}.jpg`, c)))
  await entradas.nth(1).setInputFiles(mas)
  await seccion.locator('text=Solo se agregaron 4 fotos: ya no caben más.').waitFor()
  if (await seccion.locator('button:has-text("Galería")').count()) throw new Error('sigue el botón con 6 de 6 fotos')
  console.log('más fotos de las que caben: se agregan las que caben ok')

  // Al quitar una se va el aviso y vuelven los botones.
  await seccion.locator('button:has-text("Quitar")').last().click()
  await seccion.locator('text=5 de 6 fotos').waitFor()
  if (await seccion.locator('text=Solo se agregaron').count()) throw new Error('el aviso se quedó tras quitar una foto')
  await seccion.locator('input[placeholder="Toma general: equipo, nivel, columna"]').fill('Vista desde la escalera norte')
  await shot(page, '502-galeria-lista')

  await seccion.locator('button:has-text("Guardar 5 fotos")').click()
  await seccion.locator('button:has-text("Listo")').click()
  await seccion.locator('text=Vista desde la escalera norte').waitFor()

  // Se suben reducidas, igual que las de la cámara.
  let fotos = []
  for (let i = 0; i < 60; i++) {
    fotos = (await db.collection(`instrumentos/${inst.id}/ubicacion`).get()).docs.map((d) => d.data())
    if (fotos.length === 5 && fotos.every((f) => f.url && f.miniaturaUrl)) break
    await page.waitForTimeout(500)
  }
  if (fotos.length !== 5 || !fotos.every((f) => f.url && f.miniaturaUrl)) throw new Error('las fotos no se subieron')
  const [meta] = await getStorage().bucket().file(fotos[0].ruta).getMetadata()
  if (!['image/webp', 'image/jpeg'].includes(meta.contentType)) throw new Error(`se subió como ${meta.contentType}`)
  if (Number(meta.size) > 3 * 1024 * 1024) throw new Error(`la foto pesa ${meta.size} bytes: no se redujo`)
  await page.waitForTimeout(800)
  await seccion.scrollIntoViewIfNeeded()
  await shot(page, '503-galeria-guardada')
  console.log(`5 fotos de la galería subidas (${meta.contentType}, ${Math.round(meta.size / 1024)} KB la primera) ok`)

  // Reportar falla usa el mismo selector: también ofrece la galería.
  await page.goto(`${BASE}/fallas/nueva?instrumento=${inst.id}`)
  await page.locator('button:has-text("Galería")').waitFor()
  console.log('reportar falla también ofrece la galería ok')

  if (errores.length) {
    console.log('errores de página:', errores)
    process.exitCode = 1
  }
  await browser.close()
  await db.recursiveDelete(inst)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
