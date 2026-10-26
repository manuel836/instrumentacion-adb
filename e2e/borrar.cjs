// Prueba de punta a punta: el admin borra un instrumento con sus fotos, calibraciones,
// documentos y fallas; quitar un documento borra su archivo.
// Requiere el admin manuel@adb.test / Prueba1234 creado con functions/scripts/crear-admin.mjs.
// Uso: node e2e/borrar.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
const S = process.argv[2] ?? 'e2e/salida'
const REPO = process.argv[3] ?? process.cwd()
const BASE = 'http://localhost:4173'
const STORAGE = 'http://127.0.0.1:9199/v0/b/demo-instrumentacion-adb.appspot.com/o'
require('fs').mkdirSync(path.join(S, 'shots'), { recursive: true })
const shot = (p, n) => p.screenshot({ path: path.join(S, 'shots', n + '.png') })
const tag = `FT-${Math.floor(Math.random() * 9000 + 1000)}`

const nfcMock = () => {
  class NDEFReader extends EventTarget {
    async write(msg) {
      localStorage.setItem('nfc-ultimo', msg.records[0].data)
      await new Promise((r) => setTimeout(r, 300))
    }
    async scan() {
      setTimeout(() => {
        const url = localStorage.getItem('nfc-ultimo') ?? ''
        const ev = new Event('reading')
        ev.serialNumber = '04:bb'
        ev.message = { records: [{ recordType: 'url', data: new DataView(new TextEncoder().encode(url).buffer) }] }
        this.dispatchEvent(ev)
      }, 300)
    }
  }
  window.NDEFReader = NDEFReader
  navigator.vibrate = () => true
}

/** Archivos en el emulador de Storage bajo un prefijo. */
async function archivos(prefijo) {
  const r = await fetch(`${STORAGE}?prefix=${encodeURIComponent(prefijo)}`, { headers: { Authorization: 'Bearer owner' } })
  const j = await r.json()
  return (j.items ?? []).map((i) => i.name)
}

async function esperar(cond, msg, ms = 20000) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    if (await cond()) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(msg)
}

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...devices['Pixel 7'] })
  await ctx.addInitScript(nfcMock)
  const page = await ctx.newPage()
  const errores = []
  page.on('pageerror', (e) => errores.push(e.message))

  await page.goto(`${BASE}/login`)
  await page.fill('#email', 'manuel@adb.test')
  await page.fill('#pass', 'Prueba1234')
  await page.click('button:has-text("Entrar")')
  await page.waitForSelector('text=Menú')

  // Alta con tag, foto, documento, calibración y falla.
  await page.goto(`${BASE}/instrumentos/nuevo`)
  await page.fill('input[placeholder="PT-101"]', tag)
  await page.fill('input[placeholder="Presión de vapor a cabezal"]', 'Flujo de prueba para borrar')
  await page.click('button:has-text("Siguiente")')
  await page.waitForURL('**/vincular')
  await page.click('button:has-text("Grabar tag")')
  await page.waitForSelector('text=Tag grabado y vinculado')
  const token = (await page.evaluate(() => localStorage.getItem('nfc-ultimo'))).split('/t/')[1]
  await page.setInputFiles('input[type=file]', [path.join(REPO, 'public/icons/icon-512.png')])
  await page.click('button:has-text("Guardar y terminar")')
  await page.waitForURL(/\/instrumentos\/[^/]+$/)
  const id = page.url().split('/').pop()

  await page.setInputFiles('input[type=file][accept^=".pdf"]', [path.join(REPO, 'README.md')])
  await page.waitForSelector('a:has-text("README.md")', { timeout: 20000 })
  await page.setInputFiles('input[type=file][accept^=".pdf"]', [path.join(REPO, 'index.html')])
  await page.waitForSelector('a:has-text("index.html")', { timeout: 20000 })
  await esperar(async () => (await archivos(`instrumentos/${id}/docs/`)).length === 2, 'los documentos no se subieron')

  // Quitar un documento borra su archivo en Storage.
  await page.locator('a:has-text("index.html")').locator('xpath=..').locator('button:has-text("Quitar")').click()
  await esperar(async () => (await archivos(`instrumentos/${id}/docs/`)).length === 1, 'quitar el documento no borró el archivo')
  console.log('quitar documento borra el archivo ok')

  await page.goto(`${BASE}/instrumentos/${id}/calibrar`)
  await page.fill('input[aria-label="Entrada 1"]', '0')
  await page.fill('input[aria-label="As-Found 1"]', '0')
  await page.fill('input[aria-label="Entrada 2"]', '10')
  await page.fill('input[aria-label="As-Found 2"]', '10')
  const min = page.locator('label:has-text("Rango mínimo") input')
  const max = page.locator('label:has-text("Rango máximo") input')
  await min.fill('0')
  await max.fill('10')
  await page.click('button:has-text("Guardar")')
  await page.waitForURL(new RegExp(`/instrumentos/${id}$`))

  await page.goto(`${BASE}/fallas/nueva?instrumento=${id}`)
  await page.fill('textarea', 'Falla de prueba que se borrará con el instrumento')
  await page.setInputFiles('input[type=file]', [path.join(REPO, 'public/icons/icon-192.png')])
  await page.click('button:has-text("Reportar")')
  await page.waitForURL((u) => /\/fallas\/[^/?]+$/.test(u.pathname) && !u.pathname.endsWith('/nueva'))
  const fallaId = page.url().split('/').pop()
  await page.fill('textarea[placeholder="Escribe un mensaje"]', 'Mensaje en el chat de la falla')
  await page.click('button:has-text("Enviar")')
  await esperar(async () => (await archivos(`fallas/${fallaId}/`)).length >= 2, 'las fotos de la falla no se subieron')
  await esperar(async () => (await archivos(`instrumentos/${id}/ubicacion/`)).length >= 2, 'las fotos de ubicación no se subieron')
  console.log('instrumento con tag, foto, documento, calibración y falla ok')

  // Un técnico no ve el botón; el admin sí.
  await page.goto(`${BASE}/instrumentos/${id}`)
  await page.click('button:has-text("Borrar instrumento")')
  await page.waitForSelector('text=1 foto de ubicación')
  await page.waitForSelector('text=1 calibración')
  await page.waitForSelector('text=1 falla con su chat')
  await page.waitForSelector('text=1 documento')
  const confirmar = page.locator('button:has-text("Sí, borrar")')
  if (await confirmar.isEnabled()) throw new Error('se puede borrar sin escribir el tag')
  await page.fill('input[aria-label="Escribe el tag para confirmar"]', tag.toLowerCase())
  await shot(page, '60-confirmar-borrar')
  await confirmar.click()
  await page.waitForSelector(`text=${tag} se borró.`, { timeout: 30000 })
  await shot(page, '61-borrado')
  if ((await page.locator(`text=${tag}`).count()) !== 1) throw new Error('el instrumento sigue en el catálogo')
  console.log('borrado y fuera del catálogo ok')

  await esperar(async () => (await archivos(`instrumentos/${id}/`)).length === 0, 'quedaron archivos del instrumento')
  await esperar(async () => (await archivos(`fallas/${fallaId}/`)).length === 0, 'quedaron archivos de la falla')
  console.log('archivos en Storage borrados ok')

  await page.goto(`${BASE}/fallas`)
  await page.click('button:has-text("Abierta")')
  await page.waitForTimeout(1000)
  if ((await page.locator(`text=${tag}`).count()) !== 0) throw new Error('la falla sigue en la lista')
  await page.goto(`${BASE}/fallas/${fallaId}`)
  await page.waitForSelector('text=Esta falla no existe.')
  console.log('falla borrada ok')

  const invitado = await browser.newContext({ ...devices['Pixel 7'] })
  const g = await invitado.newPage()
  await g.goto(`${BASE}/t/${token}`)
  await g.waitForSelector('text=Este tag no está vinculado', { timeout: 20000 })
  console.log('el tag ya no abre la vista pública ok')

  await page.goto(`${BASE}/bitacora`)
  const entradas = page.locator('li', { hasText: tag })
  await entradas.filter({ hasText: 'Baja' }).first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(3000)
  const bajas = await entradas.filter({ hasText: 'Baja' }).count()
  if (bajas !== 1) throw new Error(`esperaba 1 baja en la bitácora y hay ${bajas}`)
  await page.locator('li', { hasText: tag }).filter({ hasText: 'Baja' }).filter({ hasText: 'Fallas (con su chat)' }).waitFor()
  await shot(page, '62-bitacora-baja')
  console.log('una sola baja con resumen en la bitácora ok')

  console.log('errores de página:', errores)
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
