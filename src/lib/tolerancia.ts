// Cálculos de calibración (sin Firebase, para poder probarlos solos).
import type { PuntoCalibracion, ResultadoCalibracion } from '../types'

/** Error de una lectura en % del span. */
export function errorPct(lectura: number | null, entrada: number, min: number, max: number): number | null {
  if (lectura === null || max === min) return null
  return ((lectura - entrada) / (max - min)) * 100
}

/** Cómo se leen y evalúan los puntos de una calibración. Lo que falta es como antes: unidades y % del span. */
export interface Medida {
  rangoMin: number
  rangoMax: number
  lecturaEn?: 'mA' | 'unidades'
  toleranciaEn?: '%' | 'unidades'
  senalInvertida?: boolean
}

/**
 * Lo que debería marcar el instrumento en ese punto: la misma entrada, su salida en mA
 * (4 a 20) si se leyó la salida, o la posición contraria si la señal de la válvula va invertida.
 */
export function esperado(m: Medida, entrada: number): number | null {
  if (m.lecturaEn === 'mA') return m.rangoMax > m.rangoMin ? 4 + (16 * (entrada - m.rangoMin)) / (m.rangoMax - m.rangoMin) : null
  if (m.senalInvertida) return m.rangoMax - (entrada - m.rangoMin)
  return entrada
}

/** Error de una lectura en la unidad de la tolerancia: % del span, o unidades de proceso. */
export function errorLectura(m: Medida, lectura: number | null, entrada: number): number | null {
  if (lectura === null) return null
  const e = esperado(m, entrada)
  if (e === null) return null
  if (m.toleranciaEn === 'unidades') return lectura - e
  if (m.lecturaEn === 'mA') return ((lectura - e) / 16) * 100
  return errorPct(lectura, e, m.rangoMin, m.rangoMax)
}

/** "+0.25 %" o "-0.10 kg/cm²". */
export function textoError(err: number, m: Medida & { unidades: string }): string {
  const signo = err >= 0 ? '+' : ''
  return m.toleranciaEn === 'unidades' ? `${signo}${err.toFixed(2)} ${m.unidades}`.trim() : `${signo}${err.toFixed(2)} %`
}

/** "± 0.5 % del span", "± 2 % de carrera" o "± 0.2 kg/cm²". */
export function textoTolerancia(c: Medida & { tolerancia: number; unidades: string; tipo?: string }): string {
  if (c.toleranciaEn === 'unidades') return `± ${c.tolerancia} ${c.unidades}`.trim()
  return `± ${c.tolerancia} % ${c.tipo === 'Válvula de control' ? 'de carrera' : 'del span'}`
}

/** El mayor error (con su signo) de las lecturas antes o después del ajuste; null si no hay lecturas. */
export function errorMaximo(c: Medida & { puntos: PuntoCalibracion[] }, cual: 'asFound' | 'asLeft'): number | null {
  const errs = c.puntos.map((p) => errorLectura(c, p[cual], p.entrada)).filter((e): e is number => e !== null)
  if (errs.length === 0) return null
  return errs.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a))
}

/**
 * Resultado según la tolerancia: dentro sin tocar, dentro después de ajustar,
 * o fuera de tolerancia aun después del ajuste.
 */
export function resultadoSugerido(puntos: PuntoCalibracion[], tolerancia: number, m: Medida): ResultadoCalibracion {
  const dentro = (v: number | null, e: number) => {
    const err = errorLectura(m, v, e)
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
