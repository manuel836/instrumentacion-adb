// Importación de instrumentos desde Excel: reconoce las columnas, valida cada fila y
// separa nuevos, actualizaciones y errores antes de escribir nada. Sin Firebase para
// poder probarlo solo; la escritura está en importarInstrumentos.ts.

import { AREAS, ESTADOS_INSTRUMENTO, SENALES, dondeEsta, type Area, type EstadoInstrumento, type InstrumentoNuevo } from '../types'
import type { Celda, HojaLeida } from './xlsx'
import { alimentacionConocida, unidadConocida } from './unidades'

/** Datos de un instrumento tal como salen del archivo (la fecha aún como Date). */
export type InstrumentoImportado = Omit<InstrumentoNuevo, 'proximaCalibracion' | 'nfcToken' | 'docs' | 'portadaMiniatura' | 'actualizado'> & {
  proximaCalibracion: Date | null
}
export type Campo = keyof InstrumentoImportado

/** Columnas de la plantilla, en orden, con su explicación. Son las mismas del Excel de Exportar. */
export const COLUMNAS: { campo: Campo; titulo: string; ayuda: string; ejemplo: string | number; alias: string[] }[] = [
  { campo: 'tagISA', titulo: 'Tag ISA', ayuda: 'Obligatorio. Forma PT-101, FIC-2003 o TT-15A. No se puede repetir dentro de la misma área y sub área.', ejemplo: 'PT-101', alias: ['tag', 'isa', 'etiqueta'] },
  { campo: 'servicio', titulo: 'Servicio', ayuda: 'Obligatorio para instrumentos nuevos. Qué mide o controla.', ejemplo: 'Presión de vapor a cabezal', alias: ['descripcion', 'funcion'] },
  {
    campo: 'area',
    titulo: 'Área',
    ayuda: `Obligatorio para instrumentos nuevos. Una de: ${AREAS.join(', ')}. Basta con "vapor", "amoniaco" o "agua".`,
    ejemplo: 'Generación de vapor',
    alias: ['planta', 'zona'],
  },
  {
    campo: 'subArea',
    titulo: 'Sub área',
    ayuda:
      'Opcional. Caldera, tanque o sección, como está en Menú > Sub áreas (el admin las agrega). Si la pones, pon también el Área. Escribe "Sin sub área" para quitarla.',
    ejemplo: 'Caldera 1',
    alias: ['seccion', 'sector'],
  },
  { campo: 'ubicacionTexto', titulo: 'Ubicación', ayuda: 'Dónde está, en palabras.', ejemplo: 'Caldera B, nivel 2', alias: ['ubicacionencampo', 'localizacion'] },
  { campo: 'lazo', titulo: 'Lazo', ayuda: 'Opcional.', ejemplo: '101', alias: ['loop'] },
  { campo: 'pid', titulo: 'P&ID', ayuda: 'Opcional. Número de diagrama.', ejemplo: 'DTI-GV-001', alias: ['dti', 'diagrama'] },
  { campo: 'marca', titulo: 'Marca', ayuda: 'Opcional.', ejemplo: 'Rosemount', alias: ['fabricante'] },
  { campo: 'modelo', titulo: 'Modelo', ayuda: 'Opcional.', ejemplo: '3051S', alias: [] },
  { campo: 'serie', titulo: 'Serie', ayuda: 'Opcional. Número de serie.', ejemplo: '1234567', alias: ['numerodeserie', 'noserie', 'nserie', 'ns'] },
  { campo: 'rangoMin', titulo: 'Rango mín.', ayuda: 'Opcional. Número (acepta punto o coma decimal).', ejemplo: 0, alias: ['rangominimo', 'minimo', 'min'] },
  { campo: 'rangoMax', titulo: 'Rango máx.', ayuda: 'Opcional. Número mayor que el mínimo.', ejemplo: 20, alias: ['rangomaximo', 'maximo', 'max'] },
  { campo: 'unidades', titulo: 'Unidades', ayuda: 'Opcional. Ej.: kg/cm², psi, °C, %, m³/h.', ejemplo: 'kg/cm²', alias: ['unidad', 'ue'] },
  { campo: 'senal', titulo: 'Señal', ayuda: `Opcional. Una de: ${SENALES.join(', ')}.`, ejemplo: '4-20 mA + HART', alias: ['salida', 'tipodesenal'] },
  { campo: 'alimentacion', titulo: 'Alimentación', ayuda: 'Opcional. 24 VCD o 120 VCA.', ejemplo: '24 VCD', alias: ['voltaje'] },
  { campo: 'estado', titulo: 'Estado', ayuda: `Opcional (si va vacío: Operando). Uno de: ${ESTADOS_INSTRUMENTO.join(', ')}.`, ejemplo: 'Operando', alias: ['estatus', 'status'] },
  {
    campo: 'disparaCaldera',
    titulo: 'Dispara caldera',
    ayuda: 'Opcional. Sí si al intervenirlo puede disparar la caldera (si va vacío: No).',
    ejemplo: 'Sí',
    alias: ['disparo', 'disparacaldera', 'disparodecaldera', 'trip'],
  },
  {
    campo: 'notaDisparo',
    titulo: 'Precauciones de disparo',
    ayuda: 'Opcional. Qué cuidar antes de intervenirlo (bypass, avisar a operación…). Máximo 300 letras.',
    ejemplo: 'Poner en bypass el disparo por baja presión',
    alias: ['precauciones', 'notadisparo'],
  },
  {
    campo: 'proximaCalibracion',
    titulo: 'Próxima calibración',
    ayuda: 'Opcional. Fecha de Excel o texto día/mes/año (31/12/2026).',
    ejemplo: '31/12/2026',
    alias: ['proximacal', 'proxcalibracion', 'fechaproximacalibracion'],
  },
]

export const MAX_FILAS = 2000
const TAG_ISA = /^[A-Z]{1,5}-?\d{1,5}[A-Z]?$/

/** "Rango mín." → "rangomin": sin acentos, mayúsculas ni signos. */
export function clave(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

const PORCLAVE = new Map<string, Campo>()
for (const c of COLUMNAS) for (const a of [c.titulo, c.campo, ...c.alias]) PORCLAVE.set(clave(a), c.campo)

const texto = (v: Celda): string => (v === null ? '' : typeof v === 'number' ? String(v) : String(v).trim())

function area(v: string): Area | null {
  const k = clave(v)
  const exacta = AREAS.find((a) => clave(a) === k)
  if (exacta) return exacta
  if (k.includes('vapor') || k.includes('caldera')) return 'Generación de vapor'
  if (k.includes('amoniaco') || k.includes('nh3')) return 'Almacenamiento de amoniaco'
  if (k.includes('agua')) return 'Tratamiento de agua'
  return null
}

function estado(v: string): EstadoInstrumento | null {
  const k = clave(v)
  const exacto = ESTADOS_INSTRUMENTO.find((e) => clave(e) === k)
  if (exacto) return exacto
  if (k.startsWith('fuera') || k === 'baja' || k === 'fs') return 'Fuera de servicio'
  if (k.includes('falla')) return 'Con falla'
  if (['ok', 'operativo', 'enservicio', 'activo', 'funcionando'].includes(k)) return 'Operando'
  return null
}

/** Sí / No escrito como sea ("si", "X", "1", "no"…); null si no se entiende. */
function siNo(v: string): boolean | null {
  const k = clave(v)
  if (['si', 's', 'x', '1', 'true', 'verdadero', 'dispara'].includes(k)) return true
  if (['no', 'n', '0', 'false', 'falso'].includes(k)) return false
  return null
}

function senal(v: string): string | null {
  const k = clave(v)
  return SENALES.find((s) => clave(s) === k) ?? null
}

function numero(v: Celda): number | null | 'malo' {
  if (v === null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : 'malo'
  const t = String(v).trim().replace(/\s/g, '').replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : 'malo'
}

/** Fecha a mediodía local (como guarda la app las fechas de calendario). */
const mediodia = (a: number, m: number, d: number) => {
  const f = new Date(a, m - 1, d, 12)
  return f.getFullYear() === a && f.getMonth() === m - 1 && f.getDate() === d ? f : null
}

export function fecha(v: Celda): Date | null | 'malo' {
  if (v === null || v === '') return null
  if (typeof v === 'number') {
    // Número de serie de Excel: días desde el 30/12/1899.
    if (v < 1 || v > 2958465) return 'malo'
    const utc = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000)
    return mediodia(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate()) ?? 'malo'
  }
  const t = String(v).trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t)
  if (m) return mediodia(Number(m[1]), Number(m[2]), Number(m[3])) ?? 'malo'
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t)
  if (m) {
    const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return mediodia(a, Number(m[2]), Number(m[1])) ?? 'malo'
  }
  return 'malo'
}

/** Tag ISA escrito como sea ("pt 101", " PT-101 ") a la forma de la app. */
export function limpiarTag(v: Celda): string {
  return texto(v).toUpperCase().replace(/\s+/g, '-')
}

/** Sub áreas dadas de alta, para reconocer las del archivo. */
export interface SubareaConocida {
  area: string
  nombre: string
}

export interface Existente {
  id: string
  tagISA: string
  datos: Partial<Record<Campo, unknown>>
}

export interface Problema {
  /** Número de fila como lo ve Excel (1 = la primera). */
  fila: number
  tag: string
  mensaje: string
}

export interface Analisis {
  hoja: string
  /** Columnas reconocidas, en el orden del archivo. */
  columnas: { campo: Campo; titulo: string }[]
  /** Encabezados que no se reconocieron (se ignoran). */
  ignoradas: string[]
  nuevos: { fila: number; datos: InstrumentoImportado }[]
  actualizar: { fila: number; id: string; tagISA: string; cambios: Partial<InstrumentoImportado> }[]
  sinCambios: number
  existentesOmitidos: number
  errores: Problema[]
  avisos: Problema[]
}

function mismoValor(campo: Campo, a: unknown, b: unknown): boolean {
  // Los instrumentos de antes no tienen el campo: cuentan como "No".
  if (campo === 'disparaCaldera') return !!a === !!b
  if (campo === 'proximaCalibracion') {
    const fa = a && typeof (a as { toDate?: () => Date }).toDate === 'function' ? (a as { toDate: () => Date }).toDate() : (a as Date | null)
    const fb = b as Date | null
    if (!fa || !fb) return !fa && !fb
    return fa.toDateString() === fb.toDateString()
  }
  return (a ?? '') === (b ?? '')
}

/** Busca la hoja y la fila de encabezados (la primera con una columna de tag en las primeras 10 filas). */
function encabezados(hojas: HojaLeida[]): { hoja: HojaLeida; fila: number } | null {
  for (const hoja of hojas) {
    for (let i = 0; i < Math.min(10, hoja.filas.length); i++) {
      if ((hoja.filas[i] ?? []).some((c) => PORCLAVE.get(clave(texto(c))) === 'tagISA')) return { hoja, fila: i }
    }
  }
  return null
}

/**
 * Analiza el archivo contra el catálogo actual. Con `actualizarExistentes`, las filas cuyo tag
 * ya existe actualizan sus datos (las celdas vacías no borran nada); si no, se dejan como están.
 */
export function analizar(hojas: HojaLeida[], existentes: Existente[], actualizarExistentes: boolean, subareas: SubareaConocida[] = []): Analisis {
  const enc = encabezados(hojas)
  if (!enc) throw new Error('No encontré la columna "Tag ISA". Usa la plantilla o pon "Tag ISA" como encabezado en la primera fila.')
  const { hoja, fila: filaEnc } = enc

  const columnas: { campo: Campo; titulo: string; indice: number }[] = []
  const ignoradas: string[] = []
  const vistos = new Set<Campo>()
  ;(hoja.filas[filaEnc] ?? []).forEach((c, indice) => {
    const t = texto(c)
    if (!t) return
    const campo = PORCLAVE.get(clave(t))
    if (campo && !vistos.has(campo)) {
      vistos.add(campo)
      columnas.push({ campo, titulo: t, indice })
    } else ignoradas.push(t)
  })

  // El mismo tag puede estar en varias áreas o sub áreas: se buscan todos y luego se elige.
  const porTag = new Map<string, Existente[]>()
  for (const e of existentes) porTag.set(e.tagISA, [...(porTag.get(e.tagISA) ?? []), e])
  const subDe = (e: Existente) => (e.datos.subArea as string | undefined) ?? ''
  const enArchivo = new Map<string, number>()
  /** Instrumentos que ya actualiza otra fila (id → fila). */
  const usados = new Map<string, number>()
  const resultado: Analisis = {
    hoja: hoja.nombre,
    columnas: columnas.map(({ campo, titulo }) => ({ campo, titulo })),
    ignoradas,
    nuevos: [],
    actualizar: [],
    sinCambios: 0,
    existentesOmitidos: 0,
    errores: [],
    avisos: [],
  }

  const datos = hoja.filas.slice(filaEnc + 1)
  if (datos.length > MAX_FILAS) throw new Error(`El archivo tiene ${datos.length} filas; el máximo por importación es ${MAX_FILAS}.`)

  datos.forEach((celdas, i) => {
    const fila = filaEnc + i + 2
    const valor = (campo: Campo): Celda => {
      const col = columnas.find((c) => c.campo === campo)
      return col ? (celdas[col.indice] ?? null) : null
    }
    if (columnas.every((c) => texto(celdas[c.indice] ?? null) === '')) return

    const tag = limpiarTag(valor('tagISA'))
    const error = (mensaje: string) => resultado.errores.push({ fila, tag, mensaje })
    const aviso = (mensaje: string) => resultado.avisos.push({ fila, tag, mensaje })
    if (!tag) return error('Falta el tag ISA.')
    if (!TAG_ISA.test(tag)) return error(`El tag "${tag}" no tiene la forma PT-101, FIC-2003 o TT-15A.`)

    // Solo los campos que traen algo en esta fila.
    const leido: Partial<InstrumentoImportado> = {}
    const errores: string[] = []
    for (const { campo } of columnas) {
      if (campo === 'tagISA') continue
      const v = valor(campo)
      const t = texto(v)
      if (t === '') continue
      if (campo === 'area') {
        const a = area(t)
        if (a) leido.area = a
        else errores.push(`Área "${t}" no reconocida (usa vapor, amoniaco o agua).`)
      } else if (campo === 'estado') {
        const e = estado(t)
        if (e) leido.estado = e
        else errores.push(`Estado "${t}" no reconocido.`)
      } else if (campo === 'senal') {
        const s = senal(t)
        if (s) leido.senal = s
        else {
          leido.senal = 'Otra'
          aviso(`Señal "${t}" no está en la lista: se guarda como "Otra".`)
        }
      } else if (campo === 'unidades') {
        leido.unidades = unidadConocida(t) ?? t.slice(0, 200)
      } else if (campo === 'alimentacion') {
        const a = alimentacionConocida(t)
        if (a) leido.alimentacion = a
        else {
          leido.alimentacion = t.slice(0, 200)
          aviso(`Alimentación "${t}" no es 24 VCD ni 120 VCA: se guarda tal cual.`)
        }
      } else if (campo === 'rangoMin' || campo === 'rangoMax') {
        const n = numero(v)
        if (n === 'malo') errores.push(`${campo === 'rangoMin' ? 'Rango mín.' : 'Rango máx.'} "${t}" no es un número.`)
        else leido[campo] = n
      } else if (campo === 'proximaCalibracion') {
        const f = fecha(v)
        if (f === 'malo') errores.push(`Fecha "${t}" no reconocida (usa día/mes/año).`)
        else leido.proximaCalibracion = f
      } else if (campo === 'subArea') {
        leido.subArea = ['sinsubarea', 'ninguna', 'ninguno'].includes(clave(t)) ? '' : t
      } else if (campo === 'disparaCaldera') {
        const b = siNo(t)
        if (b === null) errores.push(`Dispara caldera "${t}": escribe Sí o No.`)
        else leido.disparaCaldera = b
      } else if (campo === 'notaDisparo') {
        leido.notaDisparo = t.slice(0, 300)
      } else if (campo === 'servicio') {
        if (t.length > 200) errores.push('El servicio pasa de 200 letras.')
        else leido.servicio = t
      } else {
        leido[campo] = t.slice(0, 200)
      }
    }
    // La sub área se escribe como está dada de alta en esa área.
    if (leido.subArea) {
      if (!leido.area) errores.push('Si pones Sub área, pon también el Área.')
      else {
        const conocida = subareas.find((s) => s.area === leido.area && clave(s.nombre) === clave(leido.subArea!))
        if (conocida) leido.subArea = conocida.nombre
        else errores.push(`Sub área "${leido.subArea}" no existe en ${leido.area}: agrégala en Menú > Sub áreas.`)
      }
    }
    if (errores.length) return error(errores.join(' '))

    const llave = `${tag}|${leido.area ?? '?'}|${leido.subArea ?? '?'}`
    if (enArchivo.has(llave)) return error(`Está repetido: ya aparece en la fila ${enArchivo.get(llave)}.`)
    enArchivo.set(llave, fila)

    const mismos = porTag.get(tag) ?? []
    const delArea = leido.area ? mismos.filter((e) => e.datos.area === leido.area) : mismos
    let existente: Existente | undefined
    if (leido.subArea !== undefined) {
      existente =
        delArea.find((e) => subDe(e) === leido.subArea) ??
        // Uno que aún no tenía sub área la recibe, en vez de crear otro con el mismo tag.
        (leido.subArea ? delArea.find((e) => subDe(e) === '' && !usados.has(e.id)) : undefined)
    } else if (delArea.length > 1) {
      const lugares = delArea.map((e) => dondeEsta(e.datos as { area: string; subArea?: string })).join('; ')
      return error(`${tag} está en ${delArea.length} lugares (${lugares}): pon el Área y la Sub área para saber cuál es.`)
    } else existente = delArea[0]
    if (existente) {
      if (usados.has(existente.id)) return error(`Está repetido: ya aparece en la fila ${usados.get(existente.id)}.`)
      usados.set(existente.id, fila)
    }

    const min = leido.rangoMin ?? (existente?.datos.rangoMin as number | null | undefined) ?? null
    const max = leido.rangoMax ?? (existente?.datos.rangoMax as number | null | undefined) ?? null
    if (min !== null && max !== null && max <= min) return error('El rango máximo debe ser mayor que el mínimo.')

    if (existente) {
      if (!actualizarExistentes) {
        resultado.existentesOmitidos++
        return
      }
      const cambios: Partial<InstrumentoImportado> = {}
      for (const [k, v] of Object.entries(leido) as [Campo, unknown][]) {
        if (!mismoValor(k, existente.datos[k], v)) (cambios as Record<string, unknown>)[k] = v
      }
      if (Object.keys(cambios).length === 0) resultado.sinCambios++
      else resultado.actualizar.push({ fila, id: existente.id, tagISA: tag, cambios })
      return
    }

    if (!leido.servicio) return error('Falta el servicio (obligatorio para un instrumento nuevo).')
    if (!leido.area) return error('Falta el área (obligatoria para un instrumento nuevo).')
    resultado.nuevos.push({
      fila,
      datos: {
        tagISA: tag,
        servicio: leido.servicio,
        area: leido.area,
        subArea: leido.subArea ?? '',
        ubicacionTexto: leido.ubicacionTexto ?? '',
        lazo: leido.lazo ?? '',
        pid: leido.pid ?? '',
        marca: leido.marca ?? '',
        modelo: leido.modelo ?? '',
        serie: leido.serie ?? '',
        rangoMin: leido.rangoMin ?? null,
        rangoMax: leido.rangoMax ?? null,
        unidades: leido.unidades ?? '',
        senal: leido.senal ?? '4-20 mA',
        alimentacion: leido.alimentacion ?? '',
        estado: leido.estado ?? 'Operando',
        disparaCaldera: leido.disparaCaldera ?? false,
        notaDisparo: leido.notaDisparo ?? '',
        proximaCalibracion: leido.proximaCalibracion ?? null,
      },
    })
  })
  return resultado
}
