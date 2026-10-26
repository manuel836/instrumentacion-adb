import { useEffect, useMemo, useRef, useState } from 'react'
import {
  collection,
  doc,
  getDocFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { Persona, Rol } from '../types'
import type { ConPendiente } from './instrumentos'
import { idChatPrivado, type Tambien } from './chat'

// Chats privados: cada conversación es un documento chats_privados/{uidA_uidB} con el
// último mensaje y hasta dónde leyó cada quien; los mensajes van en su subcolección.
// Solo las dos personas la pueden leer (ni el admin).

export interface ChatPrivado {
  id: string
  miembros: string[]
  nombres: Record<string, string>
  ultimo: { texto: string; autor: string; fecha: Timestamp | null } | null
  /** Hora en que cada quien lo vio por última vez. */
  leido: Record<string, Timestamp | null>
}

/** Quién está en la app (nombre, rol y área) para elegir con quién chatear. */
export interface Contacto {
  uid: string
  nombre: string
  rol: Rol
  area: string
  activo: boolean
}

const colChats = collection(db, 'chats_privados')

function aChat(id: string, d: Record<string, unknown>): ChatPrivado {
  return {
    id,
    miembros: (d.miembros as string[] | undefined) ?? id.split('_'),
    nombres: (d.nombres as Record<string, string> | undefined) ?? {},
    ultimo: (d.ultimo as ChatPrivado['ultimo'] | undefined) ?? null,
    leido: (d.leido as ChatPrivado['leido'] | undefined) ?? {},
  }
}

/** El otro integrante de la conversación. */
export const otroDe = (chat: Pick<ChatPrivado, 'miembros'>, yo: string) => chat.miembros.find((u) => u !== yo) ?? yo

/** Hay un mensaje del otro que aún no se ha visto. */
export function sinLeer(chat: ChatPrivado, yo: string): boolean {
  const u = chat.ultimo
  if (!u || u.autor === yo) return false
  const visto = chat.leido[yo]
  return !visto || (u.fecha?.toMillis() ?? 0) > visto.toMillis()
}

/** Mis conversaciones, la más reciente primero. */
export function useChatsPrivados(uid: string | undefined) {
  const [lista, setLista] = useState<ConPendiente<ChatPrivado>[] | null>(null)
  useEffect(() => {
    if (!uid) return
    return onSnapshot(query(colChats, where('miembros', 'array-contains', uid)), { includeMetadataChanges: true }, (snap) =>
      setLista(
        snap.docs
          .map((d) => ({ ...aChat(d.id, d.data({ serverTimestamps: 'estimate' })), sinSincronizar: d.metadata.hasPendingWrites }))
          .sort((a, b) => (b.ultimo?.fecha?.toMillis() ?? 0) - (a.ultimo?.fecha?.toMillis() ?? 0)),
      ),
    )
  }, [uid])
  return lista
}

/** Cuántas conversaciones tienen mensajes sin ver (para el globo del Chat). */
export function useNoLeidosPrivados(uid: string | undefined): number {
  const chats = useChatsPrivados(uid)
  return useMemo(() => (uid ? (chats ?? []).filter((c) => sinLeer(c, uid)).length : 0), [chats, uid])
}

export function useChatPrivado(chatId: string | null) {
  const [chat, setChat] = useState<ChatPrivado | null | undefined>(undefined)
  useEffect(() => {
    if (!chatId) return
    return onSnapshot(
      doc(colChats, chatId),
      (s) => setChat(s.exists() ? aChat(s.id, s.data({ serverTimestamps: 'estimate' })) : null),
      () => setChat(null),
    )
  }, [chatId])
  return chat
}

/** Mientras la conversación está abierta, lo que llega queda como visto. */
export function useMarcarLeido(chat: ChatPrivado | null | undefined, yo: string | undefined) {
  // Una sola escritura por mensaje nuevo, aunque la hora local y la del servidor no coincidan.
  const marcado = useRef<number | null>(null)
  useEffect(() => {
    if (!chat || !yo || !sinLeer(chat, yo)) return
    const ms = chat.ultimo?.fecha?.toMillis() ?? 0
    if (marcado.current === ms) return
    marcado.current = ms
    void updateDoc(doc(colChats, chat.id), { [`leido.${yo}`]: serverTimestamp() }).catch(() => undefined)
  }, [chat, yo])
}

/** Lo que se escribe junto con cada mensaje: el resumen de la conversación y que yo ya la vi. */
export function resumenDelChat(yo: Persona, otro: Persona): Tambien {
  const chatId = idChatPrivado(yo.uid, otro.uid)
  return (lote, m) =>
    lote.set(
      doc(colChats, chatId),
      {
        miembros: [yo.uid, otro.uid].sort(),
        nombres: { [yo.uid]: yo.nombre, [otro.uid]: otro.nombre },
        ultimo: { texto: m.texto.slice(0, 140) || (m.fotos > 0 ? 'Foto' : ''), autor: yo.uid, fecha: serverTimestamp() },
        leido: { [yo.uid]: serverTimestamp() },
      },
      { merge: true },
    )
}

// ---------- Directorio ----------

/** Personas activas de la app, por nombre (sin mí). Sale de la caché del teléfono sin señal. */
export function useDirectorio(yo: string | undefined) {
  const [lista, setLista] = useState<Contacto[] | null>(null)
  useEffect(
    () =>
      onSnapshot(collection(db, 'directorio'), (snap) =>
        setLista(
          snap.docs
            .map((d) => ({ uid: d.id, nombre: '', rol: 'operador' as Rol, area: '', activo: true, ...d.data() }) as Contacto)
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
        ),
      ),
    [],
  )
  return useMemo(() => lista?.filter((c) => c.uid !== yo), [lista, yo]) ?? null
}

/**
 * Las altas, bajas y cambios de rol los copia una Function al directorio. Quien ya tenía
 * cuenta antes de los chats privados se anota solo la primera vez que abre la app.
 */
export async function anotarEnDirectorio(uid: string, nombre: string, rol: Rol, area: string) {
  const ref_ = doc(db, 'directorio', uid)
  try {
    if ((await getDocFromServer(ref_)).exists()) return
    await setDoc(ref_, { nombre, rol, area, activo: true })
  } catch {
    // Sin señal se intenta la próxima vez que se abra la app.
  }
}
