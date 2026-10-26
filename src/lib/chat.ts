import { useEffect, useState } from 'react'
import {
  Timestamp,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentReference,
  type WriteBatch,
} from 'firebase/firestore'
import { db } from '../firebase'
import { claveDia } from '../hooks/useHoy'
import type { FotoFalla, Mensaje, Persona } from '../types'
import { comprimirFoto } from './images'
import type { ConPendiente } from './instrumentos'
import { encolar } from './uploadQueue'

/** Canal general del equipo. */
export const CANAL_GENERAL = 'chat_general'
/** Hilo de chat de una falla. */
export const hiloDeFalla = (fallaId: string) => `fallas/${fallaId}/mensajes`
/** Chat privado entre dos personas: su id junta los dos uid en orden. */
export const idChatPrivado = (a: string, b: string) => [a, b].sort().join('_')
export const hiloPrivado = (chatId: string) => `chats_privados/${chatId}/mensajes`

export const MAX_FOTOS_MENSAJE = 4
const MAX_MENSAJES = 200

/**
 * Mensajes de un hilo, del más viejo al más nuevo. Los que se escribieron sin
 * señal aparecen al final con `sinSincronizar` hasta que el teléfono sincroniza.
 * Con `desde` solo llegan los de esa hora en adelante (el canal general muestra hoy);
 * con `desde` y `hasta`, un día completo del historial.
 */
export function useMensajes(ruta: string | null, desde?: Date, hasta?: Date) {
  const [lista, setLista] = useState<ConPendiente<Mensaje>[] | null>(null)
  const desdeMs = desde?.getTime()
  const hastaMs = hasta?.getTime()
  useEffect(() => {
    if (!ruta) return
    const col = collection(db, ruta)
    const q =
      desdeMs !== undefined && hastaMs !== undefined
        ? query(col, where('fecha', '>=', Timestamp.fromMillis(desdeMs)), where('fecha', '<', Timestamp.fromMillis(hastaMs)), orderBy('fecha', 'desc'))
        : query(col, orderBy('fecha', 'desc'), limit(MAX_MENSAJES))
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
              fecha: (m.fecha as Timestamp | undefined) ?? null,
              sinSincronizar: d.metadata.hasPendingWrites,
            }
          })
          // Lo escrito sin señal aún no tiene hora del servidor: se filtra aquí con la del teléfono.
          .filter((m) => desdeMs === undefined || (m.fecha?.toMillis() ?? Date.now()) >= desdeMs)
          .reverse(),
      ),
    )
  }, [ruta, desdeMs, hastaMs])
  return lista
}

/** Escrituras que van en el mismo lote que el mensaje (el resumen de un chat privado). */
export type Tambien = (lote: WriteBatch, mensaje: { ref: DocumentReference; texto: string; fotos: number }) => void

/** Envía un mensaje. Sin señal queda en el teléfono y las fotos en la cola local. */
export async function enviarMensaje(ruta: string, texto: string, archivos: Blob[], autor: Persona, tambien?: Tambien): Promise<void> {
  const ref_ = doc(collection(db, ruta))
  const comprimidas = await Promise.all(archivos.map((a) => comprimirFoto(a)))
  const base = `${ruta}/${ref_.id}`
  const fotos: FotoFalla[] = comprimidas.map((_, i) => ({
    ruta: `${base}/${i}.webp`,
    miniatura: `${base}/${i}_min.webp`,
    url: null,
    miniaturaUrl: null,
  }))
  const lote = writeBatch(db)
  lote.set(ref_, { autor, texto: texto.trim(), fotos, fecha: serverTimestamp() })
  tambien?.(lote, { ref: ref_, texto: texto.trim(), fotos: fotos.length })
  void lote.commit()
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

// ---------- Historial del canal general ----------

export interface DiaDelCanal {
  /** "2026-10-25" */
  clave: string
  fecha: Date
  mensajes: number
  personas: string[]
  /** El último mensaje del día, para reconocerlo en la lista. */
  ultimo: string
}

/**
 * Días anteriores a `antesDe` con mensajes en el canal general, el más reciente primero.
 * Lee los últimos `cuantos` mensajes; si hay más, el día más viejo (que puede venir
 * incompleto) se guarda para cuando se pidan más.
 */
export function useDiasDelCanal(antesDe: Date, cuantos: number) {
  const [r, setR] = useState<{ dias: DiaDelCanal[]; hayMas: boolean } | null>(null)
  const ms = antesDe.getTime()
  useEffect(() => {
    const q = query(collection(db, CANAL_GENERAL), where('fecha', '<', Timestamp.fromMillis(ms)), orderBy('fecha', 'desc'), limit(cuantos))
    return onSnapshot(q, (snap) => {
      const dias = new Map<string, DiaDelCanal>()
      for (const d of snap.docs) {
        const f = (d.get('fecha') as Timestamp | null)?.toDate()
        if (!f) continue
        const autor = (d.get('autor.nombre') as string | undefined) ?? ''
        const clave = claveDia(f)
        let dia = dias.get(clave)
        if (!dia) {
          const texto = (d.get('texto') as string | undefined) || 'Foto'
          dia = { clave, fecha: new Date(f.getFullYear(), f.getMonth(), f.getDate()), mensajes: 0, personas: [], ultimo: `${autor}: ${texto}` }
          dias.set(clave, dia)
        }
        dia.mensajes++
        if (autor && !dia.personas.includes(autor)) dia.personas.push(autor)
      }
      const lista = [...dias.values()]
      const hayMas = snap.size === cuantos
      setR({ dias: hayMas && lista.length > 1 ? lista.slice(0, -1) : lista, hayMas })
    })
  }, [ms, cuantos])
  return r
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
