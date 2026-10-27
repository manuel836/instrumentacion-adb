import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, getDocFromServer, increment, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { vigilar } from './rechazos'
import type { Movimiento, Persona, Refaccion, RefaccionNueva, TipoMovimiento } from '../types'
import type { ConPendiente } from './instrumentos'

const colRefacciones = collection(db, 'refacciones')
const colMovimientos = collection(db, 'movimientos')

function aRefaccion(id: string, d: Record<string, unknown>, pendiente: boolean): ConPendiente<Refaccion> {
  const base = d as Partial<Refaccion>
  return {
    nombre: '',
    numeroParte: '',
    marca: '',
    ubicacion: '',
    unidad: 'pza',
    existencia: 0,
    minimo: 0,
    instrumentos: [],
    notas: '',
    ultimoMovimiento: null,
    ...base,
    id,
    sinSincronizar: pendiente,
  }
}

/** Todas las refacciones (son pocas): quedan en el teléfono para verlas sin señal. */
export function useRefacciones() {
  const [lista, setLista] = useState<ConPendiente<Refaccion>[] | null>(null)
  useEffect(
    () =>
      onSnapshot(query(colRefacciones, orderBy('nombre')), { includeMetadataChanges: true }, (snap) =>
        setLista(snap.docs.map((d) => aRefaccion(d.id, d.data(), d.metadata.hasPendingWrites))),
      ),
    [],
  )
  return lista
}

export function useRefaccion(id: string | undefined) {
  const [r, setR] = useState<ConPendiente<Refaccion> | null | undefined>(undefined)
  useEffect(() => {
    if (!id) return
    return onSnapshot(doc(colRefacciones, id), { includeMetadataChanges: true }, (s) =>
      setR(s.exists() ? aRefaccion(s.id, s.data(), s.metadata.hasPendingWrites) : null),
    )
  }, [id])
  return r
}

const cuando = (m: Movimiento) => m.fecha?.toMillis() ?? Number.MAX_SAFE_INTEGER

function useMovimientosDonde(campo: 'refaccionId' | 'fallaId', valor: string | undefined) {
  const [lista, setLista] = useState<ConPendiente<Movimiento>[] | null>(null)
  useEffect(() => {
    if (!valor) return
    return onSnapshot(query(colMovimientos, where(campo, '==', valor)), { includeMetadataChanges: true }, (snap) =>
      setLista(
        snap.docs
          .map((d) => ({ ...(d.data() as Movimiento), id: d.id, sinSincronizar: d.metadata.hasPendingWrites }))
          // Lo más reciente primero; lo que aún no sincroniza va hasta arriba.
          .sort((a, b) => cuando(b) - cuando(a)),
      ),
    )
  }, [campo, valor])
  return lista
}

/** Kardex de una refacción. */
export const useMovimientos = (refaccionId: string | undefined) => useMovimientosDonde('refaccionId', refaccionId)

/** Refacciones usadas en una falla. */
export const useMovimientosDeFalla = (fallaId: string | undefined) => useMovimientosDonde('fallaId', fallaId)

/** Sin existencia: ya no hay ninguna. */
export const sinExistencia = (r: Refaccion) => r.existencia <= 0
/** Por pedir: llegó al mínimo (si se definió uno). */
export const porPedir = (r: Refaccion) => r.minimo > 0 && r.existencia <= r.minimo

export const FILTROS_REFACCION = {
  'por-pedir': { texto: 'Por pedir', cumple: porPedir },
  'sin-existencia': { texto: 'Sin existencia', cumple: sinExistencia },
} as const
export type FiltroRefaccion = keyof typeof FILTROS_REFACCION

export interface DatosMovimiento {
  tipo: TipoMovimiento
  /** Con signo: positiva entra, negativa sale. */
  cantidad: number
  nota: string
  quien: Persona
  falla?: { id: string; instrumentoId: string; tagISA: string } | null
  instrumento?: { id: string; tagISA: string } | null
}

/**
 * El movimiento y el cambio de existencia van juntos: las reglas revisan que la
 * existencia cambie exactamente lo que dice el movimiento. Funciona sin señal.
 */
function agregarMovimiento(lote: ReturnType<typeof writeBatch>, refaccionId: string, refaccionNombre: string, m: DatosMovimiento) {
  const ref_ = doc(colMovimientos)
  lote.set(ref_, {
    refaccionId,
    refaccionNombre,
    tipo: m.tipo,
    cantidad: m.cantidad,
    nota: m.nota.trim(),
    quien: m.quien,
    fecha: serverTimestamp(),
    fallaId: m.falla?.id ?? null,
    instrumentoId: m.falla?.instrumentoId ?? m.instrumento?.id ?? null,
    tagISA: m.falla?.tagISA ?? m.instrumento?.tagISA ?? null,
  })
  return ref_.id
}

export function crearRefaccion(datos: RefaccionNueva, existenciaInicial: number, quien: Persona): string {
  const ref_ = doc(colRefacciones)
  const lote = writeBatch(db)
  let ultimoMovimiento: string | null = null
  if (existenciaInicial > 0) {
    ultimoMovimiento = agregarMovimiento(lote, ref_.id, datos.nombre, { tipo: 'entrada', cantidad: existenciaInicial, nota: 'Existencia inicial', quien })
  }
  lote.set(ref_, { ...datos, existencia: existenciaInicial, ultimoMovimiento, actualizado: serverTimestamp() })
  void lote.commit()
  return ref_.id
}

/** Cambia los datos de la refacción; la existencia solo cambia con movimientos. */
export function actualizarRefaccion(id: string, cambios: Partial<RefaccionNueva>) {
  void updateDoc(doc(colRefacciones, id), { ...cambios, actualizado: serverTimestamp() })
}

export function registrarMovimiento(r: Refaccion, m: DatosMovimiento) {
  const lote = writeBatch(db)
  const movId = agregarMovimiento(lote, r.id, r.nombre, m)
  lote.update(doc(colRefacciones, r.id), { existencia: increment(m.cantidad), ultimoMovimiento: movId, actualizado: serverTimestamp() })
  vigilar(lote.commit(), {
    docPath: `movimientos/${movId}`,
    titulo: `${m.tipo === 'entrada' ? 'Entrada' : m.tipo === 'salida' ? 'Salida' : 'Ajuste'} de ${r.nombre}`,
    texto: `Cantidad: ${Math.abs(m.cantidad)} ${r.unidad}${m.nota.trim() ? `\nNota: ${m.nota.trim()}` : ''}`,
    ruta: `/refacciones/${r.id}`,
    motivo: 'El servidor no aceptó el movimiento. Puede que la refacción se haya borrado mientras no había señal.',
  })
}

/**
 * Conteo físico: se lee la existencia del servidor (necesita señal) y se registra la
 * diferencia. Devuelve la diferencia (0 si ya cuadraba).
 */
export async function ajustarExistencia(r: Refaccion, contado: number, nota: string, quien: Persona): Promise<number> {
  const actual = ((await getDocFromServer(doc(colRefacciones, r.id))).get('existencia') as number | undefined) ?? 0
  const diferencia = contado - actual
  if (diferencia === 0) return 0
  const lote = writeBatch(db)
  const movId = agregarMovimiento(lote, r.id, r.nombre, { tipo: 'ajuste', cantidad: diferencia, nota: nota || `Conteo físico: ${contado}`, quien })
  lote.update(doc(colRefacciones, r.id), { existencia: increment(diferencia), ultimoMovimiento: movId, actualizado: serverTimestamp() })
  await lote.commit()
  return diferencia
}

export async function borrarRefaccion(id: string) {
  await deleteDoc(doc(colRefacciones, id))
}
