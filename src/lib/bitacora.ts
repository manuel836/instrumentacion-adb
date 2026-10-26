import { useCallback, useEffect, useState } from 'react'
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { Persona } from '../types'

export type ColeccionBitacora = 'instrumentos' | 'ubicacion' | 'calibraciones' | 'fallas' | 'usuarios' | 'refacciones'

export interface EntradaBitacora {
  id: string
  /** null cuando el cambio lo hizo el sistema (Cloud Functions). */
  usuario: Persona | null
  coleccion: ColeccionBitacora
  docId: string
  ruta: string
  instrumentoId: string | null
  etiqueta: string
  accion: 'crear' | 'editar' | 'borrar'
  antes: Record<string, unknown>
  despues: Record<string, unknown>
  fecha: Timestamp | null
}

const col = collection(db, 'auditoria')
const POR_PAGINA = 100

function aEntrada(d: QueryDocumentSnapshot): EntradaBitacora {
  const x = d.data({ serverTimestamps: 'estimate' })
  return { antes: {}, despues: {}, instrumentoId: null, usuario: null, ...x, id: d.id } as EntradaBitacora
}

/** Bitácora completa, de lo más reciente a lo más viejo, por páginas. */
export function useBitacora() {
  const [entradas, setEntradas] = useState<EntradaBitacora[] | null>(null)
  const [mas, setMas] = useState<EntradaBitacora[]>([])
  const [ultimo, setUltimo] = useState<QueryDocumentSnapshot | null>(null)
  const [hayMas, setHayMas] = useState(false)
  const [cargando, setCargando] = useState(false)

  useEffect(
    () =>
      onSnapshot(query(col, orderBy('fecha', 'desc'), limit(POR_PAGINA)), (snap) => {
        setEntradas(snap.docs.map(aEntrada))
        setUltimo(snap.docs.at(-1) ?? null)
        setHayMas(snap.size === POR_PAGINA)
        setMas([])
      }),
    [],
  )

  const cargarMas = useCallback(async () => {
    if (!ultimo) return
    setCargando(true)
    try {
      const snap = await getDocs(query(col, orderBy('fecha', 'desc'), startAfter(ultimo), limit(POR_PAGINA)))
      setMas((m) => [...m, ...snap.docs.map(aEntrada)])
      setUltimo(snap.docs.at(-1) ?? null)
      setHayMas(snap.size === POR_PAGINA)
    } finally {
      setCargando(false)
    }
  }, [ultimo])

  return { entradas: entradas && [...entradas, ...mas], hayMas, cargando, cargarMas }
}

/** Historial de cambios de un instrumento (sus datos, fotos, calibraciones y fallas). */
export function useBitacoraDeInstrumento(instrumentoId: string) {
  const [entradas, setEntradas] = useState<EntradaBitacora[] | null>(null)
  useEffect(
    () =>
      onSnapshot(query(col, where('instrumentoId', '==', instrumentoId)), (snap) =>
        setEntradas(
          snap.docs
            .map(aEntrada)
            .sort((a, b) => (b.fecha?.toMillis() ?? Date.now()) - (a.fecha?.toMillis() ?? Date.now())),
        ),
      ),
    [instrumentoId],
  )
  return entradas
}

export const NOMBRE_COLECCION: Record<ColeccionBitacora, string> = {
  instrumentos: 'Instrumento',
  ubicacion: 'Foto de ubicación',
  calibraciones: 'Calibración',
  fallas: 'Falla',
  usuarios: 'Usuario',
  refacciones: 'Refacción',
}

export const NOMBRE_ACCION = { crear: 'Alta', editar: 'Edición', borrar: 'Baja' } as const

const CAMPOS: Record<string, string> = {
  tagISA: 'Tag ISA',
  lazo: 'Lazo',
  servicio: 'Servicio',
  area: 'Área',
  ubicacionTexto: 'Ubicación',
  pid: 'P&ID',
  marca: 'Marca',
  modelo: 'Modelo',
  serie: 'Serie',
  rangoMin: 'Rango mínimo',
  rangoMax: 'Rango máximo',
  unidades: 'Unidades',
  senal: 'Señal',
  alimentacion: 'Alimentación',
  nfcToken: 'Tag NFC',
  estado: 'Estado',
  subArea: 'Sub área',
  disparaCaldera: 'Puede disparar la caldera',
  notaDisparo: 'Precauciones de disparo',
  proximaCalibracion: 'Próxima calibración',
  docs: 'Documentos',
  pie: 'Pie de foto',
  orden: 'Orden',
  esPortada: 'Portada',
  autor: 'Autor',
  fecha: 'Fecha',
  tecnico: 'Técnico',
  puntos: 'Puntos (entrada: As-Found / As-Left)',
  tolerancia: 'Tolerancia (± % span)',
  patron: 'Patrón',
  resultado: 'Resultado',
  observaciones: 'Observaciones',
  proxima: 'Próxima',
  reportadoPor: 'Reportó',
  tecnicoAsignado: 'Técnico asignado',
  descripcion: 'Descripción',
  fotos: 'Fotos',
  causaRaiz: 'Causa raíz',
  accionCorrectiva: 'Acción correctiva',
  nombre: 'Nombre',
  email: 'Correo',
  rol: 'Rol',
  activo: 'Activo',
  contrasena: 'Contraseña',
  calibraciones: 'Calibraciones',
  fallasBorradas: 'Fallas (con su chat)',
  numeroParte: 'Número de parte',
  ubicacion: 'Ubicación en almacén',
  unidad: 'Unidad',
  minimo: 'Mínimo',
  instrumentos: 'Instrumentos compatibles',
  notas: 'Notas',
}

export const nombreCampo = (c: string) => CAMPOS[c] ?? c

/** Valor legible: fechas, sí/no y vacíos. */
export function textoValor(campo: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (typeof v === 'object' && 'toDate' in v && typeof (v as Timestamp).toDate === 'function') {
    return (v as Timestamp).toDate().toLocaleDateString('es-MX', { dateStyle: 'medium' })
  }
  // El token del tag no aporta nada a la vista; basta con saber si cambió.
  if (campo === 'nfcToken') return 'grabado'
  return String(v)
}
