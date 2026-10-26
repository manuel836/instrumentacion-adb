// Cálculos de calibración (sin Firebase, para poder probarlos solos).
import type { PuntoCalibracion, ResultadoCalibracion } from '../types'

/** Error de una lectura en % del span. */
export function errorPct(lectura: number | null, entrada: number, min: number, max: number): number | null {
  if (lectura === null || max === min) return null
  return ((lectura - entrada) / (max - min)) * 100
}

/**
 * Resultado según la tolerancia: dentro sin tocar, dentro después de ajustar,
 * o fuera de tolerancia aun después del ajuste.
 */
export function resultadoSugerido(puntos: PuntoCalibracion[], tolerancia: number, min: number, max: number): ResultadoCalibracion {
  const dentro = (v: number | null, e: number) => {
    const err = errorPct(v, e, min, max)
    return err !== null && Math.abs(err) <= tolerancia + 1e-9
  }
  const ajustado = puntos.some((p) => p.asLeft !== null)
  if (!ajustado && puntos.every((p) => dentro(p.asFound, p.entrada))) return 'Aprobada sin ajuste'
  if (ajustado && puntos.every((p) => dentro(p.asLeft ?? p.asFound, p.entrada))) return 'Ajustada'
  return 'Fuera de tolerancia'
}

/** Cinco puntos (0, 25, 50, 75 y 100 %) del rango del instrumento. */
export function puntosDelRango(min: number, max: number): number[] {
  return [0, 0.25, 0.5, 0.75, 1].map((f) => Number((min + (max - min) * f).toPrecision(6)))
}

/** Estado de la próxima calibración para mostrarlo en la ficha y el catálogo. */
export function vencimiento(proxima: { toDate(): Date } | null | undefined, hoy = new Date()): 'vencida' | 'pronto' | 'ok' | 'sin' {
  if (!proxima) return 'sin'
  const inicioDeHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  // Días completos: la fecha se guarda a mediodía, así el día 30 también cuenta como "pronto".
  const dias = Math.floor((proxima.toDate().getTime() - inicioDeHoy.getTime()) / 86_400_000)
  if (dias < 0) return 'vencida'
  if (dias <= 30) return 'pronto'
  return 'ok'
}
