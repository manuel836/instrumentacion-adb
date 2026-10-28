import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore'
import { db } from '../firebase'
import type { Falla, FotoFalla, Instrumento, Persona } from '../types'
import { comprimirFoto } from './images'
import type { ConPendiente } from './instrumentos'
import { vigilar } from './rechazos'
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
    fechas: { creada: null, tomada: null, cerrada: null, enTelefono: null, ...(d.fechas as object) },
    id,
    sinSincronizar: pendiente,
  }
}

/** Hora real del reporte: la del teléfono si la tiene (sin señal, `creada` es la hora de llegada). */
export function horaDelReporte(f: Pick<Falla, 'fechas'>) {
  return f.fechas.enTelefono ?? f.fechas.creada
}

/** Tiempo promedio de cierre: minutos si fue menos de una hora (no "0.0 horas"), días si pasó de dos. */
export function duracionCierre(horas: number) {
  if (horas < 1) {
    const min = Math.max(1, Math.round(horas * 60))
    return `${min} ${min === 1 ? 'minuto' : 'minutos'}`
  }
  return horas < 48 ? `${horas.toFixed(1)} horas` : `${(horas / 24).toFixed(1)} días`
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
  const escritura = setDoc(ref_, {
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
    // `creada` es la hora en que llegó al servidor; sin señal puede ser horas después.
    // `enTelefono` guarda la hora real del reporte.
    fechas: { creada: serverTimestamp(), tomada: null, cerrada: null, enTelefono: Timestamp.now() },
  })
  // Se espera a que quede en el teléfono: la persona puede cerrar la app en cuanto ve "Reportada".
  await vigilar(escritura, {
    docPath: ref_.path,
    titulo: `Reporte de falla de ${inst.tagISA}`,
    texto: descripcion.trim(),
    ruta: `/instrumentos/${inst.id}`,
    motivo: 'El servidor no aceptó el reporte. Puede que el instrumento se haya borrado mientras no había señal.',
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

export function tomarFalla(falla: Pick<Falla, 'id' | 'tagISA'>, tecnico: Persona) {
  const escritura = updateDoc(doc(db, 'fallas', falla.id), { estado: 'En proceso', tecnicoAsignado: tecnico, 'fechas.tomada': serverTimestamp() })
  vigilar(escritura, {
    docPath: `fallas/${falla.id}`,
    titulo: `Tomar la falla de ${falla.tagISA}`,
    texto: '',
    ruta: `/fallas/${falla.id}`,
    motivo: 'Otra persona ya la había tomado o cerrado antes de que tu teléfono tuviera señal.',
    esperado: { 'tecnicoAsignado.uid': tecnico.uid },
  })
}

export function cerrarFalla(falla: Pick<Falla, 'id' | 'tagISA'>, causaRaiz: string, accionCorrectiva: string, tecnico: Persona, yaAsignada: boolean) {
  const escritura = updateDoc(doc(db, 'fallas', falla.id), {
    estado: 'Cerrada',
    causaRaiz: causaRaiz.trim(),
    accionCorrectiva: accionCorrectiva.trim(),
    'fechas.cerrada': serverTimestamp(),
    // Cerrar sin haberla tomado la asigna a quien la cierra.
    ...(yaAsignada ? {} : { tecnicoAsignado: tecnico, 'fechas.tomada': serverTimestamp() }),
  })
  vigilar(escritura, {
    docPath: `fallas/${falla.id}`,
    titulo: `Cierre de la falla de ${falla.tagISA}`,
    texto: `Causa raíz: ${causaRaiz.trim()}\nAcción correctiva: ${accionCorrectiva.trim()}`,
    ruta: `/fallas/${falla.id}`,
    motivo: 'Otra persona la cerró antes de que tu teléfono tuviera señal, o el administrador la eliminó.',
    esperado: { estado: 'Cerrada', causaRaiz: causaRaiz.trim() },
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
