import { describe, expect, it } from 'vitest'
import { errorLectura, errorMaximo, errorPct, esperado, puntosDelRango, resultadoSugerido, textoError, textoTolerancia, vencimiento } from './tolerancia'

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
    const r = { rangoMin: 0, rangoMax: 20 }
    expect(resultadoSugerido([p(0, 0.05), p(20, 19.95)], 0.5, r)).toBe('Aprobada sin ajuste')
    expect(resultadoSugerido([p(0, 0.3, 0.01), p(20, 19.6, 20)], 0.5, r)).toBe('Ajustada')
    expect(resultadoSugerido([p(0, 0.3, 0.2), p(20, 19.6, 20)], 0.5, r)).toBe('Fuera de tolerancia')
    expect(resultadoSugerido([p(0, 0.3), p(20, 20)], 0.5, r)).toBe('Fuera de tolerancia')
  })

  it('con la salida leída en mA compara contra 4 a 20 mA', () => {
    const m = { rangoMin: 0, rangoMax: 20, lecturaEn: 'mA' as const }
    expect(esperado(m, 10)).toBeCloseTo(12)
    expect(esperado(m, 0)).toBeCloseTo(4)
    // 0.08 mA de 16 mA es 0.5 % del span.
    expect(errorLectura(m, 12.08, 10)).toBeCloseTo(0.5)
    expect(resultadoSugerido([p(0, 4.02), p(10, 12.05), p(20, 19.97)], 0.5, m)).toBe('Aprobada sin ajuste')
    expect(resultadoSugerido([p(0, 4.2), p(20, 20)], 0.5, m)).toBe('Fuera de tolerancia')
    expect(errorMaximo({ ...m, puntos: [p(0, 4.02), p(20, 19.9)] }, 'asFound')).toBeCloseTo(-0.625)
  })

  it('con salida de raíz cuadrada los mA siguen la raíz de la entrada', () => {
    // El ejemplo del transmisor de presión diferencial de 0 a 150 inH2O.
    const lineal = { rangoMin: 0, rangoMax: 150, lecturaEn: 'mA' as const, salidaTransmisor: 'Lineal' }
    const raiz = { ...lineal, salidaTransmisor: 'Raíz cuadrada' }
    expect([0, 37.5, 75, 112.5, 150].map((e) => Number(esperado(lineal, e)!.toFixed(2)))).toEqual([4, 8, 12, 16, 20])
    expect([0, 37.5, 75, 112.5, 150].map((e) => Number(esperado(raiz, e)!.toFixed(2)))).toEqual([4, 12, 15.31, 17.86, 20])
    // Bajo el cero se queda en 4 mA (no hay raíz de un negativo).
    expect(esperado(raiz, -1)).toBe(4)
    // El error sigue en % de los 16 mA: 15.39 contra 15.31 es 0.5 %.
    expect(errorLectura(raiz, 15.3937, 75)).toBeCloseTo(0.5, 2)
    expect(resultadoSugerido([p(0, 4.01), p(37.5, 12.03), p(75, 15.3), p(112.5, 17.87), p(150, 19.98)], 0.5, raiz)).toBe('Aprobada sin ajuste')
    // Un transmisor de raíz evaluado como lineal sale fuera.
    expect(resultadoSugerido([p(37.5, 12.03)], 0.5, lineal)).toBe('Fuera de tolerancia')
    // En unidades de proceso no cambia nada: se compara la presión diferencial.
    expect(esperado({ ...raiz, lecturaEn: 'unidades' as const }, 37.5)).toBe(37.5)
  })

  it('en interruptores y analizadores el error va en unidades', () => {
    const m = { rangoMin: 0, rangoMax: 0, toleranciaEn: 'unidades' as const }
    expect(errorLectura(m, 10.3, 10)).toBeCloseTo(0.3)
    expect(resultadoSugerido([p(10, 10.3)], 0.2, m)).toBe('Fuera de tolerancia')
    expect(resultadoSugerido([p(10, 10.3, 10.05)], 0.2, m)).toBe('Ajustada')
    expect(textoError(-0.1, { ...m, unidades: 'pH' })).toBe('-0.10 pH')
    expect(textoTolerancia({ ...m, tolerancia: 0.2, unidades: 'kg/cm²' })).toBe('± 0.2 kg/cm²')
  })

  it('la válvula con señal invertida debe cerrar al subir la señal', () => {
    const m = { rangoMin: 0, rangoMax: 100, senalInvertida: true }
    expect(esperado(m, 25)).toBe(75)
    expect(errorLectura(m, 76, 25)).toBeCloseTo(1)
    expect(resultadoSugerido([p(0, 100), p(50, 49.5), p(100, 0.8)], 2, m)).toBe('Aprobada sin ajuste')
    expect(textoTolerancia({ rangoMin: 0, rangoMax: 100, tolerancia: 2, unidades: '%', tipo: 'Válvula de control' })).toBe('± 2 % de carrera')
  })

  it('marca la próxima calibración vencida o por vencer', () => {
    const hoy = new Date(2026, 9, 25, 18)
    const f = (d: Date) => ({ toDate: () => d })
    expect(vencimiento(null, hoy)).toBe('sin')
    expect(vencimiento(f(new Date(2026, 9, 25, 12)), hoy)).toBe('pronto')
    expect(vencimiento(f(new Date(2026, 9, 24, 12)), hoy)).toBe('vencida')
    expect(vencimiento(f(new Date(2027, 0, 1, 12)), hoy)).toBe('ok')
    // El día 30 todavía es "pronto"; el 31 ya no.
    expect(vencimiento(f(new Date(2026, 10, 24, 12)), hoy)).toBe('pronto')
    expect(vencimiento(f(new Date(2026, 10, 25, 12)), hoy)).toBe('ok')
  })
})
