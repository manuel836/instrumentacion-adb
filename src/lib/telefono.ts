import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { db } from '../firebase'
import { rechazosDe, sinConfirmar, suscribirRegistros } from './rechazos'
import { suscribirPendientes, type EstadoCola } from './uploadQueue'
import { VERSION } from './version'

// Cada teléfono le cuenta al admin cómo está: qué tiene sin enviar o detenido, qué versión de
// la app usa y sus últimos errores (Menú > Estado de los teléfonos). Sin señal no se manda
// nada: el admin ve cuándo fue la última vez que se supo de él.

export interface ErrorApp {
  mensaje: string
  /** Pantalla donde pasó ("/fallas/abc"). */
  donde: string
  fecha: number
}

export interface EstadoTelefono {
  uid: string
  nombre: string
  dispositivo: string
  version: string
  instalada: boolean
  almacenamientoProtegido: boolean
  sinConfirmar: number
  subidas: number
  detenidas: number
  rechazos: number
  errores: ErrorApp[]
}

const CLAVE_DISPOSITIVO = 'dispositivo'
const CLAVE_ERRORES = 'errores-recientes'
const MAX_ERRORES = 5
/** Aunque nada cambie, cada media hora con la app abierta se avisa que sigue en línea. */
const LATIDO = 30 * 60_000

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave)
  } catch {
    return null
  }
}

function escribir(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor)
  } catch {
    // Sin almacenamiento: se manda lo de esta sesión.
  }
}

/** Identifica este teléfono (una persona puede entrar en dos). */
function dispositivoId(): string {
  let id = leer(CLAVE_DISPOSITIVO)
  if (!id) {
    id = crypto.randomUUID()
    escribir(CLAVE_DISPOSITIVO, id)
  }
  return id
}

/** "Android 13 · Chrome 130", "iPhone · Safari". */
export function describirDispositivo(ua = navigator.userAgent): string {
  const android = /Android ([\d.]+)/.exec(ua)?.[1]
  const sistema = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : android
        ? `Android ${android.split('.')[0]}`
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X/.test(ua)
            ? 'Mac'
            : 'Otro'
  const navegadores: [RegExp, string][] = [
    [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
    [/EdgA?\/(\d+)/, 'Edge'],
    [/CriOS\/(\d+)/, 'Chrome'],
    [/FxiOS\/(\d+)|Firefox\/(\d+)/, 'Firefox'],
    [/Chrome\/(\d+)/, 'Chrome'],
    [/Version\/(\d+).*Safari/, 'Safari'],
  ]
  for (const [re, nombre] of navegadores) {
    const m = re.exec(ua)
    if (m) return `${sistema} · ${nombre} ${m[1] ?? m[2] ?? ''}`.trim()
  }
  return sistema
}

function erroresGuardados(): ErrorApp[] {
  try {
    // Lo que se anotó con una versión anterior y resultó ser ruido ya no se manda.
    return (JSON.parse(leer(CLAVE_ERRORES) ?? '[]') as ErrorApp[]).filter((e) => !esRuido(e.mensaje)).slice(0, MAX_ERRORES)
  } catch {
    return []
  }
}

/**
 * Errores que no son fallas de la app: falta de señal, permisos que la persona negó, y lo que
 * meten el navegador o sus extensiones ("Script error." es un script ajeno que no da detalles;
 * standardSelectors es del bloqueador de anuncios de Brave en el iPhone).
 */
const RUIDO = [
  /ResizeObserver loop/,
  /dynamically imported module|Importing a module script failed/,
  /AbortError|NotAllowedError|aborted/,
  /unavailable|offline|Failed to fetch|Load failed|NetworkError/,
  /^Script error\.?$/,
  /ethereum|web3|solana|phantom|metamask/i,
  /standardSelectors/,
]

function esRuido(mensaje: string) {
  return RUIDO.some((r) => r.test(mensaje))
}

/** El código de la app se sirve desde /assets/; lo demás lo metió el navegador o una extensión. */
export const esDeLaApp = (archivo: string | undefined) => !!archivo?.startsWith(`${location.origin}/assets/`)

/**
 * Un error cuya pila no pasa por el código de la app es de un script ajeno: Brave en el iPhone,
 * por ejemplo, mete su bloqueador de anuncios en la página y a veces falla. Si no trae pila no
 * se sabe de dónde vino y sí se anota.
 */
function esDeOtroScript(err: unknown): boolean {
  const pila = (err as { stack?: unknown } | null)?.stack
  if (typeof pila !== 'string' || !/:\d+:\d+/.test(pila)) return false
  return !pila.includes(`${location.origin}/assets/`)
}

/** Anota un error de la app; el admin lo ve en Estado de los teléfonos. */
export function registrarError(err: unknown, donde = location.pathname) {
  const mensaje = (err instanceof Error ? `${err.name}: ${err.message}` : String(err)).slice(0, 300)
  if (esRuido(mensaje) || esDeOtroScript(err)) return
  const lista = [{ mensaje, donde: donde.slice(0, 100), fecha: Date.now() }, ...erroresGuardados().filter((e) => e.mensaje !== mensaje)]
  escribir(CLAVE_ERRORES, JSON.stringify(lista.slice(0, MAX_ERRORES)))
  programarEnvio()
}

let sesion: { uid: string; nombre: string } | null = null
let cola: EstadoCola = { pendientes: 0, detenidas: 0 }
let ultimaHuella = ''
let ultimoEnvio = 0
let espera: ReturnType<typeof setTimeout> | null = null

function programarEnvio() {
  if (espera) clearTimeout(espera)
  // Unos segundos: lo que se envía y se confirma enseguida no llega a contar.
  espera = setTimeout(() => {
    espera = null
    void enviar()
  }, 5_000)
}

async function enviar() {
  if (!sesion || !navigator.onLine) return
  const { uid, nombre } = sesion
  try {
    const [n, rechazos, protegido] = await Promise.all([
      sinConfirmar(uid),
      rechazosDe(uid),
      navigator.storage?.persisted?.().catch(() => false) ?? Promise.resolve(false),
    ])
    const estado: EstadoTelefono = {
      uid,
      nombre: nombre.slice(0, 100),
      dispositivo: describirDispositivo().slice(0, 100),
      version: VERSION,
      instalada: matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true,
      almacenamientoProtegido: protegido,
      sinConfirmar: n,
      subidas: cola.pendientes - cola.detenidas,
      detenidas: cola.detenidas,
      rechazos: rechazos.length,
      errores: erroresGuardados(),
    }
    const huella = JSON.stringify(estado)
    if (huella === ultimaHuella && Date.now() - ultimoEnvio < LATIDO) return
    await setDoc(doc(db, 'telefonos', `${uid}_${dispositivoId()}`), { ...estado, actualizado: serverTimestamp() })
    ultimaHuella = huella
    ultimoEnvio = Date.now()
  } catch {
    // Se intenta otra vez con el siguiente cambio o latido. No se anota como error de la app.
  }
}

/** Empieza a reportar el estado de este teléfono mientras la persona tiene la sesión abierta. */
export function iniciarEstadoTelefono(user: User): () => void {
  sesion = { uid: user.uid, nombre: user.displayName || user.email || 'Usuario' }
  ultimaHuella = ''
  const quitarCola = suscribirPendientes((e) => {
    cola = e
    programarEnvio()
  })
  const quitarRegistros = suscribirRegistros(programarEnvio)
  const alVolver = () => programarEnvio()
  window.addEventListener('online', alVolver)
  const latido = setInterval(() => {
    if (document.visibilityState === 'visible') void enviar()
  }, LATIDO)
  programarEnvio()
  return () => {
    sesion = null
    quitarCola()
    quitarRegistros()
    window.removeEventListener('online', alVolver)
    clearInterval(latido)
    if (espera) clearTimeout(espera)
  }
}
