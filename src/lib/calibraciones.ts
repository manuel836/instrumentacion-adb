import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import type { Calibracion } from '../types'
import type { ConPendiente } from './instrumentos'

const colCalibraciones = (instrumentoId: string) => collection(db, 'instrumentos', instrumentoId, 'calibraciones')

function aCalibracion(id: string, d: Record<string, unknown>, pendiente: boolean): ConPendiente<Calibracion> {
  const c = d as Partial<Calibracion>
  return {
    ...(c as Calibracion),
    patron: c.patron ?? '',
    observaciones: c.observaciones ?? '',
    proxima: c.proxima ?? null,
    unidades: c.unidades ?? '',
    puntos: c.puntos ?? [],
    id,
    sinSincronizar: pendiente,
  }
}

/** Calibraciones del instrumento, de la más reciente a la más vieja. */
export function useCalibraciones(instrumentoId: string | undefined) {
  const [lista, setLista] = useState<ConPendiente<Calibracion>[] | null>(null)
  useEffect(() => {
    if (!instrumentoId) return
    return onSnapshot(query(colCalibraciones(instrumentoId), orderBy('fecha', 'desc')), { includeMetadataChanges: true }, (snap) =>
      setLista(snap.docs.map((d) => aCalibracion(d.id, d.data(), d.metadata.hasPendingWrites))),
    )
  }, [instrumentoId])
  return lista
}

export function useCalibracion(instrumentoId: string | undefined, id: string | undefined) {
  const [cal, setCal] = useState<ConPendiente<Calibracion> | null | undefined>(undefined)
  useEffect(() => {
    if (!instrumentoId || !id) return
    return onSnapshot(doc(colCalibraciones(instrumentoId), id), { includeMetadataChanges: true }, (s) =>
      setCal(s.exists() ? aCalibracion(s.id, s.data(), s.metadata.hasPendingWrites) : null),
    )
  }, [instrumentoId, id])
  return cal
}

/**
 * Guarda la calibración y, si es la más reciente, pasa su fecha de próxima
 * calibración a la ficha. Sin señal ambas escrituras esperan juntas en el teléfono.
 */
export function registrarCalibracion(instrumentoId: string, datos: Omit<Calibracion, 'id'>, esLaMasReciente: boolean): string {
  const ref_ = doc(colCalibraciones(instrumentoId))
  const lote = writeBatch(db)
  lote.set(ref_, { ...datos, creada: serverTimestamp() })
  if (esLaMasReciente) lote.update(doc(db, 'instrumentos', instrumentoId), { proximaCalibracion: datos.proxima })
  void lote.commit()
  return ref_.id
}
