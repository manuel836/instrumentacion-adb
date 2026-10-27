import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import type { Calibracion, InstrumentoNuevo } from '../types'
import type { ConPendiente } from './instrumentos'

const colCalibraciones = (instrumentoId: string) => collection(db, 'instrumentos', instrumentoId, 'calibraciones')

/** Cómo quedan los datos de tipo en una calibración general (y en todas las de antes). */
const SIN_TIPO = {
  tipo: '',
  lecturaEn: 'unidades',
  toleranciaEn: '%',
  senalInvertida: false,
  disparaAl: '',
  reposicion: null,
  revisiones: [],
  tiempoApertura: null,
  tiempoCierre: null,
  pendiente: null,
  offset: null,
} satisfies Partial<Calibracion>

export function aCalibracion(id: string, d: Record<string, unknown>, pendiente: boolean): ConPendiente<Calibracion> {
  const c = d as Partial<Calibracion>
  return {
    ...SIN_TIPO,
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
 * calibración a la ficha, junto con los datos de la ficha que se llenaron al calibrar
 * (el tipo o el punto de ajuste, si no los tenía). Sin señal todo espera junto en el teléfono.
 */
export function registrarCalibracion(
  instrumentoId: string,
  datos: Omit<Calibracion, 'id'>,
  esLaMasReciente: boolean,
  paraLaFicha: Partial<InstrumentoNuevo> = {},
): string {
  const ref_ = doc(colCalibraciones(instrumentoId))
  const lote = writeBatch(db)
  // Lo que no aplica a su tipo no se guarda: así la bitácora solo anota lo que se capturó.
  const propios = Object.fromEntries(
    Object.entries(datos).filter(([k, v]) => !(k in SIN_TIPO) || JSON.stringify(v) !== JSON.stringify(SIN_TIPO[k as keyof typeof SIN_TIPO])),
  )
  lote.set(ref_, { ...propios, creada: serverTimestamp() })
  const ficha = { ...paraLaFicha, ...(esLaMasReciente ? { proximaCalibracion: datos.proxima } : {}) }
  if (Object.keys(ficha).length) lote.update(doc(db, 'instrumentos', instrumentoId), ficha)
  void lote.commit()
  return ref_.id
}
