import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

// Lo que se va escribiendo en un formulario se guarda en el teléfono. Si Android cierra
// Chrome mientras la cámara está abierta, si la app se recarga o si se toca "atrás" por
// error, al volver a esa pantalla lo escrito sigue ahí (fotos incluidas).

export interface Borrador<T = unknown> {
  clave: string
  datos: T
  guardado: number
}

interface BorradoresDB extends DBSchema {
  borradores: { key: string; value: Borrador }
}

/** Un borrador de hace más de una semana ya no sirve: se tira. */
const VIGENCIA = 7 * 24 * 3_600_000

let dbPromise: Promise<IDBPDatabase<BorradoresDB>> | null = null
function abrir() {
  dbPromise ??= openDB<BorradoresDB>('borradores', 1, {
    upgrade(d) {
      d.createObjectStore('borradores', { keyPath: 'clave' })
    },
  })
  return dbPromise
}

export async function leerBorrador<T>(clave: string): Promise<Borrador<T> | null> {
  const d = await abrir()
  const b = (await d.get('borradores', clave)) as Borrador<T> | undefined
  if (!b) return null
  if (Date.now() - b.guardado > VIGENCIA) {
    await d.delete('borradores', clave)
    return null
  }
  return b
}

export async function guardarBorrador(clave: string, datos: unknown): Promise<void> {
  await (await abrir()).put('borradores', { clave, datos, guardado: Date.now() })
}

export async function borrarBorrador(clave: string): Promise<void> {
  await (await abrir()).delete('borradores', clave)
}

// ---------- Capturas en curso ----------
// Mientras alguien escribe en un formulario, una versión nueva de la app espera para
// recargarse (ver main.tsx).

const enCurso = new Set<string>()
const oyentes = new Set<() => void>()

export function marcarCaptura(clave: string, activa: boolean) {
  const antes = enCurso.size
  if (activa) enCurso.add(clave)
  else enCurso.delete(clave)
  if (enCurso.size !== antes) oyentes.forEach((o) => o())
}

export function hayCaptura(): boolean {
  return enCurso.size > 0
}

export function suscribirCapturas(o: () => void): () => void {
  oyentes.add(o)
  return () => oyentes.delete(o)
}
