// Prueba de punta a punta de la cola de subidas y de la sesión sin señal:
// - fotos tomadas en un iPhone (Safari no sabe hacer WebP: entrega PNG) se suben como JPEG,
//   aunque se cierre la falla antes de que termine la subida;
// - las fotos que quedaron atoradas en PNG con la versión anterior se recuperan solas;
// - si un intento alcanzó a subir el archivo pero no a anotar su URL, el siguiente no lo resube;
// - lo que el servidor rechaza se detiene (no frena lo demás) y se puede descartar;
// - sin señal y con el token vencido, el admin sigue dentro (antes salía "no tiene un rol").
// Requiere el admin manuel@adb.test / Prueba1234 y los emuladores corriendo.
// Uso: node e2e/subidas-iphone.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
const { createRequire } = require('module')
const S = process.argv[2] ?? 'e2e/salida'
const REPO = process.argv[3] ?? process.cwd()
const BASE = 'http://localhost:4173'
const BUCKET = 'demo-instrumentacion-adb.appspot.com'
require('fs').mkdirSync(path.join(S, 'shots'), { recursive: true })
const shot = (p, n) => p.screenshot({ path: path.join(S, 'shots', n + '.png') })
const tag = `KV-${(Date.now() % 900) + 100}`

process.env.GCLOUD_PROJECT = 'demo-instrumentacion-adb'
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199'
const req = createRequire(path.resolve(REPO, 'functions/package.json'))
const { initializeApp } = req('firebase-admin/app')
const { getFirestore, Timestamp } = req('firebase-admin/firestore')
const { getAuth } = req('firebase-admin/auth')
const { getStorage } = req('firebase-admin/storage')
initializeApp({ projectId: 'demo-instrumentacion-adb', storageBucket: BUCKET })
const fs = getFirestore()

/** Safari: pedir WebP al canvas entrega PNG. */
const comoIphone = () => {
  const original = OffscreenCanvas.prototype.convertToBlob
  OffscreenCanvas.prototype.convertToBlob = function (opciones) {
    return original.call(this, opciones?.type === 'image/webp' ? { ...opciones, type: 'image/png' } : opciones)
  }
}

/** Una "foto" con textura (ruido suave sobre un degradado), que en PNG pesa más de 3 MB. */
const pintarFoto = async ([w, h, tipo]) => {
  const c = new OffscreenCanvas(w, h)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(w, h)
  const ruido = new Uint8Array(img.data.length)
  for (let i = 0; i < ruido.length; i += 65536) crypto.getRandomValues(ruido.subarray(i, Math.min(i + 65536, ruido.length)))
  for (let i = 0; i < img.data.length; i += 4) {
    const x = (i / 4) % w
    img.data[i] = (x * 200) / w + (ruido[i] & 31)
    img.data[i + 1] = 90 + (ruido[i + 1] & 31)
    img.data[i + 2] = 160 - (x * 100) / w + (ruido[i + 2] & 31)
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return c.convertToBlob({ type: tipo, quality: 0.95 })
}

async function fotoGrande(page) {
  const b64 = await page.evaluate(async ([fn, args]) => {
    const blob = await new Function(`return (${fn})`)()(args)
    const buf = new Uint8Array(await blob.arrayBuffer())
    let s = ''
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    return btoa(s)
  }, [pintarFoto.toString(), [2400, 1800, 'image/jpeg']])
  return Buffer.from(b64, 'base64')
}

/** Mete una subida directo en la cola del teléfono (como las que dejó la versión anterior). */
async function encolarDirecto(page, item, pintar) {
  await page.evaluate(
    async ([item, fn, args]) => {
      const blob = fn ? await new Function(`return (${fn})`)()(args) : new Blob([new Uint8Array(2000)], { type: item.contentType })
      const db = await new Promise((ok, mal) => {
        const r = indexedDB.open('cola-subidas', 1)
        r.onsuccess = () => ok(r.result)
        r.onerror = () => mal(r.error)
      })
      await new Promise((ok, mal) => {
        const tx = db.transaction('subidas', 'readwrite')
        tx.objectStore('subidas').put({ ...item, blob })
        tx.oncomplete = ok
        tx.onerror = () => mal(tx.error)
      })
      db.close()
    },
    [item, pintar ? pintarFoto.toString() : null, pintar],
  )
}

async function cola(page) {
  return page.evaluate(async () => {
    const db = await new Promise((ok) => {
      const r = indexedDB.open('cola-subidas', 1)
      r.onsuccess = () => ok(r.result)
    })
    const todas = await new Promise((ok) => {
      const r = db.transaction('subidas').objectStore('subidas').getAll()
      r.onsuccess = () => ok(r.result)
    })
    db.close()
    return todas.map((s) => ({ ruta: s.ruta, intentos: s.intentos, detenida: !!s.detenida, error: s.error }))
  })
}

async function esperar(cond, ms, que) {
  const fin = Date.now() + ms
  for (;;) {
    const r = await cond()
    if (r) return r
    if (Date.now() > fin) throw new Error(`no pasó a tiempo: ${que}`)
    await new Promise((ok) => setTimeout(ok, 500))
  }
}

async function archivo(ruta) {
  const [meta] = await getStorage().bucket(BUCKET).file(ruta).getMetadata()
  return { tipo: meta.contentType, bytes: Number(meta.size) }
}

;(async () => {
  const uid = (await getAuth().getUserByEmail('manuel@adb.test')).uid
  const inst = await fs.collection('instrumentos').add({
    tagISA: tag, servicio: 'Válvula de lechos mixtos', area: 'Tratamiento de agua', estado: 'Operando',
    nfcToken: null, docs: [], portadaMiniatura: null, rangoMin: 0, rangoMax: 100, proximaCalibracion: null,
  })

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...devices['Pixel 7'] })
  await ctx.addInitScript(comoIphone)
  const page = await ctx.newPage()
  const errores = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.goto(`${BASE}/login`)
  await page.fill('#email', 'manuel@adb.test')
  await page.fill('#pass', 'Prueba1234')
  await page.click('button:has-text("Entrar")')
  await page.waitForSelector('text=Menú')

  // 1. Foto del chat de una falla tomada en "iPhone", cerrando la falla antes de que termine de subir.
  await page.goto(`${BASE}/fallas/nueva?instrumento=${inst.id}`)
  await page.fill('textarea', 'Fuga por el vástago')
  await page.click('button:has-text("Reportar")')
  await page.waitForURL(/\/fallas\/[^/]+$/)
  const fallaId = page.url().split('/').pop()
  await page.waitForSelector('text=Chat de la falla')
  const grande = await fotoGrande(page)
  await page.setInputFiles('input[type=file][multiple]', [{ name: 'IMG_4124.jpg', mimeType: 'image/jpeg', buffer: grande }])
  await page.fill('textarea[placeholder="Escribe un mensaje"]', 'Así se ve el vástago')
  await page.click('button:has-text("Enviar")')
  await page.click('button:has-text("Cerrar falla")')
  await page.fill('label:has-text("Causa raíz") textarea', 'Empaque gastado')
  await page.fill('label:has-text("Acción correctiva") textarea', 'Se cambió el empaque')
  await page.click('form button:has-text("Cerrar")')
  await page.waitForSelector('text=El chat se cerró junto con la falla')
  await page.waitForSelector('text=por subir', { state: 'detached', timeout: 60000 })
  const msgs = await fs.collection(`fallas/${fallaId}/mensajes`).get()
  const foto = msgs.docs[0].get('fotos')[0]
  if (!foto.url || !foto.miniaturaUrl) throw new Error(`la foto del iPhone no quedó anotada: ${JSON.stringify(await cola(page))}`)
  if (!foto.ruta.endsWith('.jpg')) throw new Error(`la foto del iPhone no se guardó como JPEG: ${foto.ruta}`)
  const subida = await archivo(foto.ruta)
  if (subida.tipo !== 'image/jpeg' || subida.bytes >= 3 * 1024 * 1024) throw new Error(`foto subida mal: ${JSON.stringify(subida)}`)
  console.log(`foto de iPhone (${(grande.length / 1e6).toFixed(1)} MB) se subió como JPEG de ${(subida.bytes / 1e6).toFixed(2)} MB aunque se cerró la falla ok`)

  // 2. Una foto que la versión anterior dejó atorada (PNG de más de 3 MB marcado como WebP) se recupera sola.
  const msgViejo = fs.collection(`fallas/${fallaId}/mensajes`).doc()
  const rutaVieja = `${msgViejo.path}/0.webp`
  await msgViejo.set({
    autor: { uid, nombre: 'Manuel' }, texto: '',
    fotos: [{ ruta: rutaVieja, miniatura: `${msgViejo.path}/0_min.webp`, url: null, miniaturaUrl: null }],
    fecha: Timestamp.now(),
  })
  await encolarDirecto(
    page,
    {
      id: 'vieja-1', ruta: rutaVieja, contentType: 'image/webp', creado: Date.now(), intentos: 40,
      error: 'FirebaseError: Firebase Storage: User does not have permission to access (storage/unauthorized)',
      destino: { tipo: 'arreglo', docPath: msgViejo.path, campo: 'fotos' },
    },
    [1600, 1200, 'image/png'],
  )
  await page.reload()
  await esperar(async () => (await msgViejo.get()).get('fotos')[0].url, 60000, 'recuperar la foto vieja en PNG')
  const recuperada = await archivo(rutaVieja)
  if (recuperada.tipo !== 'image/jpeg') throw new Error(`la foto vieja se subió como ${recuperada.tipo}`)
  await page.waitForSelector('text=por subir', { state: 'detached', timeout: 20000 })
  console.log(`foto atorada en PNG se recuperó sola (JPEG de ${(recuperada.bytes / 1e6).toFixed(2)} MB) ok`)

  // 3. El archivo se subió pero no se alcanzó a anotar la URL: el reintento no lo vuelve a subir.
  await page.goto(`${BASE}/fallas/nueva?instrumento=${inst.id}`)
  await page.fill('textarea', 'No abre al 100%')
  await page.click('button:has-text("Reportar")')
  await page.waitForURL(/\/fallas\/[^/]+$/)
  const falla2 = page.url().split('/').pop()
  await page.waitForSelector('text=Chat de la falla')
  await page.waitForTimeout(1500)
  await page.route('**/documents:commit*', (r) => r.abort())
  await page.setInputFiles('input[type=file][multiple]', [path.join(REPO, 'public/icons/icon-192.png')])
  await page.click('button:has-text("Enviar")')
  await esperar(async () => (await cola(page)).filter((s) => s.intentos > 0).length === 2, 90000, 'primer intento con la URL sin anotar')
  await page.unroute('**/documents:commit*')
  await page.waitForSelector('text=por subir', { state: 'detached', timeout: 60000 })
  const m2 = (await fs.collection(`fallas/${falla2}/mensajes`).get()).docs[0].get('fotos')[0]
  if (!m2.url || !m2.miniaturaUrl) throw new Error('no se anotó la URL del archivo que ya estaba subido')
  console.log('archivo ya subido: el reintento solo anota la URL ok')

  // 3b. La foto termina de subir antes de que el mensaje llegue al servidor: se espera al mensaje
  // (antes la subida se daba por terminada sin anotar la URL).
  await page.route('**/google.firestore.v1.Firestore/Write/channel*', (r) => r.abort())
  await page.setInputFiles('input[type=file][multiple]', [path.join(REPO, 'public/icons/icon-192.png')])
  await page.fill('textarea[placeholder="Escribe un mensaje"]', 'Segunda foto')
  await page.click('button:has-text("Enviar")')
  await esperar(async () => (await cola(page)).filter((s) => s.intentos > 0).length === 2, 90000, 'reintentar mientras el mensaje no llega')
  await page.unroute('**/google.firestore.v1.Firestore/Write/channel*')
  await page.waitForSelector('text=por subir', { state: 'detached', timeout: 60000 })
  const segunda = await esperar(async () => {
    const d = (await fs.collection(`fallas/${falla2}/mensajes`).where('texto', '==', 'Segunda foto').get()).docs[0]
    return d?.get('fotos')[0]
  }, 30000, 'que llegue el segundo mensaje')
  if (!segunda.url || !segunda.miniaturaUrl) throw new Error('la foto que se subió antes que su mensaje se quedó sin URL')
  console.log('foto subida antes que su mensaje: espera al mensaje y anota la URL ok')

  // 4. Lo que el servidor rechaza se detiene sin frenar lo demás, y se puede descartar.
  await encolarDirecto(page, {
    id: 'rechazada-1', ruta: `prohibido/${Date.now()}.jpg`, contentType: 'image/jpeg', creado: Date.now(), intentos: 0,
    destino: { tipo: 'campo', docPath: inst.path, campo: 'nada' },
  })
  await page.reload()
  await page.waitForSelector('text=1 archivo no se pudo subir', { timeout: 90000 })
  if (await page.locator('text=por subir').count()) throw new Error('la detenida sigue contando como "por subir"')
  await page.click('text=1 archivo no se pudo subir')
  await page.waitForSelector('text=El servidor no la aceptó.')
  await shot(page, '160-subida-detenida')
  await page.click('button:has-text("Descartar")')
  await page.click('button:has-text("Sí, descartar")')
  await page.waitForSelector('text=no se pudo subir', { state: 'detached' })
  if ((await cola(page)).length) throw new Error('la cola no quedó vacía')
  console.log('subida rechazada: se detiene, se ve en la barra y se descarta ok')

  // 5. Sin señal y con el token vencido el admin sigue dentro.
  await page.goto(`${BASE}/catalogo`)
  await page.waitForSelector(`text=${tag}`)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForSelector(`text=${tag}`)
  const vencerToken = (sinRol) => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('firebase:authUser:'))
    const u = JSON.parse(localStorage.getItem(k))
    u.stsTokenManager.expirationTime = Date.now() - 60_000
    // "e30" es {} en base64: un token sin rol.
    if (sinRol) u.stsTokenManager.accessToken = 'x.e30.x'
    localStorage.setItem(k, JSON.stringify(u))
  }
  await page.evaluate(vencerToken, false)
  await ctx.setOffline(true)
  await page.reload()
  await page.waitForSelector('text=Sin conexión', { timeout: 15000 })
  await page.waitForSelector(`text=${tag}`)
  if (await page.locator('text=no tiene un rol asignado').count()) throw new Error('sin señal salió "no tiene un rol asignado"')
  if (!(await page.locator('text=Alta').count())) throw new Error('sin señal no se ven las opciones del admin')
  await shot(page, '161-admin-sin-senal')
  console.log('sin señal y con el token vencido el admin sigue dentro ok')

  // Sin un rol guardado: aviso de sin conexión (no "no tienes rol") y entra solo al volver la señal.
  await page.evaluate(vencerToken, true)
  await page.reload()
  await page.waitForSelector('text=No se pudo comprobar tu cuenta sin señal')
  if (await page.locator('text=Soy el administrador inicial').count()) throw new Error('sin señal se ofrece "Soy el administrador inicial"')
  await shot(page, '162-sin-senal-sin-rol')
  await ctx.setOffline(false)
  await page.waitForSelector(`text=${tag}`, { timeout: 30000 })
  console.log('sin rol guardado: avisa "sin conexión" y entra solo al volver la señal ok')

  if (errores.length) console.log('errores de página:', errores)
  await browser.close()
  process.exit(0)
})().catch((e) => {
  console.error('FALLO:', e.message)
  process.exit(1)
})
