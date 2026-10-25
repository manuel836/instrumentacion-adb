// Prueba de punta a punta: cambiar la propia contraseña y eliminar usuarios.
// Requiere el admin manuel@adb.test / Prueba1234 creado con functions/scripts/crear-admin.mjs.
// Uso: node e2e/usuarios.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
const S = process.argv[2] ?? 'e2e/salida'
const BASE = 'http://localhost:4173'
require('fs').mkdirSync(path.join(S, 'shots'), { recursive: true })
const shot = (p, n) => p.screenshot({ path: path.join(S, 'shots', n + '.png') })
const sufijo = Date.now().toString(36)

async function abrir(browser) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror', e.message))
  return { ctx, page }
}

async function login(page, email, pass) {
  await page.goto(`${BASE}/login`)
  await page.fill('#email', email)
  await page.fill('#pass', pass)
  await page.click('button:has-text("Entrar")')
}

;(async () => {
  const browser = await chromium.launch()
  const admin = await abrir(browser)
  await login(admin.page, 'manuel@adb.test', 'Prueba1234')
  await admin.page.waitForSelector('text=instrumentos')

  const email = `borrar-${sufijo}@adb.test`
  await admin.page.goto(`${BASE}/usuarios`)
  await admin.page.fill('input[placeholder="Nombre"]', 'Pedro Prueba')
  await admin.page.fill('input[placeholder="Correo"]', email)
  await admin.page.fill('input[placeholder^="Contraseña"]', 'Prueba1234')
  await admin.page.click('button:has-text("Crear usuario")')
  await admin.page.waitForSelector(`text=Usuario ${email} creado.`, { timeout: 20000 })
  const propia = admin.page.locator('.tarjeta', { hasText: 'manuel@adb.test' })
  if ((await propia.locator('button:has-text("Eliminar")').count()) !== 0) throw new Error('el admin puede eliminarse a sí mismo')
  console.log('usuario creado ok')

  // El operador cambia su contraseña desde el menú.
  const op = await abrir(browser)
  await login(op.page, email, 'Prueba1234')
  await op.page.waitForSelector('text=instrumentos')
  await op.page.click('text=Menú')
  await op.page.click('text=Cambiar contraseña')
  await op.page.fill('#actual', 'Equivocada99')
  await op.page.fill('#nueva', 'NuevaClave55')
  await op.page.fill('#repetir', 'NuevaClave55')
  await op.page.click('button:has-text("Cambiar contraseña")')
  await op.page.waitForSelector('text=La contraseña actual no es correcta.')
  console.log('contraseña actual equivocada rechazada ok')
  await op.page.fill('#actual', 'Prueba1234')
  await op.page.fill('#repetir', 'OtraCosa55')
  await op.page.click('button:has-text("Cambiar contraseña")')
  await op.page.waitForSelector('text=no coinciden')
  await op.page.fill('#repetir', 'NuevaClave55')
  await op.page.click('button:has-text("Cambiar contraseña")')
  await op.page.waitForSelector('text=tu contraseña cambió')
  await shot(op.page, '40-cambiar-contrasena')
  console.log('contraseña cambiada ok')

  await op.page.click('text=Menú')
  await op.page.click('button:has-text("Salir")')
  await op.page.waitForSelector('#email')
  await login(op.page, email, 'Prueba1234')
  await op.page.waitForSelector('text=Correo o contraseña incorrectos.')
  await login(op.page, email, 'NuevaClave55')
  // Vuelve a la pantalla donde salió (Mi cuenta).
  await op.page.waitForSelector('text=Menú')
  console.log('entra con la contraseña nueva y no con la vieja ok')
  await op.page.click('text=Menú')
  await op.page.click('button:has-text("Salir")')
  await op.page.waitForSelector('#email')

  // El admin lo elimina.
  const tarjeta = admin.page.locator('.tarjeta', { hasText: email })
  await tarjeta.locator('button:has-text("Eliminar")').click()
  await admin.page.waitForSelector('text=para siempre')
  await shot(admin.page, '41-confirmar-eliminar')
  await tarjeta.locator('button:has-text("Sí, eliminar")').click()
  await admin.page.waitForSelector(`text=Usuario ${email} eliminado.`, { timeout: 20000 })
  await admin.page.waitForSelector(`.tarjeta:has-text("${email}")`, { state: 'detached' })
  await shot(admin.page, '42-usuario-eliminado')
  console.log('usuario eliminado ok')

  await login(op.page, email, 'NuevaClave55')
  await op.page.waitForSelector('text=Correo o contraseña incorrectos.')
  console.log('el usuario eliminado ya no entra ok')

  await admin.page.click('text=Menú')
  await admin.page.click('text=Bitácora de cambios')
  await admin.page.locator('li', { hasText: 'Pedro Prueba' }).filter({ hasText: /Baja|Borr|Elimin/ }).first().waitFor({ timeout: 20000 })
  await shot(admin.page, '43-bitacora-eliminado')
  console.log('eliminación en la bitácora ok')

  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
