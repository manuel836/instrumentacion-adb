// Prueba de punta a punta: el admin pone una contraseña temporal a quien olvidó la suya.
// Requiere el admin manuel@adb.test / Prueba1234 creado con functions/scripts/crear-admin.mjs.
// Uso: node e2e/restablecer.cjs
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
  await admin.page.waitForSelector('text=Menú')

  const email = `olvido-${sufijo}@adb.test`
  await admin.page.goto(`${BASE}/usuarios`)
  await admin.page.fill('input[placeholder="Nombre"]', 'Olga Olvido')
  await admin.page.fill('input[placeholder="Correo"]', email)
  await admin.page.fill('input[placeholder^="Contraseña"]', 'Original123')
  await admin.page.click('button:has-text("Crear usuario")')
  await admin.page.waitForSelector(`text=Usuario ${email} creado.`, { timeout: 20000 })

  // La operadora entra con su contraseña original.
  const op = await abrir(browser)
  await login(op.page, email, 'Original123')
  await op.page.waitForSelector('text=Menú')
  if ((await op.page.locator('text=contraseña temporal').count()) !== 0) throw new Error('aviso de contraseña temporal sin motivo')
  console.log('usuaria creada y sin aviso ok')

  // El admin le pone una contraseña temporal (se escribe una propia sobre la sugerida).
  const tarjeta = admin.page.locator('.tarjeta', { hasText: email })
  await tarjeta.locator('button:has-text("Nueva contraseña")').click()
  const campo = tarjeta.locator('input[aria-label="Contraseña temporal"]')
  const sugerida = await campo.inputValue()
  if (!/^[a-z2-9]{4}-[a-z2-9]{4}$/.test(sugerida)) throw new Error(`sugerencia rara: ${sugerida}`)
  await campo.fill('Temporal777')
  await shot(admin.page, '50-nueva-contrasena')
  await tarjeta.locator('button:has-text("Poner contraseña")').click()
  await admin.page.waitForSelector('text=esta contraseña temporal: Temporal777', { timeout: 20000 })
  await shot(admin.page, '51-contrasena-puesta')
  console.log('admin puso contraseña temporal ok (sugerida era', sugerida + ')')

  // En producción la sesión abierta se cierra sola (tokens revocados). El emulador de Auth
  // no aplica la revocación, así que ahí la sesión sigue y muestra el aviso.
  await op.page.locator('#email').or(op.page.getByText('Entraste con una contraseña temporal')).waitFor({ timeout: 30000 })
  console.log('la sesión abierta se enteró del cambio ok')
  if ((await op.page.locator('#email').count()) === 0) {
    await op.page.click('text=Menú')
    await op.page.click('button:has-text("Salir")')
    await op.page.waitForSelector('#email')
  }
  await login(op.page, email, 'Original123')
  await op.page.waitForSelector('text=Correo o contraseña incorrectos.')
  await login(op.page, email, 'Temporal777')
  await op.page.waitForSelector('text=Entraste con una contraseña temporal')
  await shot(op.page, '52-aviso-temporal')
  console.log('entra con la temporal y ve el aviso ok')

  await op.page.click('text=Entraste con una contraseña temporal')
  await op.page.waitForSelector('text=El administrador te puso una contraseña temporal')
  await op.page.fill('#actual', 'Temporal777')
  await op.page.fill('#nueva', 'MiClave2026')
  await op.page.fill('#repetir', 'MiClave2026')
  await op.page.click('button:has-text("Cambiar contraseña")')
  await op.page.waitForSelector('text=tu contraseña cambió')
  await op.page.click('nav >> text=Fallas')
  await op.page.waitForTimeout(1500)
  if ((await op.page.locator('text=Entraste con una contraseña temporal').count()) !== 0) throw new Error('el aviso no se quitó')
  console.log('elige su contraseña y el aviso desaparece ok')

  await op.page.click('text=Menú')
  await op.page.click('button:has-text("Salir")')
  await login(op.page, email, 'MiClave2026')
  await op.page.waitForSelector('text=Menú')
  console.log('entra con su nueva contraseña ok')

  // El admin no puede usar esto sobre sí mismo.
  const propia = admin.page.locator('.tarjeta', { hasText: 'manuel@adb.test' })
  if ((await propia.locator('button:has-text("Nueva contraseña")').count()) !== 0) throw new Error('el admin puede restablecerse a sí mismo')

  await admin.page.click('text=Menú')
  await admin.page.click('text=Bitácora de cambios')
  await admin.page.locator('li', { hasText: 'Olga Olvido' }).filter({ hasText: 'temporal' }).first().waitFor({ timeout: 20000 })
  if ((await admin.page.locator('text=Temporal777').count()) !== 0) throw new Error('la contraseña quedó en la bitácora')
  console.log('bitácora sin la contraseña ok')

  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
