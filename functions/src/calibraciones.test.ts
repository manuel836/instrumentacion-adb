import { describe, expect, it } from 'vitest'
import { avisoCalibraciones, inicioDelDia, limitePorVencer, resumenCalibraciones, type InstrumentoCal } from './calibraciones'

// Lunes 2 de noviembre de 2026, 7:00 en la planta (13:00 UTC).
const AHORA = new Date('2026-11-02T13:00:00Z')
const dia = (s: string) => new Date(`${s}T12:00:00-06:00`)

const INSTS: InstrumentoCal[] = [
  { tagISA: 'PT-101', area: 'Generación de vapor', proxima: dia('2026-10-30') },
  { tagISA: 'FT-202', area: 'Generación de vapor', proxima: dia('2026-11-01') },
  { tagISA: 'LT-300', area: 'Tratamiento de agua', proxima: dia('2026-11-02') },
  { tagISA: 'TT-400', area: 'Tratamiento de agua', proxima: dia('2026-12-02') },
  { tagISA: 'TT-401', area: 'Tratamiento de agua', proxima: dia('2026-12-03') },
  { tagISA: 'PI-500', area: 'Almacenamiento de amoniaco', proxima: null },
]

describe('aviso semanal de calibraciones', () => {
  it('cuenta los días desde la medianoche de la planta, no la de UTC', () => {
    // A las 23:00 del domingo en la planta ya es lunes en UTC.
    expect(inicioDelDia(new Date('2026-11-02T05:00:00Z')).toISOString()).toBe('2026-11-01T06:00:00.000Z')
    expect(inicioDelDia(AHORA).toISOString()).toBe('2026-11-02T06:00:00.000Z')
    expect(limitePorVencer(AHORA).toISOString()).toBe('2026-12-03T06:00:00.000Z')
  })

  it('separa vencidas y por vencer (hoy y el día 30 cuentan como por vencer)', () => {
    expect(resumenCalibraciones(INSTS, '', AHORA)).toEqual({ vencidas: ['PT-101', 'FT-202'], porVencer: ['LT-300', 'TT-400'] })
  })

  it('filtra por área', () => {
    expect(resumenCalibraciones(INSTS, 'Tratamiento de agua', AHORA)).toEqual({ vencidas: [], porVencer: ['LT-300', 'TT-400'] })
    expect(resumenCalibraciones(INSTS, 'Almacenamiento de amoniaco', AHORA)).toEqual({ vencidas: [], porVencer: [] })
  })

  it('arma el texto y lleva a la lista más urgente', () => {
    const todas = avisoCalibraciones(resumenCalibraciones(INSTS, '', AHORA), '')!
    expect(todas.titulo).toBe('Calibraciones')
    expect(todas.cuerpo).toBe('2 vencidas: PT-101, FT-202. 2 vencen en 30 días: LT-300, TT-400.')
    expect(todas.ruta).toBe('/catalogo?filtro=vencidas')

    const agua = avisoCalibraciones(resumenCalibraciones(INSTS, 'Tratamiento de agua', AHORA), 'Tratamiento de agua')!
    expect(agua.titulo).toBe('Calibraciones · Tratamiento de agua')
    expect(agua.cuerpo).toBe('2 vencen en 30 días: LT-300, TT-400.')
    expect(agua.ruta).toBe('/catalogo?area=Tratamiento+de+agua&filtro=por-vencer')
  })

  it('resume las listas largas y no avisa si no hay nada', () => {
    const r = { vencidas: ['A-1', 'A-2', 'A-3', 'A-4', 'A-5'], porVencer: ['B-1'] }
    expect(avisoCalibraciones(r, '')!.cuerpo).toBe('5 vencidas: A-1, A-2, A-3 y 2 más. 1 vence en 30 días: B-1.')
    expect(avisoCalibraciones({ vencidas: [], porVencer: [] }, '')).toBeNull()
  })
})
