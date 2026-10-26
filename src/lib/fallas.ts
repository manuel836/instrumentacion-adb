import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { db } from '../firebase'
import type { Falla, FotoFalla, Instrumento, Persona } from '../types'
import { comprimirFoto } from './images'
import type { ConPendiente } from './instrumentos'
import { descartarDePrefijo, encolar } from './uploadQueue'

const colFallas = collection(db, 'fallas')

function aFalla(id: string, d: Record<string, unknown>, pendiente: boolean): ConPendiente<Falla> {
  const base: Partial<Falla> = d
  return {
    ...(base as Falla),
    fotos: base.fotos ?? [],
    causaRaiz: base.causaRaiz ?? '',
    accionCorrectiva: base.accionCorrectiva ?? '',
    tecnicoAsignado: base.tecnicoAsignado ?? null,
    fechas: { creada: null, tomada: null, cerrada: null, ...(d.fechas as object) },
    id,
    sinSincronizar: pendiente,
  }
}

/** Todas las fallas (son pocas): quedan en la caché del teléfono para verlas sin señal. */
export function useFallas() {
  const [lista, setLista] = useState<ConPendiente<Falla>[] | null>(null)
  useEffect(
    () =>
      onSnapshot(query(colFallas, orderBy('fechas.creada', 'desc')), { includeMetadataChanges: true }, (snap) =>
        setLista(snap.docs.map((d) => aFalla(d.id, d.data(), d.metadata.hasPendingWrites))),
      ),
    [],
  )
  return lista
}

export function useFallasDeInstrumento(instrumentoId: string | undefined) {
  const [lista, setLista] = useState<ConPendiente<Falla>[]>([])
  useEffect(() => {
    if (!instrumentoId) return
    return onSnapshot(query(colFallas, where('instrumentoId', '==', instrumentoId)), { includeMetadataChanges: true }, (snap) =>
      setLista(
        snap.docs
          .map((d) => aFalla(d.id, d.data(), d.metadata.hasPendingWrites))
          .sort((a, b) => (b.fechas.creada?.toMillis() ?? Date.now()) - (a.fechas.creada?.toMillis() ?? Date.now())),
      ),
    )
  }, [instrumentoId])
  return lista
}

export function useFalla(id: string | undefined) {
  const [falla, setFalla] = useState<ConPendiente<Falla> | null | undefined>(undefined)
  useEffect(() => {
    if (!id) return
    return onSnapshot(doc(db, 'fallas', id), { includeMetadataChanges: true }, (s) =>
      setFalla(s.exists() ? aFalla(s.id, s.data(), s.metadata.hasPendingWrites) : null),
    )
  }, [id])
  return falla
}

/**
 * Reporta una falla. Funciona sin señal: el documento queda en la caché y las
 * fotos en la cola local; el aviso a los técnicos sale cuando el teléfono sincroniza.
 */
export async function reportarFalla(inst: Instrumento, descripcion: string, archivos: Blob[], quien: Persona): Promise<string> {
  const ref_ = doc(colFallas)
  const comprimidas = await Promise.all(archivos.map((a) => comprimirFoto(a)))
  const fotos: FotoFalla[] = comprimidas.map((c, i) => ({
    ruta: `fallas/${ref_.id}/${i}.${c.ext}`,
    miniatura: `fallas/${ref_.id}/${i}_min.${c.ext}`,
    url: null,
    miniaturaUrl: null,
  }))
  void setDoc(ref_, {
    instrumentoId: inst.id,
    tagISA: inst.tagISA,
    area: inst.area,
    subArea: inst.subArea ?? '',
    estado: 'Abierta',
    reportadoPor: quien,
    tecnicoAsignado: null,
    descripcion: descripcion.trim(),
    fotos,
    causaRaiz: '',
    accionCorrectiva: '',
    fechas: { creada: serverTimestamp(), tomada: null, cerrada: null },
  })
  if (fotos.length > 0) {
    await encolar(
      comprimidas.flatMap((c, i) => [
        { ruta: fotos[i].ruta, blob: c.completa, contentType: c.tipo, destino: { tipo: 'arreglo' as const, docPath: ref_.path, campo: 'fotos' } },
        {
          ruta: fotos[i].miniatura,
          blob: c.miniatura,
          contentType: c.tipo,
          destino: { tipo: 'arreglo' as const, docPath: ref_.path, campo: 'fotos', clave: 'miniatura', campoUrl: 'miniaturaUrl' },
        },
      ]),
    )
  }
  return ref_.id
}

export function tomarFalla(id: string, tecnico: Persona) {
  void updateDoc(doc(db, 'fallas', id), { estado: 'En proceso', tecnicoAsignado: tecnico, 'fechas.tomada': serverTimestamp() })
}

export function cerrarFalla(id: string, causaRaiz: string, accionCorrectiva: string, tecnico: Persona, yaAsignada: boolean) {
  void updateDoc(doc(db, 'fallas', id), {
    estado: 'Cerrada',
    causaRaiz: causaRaiz.trim(),
    accionCorrectiva: accionCorrectiva.trim(),
    'fechas.cerrada': serverTimestamp(),
    // Cerrar sin haberla tomado la asigna a quien la cierra.
    ...(yaAsignada ? {} : { tecnicoAsignado: tecnico, 'fechas.tomada': serverTimestamp() }),
  })
}

/**
 * Elimina una falla reportada por error, en cualquier estado (solo admin). Desaparece
 * al momento en este teléfono; una Function borra después su chat y sus fotos y
 * regresa el instrumento a "Operando" si ya no le queda otra pendiente.
 */
export function borrarFalla(id: string): Promise<void> {
  // Lo que este teléfono aún no sube de esa falla (fotos del reporte o del chat) ya sobra.
  void descartarDePrefijo(`fallas/${id}/`)
  return deleteDoc(doc(db, 'fallas', id))
}
