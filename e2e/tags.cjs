// Prueba de punta a punta: antes de grabar, la app lee el tag y avisa si ya pertenece
// a otro instrumento o trae otra información. NFC simulado: el tag "en la mano" es el
// último grabado (o lo que se ponga en localStorage nfc-ultimo).
// Requiere el admin manuel@adb.test / Prueba1234 creado con functions/scripts/crear-admin.mjs.
// Uso: node e2e/tags.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
const S = process.argv[2] ?? 'e2e/salida'
const BASE = 'http://localhost:4173'
require('fs').mkdirSync(path.join(S, 'shots'), { recursive: true })
const shot = (p, n) => p.screenshot({ path: path.join(S, 'shots', n + '.png') })
const n = Math.floor(Math.random() * 900 + 100)

const nfcMock = () => {
  class NDEFReader extends EventTarget {
    async write(msg) {
      localStorage.setItem('nfc-ultimo', msg.records[0].data)
      localStorage.setItem('nfc-escrituras', String(Number(localStorage.getItem('nfc-escrituras') ?? 0) + 1))
      await new Promise((r) => setTimeout(r, 300))
    }
    async scan() {
      setTimeout(() => {
        const url = localStorage.getItem('nfc-ultimo') ?? ''
        const ev = new Event('reading')
        ev.serialNumber = '04:cc'
        ev.message = { records: url ? [{ recordType: 'url', data: new DataView(new TextEncoder().encode(url).buffer) }] : [] }
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
  const escrituras = () => page.evaluate(() => Number(localStorage.getItem('nfc-escrituras') ?? 0))

  await page.goto(`${BASE}/login`)
  await page.fill('#email', 'manuel@adb.test')
  await page.fill('#pass', 'Prueba1234')
  await page.click('button:has-text("Entrar")')
  await page.waitForSelector('text=Menú')

  async function alta(tag) {
    await page.goto(`${BASE}/instrumentos/nuevo`)
    await page.fill('input[placeholder="PT-101"]', tag)
    await page.fill('input[placeholder="Presión de vapor a cabezal"]', `Servicio de ${tag}`)
    await page.click('button:has-text("Siguiente")')
    await page.waitForURL('**/vincular')
    return page.url().split('/').slice(-2)[0]
  }

  // A recibe un tag vacío: se graba sin preguntar.
  const tagA = `PT-${n}A`
  const idA = await alta(tagA)
  await page.click('button:has-text("Grabar tag")')
  await page.waitForSelector('text=Tag grabado y vinculado')
  const urlA = await page.evaluate(() => localStorage.getItem('nfc-ultimo'))
  console.log('tag vacío grabado sin preguntar ok')

  // B intenta usar el mismo tag físico: aviso y no se graba.
  const tagB = `PT-${n}B`
  const idB = await alta(tagB)
  const antes = await escrituras()
  await page.click('button:has-text("Grabar tag")')
  await page.waitForSelector(`text=Este tag ya pertenece a ${tagA}`)
  await shot(page, '80-tag-de-otro')
  if ((await escrituras()) !== antes) throw new Error('grabó encima del tag de otro instrumento')
  console.log('aviso de tag ajeno y no graba ok')

  await page.click('button:has-text("Usar otro tag")')
  await page.waitForSelector('button:has-text("Grabar tag")')
  await page.click('button:has-text("Grabar tag")')
  await page.waitForSelector(`button:has-text("Pasarlo a ${tagB}")`)
  await page.click(`button:has-text("Pasarlo a ${tagB}")`)
  await page.waitForSelector('text=Tag grabado y vinculado')
  const urlB = await page.evaluate(() => localStorage.getItem('nfc-ultimo'))
  if (urlB === urlA) throw new Error('no cambió la URL del tag')
  console.log('tag pasado de A a B ok')

  await page.goto(`${BASE}/instrumentos/${idA}`)
  await page.waitForSelector('text=Sin tag NFC todavía.', { timeout: 15000 })
  await page.waitForSelector('a:has-text("Vincular tag")')
  console.log('A quedó sin tag ok')

  await page.goto(`${BASE}/escanear`)
  await page.click('button:has-text("Escanear")')
  await page.waitForURL(`**/instrumentos/${idB}`)
  console.log('al escanear el tag abre B ok')

  const invitado = await (await browser.newContext({ ...devices['Pixel 7'] })).newPage()
  await invitado.goto(`${BASE}/t/${urlA.split('/t/')[1]}`)
  await invitado.waitForSelector('text=Este tag no está vinculado', { timeout: 20000 })
  await invitado.goto(`${BASE}/t/${urlB.split('/t/')[1]}`)
  await invitado.waitForSelector(`text=${tagB}`, { timeout: 20000 })
  console.log('la vista pública sigue al tag ok')

  // Regrabar el tag del propio instrumento no pregunta.
  await page.goto(`${BASE}/instrumentos/${idB}/vincular`)
  await page.click('button:has-text("Grabar tag")')
  await page.waitForSelector('text=Tag grabado y vinculado')
  console.log('regrabar su propio tag no pregunta ok')

  // Un tag con información de otra cosa avisa antes de borrarla.
  const tagC = `PT-${n}C`
  await alta(tagC)
  await page.evaluate(() => localStorage.setItem('nfc-ultimo', 'https://example.com/menu-del-comedor'))
  await page.click('button:has-text("Grabar tag")')
  await page.waitForSelector('text=Este tag ya tiene otra información grabada')
  await shot(page, '81-tag-con-otra-info')
  await page.click('button:has-text("Grabar de todos modos")')
  await page.waitForSelector('text=Tag grabado y vinculado')
  console.log('tag con otra información: avisa y luego graba ok')

  console.log('errores de página:', errores)
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
