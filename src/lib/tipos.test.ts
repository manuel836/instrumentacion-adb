import { describe, expect, it } from 'vitest'
import {
  datosDelTipo,
  detallePrueba,
  pruebaDe,
  resultadoRevisiones,
  revisionesDe,
  soloDatosDelTipo,
  textoResultado,
  tipoConocido,
  tipoSugerido,
} from './tipos'
import type { Calibracion } from '../types'

/** Los datos de tipo de un instrumento, vacíos. */
const instrumentoVacio = () => ({
  tipo: '',
  unidades: '',
  accionValvula: '',
  posicionador: '',
  rangoResorte: '',
  presionSuministro: '',
  finalesCarrera: '',
  sensor: '',
  puntoAjuste: null as number | null,
  disparaAl: '',
  contacto: '',
})

describe('tipos de instrumento', () => {
  it('sugiere el tipo por las letras del tag', () => {
    expect(tipoSugerido('PT-101')).toBe('Transmisor de presión')
    expect(tipoSugerido('PIT-3')).toBe('Transmisor de presión')
    expect(tipoSugerido('PDT-12')).toBe('Transmisor de presión diferencial')
    expect(tipoSugerido('TT-15A')).toBe('Transmisor de temperatura')
    expect(tipoSugerido('LIT-2')).toBe('Transmisor de nivel')
    expect(tipoSugerido('FT-202')).toBe('Transmisor de flujo')
    expect(tipoSugerido('AIT-5')).toBe('Analizador')
    expect(tipoSugerido('PI-7')).toBe('Manómetro')
    expect(tipoSugerido('TI-8')).toBe('Termómetro')
    expect(tipoSugerido('PSH-3')).toBe('Interruptor de presión')
    expect(tipoSugerido('TSL-4')).toBe('Interruptor de temperatura')
    expect(tipoSugerido('LSHH-1')).toBe('Interruptor de nivel')
    expect(tipoSugerido('FCV-70')).toBe('Válvula de control')
    expect(tipoSugerido('PV-9')).toBe('Válvula de control')
    expect(tipoSugerido('KV-12')).toBe('Válvula de corte')
    expect(tipoSugerido('XV101')).toBe('Válvula de corte')
    // La válvula de seguridad, el elemento y el controlador no son de la lista.
    expect(tipoSugerido('PSV-1')).toBeNull()
    expect(tipoSugerido('FE-1')).toBeNull()
    expect(tipoSugerido('PIC-1')).toBeNull()
    expect(tipoSugerido('')).toBeNull()
  })

  it('reconoce el tipo escrito en el Excel', () => {
    expect(tipoConocido('valvula de corte')).toBe('Válvula de corte')
    expect(tipoConocido('TRANSMISOR DE PRESIÓN')).toBe('Transmisor de presión')
    expect(tipoConocido('KV')).toBe('Válvula de corte')
    expect(tipoConocido('psh')).toBe('Interruptor de presión')
    expect(tipoConocido('On/Off')).toBe('Válvula de corte')
    expect(tipoConocido('bomba')).toBeNull()
  })

  it('cada tipo lleva su prueba', () => {
    expect(pruebaDe('')).toBe('general')
    expect(pruebaDe(undefined)).toBe('general')
    expect(pruebaDe('Otro')).toBe('general')
    expect(pruebaDe('Transmisor de nivel')).toBe('transmisor')
    expect(pruebaDe('Manómetro')).toBe('indicador')
    expect(pruebaDe('Interruptor de flujo')).toBe('interruptor')
    expect(pruebaDe('Válvula de control')).toBe('carrera')
    expect(pruebaDe('Válvula de corte')).toBe('funcional')
    expect(pruebaDe('Analizador')).toBe('analizador')
  })

  it('al guardar quita los datos que no son de su tipo', () => {
    const v = { ...instrumentoVacio(), tipo: 'Transmisor de presión', accionValvula: 'Aire para abrir', puntoAjuste: 3, sensor: 'RTD Pt100' }
    const limpio = soloDatosDelTipo(v)
    expect(limpio.accionValvula).toBe('')
    expect(limpio.puntoAjuste).toBeNull()
    expect(limpio.sensor).toBe('')
    const kv = soloDatosDelTipo({ ...v, tipo: 'Válvula de corte', finalesCarrera: 'Solo cerrada' })
    expect(kv.accionValvula).toBe('Aire para abrir')
    expect(kv.finalesCarrera).toBe('Solo cerrada')
  })

  it('muestra en la ficha solo los datos de su tipo', () => {
    const ps = { ...instrumentoVacio(), tipo: 'Interruptor de presión', unidades: 'kg/cm²', puntoAjuste: 10.5, disparaAl: 'Al subir', contacto: 'NC', sensor: 'RTD Pt100' }
    expect(datosDelTipo(ps)).toEqual([
      { k: 'Punto de ajuste', v: '10.5 kg/cm²' },
      { k: 'Dispara', v: 'al subir' },
      { k: 'Contacto', v: 'NC (normalmente cerrado)' },
    ])
    expect(datosDelTipo({ ...instrumentoVacio(), tipo: 'Válvula de corte', accionValvula: 'Aire para cerrar' })).toEqual([
      { k: 'Acción', v: 'Aire para cerrar · sin aire abre (falla abierta)' },
    ])
  })

  it('las revisiones de la válvula de corte dependen de su acción y finales de carrera', () => {
    const r = revisionesDe('funcional', { accionValvula: 'Aire para abrir', finalesCarrera: 'Solo cerrada' })
    expect(r).toContain('Sin aire cierra sola (posición segura)')
    expect(r).toContain('Final de carrera cerrada (ZSC) señaliza')
    expect(r).not.toContain('Final de carrera abierta (ZSO) señaliza')
    expect(revisionesDe('funcional', { accionValvula: '', finalesCarrera: '' })).toContain('Final de carrera abierta (ZSO) señaliza')
    expect(revisionesDe('carrera', { accionValvula: 'Aire para cerrar', finalesCarrera: '' })).toContain('Sin aire abre sola (posición segura)')
    expect(revisionesDe('transmisor', { accionValvula: '', finalesCarrera: '' })).toEqual([])
  })

  it('el resultado de la válvula de corte sale de sus revisiones', () => {
    const r = (estado: 'Bien' | 'Mal' | 'No aplica' | '') => ({ nombre: 'x', estado })
    expect(resultadoRevisiones([r('Bien'), r('')], false)).toBeNull()
    expect(resultadoRevisiones([r('Bien'), r('No aplica')], false)).toBe('Aprobada sin ajuste')
    expect(resultadoRevisiones([r('Bien'), r('Bien')], true)).toBe('Ajustada')
    expect(resultadoRevisiones([r('Bien'), r('Mal')], true)).toBe('Fuera de tolerancia')
    expect(textoResultado('Fuera de tolerancia', 'Válvula de corte')).toBe('No pasó la prueba')
    expect(textoResultado('Fuera de tolerancia', 'Transmisor de presión')).toBe('Fuera de tolerancia')
  })

  it('resume la prueba en una línea', () => {
    const base: Parameters<typeof detallePrueba>[0] = {
      tipo: '',
      lecturaEn: 'unidades',
      senalInvertida: false,
      puntos: [],
      unidades: 'kg/cm²',
      disparaAl: '',
      reposicion: null,
      revisiones: [],
      tiempoApertura: null,
      tiempoCierre: null,
      pendiente: null,
      offset: null,
    } satisfies Partial<Calibracion>
    expect(detallePrueba(base)).toBe('')
    expect(
      detallePrueba({
        ...base,
        tipo: 'Interruptor de presión',
        disparaAl: 'Al subir',
        puntos: [{ entrada: 10, asFound: 10.4, asLeft: 10.1 }],
        reposicion: { asFound: 9.8, asLeft: 9.6 },
      }),
    ).toBe('Ajuste 10 kg/cm², dispara al subir. Disparo 10.4 / 10.1, reposición 9.8 / 9.6 (antes / después). Diferencial 0.5 kg/cm².')
    expect(
      detallePrueba({
        ...base,
        tipo: 'Válvula de corte',
        tiempoApertura: 4.2,
        tiempoCierre: null,
        revisiones: [
          { nombre: 'Abre completo', estado: 'Bien' },
          { nombre: 'Cierra completo', estado: 'Mal' },
          { nombre: 'Final de carrera abierta (ZSO) señaliza', estado: 'No aplica' },
        ],
      }),
    ).toBe('Abre en 4.2 s. Revisiones: 1 bien, 1 mal (Cierra completo), 1 no aplica.')
    expect(detallePrueba({ ...base, tipo: 'Analizador', pendiente: 98, offset: -3 })).toBe('Pendiente 98 %, offset -3 mV.')
    expect(detallePrueba({ ...base, tipo: 'Transmisor de presión', lecturaEn: 'mA' })).toBe('Salida leída en mA (4-20).')
  })
})
