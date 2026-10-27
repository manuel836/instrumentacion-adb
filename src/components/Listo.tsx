import { useEffect, useState } from 'react'
import { Icono } from './Icono'

type Tono = 'bien' | 'espera'
interface Aviso {
  n: number
  texto: string
  tono: Tono
}

let contador = 0
let mostrar: ((a: Aviso) => void) | null = null

/** Avisa por unos segundos, debajo de la barra verde, que algo se hizo ("Falla reportada."). */
export function avisar(texto: string, tono: Tono = 'bien') {
  mostrar?.({ n: ++contador, texto, tono })
}

/** Igual, pero sin señal dice que se quedó en el teléfono y se envía después. */
export function avisarGuardado(conSenal: string, sinSenal: string) {
  if (navigator.onLine) avisar(conSenal)
  else avisar(sinSenal, 'espera')
}

/**
 * El aviso en pantalla. Va dentro del encabezado (Layout), así queda justo debajo de la barra
 * verde aunque arriba se vean otros avisos, y no tapa los botones de abajo. No recibe toques:
 * lo que esté debajo se puede seguir usando mientras se ve.
 */
export function AvisoListo() {
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [saliendo, setSaliendo] = useState(false)

  useEffect(() => {
    mostrar = (a) => {
      setSaliendo(false)
      setAviso(a)
    }
    return () => {
      mostrar = null
    }
  }, [])

  useEffect(() => {
    if (!aviso) return
    if (!saliendo) {
      // El de "sin señal" se queda un poco más porque trae más que leer.
      const t = setTimeout(() => setSaliendo(true), aviso.tono === 'espera' ? 5000 : 3500)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setAviso(null), 160)
    return () => clearTimeout(t)
  }, [aviso, saliendo])

  return (
    <div role="status" aria-live="polite" className="pointer-events-none absolute inset-x-0 top-full flex justify-center px-3 pt-2">
      {aviso && (
        <p
          key={aviso.n}
          className={`flex max-w-md items-start gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-slate-900/20 ${saliendo ? 'animate-salir' : 'animate-bajar'}`}
        >
          <Icono nombre={aviso.tono === 'bien' ? 'listo' : 'reloj'} className={`size-5 ${aviso.tono === 'bien' ? 'text-marca-300' : 'text-aviso-300'}`} />
          {aviso.texto}
        </p>
      )}
    </div>
  )
}
