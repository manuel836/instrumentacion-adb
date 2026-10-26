import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { deleteField, doc, getDocFromCache, runTransaction, updateDoc } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { MAX_BYTES_FOTO } from '../config'
import { db, storage } from '../firebase'
import { recodificar } from './images'

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
  /** Rechazos seguidos del servidor (permiso, tipo o tamaño), que no se arreglan con señal. */
  rechazos?: number
  /** El servidor la rechazó varias veces: ya no se reintenta sola, la persona decide. */
  detenida?: boolean
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

export interface EstadoCola {
  /** Todo lo que falta subir, incluidas las detenidas. */
  pendientes: number
  detenidas: number
}

type Oyente = (estado: EstadoCola) => void
const oyentes = new Set<Oyente>()

async function avisar() {
  const todas = await (await abrir()).getAll('subidas')
  const estado = { pendientes: todas.length, detenidas: todas.filter((s) => s.detenida).length }
  oyentes.forEach((o) => o(estado))
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

/** Quita de la cola un archivo que ya no hace falta subir. */
export async function descartarRuta(ruta: string): Promise<void> {
  const d = await abrir()
  const keys = await d.getAllKeysFromIndex('subidas', 'ruta', ruta)
  await Promise.all(keys.map((k) => d.delete('subidas', k)))
  await avisar()
}

/** Las subidas que el servidor rechazó, para que la persona las reintente o las descarte. */
export async function subidasDetenidas(): Promise<Subida[]> {
  return (await (await abrir()).getAll('subidas')).filter((s) => s.detenida)
}

/** Descarta una subida detenida: el archivo no llegará a los demás teléfonos. */
export async function descartarSubida(id: string): Promise<void> {
  await (await abrir()).delete('subidas', id)
  await avisar()
}

/** Vuelve a intentar las subidas detenidas. */
export async function reintentarDetenidas(): Promise<void> {
  const d = await abrir()
  for (const s of await d.getAll('subidas')) {
    if (s.detenida) await d.put('subidas', { ...s, detenida: false, rechazos: 0 })
  }
  await avisar()
  fallasSeguidas = 0
  await vaciarCola()
}

/** Quita de la cola todo lo que va dentro de una carpeta (una falla eliminada con su chat). */
export async function descartarDePrefijo(prefijo: string): Promise<void> {
  const d = await abrir()
  const todas = await d.getAll('subidas')
  await Promise.all(todas.filter((s) => s.ruta.startsWith(prefijo)).map((s) => d.delete('subidas', s.id)))
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
      if (!snap.exists()) {
        // La transacción lee del servidor. Si el mensaje acaba de escribirse (o se escribió sin
        // señal) puede no haber llegado aún: se reintenta. Si no, se borró y la subida sobra.
        const local = await getDocFromCache(ref_).catch(() => null)
        if (local?.metadata.hasPendingWrites) throw new Error('El documento aún no llega al servidor')
        return
      }
      const arr = ((snap.get(campo) as Record<string, unknown>[] | undefined) ?? []).map((x) =>
        x[clave] === s.ruta ? { ...x, [campoUrl]: url } : x,
      )
      tx.update(ref_, { [campo]: arr })
    })
  }
}

/**
 * Antes de este arreglo el iPhone guardaba las fotos como PNG (Safari no sabe hacer WebP)
 * y Storage las rechazaba por tipo o por tamaño. Se vuelven a codificar aquí y se guardan
 * así en la cola, para no repetir el trabajo si la subida falla por señal.
 */
async function prepararFoto(d: IDBPDatabase<ColaDB>, s: Subida): Promise<Subida> {
  const esFoto = s.contentType === 'image/webp' || s.contentType === 'image/jpeg'
  if (!esFoto || (s.blob.type === s.contentType && s.blob.size < MAX_BYTES_FOTO)) return s
  const { blob, tipo } = await recodificar(s.blob)
  const lista = { ...s, blob, contentType: tipo }
  await guardarSiSigue(d, lista)
  return lista
}

/** Guarda los cambios de una subida, salvo que la hayan descartado mientras se subía. */
async function guardarSiSigue(d: IDBPDatabase<ColaDB>, s: Subida) {
  const tx = d.transaction('subidas', 'readwrite')
  if (await tx.store.getKey(s.id)) await tx.store.put(s)
  await tx.done
}

/** Errores que no se arreglan reintentando: el servidor no acepta el archivo o el teléfono ya no lo puede leer. */
function esPermanente(err: unknown): boolean {
  if (err instanceof DOMException) return true
  const code = (err as { code?: string }).code ?? ''
  return ['storage/unauthorized', 'storage/invalid-argument', 'permission-denied', 'invalid-argument'].includes(code)
}
/** Con tantos rechazos seguidos del servidor una subida se detiene. */
const MAX_RECHAZOS = 3

let vaciando: Promise<void> | null = null
let reintento: ReturnType<typeof setTimeout> | null = null
let fallasSeguidas = 0
/** Algo se encoló mientras se subía lo anterior: hay que dar otra vuelta al terminar. */
let otraVuelta = false

/**
 * Si algo no se pudo subir (señal débil, o el documento cambió justo al anotar la URL),
 * se vuelve a intentar solo: a los 5 s, 10 s, 20 s… hasta cada 2 minutos.
 */
function programarReintento() {
  if (reintento) return
  const espera = Math.min(120_000, 5_000 * 2 ** fallasSeguidas)
  fallasSeguidas++
  reintento = setTimeout(() => {
    reintento = null
    void vaciarCola()
  }, espera)
}

export function vaciarCola(): Promise<void> {
  if (!navigator.onLine) return Promise.resolve()
  if (vaciando) {
    otraVuelta = true
    return vaciando
  }
  vaciando = (async () => {
    let fallaron = 0
    try {
      const d = await abrir()
      const todas = await d.getAll('subidas')
      todas.sort((a, b) => a.creado - b.creado)
      for (const s of todas) {
        if (!navigator.onLine) break
        // Una detenida no frena a las demás: se salta hasta que la persona la reintente.
        if (s.detenida) continue
        let actual = s
        try {
          actual = await prepararFoto(d, s)
          const r = ref(storage, actual.ruta)
          // Si un intento anterior alcanzó a subir el archivo y falló después (al anotar la URL),
          // no se vuelve a subir: las reglas no dejan reemplazar las fotos de fallas y chats.
          let url = actual.intentos > 0 ? await getDownloadURL(r).catch(() => null) : null
          if (!url) {
            // Se sube una copia en memoria: en el iPhone, un archivo leído de IndexedDB a veces no se envía.
            const datos = new Uint8Array(await actual.blob.arrayBuffer())
            await uploadBytes(r, datos, { contentType: actual.contentType, cacheControl: 'public, max-age=31536000' })
            url = await getDownloadURL(r)
          }
          await aplicarDestino(actual, url)
          await d.delete('subidas', actual.id)
          const quedan = await d.countFromIndex('subidas', 'docPath', actual.destino.docPath)
          if (quedan === 0 && actual.destino.tipo === 'campo') {
            await updateDoc(doc(db, actual.destino.docPath), { pendiente: deleteField() }).catch(() => undefined)
          }
        } catch (err) {
          // El documento destino ya no existe (se borró la foto): la subida sobra.
          if ((err as { code?: string }).code === 'not-found') {
            await d.delete('subidas', actual.id)
            continue
          }
          const rechazos = esPermanente(err) ? (actual.rechazos ?? 0) + 1 : 0
          const detenida = rechazos >= MAX_RECHAZOS
          if (!detenida) fallaron++
          await guardarSiSigue(d, { ...actual, intentos: actual.intentos + 1, rechazos, error: String(err), detenida })
        }
        await avisar()
      }
    } finally {
      vaciando = null
    }
    if (fallaron > 0) programarReintento()
    else fallasSeguidas = 0
    if (otraVuelta) {
      otraVuelta = false
      await vaciarCola()
    }
  })()
  return vaciando
}

export function iniciarCola() {
  window.addEventListener('online', () => void vaciarCola())
  void vaciarCola()
}
