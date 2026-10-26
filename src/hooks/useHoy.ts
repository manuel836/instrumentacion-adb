import { useEffect, useState } from 'react'

const medianoche = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** Medianoche de hoy en el teléfono; cambia sola al pasar las 12 de la noche. */
export function useInicioDelDia(): Date {
  const [hoy, setHoy] = useState(medianoche)
  useEffect(() => {
    const manana = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1)
    const t = setTimeout(() => setHoy(medianoche()), manana.getTime() - Date.now() + 1000)
    return () => clearTimeout(t)
  }, [hoy])
  return hoy
}

/** "2026-10-25" en hora del teléfono (así se nombra cada día del historial). */
export function claveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Medianoche del día "2026-10-25", o null si no es una fecha válida. */
export function desdeClave(clave: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clave)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return claveDia(d) === clave ? d : null
}
