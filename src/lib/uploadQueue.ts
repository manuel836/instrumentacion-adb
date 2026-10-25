import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { deleteField, doc, runTransaction, updateDoc } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from '../firebase'

// Firebase Storage no encola subidas sin señal, así que las fotos y documentos
// esperan aquí (IndexedDB) y se suben al recuperar la conexión.

type Destino =
  /** Escribe la URL en un campo del documento. */
  | { tipo: 'campo'; docPath: string; campo: string }
  /**
   * Escribe la URL en el elemento de un arreglo cuyo campo `clave` (por defecto
   * `ruta`) coincide con la ruta subida; la URL va en `campoUrl` (por defecto `url`).
   */
  | { tipo: 'arreglo'; docPath: string; campo: string; clave?: string; campoUrl?: string }

export interface Subida {
  id: string
  ruta: string
  blob: Blob
  contentType: string
  destino: Destino
  creado: number
  intentos: number
  error?: string
}

interface ColaDB extends DBSchema {
  subidas: { key: string; value: Subida; indexes: { ruta: string; docPath: string } }
}

let dbPromise: Promise<IDBPDatabase<ColaDB>> | null = null
function abrir() {
  dbPromise ??= openDB<ColaDB>('cola-subidas', 1, {
    upgrade(d) {
      const s = d.createObjectStore('subidas', { keyPath: 'id' })
      s.createIndex('ruta', 'ruta')
      s.createIndex('docPath', 'destino.docPath')
    },
  })
  return dbPromise
}

type Oyente = (pendientes: number) => void
const oyentes = new Set<Oyente>()

async function avisar() {
  const n = await (await abrir()).count('subidas')
  oyentes.forEach((o) => o(n))
}

export function suscribirPendientes(o: Oyente): () => void {
  oyentes.add(o)
  void avisar()
  return () => oyentes.delete(o)
}

export async function encolar(items: Omit<Subida, 'id' | 'creado' | 'intentos'>[]): Promise<void> {
  const d = await abrir()
  const tx = d.transaction('subidas', 'readwrite')
  for (const it of items) {
    await tx.store.put({ ...it, id: crypto.randomUUID(), creado: Date.now(), intentos: 0 })
  }
  await tx.done
  await avisar()
  void vaciarCola()
}

/** Blob local de un archivo que aún no se sube, para mostrarlo sin señal. */
export async function blobLocal(ruta: string): Promise<Blob | null> {
  const s = await (await abrir()).getFromIndex('subidas', 'ruta', ruta)
  return s?.blob ?? null
}

/** Quita de la cola lo que pertenece a un documento borrado. */
export async function descartarDeDocumento(docPath: string): Promise<void> {
  const d = await abrir()
  const keys = await d.getAllKeysFromIndex('subidas', 'docPath', docPath)
  await Promise.all(keys.map((k) => d.delete('subidas', k)))
  await avisar()
}

async function aplicarDestino(s: Subida, url: string) {
  const ref_ = doc(db, s.destino.docPath)
  if (s.destino.tipo === 'campo') {
    await updateDoc(ref_, { [s.destino.campo]: url })
  } else {
    const { campo, clave = 'ruta', campoUrl = 'url' } = s.destino
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref_)
      if (!snap.exists()) return
      const arr = ((snap.get(campo) as Record<string, unknown>[] | undefined) ?? []).map((x) =>
        x[clave] === s.ruta ? { ...x, [campoUrl]: url } : x,
      )
      tx.update(ref_, { [campo]: arr })
    })
  }
}

let vaciando: Promise<void> | null = null

export function vaciarCola(): Promise<void> {
  if (!navigator.onLine) return Promise.resolve()
  vaciando ??= (async () => {
    try {
      const d = await abrir()
      const todas = await d.getAll('subidas')
      todas.sort((a, b) => a.creado - b.creado)
      for (const s of todas) {
        if (!navigator.onLine) break
        try {
          const r = ref(storage, s.ruta)
          await uploadBytes(r, s.blob, { contentType: s.contentType, cacheControl: 'public, max-age=31536000' })
          const url = await getDownloadURL(r)
          await aplicarDestino(s, url)
          await d.delete('subidas', s.id)
          const quedan = await d.countFromIndex('subidas', 'docPath', s.destino.docPath)
          if (quedan === 0 && s.destino.tipo === 'campo') {
            await updateDoc(doc(db, s.destino.docPath), { pendiente: deleteField() }).catch(() => undefined)
          }
        } catch (err) {
          // El documento destino ya no existe (se borró la foto): la subida sobra.
          if ((err as { code?: string }).code === 'not-found') {
            await d.delete('subidas', s.id)
            continue
          }
          await d.put('subidas', { ...s, intentos: s.intentos + 1, error: String(err) })
        }
        await avisar()
      }
    } finally {
      vaciando = null
    }
  })()
  return vaciando
}

export function iniciarCola() {
  window.addEventListener('online', () => void vaciarCola())
  void vaciarCola()
}
