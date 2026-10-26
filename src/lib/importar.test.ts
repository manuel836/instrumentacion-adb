import { describe, expect, it } from 'vitest'
import writeXlsxFile from 'write-excel-file/node'
import { analizar, fecha, limpiarTag, type Existente } from './importar'
import { leerCsv, leerXlsx } from './xlsx'

const dia = (d: Date | null | 'malo') => (d instanceof Date ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : d)

describe('lector de Excel', () => {
  it('lee texto, números, fechas y celdas vacías de un .xlsx', async () => {
    const buffer = await writeXlsxFile([
      [{ value: 'Tag ISA' }, { value: 'Servicio' }, { value: 'Rango máx.' }, { value: 'Próxima calibración' }],
      [{ value: 'PT-101' }, { value: 'Presión & "vapor" <cabezal>' }, { value: 20.5 }, { value: new Date(Date.UTC(2026, 11, 31)), type: Date, format: 'dd/mm/yyyy' }],
      [{ value: 'TT-15A' }, null, { value: 3 }, null],
    ]).toBuffer()
    const [hoja] = leerXlsx(new Uint8Array(buffer))
    expect(hoja.filas[0]).toEqual(['Tag ISA', 'Servicio', 'Rango máx.', 'Próxima calibración'])
    expect(hoja.filas[1].slice(0, 3)).toEqual(['PT-101', 'Presión & "vapor" <cabezal>', 20.5])
    expect(dia(fecha(hoja.filas[1][3]))).toBe('2026-12-31')
    expect(hoja.filas[2][0]).toBe('TT-15A')
    expect(hoja.filas[2][1] ?? null).toBeNull()
  })

  it('rechaza archivos que no son .xlsx', () => {
    expect(() => leerXlsx(new TextEncoder().encode('hola'))).toThrow(/no es un Excel/)
  })

  it('lee CSV con punto y coma, comillas y saltos de línea', () => {
    const [hoja] = leerCsv('﻿Tag ISA;Servicio;Rango mín.\r\nPT-101;"Presión; ""vapor""";0,5\r\nTT-2;"dos\nlíneas";\r\n')
    expect(hoja.filas[0]).toEqual(['Tag ISA', 'Servicio', 'Rango mín.'])
    expect(hoja.filas[1]).toEqual(['PT-101', 'Presión; "vapor"', '0,5'])
    expect(hoja.filas[2]).toEqual(['TT-2', 'dos\nlíneas', null])
  })
})

describe('fechas y tags', () => {
  it('entiende día/mes/año, ISO y número de serie de Excel', () => {
    expect(dia(fecha('31/12/2026'))).toBe('2026-12-31')
    expect(dia(fecha('1-2-27'))).toBe('2027-2-1')
    expect(dia(fecha('2026-03-15'))).toBe('2026-3-15')
    expect(dia(fecha(46387))).toBe('2026-12-31')
    expect(fecha('31/02/2026')).toBe('malo')
    expect(fecha('mañana')).toBe('malo')
    expect(fecha(null)).toBeNull()
  })
  it('limpia el tag', () => {
    expect(limpiarTag(' pt 101 ')).toBe('PT-101')
    expect(limpiarTag('fic-2003')).toBe('FIC-2003')
  })
})

describe('análisis de la importación', () => {
  const encabezado = ['Tag ISA', 'Servicio', 'Área', 'Marca', 'Rango mín.', 'Rango máx.', 'Señal', 'Estado', 'Próxima calibración', 'Tag NFC']
  const hojas = (filas: (string | number | null)[][]) => [{ nombre: 'Instrucciones', filas: [['Lee esto']] }, { nombre: 'Instrumentos', filas: [['Plantilla ADB'], encabezado, ...filas] }]
  const existentes: Existente[] = [{ id: 'i1', tagISA: 'PT-101', datos: { servicio: 'Presión', area: 'Generación de vapor', marca: 'Rosemount', rangoMin: 0, rangoMax: 20 } }]

  it('separa nuevos, actualizaciones, sin cambios y errores', () => {
    const a = analizar(
      hojas([
        ['PT-101', 'Presión', 'vapor', 'Yokogawa', null, null, null, null, null, 'Sí'],
        ['tt 200', 'Temperatura', 'agua', null, '0', '150,5', '4-20ma hart', null, '15/01/2027', null],
        [null, null, null, null, null, null, null, null, null, null],
        ['LT-300', 'Nivel', 'Amoniaco', null, 5, 1, null, null, null, null],
        ['FT-400', 'Flujo', 'Cocina', null, null, null, null, null, null, null],
        ['TT-200', 'Duplicado', 'agua', null, null, null, null, null, null, null],
        ['XX', 'Malo', 'agua', null, null, null, null, null, null, null],
        ['PI-500', null, 'agua', null, null, null, null, null, null, null],
        ['AI-600', 'Analizador', 'agua', null, null, null, 'Láser', 'fuera de servicio', 'pronto', null],
      ]),
      existentes,
      true,
    )
    expect(a.hoja).toBe('Instrumentos')
    expect(a.ignoradas).toEqual(['Tag NFC'])
    expect(a.actualizar).toEqual([{ fila: 3, id: 'i1', tagISA: 'PT-101', cambios: { marca: 'Yokogawa' } }])
    expect(a.nuevos.map((n) => n.datos.tagISA)).toEqual(['TT-200'])
    const tt = a.nuevos[0].datos
    expect(tt).toMatchObject({ area: 'Tratamiento de agua', rangoMin: 0, rangoMax: 150.5, senal: '4-20 mA + HART', estado: 'Operando' })
    expect(dia(tt.proximaCalibracion)).toBe('2027-1-15')
    expect(a.errores.map((e) => [e.fila, e.tag])).toEqual([
      [6, 'LT-300'],
      [7, 'FT-400'],
      [8, 'TT-200'],
      [9, 'XX'],
      [10, 'PI-500'],
      [11, 'AI-600'],
    ])
    expect(a.errores[0].mensaje).toMatch(/máximo debe ser mayor/)
    expect(a.errores[1].mensaje).toMatch(/Área "Cocina"/)
    expect(a.errores[2].mensaje).toMatch(/repetido.*fila 4/)
    expect(a.errores[4].mensaje).toMatch(/Falta el servicio/)
    expect(a.errores[5].mensaje).toMatch(/Fecha "pronto"/)
    expect(a.avisos.map((x) => x.tag)).toEqual(['AI-600'])
  })

  it('sin actualizar, los existentes se dejan como están', () => {
    const a = analizar(hojas([['PT-101', 'Otro servicio', 'vapor', null, null, null, null, null, null, null]]), existentes, false)
    expect(a.actualizar).toEqual([])
    expect(a.existentesOmitidos).toBe(1)
  })

  it('una fila igual a lo que ya hay cuenta como sin cambios', () => {
    const a = analizar(hojas([['PT-101', 'Presión', 'Generación de vapor', 'Rosemount', 0, 20, null, null, null, null]]), existentes, true)
    expect(a.sinCambios).toBe(1)
    expect(a.actualizar).toEqual([])
  })

  it('pide la columna de tag', () => {
    expect(() => analizar([{ nombre: 'x', filas: [['Nombre', 'Otro']] }], [], true)).toThrow(/Tag ISA/)
  })
})
