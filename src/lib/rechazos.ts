import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { doc, getDocFromCache, getDocFromServer, waitForPendingWrites } from 'firebase/firestore'
import { auth, db } from '../firebase'

// Lo que se guarda sin señal se queda en la caché de Firestore y se envía después. Si al
// llegar el servidor ya no lo acepta (otro técnico cerró la falla antes, el instrumento se
// borró), Firestore lo quita del teléfono sin avisar. Aquí se anota cada registro importante
// hasta que el servidor lo confirma; si lo rechaza, se guarda una copia para enseñarla.

type Valor = string | number | boolean | null

export interface Vigilado {
  id: string
  uid: string
  docPath: string
  /** Qué era, para mostrarlo si no llega: "Cierre de la falla de PT-101". */
  titulo: string
  /** Lo que la persona escribió, para que lo pueda copiar. */
  texto: string
  /** Dónde verlo en la app. */
  ruta: string
  /** Por qué pudo no llegar, en palabras de la planta. */
  motivo: string
  /**
   * Al revisarlo en otra sesión (la app se cerró antes de la respuesta), estos campos del
   * documento deben tener estos valores. Sin ellos basta con que el documento exista.
   */
  esperado?: Record<string, Valor>
  creado: number
}

export interface Rechazo extends Vigilado {
  rechazado: number
  error: string
}

interface RegistrosDB extends DBSchema {
  vigilados: { key: string; value: Vigilado; indexes: { uid: string } }
  rechazos: { key: string; value: Rechazo; indexes: { uid: string } }
}

let dbPromise: Promise<IDBPDatabase<RegistrosDB>> | null = null
function abrir() {
  dbPromise ??= openDB<RegistrosDB>('registros', 1, {
    upgrade(d) {
      d.createObjectStore('vigilados', { keyPath: 'id' }).createIndex('uid', 'uid')
      d.createObjectStore('rechazos', { keyPath: 'id' }).createIndex('uid', 'uid')
    },
  })
  return dbPromise
}

/** Lo anotado antes de esto es de una sesión anterior: su promesa ya no existe. */
const INICIO = Date.now()

/** Errores con los que el servidor dice que no (reintentar no lo arregla). */
const DEFINITIVOS = ['permission-denied', 'not-found', 'failed-precondition', 'invalid-argument', 'already-exists', 'out-of-range']

type Oyente = () => void
const oyentes = new Set<Oyente>()
const avisar = () => oyentes.forEach((o) => o())

/** Avisa cada vez que cambia lo pendiente o lo rechazado. */
export function suscribirRegistros(o: Oyente): () => void {
  oyentes.add(o)
  return () => oyentes.delete(o)
}

async function rechazar(d: IDBPDatabase<RegistrosDB>, v: Vigilado, error: string) {
  const tx = d.transaction(['vigilados', 'rechazos'], 'readwrite')
  await tx.objectStore('rechazos').put({ ...v, rechazado: Date.now(), error })
  await tx.objectStore('vigilados').delete(v.id)
  await tx.done
  avisar()
}

/**
 * Anota un registro hasta que el servidor lo confirme. No espera al servidor: la pantalla
 * sigue como siempre, sin señal también. La promesa termina cuando el registro ya quedó
 * guardado en el teléfono (unos milisegundos); desde ahí, cerrar la app ya no lo pierde.
 */
export function vigilar(escritura: Promise<unknown>, datos: Omit<Vigilado, 'id' | 'uid' | 'creado'>): Promise<void> {
  const uid = auth.currentUser?.uid
  if (!uid) return Promise.resolve()
  const v: Vigilado = { ...datos, id: crypto.randomUUID(), uid, creado: Date.now() }
  const anotado = abrir()
    .then(async (d) => {
      await d.put('vigilados', v)
      avisar()
      return d
    })
    .catch(() => null)
  escritura.then(
    async () => {
      const d = await anotado
      await d?.delete('vigilados', v.id)
      avisar()
    },
    async (err: unknown) => {
      const d = await anotado
      const code = (err as { code?: string }).code ?? ''
      // Otros errores (se canceló, otra cuenta entró): se revisa en el servidor la próxima vez.
      if (d && DEFINITIVOS.includes(code)) await rechazar(d, v, code)
    },
  )
  // Firestore atiende en orden: esta lectura corre después de guardar la escritura en la caché.
  const enTelefono = getDocFromCache(doc(db, datos.docPath)).catch(() => undefined)
  // Tope de 2 s: si el almacenamiento del teléfono se traba, la pantalla no se queda esperando.
  const tope = new Promise<void>((r) => setTimeout(r, 2000))
  return Promise.race([Promise.all([anotado, enTelefono]).then(() => undefined), tope])
}

/** Cuántos registros de esta persona aún no confirma el servidor. */
export async function sinConfirmar(uid: string): Promise<number> {
  return (await abrir()).countFromIndex('vigilados', 'uid', uid)
}

export async function rechazosDe(uid: string): Promise<Rechazo[]> {
  const lista = await (await abrir()).getAllFromIndex('rechazos', 'uid', uid)
  return lista.sort((a, b) => b.rechazado - a.rechazado)
}

/** La persona ya lo vio (y lo copió si le hacía falta). */
export async function descartarRechazo(id: string): Promise<void> {
  await (await abrir()).delete('rechazos', id)
  avisar()
}

const revisados = new Set<string>()

/**
 * Lo anotado en una sesión anterior (la app se cerró antes de que el servidor respondiera):
 * cuando el teléfono termina de enviar lo pendiente, se busca cada registro en el servidor.
 */
export async function revisarSesionesAnteriores(uid: string): Promise<void> {
  if (revisados.has(uid)) return
  revisados.add(uid)
  const d = await abrir()
  const viejos = (await d.getAllFromIndex('vigilados', 'uid', uid)).filter((v) => v.creado < INICIO)
  if (viejos.length === 0) return
  try {
    // Termina cuando el servidor respondió a todo lo pendiente (aceptado o no). Sin señal espera.
    await waitForPendingWrites(db)
  } catch {
    revisados.delete(uid)
    return
  }
  for (const v of viejos) {
    try {
      const snap = await getDocFromServer(doc(db, v.docPath))
      const llego = snap.exists() && Object.entries(v.esperado ?? {}).every(([k, valor]) => snap.get(k) === valor)
      if (llego) {
        await d.delete('vigilados', v.id)
        avisar()
      } else {
        const motivo = snap.exists() ? v.motivo : `${v.motivo} También pasa si la app se cerró justo al guardarlo.`
        await rechazar(d, { ...v, motivo }, snap.exists() ? 'cambio-distinto' : 'no-existe')
      }
    } catch {
      // Sin señal a medias: se revisa la próxima vez que abra la app.
      revisados.delete(uid)
    }
  }
}
