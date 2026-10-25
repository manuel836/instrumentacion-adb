import { describe, expect, it } from 'vitest'
import { errorPct, puntosDelRango, resultadoSugerido, vencimiento } from './tolerancia'

const p = (entrada: number, asFound: number | null, asLeft: number | null = null) => ({ entrada, asFound, asLeft })

describe('tolerancia', () => {
  it('calcula el error en % del span', () => {
    expect(errorPct(10.1, 10, 0, 20)).toBeCloseTo(0.5)
    expect(errorPct(null, 10, 0, 20)).toBeNull()
    expect(errorPct(5, 5, 3, 3)).toBeNull()
  })

  it('reparte cinco puntos en el rango', () => {
    expect(puntosDelRango(0, 20)).toEqual([0, 5, 10, 15, 20])
    expect(puntosDelRango(-10, 10)).toEqual([-10, -5, 0, 5, 10])
  })

  it('sugiere el resultado', () => {
    expect(resultadoSugerido([p(0, 0.05), p(20, 19.95)], 0.5, 0, 20)).toBe('Aprobada sin ajuste')
    expect(resultadoSugerido([p(0, 0.3, 0.01), p(20, 19.6, 20)], 0.5, 0, 20)).toBe('Ajustada')
    expect(resultadoSugerido([p(0, 0.3, 0.2), p(20, 19.6, 20)], 0.5, 0, 20)).toBe('Fuera de tolerancia')
    expect(resultadoSugerido([p(0, 0.3), p(20, 20)], 0.5, 0, 20)).toBe('Fuera de tolerancia')
  })

  it('marca la próxima calibración vencida o por vencer', () => {
    const hoy = new Date(2026, 9, 25, 18)
    const f = (d: Date) => ({ toDate: () => d })
    expect(vencimiento(null, hoy)).toBe('sin')
    expect(vencimiento(f(new Date(2026, 9, 25, 12)), hoy)).toBe('pronto')
    expect(vencimiento(f(new Date(2026, 9, 24, 12)), hoy)).toBe('vencida')
    expect(vencimiento(f(new Date(2027, 0, 1, 12)), hoy)).toBe('ok')
  })
})
