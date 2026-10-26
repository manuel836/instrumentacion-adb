import { Component, lazy, Suspense, type ComponentType, type ReactNode } from 'react'

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

class SiFalla extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() {
    return { error: true }
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="space-y-3 p-6 text-center">
        <p className="text-slate-700">No se pudo abrir esta pantalla. Revisa tu señal e inténtalo otra vez.</p>
        <button className="btn-secundario" onClick={() => location.reload()}>
          Reintentar
        </button>
      </div>
    )
  }
}

/** Muestra "Cargando…" mientras baja una pantalla diferida y un aviso si no se pudo. */
export function ConCarga({ children }: { children: ReactNode }) {
  return (
    <SiFalla>
      <Suspense fallback={<p className="p-6 text-center text-slate-500">Cargando…</p>}>{children}</Suspense>
    </SiFalla>
  )
}
