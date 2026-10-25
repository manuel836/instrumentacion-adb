import { useEffect, useMemo, useState } from 'react'
import { collectionGroup, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import type { Calibracion, Falla, Instrumento } from '../types'
import { useFallas } from './fallas'
import { useInstrumentos } from './instrumentos'
import { errorPct } from './tolerancia'

export type TipoReporte = 'instrumentos' | 'fallas' | 'calibraciones'

export const TIPOS_REPORTE: Record<TipoReporte, { titulo: string; descripcion: string; conPeriodo: boolean }> = {
  instrumentos: { titulo: 'Listado de instrumentos', descripcion: 'Todos los datos de la ficha, estado y próxima calibración.', conPeriodo: false },
  fallas: { titulo: 'Fallas por periodo', descripcion: 'Reportadas en el periodo, con quién atendió, causa raíz y acción correctiva.', conPeriodo: true },
  calibraciones: { titulo: 'Calibraciones', descripcion: 'Registradas en el periodo, con resultado y puntos As-Found / As-Left.', conPeriodo: true },
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
      i.area,
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
      i.estado,
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
          c('Área', 24),
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
          c('Estado', 16),
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
    const errs = cal.puntos.map((p) => errorPct(p[k], p.entrada, cal.rangoMin, cal.rangoMax)).filter((e): e is number => e !== null)
    return errs.length ? redondear(Math.max(...errs.map(Math.abs))) : null
  }

  return {
    titulo: TIPOS_REPORTE.calibraciones.titulo,
    hojas: [
      {
        nombre: 'Calibraciones',
        columnas: [
          c('Tag ISA', 12),
          c('Área', 24),
          c('Fecha', 12),
          c('Técnico', 18),
          c('Resultado', 18),
          c('Rango', 16),
          c('Tolerancia ± %', 10),
          c('Error máx. As-Found %', 12),
          c('Error máx. As-Left %', 12),
          c('Patrón', 18),
          c('Próxima', 12),
          c('Observaciones', 36),
        ],
        filas: vista.map(({ cal, inst }): Valor[] => [
          inst!.tagISA,
          inst!.area,
          fecha(cal.fecha),
          cal.tecnico.nombre,
          cal.resultado,
          `${cal.rangoMin} a ${cal.rangoMax} ${cal.unidades}`.trim(),
          cal.tolerancia,
          maxError(cal, 'asFound'),
          maxError(cal, 'asLeft'),
          cal.patron,
          fecha(cal.proxima),
          cal.observaciones,
        ]),
      },
      {
        nombre: 'Puntos',
        columnas: [c('Tag ISA', 12), c('Fecha', 12), c('Entrada', 10), c('As-Found', 10), c('As-Left', 10), c('Error As-Found %', 12), c('Error As-Left %', 12)],
        filas: vista.flatMap(({ cal, inst }) =>
          cal.puntos.map((p): Valor[] => [
            inst!.tagISA,
            fecha(cal.fecha),
            p.entrada,
            num(p.asFound),
            num(p.asLeft),
            redondear(errorPct(p.asFound, p.entrada, cal.rangoMin, cal.rangoMax)),
            redondear(errorPct(p.asLeft, p.entrada, cal.rangoMin, cal.rangoMax)),
          ]),
        ),
      },
    ],
  }
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
        if (vivo) setLista(snap.docs.map((d) => ({ ...(d.data() as Calibracion), id: d.id, instrumentoId: d.ref.parent.parent!.id })))
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
  const reporte = useMemo(() => {
    if (tipo === 'instrumentos') return instrumentos && reporteInstrumentos(instrumentos, filtros)
    if (tipo === 'fallas') return fallas && reporteFallas(fallas, filtros)
    return cals.lista && instrumentos && reporteCalibraciones(cals.lista, instrumentos, filtros)
  }, [tipo, filtros, instrumentos, fallas, cals.lista])
  return { reporte, error: cals.error }
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
