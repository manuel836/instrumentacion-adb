// Prueba de punta a punta de la Fase 1 contra los emuladores y `vite preview`.
// Requiere el admin manuel@adb.test / Prueba1234 creado con functions/scripts/crear-admin.mjs.
// Uso: node e2e/fase1.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
const S = process.argv[2] ?? 'e2e/salida'
const REPO = process.argv[3] ?? process.cwd()
const BASE = 'http://localhost:4173'
require('fs').mkdirSync(path.join(S, 'shots'), { recursive: true })
const shot = (p, n) => p.screenshot({ path: path.join(S, 'shots', n + '.png') })

// Simula Web NFC: grabar guarda la URL, escanear devuelve la última grabada.
const nfcMock = () => {
  class NDEFReader extends EventTarget {
    async write(msg) {
      localStorage.setItem('nfc-ultimo', msg.records[0].data)
      await new Promise((r) => setTimeout(r, 300))
    }
    async scan() {
      setTimeout(() => {
        const url = localStorage.getItem('nfc-ultimo')
        const ev = new Event('reading')
        ev.serialNumber = '04:aa'
        ev.message = { records: [{ recordType: 'url', data: new DataView(new TextEncoder().encode(url).buffer) }] }
        this.dispatchEvent(ev)
      }, 300)
    }
  }
  window.NDEFReader = NDEFReader
  navigator.vibrate = () => true
}

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...devices['Pixel 7'] })
  await ctx.addInitScript(nfcMock)
  const page = await ctx.newPage()
  const errores = []
  page.on('pageerror', (e) => errores.push(e.message))

  await page.goto(BASE)
  await page.waitForURL('**/login')
  await shot(page, '01-login')
  await page.fill('#email', 'manuel@adb.test')
  await page.fill('#pass', 'Prueba1234')
  await page.click('button:has-text("Entrar")')
  await page.waitForSelector('text=instrumentos')
  console.log('login ok')

  // Alta rápida
  await page.click('nav >> text=Alta')
  await page.fill('input[placeholder="PT-101"]', 'pt-101')
  await page.fill('input[placeholder="Presión de vapor a cabezal"]', 'Presión de vapor a cabezal')
  await page.fill('input[placeholder="Caldera B, nivel 2"]', 'Caldera B, nivel 2')
  await shot(page, '02-alta')
  await page.click('button:has-text("Siguiente")')
  await page.waitForURL('**/vincular')

  // Grabar tag (NFC simulado)
  await page.click('button:has-text("Grabar tag")')
  await page.waitForSelector('text=Tag grabado y vinculado')
  const url = await page.evaluate(() => localStorage.getItem('nfc-ultimo'))
  console.log('tag grabado:', url)

  // Fotos de ubicación
  await page.setInputFiles('input[type=file]', [path.join(REPO, 'public/icons/icon-512.png'), path.join(REPO, 'public/icons/icon-192.png')])
  await page.fill('input[placeholder^="Toma general"]', 'Nivel 2, lado norte de la caldera B')
  await shot(page, '03-vincular')
  await page.click('button:has-text("Guardar y terminar")')
  await page.waitForURL(/\/instrumentos\/[^/]+$/)
  await page.waitForFunction(() => document.querySelectorAll('section img').length >= 2, null, { timeout: 20000 })
  await page.waitForTimeout(3000) // subida y Functions
  await page.reload()
  await page.waitForSelector('text=Nivel 2, lado norte')
  await shot(page, '04-ficha')
  console.log('ficha con galería ok')

  // Vista de invitado
  const token = url.split('/t/')[1]
  const guest = await browser.newContext({ ...devices['Pixel 7'] })
  const gp = await guest.newPage()
  await gp.goto(`${BASE}/t/${token}`)
  await gp.waitForSelector('text=PT-101')
  await gp.waitForSelector('text=Nivel 2, lado norte', { timeout: 15000 })
  const fotosInvitado = await gp.locator('img').count()
  await shot(gp, '05-invitado')
  console.log('invitado ve PT-101 con', fotosInvitado, 'fotos')
  await gp.goto(`${BASE}/t/AAAAAAAAAAAAAAAAAA`)
  await gp.waitForSelector('text=no está vinculado')
  console.log('token inventado rechazado ok')

  // Escanear con sesión abre la ficha
  await page.click('nav >> text=Escanear')
  await page.click('button:has-text("Escanear")')
  await page.waitForURL(/\/instrumentos\/[^/]+$/)
  console.log('escaneo con sesión abre ficha ok')

  // Modo avión: catálogo, búsqueda, ficha y fotos
  await page.goto(BASE)
  await page.waitForSelector('text=PT-101')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForSelector('text=PT-101')
  await ctx.setOffline(true)
  await page.reload()
  await page.waitForSelector('text=Sin conexión', { timeout: 15000 })
  await page.fill('input[type=search]', 'cabezal')
  await page.waitForSelector('text=1 de 1 instrumentos')
  await shot(page, '06-offline-catalogo')
  await page.click('text=PT-101')
  await page.waitForSelector('text=Nivel 2, lado norte')
  const rotas = await page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0).length)
  await shot(page, '07-offline-ficha')
  console.log('offline: ficha abierta, imágenes rotas =', rotas)

  // Alta sin señal queda pendiente y se sincroniza al volver
  await page.click('nav >> text=Alta')
  await page.fill('input[placeholder="PT-101"]', 'TT-202')
  await page.selectOption('select', 'Tratamiento de agua')
  await page.fill('input[placeholder="Presión de vapor a cabezal"]', 'Temperatura agua de alimentación')
  await page.click('button:has-text("Siguiente")')
  await page.waitForURL('**/vincular')
  await page.setInputFiles('input[type=file]', [path.join(REPO, 'public/icons/icon-192.png')])
  await page.click('button:has-text("Guardar y terminar")')
  await page.waitForSelector('text=archivos por subir')
  await shot(page, '08-offline-pendiente')
  console.log('offline: alta y fotos en cola ok')
  await ctx.setOffline(false)
  await page.waitForSelector('text=por subir', { state: 'detached', timeout: 30000 })
  console.log('al reconectar se subió la cola ok')

  console.log('errores de página:', errores)
  await browser.close()
})().catch((e) => {
  console.error('FALLO:', e.message)
  process.exit(1)
})
