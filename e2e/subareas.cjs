// Prueba de punta a punta de las sub áreas: el admin las da de alta, el mismo tag se repite
// en dos calderas, el catálogo las filtra, se renombran y no se quita una que está en uso.
// Requiere el admin manuel@adb.test / Prueba1234 y los emuladores corriendo.
// Uso: node e2e/subareas.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
const S = process.argv[2] ?? 'e2e/salida'
const BASE = 'http://localhost:4173'
require('fs').mkdirSync(path.join(S, 'shots'), { recursive: true })
const shot = (p, n) => p.screenshot({ path: path.join(S, 'shots', n + '.png') })
const n = 100 + Math.floor(Math.random() * 800)
const C1 = `Caldera ${n}`
const C2 = `Caldera ${n + 1}`
const CB = `Caldera ${n}B`
const TAG = `PT-${n}`
const vapor = 'section[aria-label="Generación de vapor"]'

async function alta(page, sub) {
  await page.goto(`${BASE}/instrumentos/nuevo`)
  await page.fill('input[placeholder="PT-101"]', TAG)
  await page.locator('label:has-text("Área") select').first().selectOption('Generación de vapor')
  await page.locator('label:has-text("Sub área") select').selectOption(sub)
  await page.fill('input[placeholder="Presión de vapor a cabezal"]', `Presión de domo ${sub}`)
  await page.click('button:has-text("Guardar sin tag ni fotos")')
}

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...devices['Pixel 7'] })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror', e.message))
  await page.goto(`${BASE}/login`)
  await page.fill('#email', 'manuel@adb.test')
  await page.fill('#pass', 'Prueba1234')
  await page.click('button:has-text("Entrar")')
  await page.waitForSelector('text=Menú')

  // ---------- El admin da de alta las sub áreas ----------
  await page.click('text=Menú')
  await page.click('text=Sub áreas')
  await page.waitForSelector('h1:has-text("Sub áreas")')
  for (const nombre of [C1, C2]) {
    await page.fill('input[aria-label="Nueva sub área de Generación de vapor"]', nombre)
    await page.click(`${vapor} >> button:has-text("Agregar")`)
    await page.locator(`${vapor} li[data-subarea="${nombre}"]`).waitFor()
  }
  await page.fill('input[aria-label="Nueva sub área de Generación de vapor"]', C1.toLowerCase())
  await page.click(`${vapor} >> button:has-text("Agregar")`)
  await page.waitForSelector(`text=Ya existe “${C1.toLowerCase()}” en Generación de vapor.`)
  console.log('el admin agrega sub áreas y no deja repetirlas ok')

  // ---------- El mismo tag en dos calderas ----------
  await alta(page, C1)
  await page.waitForURL(/\/instrumentos\/[^/]+$/)
  await page.waitForSelector(`text=Generación de vapor · ${C1}`)
  await alta(page, C2)
  await page.waitForURL(/\/instrumentos\/[^/]+$/)
  await page.waitForSelector(`text=Generación de vapor · ${C2}`)
  const fichaC2 = page.url()
  await alta(page, C1)
  await page.waitForSelector(`text=Ya existe ${TAG} en Generación de vapor · ${C1}`)
  await shot(page, '160-tag-repetido-misma-subarea')
  console.log('el mismo tag se da de alta en otra caldera, pero no dos veces en la misma ok')

  // ---------- Catálogo ----------
  await page.goto(`${BASE}/catalogo?q=${TAG}`)
  await page.waitForSelector('text=2 de')
  await page.locator('a', { hasText: C1 }).first().waitFor()
  await page.locator('a', { hasText: C2 }).first().waitFor()
  await page.selectOption('select[aria-label="Área"]', 'Generación de vapor')
  await page.selectOption('select[aria-label="Sub área"]', C2)
  await page.waitForSelector('text=1 de')
  await shot(page, '161-catalogo-subarea')
  console.log('el catálogo muestra y filtra por sub área ok')

  // ---------- Renombrar y quitar ----------
  await page.goto(`${BASE}/subareas`)
  const fila = page.locator(`${vapor} li[data-subarea="${C2}"]`)
  await fila.locator('button:has-text("Renombrar")').click()
  await page.fill(`input[aria-label="Nuevo nombre de ${C2}"]`, CB)
  await page.click(`${vapor} >> button:has-text("Guardar")`)
  await page.locator(`${vapor} li[data-subarea="${CB}"]`).waitFor()
  await page.goto(fichaC2)
  await page.waitForSelector(`text=Generación de vapor · ${CB}`)
  console.log('al renombrar, el instrumento se va con el nombre nuevo ok')

  await page.goto(`${BASE}/subareas`)
  await page.locator(`${vapor} li[data-subarea="${CB}"] >> button:has-text("Quitar")`).click()
  await page.waitForSelector(`text=${CB} tiene 1 instrumento.`)
  await page.fill('input[aria-label="Nueva sub área de Generación de vapor"]', `Caldera ${n}X`)
  await page.click(`${vapor} >> button:has-text("Agregar")`)
  const sobra = page.locator(`${vapor} li[data-subarea="Caldera ${n}X"]`)
  await sobra.locator('button:has-text("Quitar")').click()
  await sobra.locator('button:has-text("Sí, quitar")').click()
  await sobra.waitFor({ state: 'detached' })
  await shot(page, '162-admin-subareas')
  console.log('no se quita una sub área en uso; una vacía sí ok')

  // ---------- Fallas ----------
  await page.goto(fichaC2)
  await page.click('text=Reportar falla')
  await page.waitForSelector(`text=Generación de vapor · ${CB}`)
  await page.fill('textarea', 'Lectura inestable')
  await page.click('button:has-text("Reportar")')
  await page.waitForURL(/\/fallas\/[^/]+$/)
  await page.waitForSelector(`text=Generación de vapor · ${CB}`)
  await page.goto(`${BASE}/fallas`)
  await page.locator('li', { hasText: TAG }).locator(`text=${CB}`).first().waitFor()
  console.log('la falla lleva la sub área del instrumento ok')

  await browser.close()
  process.exit(0)
})().catch((e) => {
  console.error('FALLO:', e.message)
  process.exit(1)
})
