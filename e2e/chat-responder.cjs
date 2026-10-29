// Prueba de punta a punta de lo nuevo del chat: con el teclado abierto la caja de escribir queda
// a la vista; responder a un mensaje; corregir y eliminar los propios (sus fotos se borran de
// Storage); eliminar un chat privado solo para mí o para ambos.
// Requiere el admin manuel@adb.test / Prueba1234 y los emuladores corriendo.
// Uso: node e2e/chat-responder.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
const { createRequire } = require('module')
const S = process.argv[2] ?? 'e2e/salida'
const REPO = process.argv[3] ?? process.cwd()
const BASE = 'http://localhost:4173'
const STORAGE = 'http://127.0.0.1:9199/v0/b/demo-instrumentacion-adb.appspot.com/o'
require('fs').mkdirSync(path.join(S, 'shots'), { recursive: true })
// Se espera a que terminen las animaciones (hojas que suben, avisos que aparecen).
const shot = async (p, n) => {
  await p.waitForTimeout(500)
  await p.screenshot({ path: path.join(S, 'shots', n + '.png') })
}
const sufijo = Date.now().toString(36)
/** Lo que el teclado del teléfono le quita a la pantalla. */
const TECLADO = 330

process.env.GCLOUD_PROJECT = 'demo-instrumentacion-adb'
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
const req = createRequire(path.resolve(REPO, 'functions/package.json'))
const { initializeApp } = req('firebase-admin/app')
const { getFirestore } = req('firebase-admin/firestore')
initializeApp({ projectId: 'demo-instrumentacion-adb' })
const db = getFirestore()

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

const caja = (page) => page.locator('form textarea')

async function escribir(page, texto) {
  await caja(page).fill(texto)
  await page.click('form button:has-text("Enviar")')
  await page.locator('li', { hasText: texto }).last().waitFor()
}

/** El mensaje con ese texto (no las respuestas que lo citan). */
const mensaje = (page, texto) => page.locator('li').filter({ has: page.locator('p.whitespace-pre-wrap', { hasText: texto }) }).last()

/** Toca el mensaje en su texto (tocar la cita de una respuesta lleva al original). */
const tocar = (page, texto) => mensaje(page, texto).locator('p.whitespace-pre-wrap').click()

async function accion(page, texto, cual) {
  await tocar(page, texto)
  await page.locator('[role=dialog]').waitFor()
  await page.click(`[role=dialog] button:has-text("${cual}")`)
}

/** Simula el teclado: la vista visible se achica y luego vuelve. */
async function conTeclado(page, abierto) {
  const v = page.viewportSize()
  await page.setViewportSize({ width: v.width, height: abierto ? v.height - TECLADO : v.height + TECLADO })
  await page.waitForTimeout(400)
}

/** La caja de escribir se ve completa dentro de lo que queda de pantalla. */
async function cajaVisible(page) {
  return page.evaluate(() => {
    const r = document.querySelector('form textarea').getBoundingClientRect()
    const vv = window.visualViewport
    return r.top >= vv.offsetTop && r.bottom <= vv.offsetTop + vv.height
  })
}

;(async () => {
  const browser = await chromium.launch()
  const admin = await entrar(browser, 'manuel@adb.test')
  const paula = { nombre: `Paula ${sufijo}`, email: `paula-r-${sufijo}@adb.test` }
  const rafa = { nombre: `Rafa ${sufijo}`, email: `rafa-r-${sufijo}@adb.test` }
  for (const [u, rol] of [
    [paula, 'operador'],
    [rafa, 'tecnico'],
  ]) {
    await admin.goto(`${BASE}/usuarios`)
    await admin.fill('input[placeholder="Nombre"]', u.nombre)
    await admin.fill('input[placeholder="Correo"]', u.email)
    await admin.fill('input[placeholder^="Contraseña"]', 'Prueba1234')
    await admin.locator('form select').first().selectOption(rol)
    await admin.click('button:has-text("Crear usuario")')
    await admin.waitForSelector(`text=Usuario ${u.email} creado.`, { timeout: 20000 })
  }
  console.log('usuarios creados ok')

  // ---------- Teclado: la caja de escribir queda arriba de él ----------
  const p = await entrar(browser, paula.email)
  await p.click('nav >> text=Chat')
  await p.waitForSelector('h1:has-text("Canal general · hoy")')
  for (let i = 1; i <= 12; i++) await escribir(p, `Revisión de ronda ${i} ${sufijo}`)
  await caja(p).click()
  await conTeclado(p, true)
  if (!(await cajaVisible(p))) throw new Error('con el teclado abierto la caja de escribir queda tapada')
  if (await p.locator('nav:has-text("Escanear")').isVisible()) throw new Error('las pestañas de abajo siguen con el teclado abierto')
  if (await p.locator('h1:has-text("Canal general")').isVisible()) throw new Error('el título sigue ocupando lugar con el teclado abierto')
  await caja(p).fill(`Escribo con el teclado abierto y veo lo que escribo ${sufijo}`)
  // Lo último del chat sigue a la vista, justo arriba de la caja.
  const ultimoVisible = await p.evaluate(
    (t) => {
      const li = [...document.querySelectorAll('li')].find((x) => x.textContent.includes(t))
      const r = li.getBoundingClientRect()
      return r.bottom <= document.querySelector('form').getBoundingClientRect().top + 1 && r.top >= 0
    },
    `Revisión de ronda 12 ${sufijo}`,
  )
  if (!ultimoVisible) throw new Error('con el teclado abierto no se ve el último mensaje')
  await shot(p, '420-teclado-abierto')
  await p.click('form button:has-text("Enviar")')
  await p.locator('li', { hasText: `Escribo con el teclado abierto y veo lo que escribo ${sufijo}` }).waitFor()
  if (!(await cajaVisible(p))) throw new Error('al enviar la caja quedó tapada')
  await conTeclado(p, false)
  await p.locator('nav:has-text("Escanear")').waitFor()
  console.log('la caja de escribir queda arriba del teclado ok')

  // ---------- Responder ----------
  const original = `¿Alguien revisó la bomba P-12? ${sufijo}`
  await escribir(p, original)
  const r = await entrar(browser, rafa.email)
  await r.click('nav >> text=Chat')
  await r.waitForSelector(`text=${original}`)
  await accion(r, original, 'Responder')
  await r.waitForSelector(`form >> text=Respondiendo a ${paula.nombre}`)
  const respuesta = `Sí, la revisé a las 8 ${sufijo}`
  await escribir(r, respuesta)
  const cita = (page) => page.locator('li', { hasText: respuesta }).locator('button[aria-label^="Responde a"]')
  await cita(r).waitFor()
  await cita(p).waitFor({ timeout: 20000 })
  if (!(await cita(p).innerText()).includes('Tú')) throw new Error('a Paula la cita no le dice "Tú"')
  if (await r.locator('form >> text=Respondiendo a').count()) throw new Error('la barra de respuesta no se quitó al enviar')
  await shot(r, '421-respuesta')
  // Al tocar la cita se va al mensaje original y lo resalta.
  await cita(p).click()
  await mensaje(p, original).locator('.ring-aviso-400').waitFor()
  console.log('responder a un mensaje ok')

  // ---------- Editar ----------
  const corregido = `¿Alguien revisó la bomba P-14? ${sufijo}`
  await accion(p, original, 'Editar')
  await p.waitForSelector('form >> text=Editando tu mensaje')
  if ((await caja(p).inputValue()) !== original) throw new Error('al editar la caja no trae el texto del mensaje')
  await shot(p, '422-editando')
  await caja(p).fill(corregido)
  await p.click('form button:has-text("Guardar")')
  await mensaje(p, corregido).locator('text=Editado').waitFor()
  await mensaje(r, corregido).locator('text=Editado').waitFor({ timeout: 20000 })
  if (!(await cita(r).innerText()).includes('P-14')) throw new Error('la cita no muestra la corrección')
  await shot(r, '423-editado')
  console.log('corregir un mensaje ok')

  // Solo el autor puede editar: en el mensaje de otro solo se ofrece responder.
  await tocar(p, respuesta)
  await p.locator('[role=dialog]').waitFor()
  if (await p.locator('[role=dialog] button:has-text("Editar")').count()) throw new Error('se ofrece editar un mensaje ajeno')
  await p.click('[role=dialog] button:has-text("Cancelar")')

  // ---------- Eliminar ----------
  await accion(p, corregido, 'Eliminar')
  await p.click('[role=dialog] button:has-text("Sí, eliminar")')
  await p.locator('li', { hasText: 'Eliminaste este mensaje' }).last().waitFor()
  // La cita de la respuesta de Rafa también lo dice.
  await cita(r).filter({ hasText: 'Se eliminó este mensaje' }).waitFor({ timeout: 20000 })
  if (await r.locator(`text=${corregido}`).count()) throw new Error('el texto eliminado se sigue viendo')
  if (await p.locator('li', { hasText: 'Eliminaste este mensaje' }).locator('div[tabindex="0"]').count()) throw new Error('un mensaje eliminado todavía se puede tocar')
  await shot(r, '424-eliminado')
  console.log('eliminar un mensaje ok')

  // ---------- Chat privado: foto eliminada se borra de Storage ----------
  await p.goto(`${BASE}/chat/privados`)
  await p.click('button:has-text("Nuevo chat privado")')
  await p.fill('input[placeholder="Buscar por nombre"]', rafa.nombre)
  await p.click(`a:has-text("${rafa.nombre}")`, { timeout: 20000 })
  await p.waitForSelector(`h1:has-text("${rafa.nombre}")`)
  await escribir(p, `Hola Rafa ${sufijo}`)
  await p.setInputFiles('input[type=file][multiple]', [path.join(REPO, 'public/icons/icon-192.png')])
  await escribir(p, `Foto equivocada ${sufijo}`)
  const msg = (
    await db.collectionGroup('mensajes').where('texto', '==', `Foto equivocada ${sufijo}`).get()
  ).docs[0]
  await esperar(async () => (await archivos(`${msg.ref.path}/`)).length > 0, 'la foto no se subió')
  await accion(p, `Foto equivocada ${sufijo}`, 'Eliminar')
  await p.click('[role=dialog] button:has-text("Sí, eliminar")')
  await p.locator('li', { hasText: 'Eliminaste este mensaje' }).waitFor()
  await esperar(async () => (await archivos(`${msg.ref.path}/`)).length === 0, 'la foto del mensaje eliminado sigue en Storage')
  // La lista de chats dice que el último se eliminó.
  await p.click('text=← Chats privados')
  await p.locator('li', { hasText: rafa.nombre }).locator('text=Se eliminó este mensaje').waitFor()
  console.log('eliminar un mensaje con foto la borra de Storage ok')

  // ---------- Eliminar chat solo para mí ----------
  await r.goto(`${BASE}/chat/privados`)
  await r.locator('li', { hasText: paula.nombre }).click()
  await r.waitForSelector(`text=Hola Rafa ${sufijo}`)
  await r.click('button:has-text("Eliminar chat")')
  await r.locator('[role=dialog]').waitFor()
  await shot(r, '425-eliminar-chat')
  await r.click('[role=dialog] button:has-text("Eliminar solo para mí")')
  await r.waitForURL(`${BASE}/chat/privados`)
  await r.waitForSelector('text=Aún no tienes chats privados')
  await p.locator('li', { hasText: rafa.nombre }).waitFor()
  await p.reload()
  await p.locator('li', { hasText: rafa.nombre }).waitFor()
  console.log('eliminar solo para mí: Rafa ya no lo ve, Paula sí ok')

  // Si Paula vuelve a escribir, a Rafa le aparece solo lo nuevo.
  await p.locator('li', { hasText: rafa.nombre }).click()
  await escribir(p, `¿Sigues ahí? ${sufijo}`)
  await r.locator('li', { hasText: paula.nombre }).waitFor({ timeout: 20000 })
  await r.locator('li', { hasText: paula.nombre }).click()
  await r.waitForSelector(`h1:has-text("${paula.nombre}")`)
  await mensaje(r, `¿Sigues ahí? ${sufijo}`).waitFor()
  await r.waitForTimeout(800)
  if (await r.locator(`text=Hola Rafa ${sufijo}`).count()) throw new Error('a Rafa le volvieron a salir los mensajes que eliminó')
  await shot(r, '426-solo-lo-nuevo')
  console.log('al volver a escribir, solo se ve lo nuevo ok')

  // ---------- Eliminar para ambos ----------
  await p.click('button:has-text("Eliminar chat")')
  await p.click('[role=dialog] button:has-text("Eliminar para ambos")')
  await p.waitForSelector('[role=dialog] >> text=No se puede deshacer')
  await shot(p, '427-eliminar-para-ambos')
  await p.click('[role=dialog] button:has-text("Sí, eliminar")')
  await p.waitForURL(`${BASE}/chat/privados`)
  await p.waitForSelector('text=Aún no tienes chats privados')
  await r.goto(`${BASE}/chat/privados`)
  await r.waitForSelector('text=Aún no tienes chats privados')
  const ruta = msg.ref.parent.path
  await esperar(async () => (await db.collection(ruta).count().get()).data().count === 0, 'quedaron mensajes del chat eliminado para ambos')
  console.log('eliminar para ambos borra los mensajes de los dos ok')

  await browser.close()
  process.exit(0)
})().catch((e) => {
  console.error('FALLO:', e.message)
  process.exit(1)
})
