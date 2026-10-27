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

describe('sub áreas', () => {
  const hojas = (filas: (string | number | null)[][]) => [{ nombre: 'Instrumentos', filas: [['Tag ISA', 'Servicio', 'Área', 'Sub área', 'Marca'], ...filas] }]
  const subareas = [
    { area: 'Generación de vapor', nombre: 'Caldera 1' },
    { area: 'Generación de vapor', nombre: 'Caldera 2' },
  ]
  const existentes: Existente[] = [
    { id: 'c1', tagISA: 'PT-101', datos: { area: 'Generación de vapor', subArea: 'Caldera 1', servicio: 'Presión C1' } },
    { id: 'c2', tagISA: 'PT-101', datos: { area: 'Generación de vapor', subArea: 'Caldera 2', servicio: 'Presión C2' } },
    { id: 's1', tagISA: 'LT-200', datos: { area: 'Generación de vapor', subArea: '', servicio: 'Nivel' } },
  ]

  it('el mismo tag en otra sub área es otro instrumento', () => {
    const a = analizar(
      hojas([
        ['PT-101', null, 'vapor', 'caldera 2', 'Yokogawa'],
        ['PT-101', 'Presión C3', 'vapor', 'Caldera 3', null],
        ['PT-101', null, null, null, 'Endress'],
        ['LT-200', null, 'vapor', 'Caldera 1', null],
        ['LT-200', 'Nivel C2', 'vapor', 'Caldera 2', null],
        ['FT-300', 'Flujo', 'vapor', 'Caldera 1', null],
        ['FT-300', 'Flujo', 'vapor', 'Caldera 1', null],
        ['TT-400', 'Temperatura', null, 'Caldera 1', null],
      ]),
      existentes,
      true,
      subareas,
    )
    expect(a.actualizar).toEqual([
      { fila: 2, id: 'c2', tagISA: 'PT-101', cambios: { marca: 'Yokogawa' } },
      // El que no tenía sub área la recibe en lugar de duplicarse.
      { fila: 5, id: 's1', tagISA: 'LT-200', cambios: { subArea: 'Caldera 1' } },
    ])
    expect(a.nuevos.map((n) => [n.datos.tagISA, n.datos.subArea])).toEqual([
      ['LT-200', 'Caldera 2'],
      ['FT-300', 'Caldera 1'],
    ])
    expect(a.errores.map((e) => e.fila)).toEqual([3, 4, 8, 9])
    expect(a.errores[0].mensaje).toMatch(/Sub área "Caldera 3" no existe en Generación de vapor/)
    expect(a.errores[1].mensaje).toMatch(/PT-101 está en 2 lugares .*Caldera 1.*Caldera 2/)
    expect(a.errores[2].mensaje).toMatch(/repetido.*fila 7/)
    expect(a.errores[3].mensaje).toMatch(/pon también el Área/)
  })

  it('"Sin sub área" la quita', () => {
    const a = analizar(hojas([['PT-101', null, 'vapor', 'Caldera 1', null], ['LT-200', null, 'vapor', 'sin sub área', 'ABB']]), existentes, true, subareas)
    expect(a.sinCambios).toBe(1)
    expect(a.actualizar).toEqual([{ fila: 3, id: 's1', tagISA: 'LT-200', cambios: { marca: 'ABB' } }])
  })
})

describe('disparo de caldera', () => {
  const hojas = (filas: (string | number | null)[][]) => [{ nombre: 'Instrumentos', filas: [['Tag ISA', 'Servicio', 'Área', 'Dispara caldera', 'Precauciones'], ...filas] }]
  const existentes: Existente[] = [{ id: 'i1', tagISA: 'PT-101', datos: { area: 'Generación de vapor', servicio: 'Presión' } }]

  it('entiende Sí y No; vacío es No; los de antes sin la marca cuentan como No', () => {
    const a = analizar(
      hojas([
        ['PT-101', null, 'vapor', 'no', null],
        ['LSLL-20', 'Nivel muy bajo domo', 'vapor', 'Sí', 'Bypass antes de desconectar'],
        ['TT-30', 'Temperatura', 'vapor', null, null],
        ['PT-40', 'Presión', 'vapor', 'quizá', null],
      ]),
      existentes,
      true,
    )
    expect(a.sinCambios).toBe(1)
    expect(a.nuevos.map((n) => [n.datos.tagISA, n.datos.disparaCaldera, n.datos.notaDisparo])).toEqual([
      ['LSLL-20', true, 'Bypass antes de desconectar'],
      ['TT-30', false, ''],
    ])
    expect(a.errores.map((e) => e.mensaje)).toEqual(['Dispara caldera "quizá": escribe Sí o No.'])
  })
})

describe('unidades y alimentación', () => {
  const hojas = (filas: (string | number | null)[][]) => [{ nombre: 'Instrumentos', filas: [['Tag ISA', 'Servicio', 'Área', 'Unidades', 'Alimentación'], ...filas] }]

  it('las acomoda a las opciones de la lista y avisa la alimentación que no reconoce', () => {
    const a = analizar(
      hojas([
        ['PT-101', 'Presión', 'vapor', 'Kg/cm2', '24 VDC lazo'],
        ['TT-102', 'Temperatura', 'vapor', 'ºC', '127 VAC'],
        ['AT-103', 'Conductividad', 'agua', 'galones', '220 VCA'],
      ]),
      [],
      true,
    )
    expect(a.nuevos.map((n) => [n.datos.unidades, n.datos.alimentacion])).toEqual([
      ['kg/cm²', '24 VCD'],
      ['°C', '120 VCA'],
      ['galones', '220 VCA'],
    ])
    expect(a.avisos.map((x) => [x.tag, x.mensaje])).toEqual([['AT-103', 'Alimentación "220 VCA" no es 24 VCD ni 120 VCA: se guarda tal cual.']])
  })
})

describe('tipo de instrumento', () => {
  const hojas = (filas: (string | number | null)[][]) => [
    { nombre: 'Instrumentos', filas: [['Tag ISA', 'Servicio', 'Área', 'Tipo', 'Acción de válvula', 'Punto de ajuste', 'Dispara al', 'Contacto'], ...filas] },
  ]
  const existentes: Existente[] = [{ id: 'i1', tagISA: 'FCV-70', datos: { area: 'Generación de vapor', servicio: 'Vapor de atomización' } }]

  it('lee el tipo y sus datos, y avisa lo que no reconoce', () => {
    const a = analizar(
      hojas([
        ['KV-12', 'Corte de gas', 'vapor', 'valvula de corte', 'FC', null, null, null],
        ['PSH-3', 'Alta presión', 'vapor', 'PSH', null, '10,5', 'alto', 'NO'],
        ['TT-4', 'Temperatura', 'vapor', 'Transmisor de temperatura', 'Aire para abrir', null, null, null],
        ['FCV-70', null, 'vapor', 'Válvula de control', 'aire para cerrar', null, null, null],
        ['XX-5', 'Otra cosa', 'agua', 'bomba', null, null, null, null],
        ['KV-13', 'Corte de vapor', 'vapor', 'KV', 'aire para abrir y cerrar', null, null, null],
        ['XV-14', 'Corte de amoniaco', 'amoniaco', 'XV', 'Doble efecto', null, null, null],
      ]),
      existentes,
      true,
    )
    expect(a.nuevos.map((n) => [n.datos.tagISA, n.datos.tipo, n.datos.accionValvula, n.datos.puntoAjuste, n.datos.disparaAl, n.datos.contacto])).toEqual([
      ['KV-12', 'Válvula de corte', 'Aire para abrir', null, '', ''],
      ['PSH-3', 'Interruptor de presión', '', 10.5, 'Al subir', 'NA'],
      // La acción de válvula no es de un transmisor: no se guarda.
      ['TT-4', 'Transmisor de temperatura', '', null, '', ''],
      ['XX-5', '', '', null, '', ''],
      ['KV-13', 'Válvula de corte', 'Aire para abrir y cerrar', null, '', ''],
      ['XV-14', 'Válvula de corte', 'Aire para abrir y cerrar', null, '', ''],
    ])
    expect(a.actualizar).toEqual([{ fila: 5, id: 'i1', tagISA: 'FCV-70', cambios: { tipo: 'Válvula de control', accionValvula: 'Aire para cerrar' } }])
    expect(a.avisos.map((x) => [x.tag, x.mensaje])).toEqual([['XX-5', 'Tipo "bomba" no está en la lista: se deja como estaba.']])
  })
})
