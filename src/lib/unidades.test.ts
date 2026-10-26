import { describe, expect, it } from 'vitest'
import { alimentacionConocida, unidadConocida } from './unidades'

describe('unidades', () => {
  it('reconoce la unidad aunque se haya escrito distinto', () => {
    expect(unidadConocida('kg/cm²')).toBe('kg/cm²')
    expect(unidadConocida('Kg/cm2')).toBe('kg/cm²')
    expect(unidadConocida(' PSI ')).toBe('psi')
    expect(unidadConocida('ºC')).toBe('°C')
    expect(unidadConocida('uS/cm')).toBe('µS/cm')
    expect(unidadConocida('m3/h')).toBe('m³/h')
    expect(unidadConocida('inH2O')).toBe('inH₂O')
    expect(unidadConocida('ton/h')).toBe('t/h')
  })

  it('deja fuera lo que no está en la lista', () => {
    expect(unidadConocida('')).toBeNull()
    expect(unidadConocida('galones')).toBeNull()
  })
})

describe('alimentación', () => {
  it('acomoda la corriente directa a 24 VCD', () => {
    for (const v of ['24 VCD', '24VDC', '24 VDC lazo', '24 V', '24 V corriente directa', 'Alimentado por lazo', 'vcd']) {
      expect(alimentacionConocida(v), v).toBe('24 VCD')
    }
  })

  it('acomoda la corriente alterna a 120 VCA', () => {
    for (const v of ['120 VCA', '120VAC', '127 V', '115 vac', 'Corriente alterna']) {
      expect(alimentacionConocida(v), v).toBe('120 VCA')
    }
  })

  it('no adivina lo que es otra cosa', () => {
    for (const v of ['', '24 VAC', '12 VCD', '220 VCA', '4-20 mA', 'N/A', '24 VCD / 120 VCA']) {
      expect(alimentacionConocida(v), v).toBeNull()
    }
  })
})
