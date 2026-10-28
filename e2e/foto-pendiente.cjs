// Prueba de punta a punta de una foto de ubicación que no se puede ver en este teléfono:
// - la tomó otro teléfono y aún no la sube: se dice quién la tomó y que se sube sola;
// - la foto completa no carga: se ve la miniatura;
// - no carga nada: se avisa en vez de dejar un cuadro gris vacío.
// Requiere el admin manuel@adb.test / Prueba1234 y los emuladores corriendo.
// Uso: node e2e/foto-pendiente.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
const { createRequire } = require('module')
const S = process.argv[2] ?? 'e2e/salida'
const REPO = process.argv[3] ?? process.cwd()
const BASE = 'http://localhost:4173'
const BUCKET = 'demo-instrumentacion-adb.appspot.com'
require('fs').mkdirSync(path.join(S, 'shots'), { recursive: true })
const shot = (p, n) => p.screenshot({ path: path.join(S, 'shots', n + '.png') })
const tag = `FP-${(Date.now() % 900) + 100}`

process.env.GCLOUD_PROJECT = 'demo-instrumentacion-adb'
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199'
const req = createRequire(path.resolve(REPO, 'functions/package.json'))
const { initializeApp } = req('firebase-admin/app')
const { getFirestore, FieldValue } = req('firebase-admin/firestore')
const { getStorage } = req('firebase-admin/storage')
initializeApp({ projectId: 'demo-instrumentacion-adb', storageBucket: BUCKET })
const db = getFirestore()

/** Una imagen real en Storage, con la URL de descarga que usa la app. */
async function subirMiniatura(ruta) {
  const imagen = require('fs').readFileSync(path.join(REPO, 'public/icons/icon-192.png'))
  const token = 'prueba-foto-pendiente'
  await getStorage().bucket().file(ruta).save(imagen, { contentType: 'image/png', metadata: { metadata: { firebaseStorageDownloadTokens: token } } })
  return `http://127.0.0.1:9199/v0/b/${BUCKET}/o/${encodeURIComponent(ruta)}?alt=media&token=${token}`
}

;(async () => {
  const inst = await db.collection('instrumentos').add({
    tagISA: tag,
    servicio: 'Piloto 3',
    area: 'Generación de vapor',
    subArea: 'Caldera 3',
    ubicacionTexto: 'Planta baja',
    estado: 'Operando',
    tipo: 'Otro',
    nfcToken: null,
    docs: [],
    portadaMiniatura: null,
    proximaCalibracion: null,
  })
  const base = `instrumentos/${inst.id}/ubicacion/foto1`
  // Así la deja la cola del teléfono que la tomó mientras no la sube.
  const foto = db.doc(base)
  await foto.set({
    ruta: `${base}.jpg`,
    miniatura: `${base}_min.jpg`,
    url: null,
    miniaturaUrl: null,
    pie: '',
    orden: 0,
    esPortada: true,
    autor: 'Técnico de campo',
    pendiente: true,
    fecha: FieldValue.serverTimestamp(),
  })

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...devices['iPhone 13'] })
  const page = await ctx.newPage()
  const errores = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.goto(`${BASE}/login`)
  await page.fill('#email', 'manuel@adb.test')
  await page.fill('#pass', 'Prueba1234')
  await page.click('button:has-text("Entrar")')
  await page.waitForSelector('text=Menú')

  await page.goto(`${BASE}/instrumentos/${inst.id}`)
  const galeria = page.locator('section', { hasText: 'Ubicación en campo' })
  await galeria.locator('text=Foto pendiente de subir').waitFor()
  await galeria.locator('text=La tomó Técnico de campo').waitFor()
  await galeria.locator('text=Se sube sola cuando se abre la app con señal').waitFor()
  await galeria.scrollIntoViewIfNeeded()
  await shot(page, '400-foto-pendiente')
  console.log('foto que otro teléfono no ha subido: se dice quién la tomó ok')

  // Ya subió la miniatura pero la foto completa no carga: se ve la miniatura.
  const miniaturaUrl = await subirMiniatura(`${base}_min.png`)
  await foto.update({ miniaturaUrl, url: `http://127.0.0.1:9199/v0/b/${BUCKET}/o/no-existe.jpg?alt=media` })
  await galeria.locator(`img[src="${miniaturaUrl}"]`).waitFor()
  if (await galeria.locator('text=No se pudo cargar').count()) throw new Error('se avisó aunque la miniatura sí cargó')
  console.log('si la foto completa no carga se ve la miniatura ok')

  // No carga nada: se avisa en lugar del cuadro gris vacío.
  await foto.update({ miniaturaUrl: `http://127.0.0.1:9199/v0/b/${BUCKET}/o/tampoco.jpg?alt=media` })
  await galeria.locator('text=No se pudo cargar la foto').waitFor()
  await shot(page, '401-foto-no-cargo')
  console.log('si no carga nada se avisa ok')

  // En el catálogo la miniatura es chica: solo el cuadro, sin texto encimado.
  await page.goto(`${BASE}/catalogo?q=${tag}`)
  await page.waitForSelector(`text=${tag}`)
  if (await page.locator('text=No se pudo cargar la foto').isVisible()) throw new Error('el aviso no cabe en la miniatura del catálogo')
  console.log('miniatura del catálogo sin texto encimado ok')

  if (errores.length) console.log('errores de página:', errores)
  await browser.close()
  await inst.delete()
  process.exit(0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
