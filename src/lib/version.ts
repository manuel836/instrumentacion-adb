import { hayCaptura, suscribirCapturas } from './borradores'

/** Fecha y hora (UTC) en que se compiló esta versión de la app; la pone vite.config.ts. */
declare const __VERSION__: string
export const VERSION: string = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev'

/** "27 oct 2026, 17:40" en la hora del teléfono. */
export function textoVersion(v: string): string {
  const d = new Date(`${v}Z`)
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}

// Cuando se publica una versión nueva, el service worker la instala y toma el control. Antes
// la app se recargaba en ese momento aunque alguien estuviera a media calibración; ahora espera
// a que nadie esté escribiendo (los formularios guardan borrador, así que nada se pierde).

let nueva = false
let programada: ReturnType<typeof setTimeout> | null = null
const oyentes = new Set<() => void>()

export function hayVersionNueva(): boolean {
  return nueva
}

export function suscribirVersion(o: () => void): () => void {
  oyentes.add(o)
  return () => oyentes.delete(o)
}

function recargarSiSePuede() {
  if (!nueva || hayCaptura() || programada) return
  // Un momento para que lo recién guardado termine de escribirse en el teléfono.
  programada = setTimeout(() => {
    programada = null
    if (hayCaptura()) return
    location.reload()
  }, 1500)
}

export function avisarVersionNueva() {
  nueva = true
  oyentes.forEach((o) => o())
  recargarSiSePuede()
}

suscribirCapturas(recargarSiSePuede)
