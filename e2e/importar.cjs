// Prueba de punta a punta: importar instrumentos desde Excel y CSV (más de 400 filas para
// probar los lotes), con errores, actualizaciones y "sin cambios".
// Requiere el admin manuel@adb.test / Prueba1234 creado con functions/scripts/crear-admin.mjs.
// Uso: node e2e/importar.cjs
const { chromium, devices } = require('playwright')
const writeXlsxFile = require('write-excel-file/node')
const fs = require('fs')
const path = require('path')
const S = process.argv[2] ?? 'e2e/salida'
const BASE = 'http://localhost:4173'
fs.mkdirSync(path.join(S, 'shots'), { recursive: true })
const shot = (p, n) => p.screenshot({ path: path.join(S, 'shots', n + '.png') })
const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const pre = 'Q' + Array.from({ length: 2 }, () => letras[Math.floor(Math.random() * letras.length)]).join('')
const N = 520
const areas = ['vapor', 'Almacenamiento de amoniaco', 'tratamiento de AGUA']

async function excel(archivo, marcaDe) {
  const encabezado = ['Tag ISA', 'Servicio', 'Área', 'Marca', 'Rango mín.', 'Rango máx.', 'Próxima calibración', 'Tag NFC'].map((value) => ({ value, fontWeight: 'bold' }))
  const filas = Array.from({ length: N }, (_, i) => [
    { value: `${pre}-${i + 1}` },
    { value: `Servicio importado ${i + 1}` },
    { value: areas[i % 3] },
    { value: marcaDe(i) },
    { value: 0 },
    { value: 100 },
    i % 2 === 0 ? { value: new Date(Date.UTC(2027, 0, 15)), type: Date, format: 'dd/mm/yyyy' } : { value: '15/02/2027' },
    { value: 'No' },
  ])
  filas.push([{ value: `${pre}-9001` }, { value: 'Área mala' }, { value: 'Comedor' }, null, null, null, null, null])
  filas.push([{ value: `${pre}-1` }, { value: 'Repetido' }, { value: 'vapor' }, null, null, null, null, null])
  await writeXlsxFile([encabezado, ...filas]).toFile(archivo)
}

;(async () => {
  const dir = path.join(S, 'importar')
  fs.mkdirSync(dir, { recursive: true })
  const x1 = path.join(dir, 'instrumentos.xlsx')
  const x2 = path.join(dir, 'instrumentos-corregido.xlsx')
  await excel(x1, (i) => (i % 2 ? 'Rosemount' : 'Yokogawa'))
  await excel(x2, (i) => (i === 9 ? 'Endress+Hauser' : i % 2 ? 'Rosemount' : 'Yokogawa'))

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...devices['Pixel 7'], acceptDownloads: true })
  const page = await ctx.newPage()
  const errores = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.goto(`${BASE}/login`)
  await page.fill('#email', 'manuel@adb.test')
  await page.fill('#pass', 'Prueba1234')
  await page.click('button:has-text("Entrar")')
  await page.waitForSelector('text=Menú')

  await page.click('text=Menú')
  await page.click('text=Importar desde Excel')
  await page.waitForSelector('h1:has-text("Importar desde Excel")')

  // La plantilla se descarga y la propia app la entiende.
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Descargar plantilla")')])
  const plantilla = path.join(dir, descarga.suggestedFilename())
  await descarga.saveAs(plantilla)
  await page.setInputFiles('input[type=file]', plantilla)
  await page.waitForSelector('text=Columnas reconocidas')
  const texto = await page.locator('section:has-text("3. Revisa")').innerText()
  if (!/Tag ISA, Servicio, Área/.test(texto)) throw new Error('la plantilla no se reconoció')
  console.log('plantilla descargada y reconocida ok:', descarga.suggestedFilename())

  // Archivo con 520 instrumentos y 2 filas con error.
  await page.setInputFiles('input[type=file]', x1)
  await page.waitForSelector(`text=${N} nuevos`)
  await page.waitForSelector('text=2 filas con error')
  await page.waitForSelector('text=Área "Comedor" no reconocida')
  await page.waitForSelector(`text=Se ignoran: Tag NFC`)
  await shot(page, '90-importar-revision')
  console.log('revisión: 520 nuevos y 2 errores ok')

  await page.click(`button:has-text("Importar ${N} nuevos")`)
  await page.waitForSelector(`text=Listo: ${N} instrumentos nuevos`, { timeout: 120000 })
  await shot(page, '91-importar-listo')
  console.log('importación en lotes ok')

  // El mismo archivo con una marca corregida: 1 se actualiza, el resto sin cambios.
  await page.setInputFiles('input[type=file]', x2)
  await page.waitForSelector('text=1 se actualiza', { timeout: 30000 })
  await page.waitForSelector(`text=${N - 1} sin cambios`)
  await page.waitForSelector('text=Marca: Endress+Hauser')
  await page.click('text=Dejarlo como está')
  await page.waitForSelector(`text=${N} ya existían`)
  if (await page.locator('button:has-text("No hay nada que importar")').isEnabled()) throw new Error('deja importar sin nada que hacer')
  await page.click('text=Actualizar sus datos')
  await page.click('button:has-text("Importar actualizar 1")')
  await page.waitForSelector('text=Listo: 0 instrumentos nuevos y 1 actualizado', { timeout: 60000 })
  console.log('actualización de existentes ok')

  await page.goto(`${BASE}/catalogo?q=${pre}-10`)
  await page.click(`a:has-text("${pre}-10 ")`).catch(async () => page.locator('a[href^="/instrumentos/"]', { hasText: `${pre}-10` }).first().click())
  await page.waitForSelector(`h1:has-text("${pre}-10")`)
  await page.waitForSelector('text=Endress+Hauser')
  await page.waitForSelector('text=0 a 100')
  await page.waitForSelector('text=15 feb 2027')
  console.log('ficha con los datos importados ok')

  // CSV de Excel en Windows: punto y coma y acentos en Windows-1252.
  const csv = path.join(dir, 'uno.csv')
  fs.writeFileSync(csv, Buffer.from(`Tag ISA;Servicio;Área;Rango mín.\r\n${pre}-777;Presión de la caldera ñ;Generación de vapor;0,5\r\n`, 'latin1'))
  await page.goto(`${BASE}/instrumentos/importar`)
  await page.setInputFiles('input[type=file]', csv)
  await page.waitForSelector('text=1 nuevo')
  await page.waitForSelector('text=Presión de la caldera ñ')
  await page.click('button:has-text("Importar 1 nuevo")')
  await page.waitForSelector('text=Listo: 1 instrumento nuevo')
  console.log('CSV con acentos ok')

  await page.goto(`${BASE}/catalogo?q=${pre}-`)
  await page.waitForSelector(`text=${N + 1} de`)
  console.log('catálogo con los', N + 1, 'importados ok')

  console.log('errores de página:', errores)
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
