import { useEffect, useState } from 'react'
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import type { FotoFalla, Mensaje, Persona } from '../types'
import { comprimirFoto } from './images'
import type { ConPendiente } from './instrumentos'
import { encolar } from './uploadQueue'

/** Canal general del equipo. */
export const CANAL_GENERAL = 'chat_general'
/** Hilo de chat de una falla. */
export const hiloDeFalla = (fallaId: string) => `fallas/${fallaId}/mensajes`

export const MAX_FOTOS_MENSAJE = 4
const MAX_MENSAJES = 200

/**
 * Mensajes de un hilo, del más viejo al más nuevo. Los que se escribieron sin
 * señal aparecen al final con `sinSincronizar` hasta que el teléfono sincroniza.
 */
export function useMensajes(ruta: string | null) {
  const [lista, setLista] = useState<ConPendiente<Mensaje>[] | null>(null)
  useEffect(() => {
    if (!ruta) return
    const q = query(collection(db, ruta), orderBy('fecha', 'desc'), limit(MAX_MENSAJES))
    return onSnapshot(q, { includeMetadataChanges: true }, (snap) =>
      setLista(
        snap.docs
          .map((d) => {
            const m = d.data({ serverTimestamps: 'estimate' })
            return {
              id: d.id,
              autor: m.autor as Persona,
              texto: (m.texto as string | undefined) ?? '',
              fotos: (m.fotos as FotoFalla[] | undefined) ?? [],
              fecha: m.fecha ?? null,
              sinSincronizar: d.metadata.hasPendingWrites,
            }
          })
          .reverse(),
      ),
    )
  }, [ruta])
  return lista
}

/** Envía un mensaje. Sin señal queda en el teléfono y las fotos en la cola local. */
export async function enviarMensaje(ruta: string, texto: string, archivos: Blob[], autor: Persona): Promise<void> {
  const ref_ = doc(collection(db, ruta))
  const comprimidas = await Promise.all(archivos.map((a) => comprimirFoto(a)))
  const base = `${ruta}/${ref_.id}`
  const fotos: FotoFalla[] = comprimidas.map((_, i) => ({
    ruta: `${base}/${i}.webp`,
    miniatura: `${base}/${i}_min.webp`,
    url: null,
    miniaturaUrl: null,
  }))
  void setDoc(ref_, { autor, texto: texto.trim(), fotos, fecha: serverTimestamp() })
  if (fotos.length > 0) {
    await encolar(
      comprimidas.flatMap((c, i) => [
        { ruta: fotos[i].ruta, blob: c.completa, contentType: 'image/webp', destino: { tipo: 'arreglo' as const, docPath: ref_.path, campo: 'fotos' } },
        {
          ruta: fotos[i].miniatura,
          blob: c.miniatura,
          contentType: 'image/webp',
          destino: { tipo: 'arreglo' as const, docPath: ref_.path, campo: 'fotos', clave: 'miniatura', campoUrl: 'miniaturaUrl' },
        },
      ]),
    )
  }
}

// ---------- Mensajes sin leer del canal general ----------

const CLAVE_LEIDO = 'chat-general-leido'
const EVENTO_LEIDO = 'chat-general-leido'

function leidoHasta(): number {
  try {
    const guardado = localStorage.getItem(CLAVE_LEIDO)
    if (guardado) return Number(guardado)
    // En un teléfono nuevo el historial anterior no cuenta como pendiente.
    localStorage.setItem(CLAVE_LEIDO, String(Date.now()))
  } catch {
    // Sin almacenamiento local se cuenta desde que se abrió la app.
  }
  return Date.now()
}

/** Marca el canal general como leído en este teléfono. */
export function marcarGeneralLeido() {
  try {
    localStorage.setItem(CLAVE_LEIDO, String(Date.now()))
  } catch {
    // Sin almacenamiento local el contador simplemente no se guarda.
  }
  window.dispatchEvent(new Event(EVENTO_LEIDO))
}

/** Cuántos mensajes de otros llegaron al canal general desde la última vez que se abrió. */
export function useNoLeidosGeneral(uid: string | undefined) {
  const [recientes, setRecientes] = useState<{ autor: string; ms: number }[]>([])
  const [leido, setLeido] = useState(leidoHasta)

  useEffect(() => {
    const al = () => setLeido(leidoHasta())
    window.addEventListener(EVENTO_LEIDO, al)
    return () => window.removeEventListener(EVENTO_LEIDO, al)
  }, [])

  useEffect(() => {
    if (!uid) return
    return onSnapshot(query(collection(db, CANAL_GENERAL), orderBy('fecha', 'desc'), limit(50)), (snap) =>
      setRecientes(
        snap.docs.map((d) => {
          const m = d.data({ serverTimestamps: 'estimate' })
          return { autor: (m.autor as Persona | undefined)?.uid ?? '', ms: m.fecha?.toMillis() ?? Date.now() }
        }),
      ),
    )
  }, [uid])

  return recientes.filter((m) => m.autor !== uid && m.ms > leido).length
}
