import { Component, lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { registrarError } from '../lib/telefono'
import { Silueta } from './Silueta'

const MARCA = 'recargo-por-version'

function leerMarca(): boolean {
  try {
    return sessionStorage.getItem(MARCA) !== null
  } catch {
    return true
  }
}

function ponerMarca(poner: boolean) {
  try {
    if (poner) sessionStorage.setItem(MARCA, '1')
    else sessionStorage.removeItem(MARCA)
  } catch {
    // Sin sessionStorage no se recarga sola: queda el botón "Reintentar".
  }
}

/**
 * Pantalla que se descarga hasta que se abre (así la app arranca más rápido).
 * Si su archivo ya no existe porque se publicó una versión nueva, recarga una vez la app.
 */
export function diferida<M extends Record<string, unknown>>(cargar: () => Promise<M>, nombre: keyof M) {
  return lazy(async () => {
    try {
      const m = await cargar()
      ponerMarca(false)
      return { default: m[nombre] as ComponentType }
    } catch (err) {
      if (!leerMarca() && navigator.onLine) {
        ponerMarca(true)
        location.reload()
        return new Promise<never>(() => {})
      }
      throw err
    }
  })
}

/** El archivo de la pantalla no bajó (sin señal o versión vieja), no es una falla de la app. */
const esDeDescarga = (e: unknown) => /dynamically imported module|Importing a module script failed|ChunkLoadError/.test(String(e))

/**
 * Si una pantalla falla, se dice qué pasó y se ofrece salir. El error queda anotado y el admin
 * lo ve en Estado de los teléfonos. `completa`: abarca toda la app (acceso, vista del tag).
 */
export class SiFalla extends Component<{ children: ReactNode; completa?: boolean }, { error: unknown }> {
  state: { error: unknown } = { error: null }
  static getDerivedStateFromError(error: unknown) {
    return { error: error ?? new Error('Error desconocido') }
  }
  componentDidCatch(error: unknown) {
    if (!esDeDescarga(error)) registrarError(error)
  }
  render() {
    if (!this.state.error) return this.props.children
    const descarga = esDeDescarga(this.state.error)
    return (
      <div className={`space-y-3 p-6 text-center ${this.props.completa ? 'flex min-h-dvh flex-col items-center justify-center' : ''}`}>
        {descarga ? (
          <p className="text-slate-700">No se pudo abrir esta pantalla. Revisa tu señal e inténtalo otra vez.</p>
        ) : (
          <>
            <p className="font-semibold text-slate-900">Algo salió mal en esta pantalla.</p>
            <p className="text-sm text-slate-600">Lo que ya guardaste no se perdió. El error quedó anotado para el administrador.</p>
          </>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {!descarga && (
            <button className="btn-secundario" onClick={() => location.assign('/')}>
              Volver al inicio
            </button>
          )}
          <button className={descarga ? 'btn-secundario' : 'btn-primario'} onClick={() => location.reload()}>
            Reintentar
          </button>
        </div>
      </div>
    )
  }
}

/** Muestra siluetas mientras baja una pantalla diferida y un aviso si no se pudo. */
export function ConCarga({ children }: { children: ReactNode }) {
  return (
    <SiFalla>
      <Suspense fallback={<Silueta />}>{children}</Suspense>
    </SiFalla>
  )
}
