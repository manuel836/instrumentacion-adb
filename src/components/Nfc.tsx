import { Icono } from './Icono'

/** Mientras se espera el tag: ondas que salen del ícono de NFC, como la señal que lo busca. */
export function OndasNfc({ chico = false }: { chico?: boolean }) {
  return (
    <div className={`relative mx-auto grid place-items-center ${chico ? 'size-32' : 'size-44'}`} aria-hidden="true">
      {[0, 600, 1200].map((retraso) => (
        <span
          key={retraso}
          className="absolute inset-0 animate-onda rounded-full border-2 border-marca-500 bg-marca-100/40"
          style={{ animationDelay: `${retraso}ms` }}
        />
      ))}
      <span className={`relative grid place-items-center rounded-full bg-marca-700 text-white shadow-md ${chico ? 'size-16' : 'size-24'}`}>
        <Icono nombre="escanear" className={chico ? 'size-8' : 'size-11'} />
      </span>
    </div>
  )
}

/** Al leer o grabar el tag: la palomita se dibuja en un círculo verde. */
export function PalomitaNfc({ chico = false }: { chico?: boolean }) {
  return (
    <div className={`mx-auto grid place-items-center ${chico ? 'size-32' : 'size-44'}`} aria-hidden="true">
      <span className={`grid animate-palomita place-items-center rounded-full bg-marca-700 text-white shadow-md ${chico ? 'size-16' : 'size-24'}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className={chico ? 'size-9' : 'size-12'}>
          <path d="M5 12.5 9.5 17 19 7" pathLength={1} strokeDasharray={1} className="animate-trazo" />
        </svg>
      </span>
    </div>
  )
}

/** Un toque corto en la mano, para saber que el tag se leyó sin tener que ver la pantalla. */
export function vibrar() {
  try {
    navigator.vibrate?.(60)
  } catch {
    // Algunos navegadores no dejan vibrar; no pasa nada.
  }
}
