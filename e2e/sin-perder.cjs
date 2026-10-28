// Prueba de punta a punta de lo que no se debe perder: borradores que sobreviven a una recarga,
// avisos cuando el servidor rechaza algo hecho sin señal (dos técnicos cierran o toman la misma
// falla), aviso al salir con cosas sin enviar y el estado de los teléfonos que ve el admin.
// Requiere los emuladores y el admin manuel@adb.test / Prueba1234. Crea sus propios datos.
// Uso: node e2e/sin-perder.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
const { createRequire } = require('module')
const S = process.argv[2] ?? 'e2e/salida'
const REPO = process.argv[3] ?? process.cwd()
const BASE = 'http://localhost:4173'
require('fs').mkdirSync(path.join(S, 'shots'), { recursive: true })
const shot = (p, n) => p.screenshot({ path: path.join(S, 'shots', n + '.png') })
const n = Date.now() % 90000 + 10000
const tag = `SP-${n}`

process.env.GCLOUD_PROJECT = 'demo-instrumentacion-adb'
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
const req = createRequire(path.resolve(REPO, 'functions/package.json'))
const { initializeApp, getApps } = req('firebase-admin/app')
const { getFirestore, FieldValue } = req('firebase-admin/firestore')
const { getAuth } = req('firebase-admin/auth')
if (!getApps().length) initializeApp({ projectId: 'demo-instrumentacion-adb' })
const db = getFirestore()

async function tecnico(nombre, email) {
  const auth = getAuth()
  const u = (await auth.getUserByEmail(email).catch(() => null)) ?? (await auth.createUser({ email, password: 'Prueba1234', displayName: nombre }))
  await auth.setCustomUserClaims(u.uid, { rol: 'tecnico' })
  await db.doc(`usuarios/${u.uid}`).set({ nombre, email, rol: 'tecnico', area: '', activo: true, tokensFCM: [], creado: FieldValue.serverTimestamp() })
  return { uid: u.uid, nombre }
}

async function falla(instrumentoId, descripcion) {
  const ref = await db.collection('fallas').add({
    instrumentoId,
    tagISA: tag,
    area: 'Generación de vapor',
    subArea: '',
    estado: 'Abierta',
    reportadoPor: { uid: 'x', nombre: 'Operador' },
    tecnicoAsignado: null,
    descripcion,
    fotos: [],
    causaRaiz: '',
    accionCorrectiva: '',
    fechas: { creada: FieldValue.serverTimestamp(), tomada: null, cerrada: null },
  })
  return ref.id
}

async function entrar(browser, email) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(`[${email}] pageerror`, e.message))
  await page.goto(`${BASE}/login`)
  await page.fill('#email', email)
  await page.fill('#pass', 'Prueba1234')
  await page.click('button:has-text("Entrar")')
  await page.waitForSelector('text=Menú')
  // Con el service worker activo la app abre sin señal (para recargar en modo avión).
  await page.evaluate(() => navigator.serviceWorker.ready)
  return { ctx, page }
}

/** Modo avión: se espera a que la app lo note (la barra de Sin conexión) antes de tocar nada. */
async function sinSenal(x) {
  await x.page.waitForTimeout(1500)
  await x.ctx.setOffline(true)
  await x.page.waitForSelector('text=Sin conexión')
}

/** B ya lo ve en su pantalla, pero se espera a que llegue al servidor: así B llega primero. */
async function enServidor(id, campo, valor) {
  for (let i = 0; i < 100; i++) {
    if ((await db.doc(`fallas/${id}`).get()).get(campo) === valor) return
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`${campo} de la falla nunca llegó al servidor`)
}

async function cerrar(page, causa, accion) {
  await page.click('button:has-text("Cerrar falla")')
  await page.fill('label:has-text("Causa raíz") textarea', causa)
  await page.fill('label:has-text("Acción correctiva") textarea', accion)
  await page.click('form button:has-text("Cerrar")')
}

;(async () => {
  const inst = await db.collection('instrumentos').add({
    tagISA: tag,
    servicio: 'Prueba de lo que no se debe perder',
    area: 'Generación de vapor',
    estado: 'Operando',
    nfcToken: null,
    docs: [],
    portadaMiniatura: null,
    rangoMin: 0,
    rangoMax: 20,
    unidades: 'kg/cm²',
    proximaCalibracion: null,
  })
  const tecA = await tecnico('Técnico A', 'tec-a@adb.test')
  const tecB = await tecnico('Técnico B', 'tec-b@adb.test')
  // Cada corrida es un teléfono nuevo: se quitan los de corridas anteriores.
  for (const d of (await db.collection('telefonos').get()).docs) {
    if ([tecA.uid, tecB.uid].includes(d.get('uid'))) await d.ref.delete()
  }
  const browser = await chromium.launch()
  const A = await entrar(browser, 'tec-a@adb.test')
  const B = await entrar(browser, 'tec-b@adb.test')

  // ---------- Borradores ----------
  await A.page.goto(`${BASE}/fallas/nueva?instrumento=${inst.id}`)
  await A.page.fill('textarea', 'Fuga en la conexión del manómetro')
  await A.page.waitForTimeout(800)
  await A.page.reload()
  await A.page.waitForSelector('text=Recuperé lo que llevabas escrito')
  if ((await A.page.inputValue('textarea')) !== 'Fuga en la conexión del manómetro') throw new Error('el reporte no se recuperó')
  await shot(A.page, '300-borrador-falla')
  await A.page.click('button:has-text("Empezar de nuevo")')
  if ((await A.page.inputValue('textarea')) !== '') throw new Error('Empezar de nuevo no vació el reporte')
  await A.page.fill('textarea', 'Fuga en la conexión del manómetro')
  await A.page.click('button:has-text("Reportar")')
  await A.page.waitForURL((u) => /\/fallas\/[^/?]+$/.test(u.pathname) && !u.pathname.endsWith('/nueva'))
  await A.page.goto(`${BASE}/fallas/nueva?instrumento=${inst.id}`)
  await A.page.waitForSelector('textarea')
  await A.page.waitForTimeout(800)
  if ((await A.page.locator('text=Recuperé lo que llevabas escrito').count()) || (await A.page.inputValue('textarea')) !== '') {
    throw new Error('el borrador siguió después de reportar')
  }
  console.log('borrador del reporte de falla: se recupera, se descarta y se borra al reportar ok')

  await A.page.goto(`${BASE}/instrumentos/${inst.id}/calibrar`)
  await A.page.fill('label:has-text("Observaciones") textarea', 'Se purgó la línea antes de calibrar')
  await A.page.waitForTimeout(800)
  await A.page.reload()
  await A.page.waitForSelector('text=Recuperé lo que llevabas escrito')
  if ((await A.page.inputValue('label:has-text("Observaciones") textarea')) !== 'Se purgó la línea antes de calibrar') {
    throw new Error('la calibración no se recuperó')
  }
  await shot(A.page, '301-borrador-calibracion')
  await A.page.click('button:has-text("Empezar de nuevo")')
  console.log('borrador de la calibración ok')

  await A.page.goto(`${BASE}/chat`)
  await A.page.fill('textarea[placeholder="Escribe un mensaje"]', 'Voy para la caldera 2')
  await A.page.waitForTimeout(800)
  await A.page.reload()
  await A.page.waitForFunction(() => document.querySelector('textarea[placeholder="Escribe un mensaje"]')?.value === 'Voy para la caldera 2')
  await A.page.fill('textarea[placeholder="Escribe un mensaje"]', '')
  console.log('borrador del chat ok')

  // ---------- Dos técnicos cierran la misma falla; A sin señal ----------
  const f1 = await falla(inst.id, 'Lectura congelada')
  await A.page.goto(`${BASE}/fallas/${f1}`)
  await A.page.waitForSelector('button:has-text("Cerrar falla")')
  await sinSenal(A)
  await cerrar(A.page, 'Sensor dañado por A', 'A cambió el sensor')
  await A.page.waitForSelector('text=A cambió el sensor')
  await B.page.goto(`${BASE}/fallas/${f1}`)
  await cerrar(B.page, 'Cable suelto según B', 'B reapretó la terminal')
  await B.page.waitForSelector('text=B reapretó la terminal')
  await enServidor(f1, 'causaRaiz', 'Cable suelto según B')
  await A.ctx.setOffline(false)
  await A.page.waitForSelector('text=1 registro no se guardó', { timeout: 60000 })
  await A.page.waitForSelector('text=B reapretó la terminal')
  await shot(A.page, '302-barra-rechazo')
  await A.page.click('text=1 registro no se guardó')
  await A.page.waitForSelector(`text=Cierre de la falla de ${tag}`)
  await A.page.waitForSelector('text=A cambió el sensor')
  await A.page.waitForTimeout(400)
  await shot(A.page, '303-lo-que-no-se-guardo')
  console.log('cierre rechazado: se avisa con lo que escribió ok')

  // ---------- Dos técnicos toman la misma falla; A sin señal ----------
  const f2 = await falla(inst.id, 'Válvula no abre')
  await A.page.click('button:has-text("Cerrar")')
  await A.page.goto(`${BASE}/fallas/${f2}`)
  await A.page.waitForSelector('button:has-text("Tomar falla")')
  await sinSenal(A)
  await A.page.click('button:has-text("Tomar falla")')
  await B.page.goto(`${BASE}/fallas/${f2}`)
  await B.page.click('button:has-text("Tomar falla")')
  await B.page.waitForSelector('text=Tomada')
  await enServidor(f2, 'tecnicoAsignado.uid', tecB.uid)
  await A.ctx.setOffline(false)
  await A.page.waitForSelector('text=2 registros no se guardaron', { timeout: 60000 })
  const asignado = (await db.doc(`fallas/${f2}`).get()).get('tecnicoAsignado.uid')
  if (asignado !== tecB.uid) throw new Error(`la falla quedó asignada a ${asignado}, no a quien la tomó primero`)
  console.log('segunda toma rechazada: la falla se queda con quien la tomó primero ok')

  // ---------- Se cerró la app antes de que el servidor respondiera ----------
  const f3 = await falla(inst.id, 'Transmisor sin señal')
  await A.page.goto(`${BASE}/fallas/${f3}`)
  await A.page.waitForSelector('button:has-text("Cerrar falla")')
  await sinSenal(A)
  await cerrar(A.page, 'Fusible abierto por A', 'A cambió el fusible')
  await A.page.waitForSelector('text=A cambió el fusible')
  await A.page.reload()
  await A.page.waitForSelector('text=A cambió el fusible')
  await B.page.goto(`${BASE}/fallas/${f3}`)
  await cerrar(B.page, 'Fuente dañada según B', 'B cambió la fuente')
  await B.page.waitForSelector('text=B cambió la fuente')
  await enServidor(f3, 'causaRaiz', 'Fuente dañada según B')
  await A.ctx.setOffline(false)
  await A.page.reload()
  await A.page.waitForSelector('text=3 registros no se guardaron', { timeout: 60000 })
  console.log('lo que quedó sin respuesta al cerrar la app se revisa al reconectar ok')

  // Un error de la app queda anotado para el admin; los de scripts ajenos (una cartera de
  // criptomonedas, el bloqueador de anuncios de Brave en el iPhone) no.
  await A.page.evaluate(() => {
    // Como los de la app: su pila pasa por /assets/.
    const e = new Error('Prueba de error para el admin')
    e.stack = `Error: Prueba de error para el admin\n    at guardar (${location.origin}/assets/index.js:1:100)`
    void Promise.reject(e)
  })
  await A.page.addScriptTag({ content: 'window.ethereum = undefined; window.ethereum.selectedAddress = undefined' }).catch(() => undefined)
  // Brave mete su script en la página: la promesa falla y su pila apunta a la página, no a /assets/.
  await A.page.addScriptTag({ content: 'void (async () => { const n = undefined; return n.estiloAjeno })()' })
  await A.page.addScriptTag({ content: "void (async () => { const n = undefined; return n.standardSelectors })()" })

  // ---------- Estado de los teléfonos (admin) ----------
  const adm = await entrar(browser, 'manuel@adb.test')
  await A.page.waitForTimeout(7000)
  await adm.page.goto(`${BASE}/telefonos`)
  await adm.page.waitForSelector('text=Estado de los teléfonos')
  const tarjetaA = adm.page.locator('li.tarjeta', { hasText: 'Técnico A' })
  await tarjetaA.waitFor()
  await tarjetaA.locator('text=3 registros rechazados por el servidor').waitFor({ timeout: 20000 })
  await tarjetaA.locator('summary:has-text("1 error reciente")').click()
  await tarjetaA.locator('text=Prueba de error para el admin').waitFor()
  for (const ajeno of ['ethereum', 'estiloAjeno', 'standardSelectors']) {
    if (await tarjetaA.locator(`text=${ajeno}`).count()) throw new Error(`se anotó el error de un script ajeno (${ajeno})`)
  }
  await adm.page.locator('li.tarjeta', { hasText: 'Técnico B' }).waitFor()
  await shot(adm.page, '304-estado-telefonos')
  console.log('estado de los teléfonos: rechazos y errores de cada uno ok')

  // A da por vistos los rechazos.
  await A.page.click('text=3 registros no se guardaron')
  for (let i = 0; i < 3; i++) await A.page.locator('button:has-text("Ya lo vi")').first().click()
  await A.page.waitForSelector('text=no se guardaron', { state: 'detached' })
  await A.page.waitForSelector('text=no se guardó', { state: 'detached' })

  // ---------- Salir con cosas sin enviar ----------
  await A.page.goto(`${BASE}/chat`)
  await sinSenal(A)
  await A.page.fill('textarea[placeholder="Escribe un mensaje"]', 'Mensaje escrito sin señal')
  await A.page.click('button:has-text("Enviar")')
  await A.page.click('button:has-text("Menú")')
  await A.page.click('button:has-text("Salir")')
  await A.page.waitForSelector('text=Tienes 1 cosa sin enviar')
  await A.page.waitForTimeout(400)
  await shot(A.page, '305-salir-con-pendientes')
  await A.page.click('button:has-text("Quedarme")')
  await A.ctx.setOffline(false)
  await A.page.waitForSelector('text=por enviar', { state: 'detached', timeout: 60000 })
  await A.page.waitForTimeout(1000)
  // El menú se quedó abierto: ya con todo enviado, sale sin preguntar.
  await A.page.click('button:has-text("Salir")')
  await A.page.waitForURL(/\/login/)
  console.log('salir avisa si hay cosas sin enviar ok')

  await browser.close()
  process.exit(0)
})().catch((e) => {
  console.error('FALLO:', e.message)
  process.exit(1)
})
