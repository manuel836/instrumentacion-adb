import { useEffect, useMemo, useState } from 'react'
import { collection, collectionGroup, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { TIPOS_MOVIMIENTO, type Calibracion, type Falla, type Instrumento, type Movimiento, type Refaccion } from '../types'
import { aCalibracion } from './calibraciones'
import { useFallas } from './fallas'
import { useInstrumentos } from './instrumentos'
import { porPedir, useRefacciones } from './refacciones'
import { errorLectura, errorMaximo, esperado, textoTolerancia } from './tolerancia'
import { detallePrueba, textoResultado } from './tipos'

export type TipoReporte = 'instrumentos' | 'fallas' | 'calibraciones' | 'refacciones'

export const TIPOS_REPORTE: Record<TipoReporte, { titulo: string; descripcion: string; conPeriodo: boolean }> = {
  instrumentos: { titulo: 'Listado de instrumentos', descripcion: 'Todos los datos de la ficha, estado y próxima calibración.', conPeriodo: false },
  fallas: { titulo: 'Fallas por periodo', descripcion: 'Reportadas en el periodo, con quién atendió, causa raíz y acción correctiva.', conPeriodo: true },
  calibraciones: { titulo: 'Calibraciones', descripcion: 'Registradas en el periodo, con resultado, lo propio de cada tipo y puntos As-Found / As-Left.', conPeriodo: true },
  refacciones: {
    titulo: 'Inventario de refacciones',
    descripcion: 'Existencia, mínimo y cuáles hay que pedir. En Excel también todas las entradas y salidas.',
    conPeriodo: false,
  },
}

export type Valor = string | number | Date | null

export interface Columna {
  titulo: string
  /** Ancho en caracteres para Excel. */
  ancho: number
}

export interface Hoja {
  nombre: string
  columnas: Columna[]
  filas: Valor[][]
}

export interface Reporte {
  titulo: string
  /** La primera hoja es la que se imprime; las demás solo van en Excel. */
  hojas: Hoja[]
}

export interface Filtros {
  area: string
  /** Fechas AAAA-MM-DD, inclusivas. */
  desde: string
  hasta: string
}

const c = (titulo: string, ancho = 14): Columna => ({ titulo, ancho })
const fecha = (t: { toDate(): Date } | null | undefined) => t?.toDate() ?? null
const num = (n: number | null | undefined) => (n === null || n === undefined ? null : n)
const redondear = (n: number | null, dec = 2) => (n === null ? null : Number(n.toFixed(dec)))

function enPeriodo(d: Date | null, f: Filtros): boolean {
  if (!d) return false
  const inicio = new Date(`${f.desde}T00:00:00`)
  const fin = new Date(`${f.hasta}T23:59:59.999`)
  return d >= inicio && d <= fin
}

function reporteInstrumentos(lista: Instrumento[], f: Filtros): Reporte {
  const filas = lista
    .filter((i) => !f.area || i.area === f.area)
    .map((i): Valor[] => [
      i.tagISA,
      i.servicio,
      i.tipo,
      i.area,
      i.subArea,
      i.ubicacionTexto,
      i.lazo,
      i.pid,
      i.marca,
      i.modelo,
      i.serie,
      num(i.rangoMin),
      num(i.rangoMax),
      i.unidades,
      i.senal,
      i.alimentacion,
      i.accionValvula,
      i.posicionador,
      i.rangoResorte,
      i.presionSuministro,
      i.finalesCarrera,
      i.sensor,
      i.salidaTransmisor,
      num(i.puntoAjuste),
      i.disparaAl,
      i.contacto,
      i.estado,
      i.disparaCaldera ? 'Sí' : 'No',
      i.notaDisparo,
      fecha(i.proximaCalibracion),
      i.nfcToken ? 'Sí' : 'No',
    ])
  return {
    titulo: TIPOS_REPORTE.instrumentos.titulo,
    hojas: [
      {
        nombre: 'Instrumentos',
        columnas: [
          c('Tag ISA', 12),
          c('Servicio', 30),
          c('Tipo', 22),
          c('Área', 24),
          c('Sub área', 16),
          c('Ubicación', 24),
          c('Lazo', 10),
          c('P&ID', 12),
          c('Marca'),
          c('Modelo'),
          c('Serie'),
          c('Rango mín.', 10),
          c('Rango máx.', 10),
          c('Unidades', 10),
          c('Señal'),
          c('Alimentación'),
          c('Acción de válvula', 16),
          c('Posicionador'),
          c('Rango del resorte', 12),
          c('Presión de suministro', 12),
          c('Finales de carrera', 16),
          c('Sensor', 12),
          c('Salida del transmisor', 14),
          c('Punto de ajuste', 10),
          c('Dispara al', 10),
          c('Contacto', 8),
          c('Estado', 16),
          c('Dispara caldera', 10),
          c('Precauciones de disparo', 30),
          c('Próxima calibración', 14),
          c('Tag NFC', 8),
        ],
        filas,
      },
    ],
  }
}

function reporteFallas(lista: Falla[], f: Filtros): Reporte {
  const filas = lista
    .filter((x) => (!f.area || x.area === f.area) && enPeriodo(fecha(x.fechas.creada), f))
    .sort((a, b) => (a.fechas.creada?.toMillis() ?? 0) - (b.fechas.creada?.toMillis() ?? 0))
    .map((x): Valor[] => {
      const creada = fecha(x.fechas.creada)
      const cerrada = fecha(x.fechas.cerrada)
      return [
        x.tagISA,
        x.area,
        x.subArea ?? '',
        x.estado,
        x.descripcion,
        x.reportadoPor.nombre,
        creada,
        x.tecnicoAsignado?.nombre ?? '',
        cerrada,
        creada && cerrada ? redondear((cerrada.getTime() - creada.getTime()) / 3_600_000, 1) : null,
        x.causaRaiz,
        x.accionCorrectiva,
      ]
    })
  return {
    titulo: TIPOS_REPORTE.fallas.titulo,
    hojas: [
      {
        nombre: 'Fallas',
        columnas: [
          c('Tag ISA', 12),
          c('Área', 24),
          c('Sub área', 16),
          c('Estado', 12),
          c('Descripción', 40),
          c('Reportó', 18),
          c('Reportada', 12),
          c('Técnico', 18),
          c('Cerrada', 12),
          c('Horas para cerrar', 10),
          c('Causa raíz', 36),
          c('Acción correctiva', 36),
        ],
        filas,
      },
    ],
  }
}

export interface CalibracionConInstrumento extends Calibracion {
  instrumentoId: string
}

function reporteCalibraciones(lista: CalibracionConInstrumento[], instrumentos: Instrumento[], f: Filtros): Reporte {
  const porId = new Map(instrumentos.map((i) => [i.id, i]))
  const vista = lista
    .map((cal) => ({ cal, inst: porId.get(cal.instrumentoId) }))
    .filter(({ cal, inst }) => inst && (!f.area || inst.area === f.area) && enPeriodo(fecha(cal.fecha), f))
    .sort((a, b) => a.cal.fecha.toMillis() - b.cal.fecha.toMillis())

  const maxError = (cal: Calibracion, k: 'asFound' | 'asLeft') => {
    const e = errorMaximo(cal, k)
    return e === null ? null : redondear(Math.abs(e))
  }
  const rango = (cal: Calibracion) => (cal.rangoMax > cal.rangoMin ? `${cal.rangoMin} a ${cal.rangoMax} ${cal.unidades}`.trim() : '')

  return {
    titulo: TIPOS_REPORTE.calibraciones.titulo,
    hojas: [
      {
        nombre: 'Calibraciones',
        columnas: [
          c('Tag ISA', 12),
          c('Área', 24),
          c('Sub área', 16),
          c('Tipo', 22),
          c('Fecha', 12),
          c('Técnico', 18),
          c('Resultado', 18),
          c('Rango', 16),
          c('Tolerancia', 14),
          c('Error máx. As-Found', 12),
          c('Error máx. As-Left', 12),
          c('Detalle de la prueba', 40),
          c('Patrón', 18),
          c('Próxima', 12),
          c('Observaciones', 36),
        ],
        filas: vista.map(({ cal, inst }): Valor[] => [
          inst!.tagISA,
          inst!.area,
          inst!.subArea,
          cal.tipo,
          fecha(cal.fecha),
          cal.tecnico.nombre,
          textoResultado(cal.resultado, cal.tipo),
          rango(cal),
          cal.tolerancia > 0 ? textoTolerancia(cal) : '',
          maxError(cal, 'asFound'),
          maxError(cal, 'asLeft'),
          detallePrueba(cal),
          cal.patron,
          fecha(cal.proxima),
          cal.observaciones,
        ]),
      },
      {
        nombre: 'Puntos',
        columnas: [
          c('Tag ISA', 12),
          c('Sub área', 16),
          c('Fecha', 12),
          c('Entrada', 10),
          c('Debe marcar', 10),
          c('As-Found', 10),
          c('As-Left', 10),
          c('Lectura en', 10),
          c('Error As-Found', 12),
          c('Error As-Left', 12),
        ],
        filas: vista.flatMap(({ cal, inst }) =>
          cal.puntos.map((p): Valor[] => [
            inst!.tagISA,
            inst!.subArea,
            fecha(cal.fecha),
            p.entrada,
            redondear(esperado(cal, p.entrada), 3),
            num(p.asFound),
            num(p.asLeft),
            cal.lecturaEn === 'mA' ? 'mA' : cal.unidades,
            redondear(errorLectura(cal, p.asFound, p.entrada)),
            redondear(errorLectura(cal, p.asLeft, p.entrada)),
          ]),
        ),
      },
    ],
  }
}

/** Con área elegida: las refacciones de instrumentos de esa área. */
function reporteRefacciones(refacciones: Refaccion[], movimientos: Movimiento[], instrumentos: Instrumento[], f: Filtros): Reporte {
  const tags = new Map(instrumentos.map((i) => [i.id, i]))
  const vista = refacciones.filter((r) => !f.area || r.instrumentos.some((id) => tags.get(id)?.area === f.area))
  const ids = new Set(vista.map((r) => r.id))
  const unidad = new Map(refacciones.map((r) => [r.id, r.unidad]))
  return {
    titulo: TIPOS_REPORTE.refacciones.titulo,
    hojas: [
      {
        nombre: 'Refacciones',
        columnas: [
          c('Refacción', 30),
          c('Número de parte', 16),
          c('Marca', 14),
          c('Ubicación en almacén', 20),
          c('Existencia', 10),
          c('Unidad', 8),
          c('Mínimo', 8),
          c('Por pedir', 9),
          c('Instrumentos', 30),
          c('Notas', 30),
        ],
        filas: vista.map((r): Valor[] => [
          r.nombre,
          r.numeroParte,
          r.marca,
          r.ubicacion,
          r.existencia,
          r.unidad,
          r.minimo,
          porPedir(r) ? 'Sí' : 'No',
          r.instrumentos.map((id) => tags.get(id)?.tagISA ?? '').filter(Boolean).join(', '),
          r.notas,
        ]),
      },
      {
        nombre: 'Movimientos',
        columnas: [c('Fecha', 12), c('Refacción', 30), c('Tipo', 16), c('Cantidad', 9), c('Unidad', 8), c('Instrumento', 12), c('Quién', 18), c('Nota', 36)],
        filas: movimientos
          .filter((m) => !f.area || ids.has(m.refaccionId))
          .sort((a, b) => (a.fecha?.toMillis() ?? 0) - (b.fecha?.toMillis() ?? 0))
          .map((m): Valor[] => [
            fecha(m.fecha),
            m.refaccionNombre,
            TIPOS_MOVIMIENTO[m.tipo] ?? m.tipo,
            m.cantidad,
            unidad.get(m.refaccionId) ?? '',
            m.tagISA ?? '',
            m.quien.nombre,
            m.nota,
          ]),
      },
    ],
  }
}

/** Todos los movimientos de refacciones, leídos una vez al abrir el reporte. */
function useTodosLosMovimientos(activo: boolean) {
  const [lista, setLista] = useState<Movimiento[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!activo) return
    let vivo = true
    getDocs(collection(db, 'movimientos'))
      .then((snap) => vivo && setLista(snap.docs.map((d) => ({ ...(d.data() as Movimiento), id: d.id }))))
      .catch((e: Error) => vivo && setError(e.message))
    return () => {
      vivo = false
    }
  }, [activo])
  return { lista, error }
}

/** Todas las calibraciones (son pocas), leídas una vez al abrir el reporte. */
function useTodasLasCalibraciones(activo: boolean) {
  const [lista, setLista] = useState<CalibracionConInstrumento[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!activo) return
    let vivo = true
    getDocs(collectionGroup(db, 'calibraciones'))
      .then((snap) => {
        if (vivo) setLista(snap.docs.map((d) => ({ ...aCalibracion(d.id, d.data(), false), instrumentoId: d.ref.parent.parent!.id })))
      })
      .catch((e: Error) => vivo && setError(e.message))
    return () => {
      vivo = false
    }
  }, [activo])
  return { lista, error }
}

/** Arma el reporte con los datos de la caché del teléfono (y las calibraciones del servidor o la caché). */
export function useReporte(tipo: TipoReporte, filtros: Filtros): { reporte: Reporte | null; error: string } {
  const instrumentos = useInstrumentos()
  const fallas = useFallas()
  const cals = useTodasLasCalibraciones(tipo === 'calibraciones')
  const refacciones = useRefacciones()
  const movs = useTodosLosMovimientos(tipo === 'refacciones')
  const reporte = useMemo(() => {
    if (tipo === 'instrumentos') return instrumentos && reporteInstrumentos(instrumentos, filtros)
    if (tipo === 'fallas') return fallas && reporteFallas(fallas, filtros)
    if (tipo === 'refacciones') return refacciones && movs.lista && instrumentos && reporteRefacciones(refacciones, movs.lista, instrumentos, filtros)
    return cals.lista && instrumentos && reporteCalibraciones(cals.lista, instrumentos, filtros)
  }, [tipo, filtros, instrumentos, fallas, cals.lista, refacciones, movs.lista])
  return { reporte, error: cals.error || movs.error }
}

export function textoCelda(v: Valor): string {
  if (v === null || v === '') return ''
  if (v instanceof Date) return v.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return String(v)
}

export function describirFiltros(tipo: TipoReporte, f: Filtros): string {
  const partes = [f.area || 'Todas las áreas']
  if (TIPOS_REPORTE[tipo].conPeriodo) {
    const d = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('es-MX', { dateStyle: 'medium' })
    partes.push(`del ${d(f.desde)} al ${d(f.hasta)}`)
  }
  return partes.join(' · ')
}

/** Excel guarda fechas sin zona horaria: se pasa la hora local para que no cambie el día. */
const horaLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000)

/** Descarga el reporte como .xlsx (la librería se carga solo al exportar). */
export async function descargarExcel(r: Reporte, nombreArchivo: string) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const hojas = r.hojas.map((h) => ({
    sheet: h.nombre.slice(0, 31),
    stickyRowsCount: 1,
    columns: h.columnas.map((col) => ({ width: col.ancho })),
    data: [
      h.columnas.map((col) => ({ value: col.titulo, fontWeight: 'bold' as const })),
      ...h.filas.map((fila) => fila.map((v) => (v instanceof Date ? { value: horaLocal(v), type: Date, format: 'dd/mm/yyyy' } : v === '' ? null : v))),
    ],
  }))
  await writeXlsxFile(hojas).toFile(nombreArchivo)
}
