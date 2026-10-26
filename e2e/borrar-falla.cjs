// Prueba de punta a punta: el admin elimina una falla reportada por error (abierta, en proceso
// y cerrada); se borran su chat y sus fotos, el instrumento vuelve a "Operando" y la bitácora
// lo anota. Un técnico no ve el botón. Requiere el admin manuel@adb.test / Prueba1234 y los emuladores.
// Uso: node e2e/borrar-falla.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
const { createRequire } = require('module')
const S = process.argv[2] ?? 'e2e/salida'
const REPO = process.argv[3] ?? process.cwd()
const BASE = 'http://localhost:4173'
const STORAGE = 'http://127.0.0.1:9199/v0/b/demo-instrumentacion-adb.appspot.com/o'
require('fs').mkdirSync(path.join(S, 'shots'), { recursive: true })
const shot = (p, n) => p.screenshot({ path: path.join(S, 'shots', n + '.png') })
const sufijo = Date.now().toString(36)
const tag = `PT-${(Date.now() % 9000) + 1000}`

process.env.GCLOUD_PROJECT = 'demo-instrumentacion-adb'
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
const req = createRequire(path.resolve(REPO, 'functions/package.json'))
const { initializeApp } = req('firebase-admin/app')
const { getAuth } = req('firebase-admin/auth')
const { getFirestore } = req('firebase-admin/firestore')
initializeApp({ projectId: 'demo-instrumentacion-adb' })
const db = getFirestore()

/** Archivos en el emulador de Storage bajo un prefijo. */
async function archivos(prefijo) {
  const r = await fetch(`${STORAGE}?prefix=${encodeURIComponent(prefijo)}`, { headers: { Authorization: 'Bearer owner' } })
  const j = await r.json()
  return (j.items ?? []).map((i) => i.name)
}

async function esperar(cond, msg, ms = 30000) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    if (await cond()) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(msg)
}

async function entrar(browser, email) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror', email, e.message))
  await page.goto(`${BASE}/login`)
  await page.fill('#email', email)
  await page.fill('#pass', 'Prueba1234')
  await page.click('button:has-text("Entrar")')
  await page.waitForSelector('text=Menú')
  return page
}

/** Reporta una falla del instrumento y regresa su id. */
async function reportar(page, id, texto) {
  await page.goto(`${BASE}/fallas/nueva?instrumento=${id}`)
  await page.fill('textarea', texto)
  await page.click('button:has-text("Reportar")')
  await page.waitForURL((u) => /\/fallas\/[^/?]+$/.test(u.pathname) && !u.pathname.endsWith('/nueva'))
  await page.waitForSelector('text=Chat de la falla')
  return page.url().split('/').pop()
}

const estadoDe = async (id) => (await db.doc(`instrumentos/${id}`).get()).get('estado')

;(async () => {
  const inst = await db
    .collection('instrumentos')
    .add({ tagISA: tag, servicio: 'Presión de prueba para eliminar fallas', area: 'Generación de vapor', estado: 'Operando', nfcToken: null, docs: [], portadaMiniatura: null, rangoMin: 0, rangoMax: 20, proximaCalibracion: null })
  const id = inst.id
  const tec = await getAuth().createUser({ email: `tec-${sufijo}@adb.test`, password: 'Prueba1234', displayName: 'Tomás Técnico' })
  await getAuth().setCustomUserClaims(tec.uid, { rol: 'tecnico' })
  await db.doc(`usuarios/${tec.uid}`).set({ nombre: 'Tomás Técnico', email: tec.email, rol: 'tecnico', area: '', activo: true, tokensFCM: [] })

  const browser = await chromium.launch()
  const admin = await entrar(browser, 'manuel@adb.test')

  // 1. Falla abierta con foto y un mensaje con foto en su chat.
  await admin.goto(`${BASE}/fallas/nueva?instrumento=${id}`)
  await admin.fill('textarea', 'Reporte duplicado por error')
  await admin.setInputFiles('input[type=file]', [path.join(REPO, 'public/icons/icon-192.png')])
  await admin.click('button:has-text("Reportar")')
  await admin.waitForURL((u) => /\/fallas\/[^/?]+$/.test(u.pathname) && !u.pathname.endsWith('/nueva'))
  const abierta = admin.url().split('/').pop()
  await admin.waitForSelector('text=Chat de la falla')
  await admin.setInputFiles('input[type=file][multiple]', [path.join(REPO, 'public/icons/icon-512.png')])
  await admin.fill('textarea[placeholder="Escribe un mensaje"]', 'Foto del tablero')
  await admin.click('button:has-text("Enviar")')
  await esperar(async () => (await archivos(`fallas/${abierta}/`)).length === 4, 'las fotos de la falla y del chat no se subieron')
  await esperar(async () => (await estadoDe(id)) === 'Con falla', 'el instrumento no quedó "Con falla"')
  console.log('falla abierta con fotos y chat ok')

  // El técnico la ve, pero no puede eliminarla.
  const tecnico = await entrar(browser, tec.email)
  await tecnico.goto(`${BASE}/fallas/${abierta}`)
  await tecnico.waitForSelector('text=Foto del tablero')
  if (await tecnico.locator('button:has-text("Eliminar falla")').count()) throw new Error('el técnico ve el botón de eliminar')
  console.log('el técnico no ve "Eliminar falla" ok')

  // Cancelar no borra nada.
  await admin.click('button:has-text("Eliminar falla")')
  await admin.waitForSelector('text=su chat: 1 mensaje y 1 foto')
  await admin.waitForSelector('text=la descripción y 1 foto')
  await admin.waitForSelector(`text=Si ${tag} no tiene otra falla pendiente, vuelve a quedar en «Operando».`)
  await admin.locator('button:has-text("Sí, eliminar")').scrollIntoViewIfNeeded()
  await shot(admin, '150-confirmar-eliminar-falla')
  await admin.click('button:has-text("Cancelar")')
  await admin.waitForSelector('button:has-text("Eliminar falla")')
  if (!(await db.doc(`fallas/${abierta}`).get()).exists) throw new Error('cancelar eliminó la falla')
  console.log('cancelar no elimina ok')

  await admin.click('button:has-text("Eliminar falla")')
  await admin.click('button:has-text("Sí, eliminar")')
  await admin.waitForURL(`${BASE}/fallas?estado=Abierta`)
  await admin.waitForSelector(`text=Se eliminó la falla de ${tag}.`)
  await shot(admin, '151-falla-eliminada')
  if (await admin.locator(`a[href="/fallas/${abierta}"]`).count()) throw new Error('la falla sigue en la lista')
  await esperar(async () => !(await db.doc(`fallas/${abierta}`).get()).exists, 'la falla sigue en el servidor')
  await esperar(async () => (await db.collection(`fallas/${abierta}/mensajes`).get()).empty, 'quedaron mensajes del chat')
  await esperar(async () => (await archivos(`fallas/${abierta}/`)).length === 0, 'quedaron fotos en Storage')
  await esperar(async () => (await estadoDe(id)) === 'Operando', 'el instrumento no volvió a "Operando"')
  // Quien la tenía abierta ve que ya no existe.
  await tecnico.waitForSelector('text=Esta falla no existe.')
  const bit = await db.collection('auditoria').where('docId', '==', abierta).where('accion', '==', 'borrar').get()
  if (bit.empty) throw new Error('la bitácora no anotó la falla eliminada')
  if (bit.docs[0].get('antes.descripcion') !== 'Reporte duplicado por error') throw new Error('la bitácora no guardó qué decía')
  console.log('falla abierta eliminada con chat y fotos; instrumento en "Operando"; bitácora ok')

  // 2. En proceso: con otra falla abierta, el instrumento sigue "Con falla".
  const otra = await reportar(admin, id, 'Esta sí es una falla real')
  const enProceso = await reportar(admin, id, 'Se reportó en el instrumento equivocado')
  await admin.click('button:has-text("Tomar falla")')
  await esperar(async () => (await db.doc(`fallas/${enProceso}`).get()).get('estado') === 'En proceso', 'no se tomó la falla')
  await admin.click('button:has-text("Eliminar falla")')
  await admin.click('button:has-text("Sí, eliminar")')
  await admin.waitForURL(`${BASE}/fallas?estado=En%20proceso`)
  await admin.waitForSelector(`text=Se eliminó la falla de ${tag}.`)
  await esperar(async () => !(await db.doc(`fallas/${enProceso}`).get()).exists, 'la falla en proceso sigue en el servidor')
  await new Promise((r) => setTimeout(r, 3000))
  if ((await estadoDe(id)) !== 'Con falla') throw new Error('con otra falla abierta el instrumento debe seguir "Con falla"')
  console.log('falla en proceso eliminada; con otra abierta sigue "Con falla" ok')

  // 3. Cerrada: también se pierden la causa raíz y la acción correctiva.
  await admin.goto(`${BASE}/fallas/${otra}`)
  await admin.click('button:has-text("Cerrar falla")')
  await admin.fill('label:has-text("Causa raíz") textarea', 'Se registró dos veces')
  await admin.fill('label:has-text("Acción correctiva") textarea', 'Ninguna, era un duplicado')
  await admin.click('form button:has-text("Cerrar")')
  await admin.waitForSelector('text=El chat se cerró junto con la falla')
  await esperar(async () => (await estadoDe(id)) === 'Operando', 'al cerrar la falla el instrumento no volvió a "Operando"')
  await admin.click('button:has-text("Eliminar falla")')
  await admin.waitForSelector('text=la causa raíz y la acción correctiva')
  if (await admin.locator('text=vuelve a quedar en «Operando»').count()) throw new Error('una falla cerrada no cambia el estado del instrumento')
  await admin.click('button:has-text("Sí, eliminar")')
  await admin.waitForURL(`${BASE}/fallas?estado=Cerrada`)
  await admin.waitForSelector(`text=Se eliminó la falla de ${tag}.`)
  await esperar(async () => !(await db.doc(`fallas/${otra}`).get()).exists, 'la falla cerrada sigue en el servidor')
  console.log('falla cerrada eliminada ok')

  // La ficha ya no la lista.
  await admin.goto(`${BASE}/instrumentos/${id}`)
  await admin.waitForSelector('text=Sin fallas registradas.')
  console.log('la ficha queda sin fallas ok')

  await browser.close()
  process.exit(0)
})().catch((e) => {
  console.error('FALLO:', e.message)
  process.exit(1)
})
