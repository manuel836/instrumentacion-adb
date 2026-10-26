import { FieldValue, getFirestore, Timestamp, type DocumentData } from 'firebase-admin/firestore'
import { onDocumentWrittenWithAuthContext, type Change, type DocumentSnapshot, type FirestoreAuthEvent } from 'firebase-functions/v2/firestore'

// Bitácora de cambios: quién, qué, cuándo, valor anterior y nuevo. Solo la escriben
// estas Functions (las reglas niegan cualquier escritura de usuarios en auditoria/).

// Se pide al usarla: este módulo se carga antes de initializeApp().
const db = () => getFirestore()

export interface Persona {
  uid: string
  nombre: string
}

type Coleccion = 'instrumentos' | 'ubicacion' | 'calibraciones' | 'fallas' | 'usuarios'
type Accion = 'crear' | 'editar' | 'borrar'

interface Entrada {
  usuario: Persona | null
  coleccion: Coleccion
  docId: string
  ruta: string
  instrumentoId: string | null
  etiqueta: string
  accion: Accion
  antes: Record<string, unknown>
  despues: Record<string, unknown>
}

/** true si el instrumento se está borrando completo (lo marca la función borrarInstrumento). */
export async function enBorrado(instrumentoId: string | null): Promise<boolean> {
  if (!instrumentoId) return false
  return (await db().doc(`borrados/${instrumentoId}`).get()).exists
}

export async function registrar(e: Entrada) {
  await db().collection('auditoria').add({ ...e, fecha: FieldValue.serverTimestamp() })
}

/** Campos que mantiene el sistema o que solo completan URLs de archivos: no son ediciones. */
const IGNORADOS = new Set([
  'actualizado',
  'portadaMiniatura',
  'pendiente',
  'creada',
  'fechas',
  'tokensFCM',
  'rolActualizado',
  'url',
  'miniaturaUrl',
  'miniatura',
  'ruta',
  'instrumentoId',
])

const esPersona = (v: unknown): v is Persona =>
  typeof v === 'object' && v !== null && 'uid' in v && 'nombre' in v && Object.keys(v).length === 2

/** Convierte un valor a algo corto y legible para la bitácora. */
function resumir(campo: string, v: unknown): unknown {
  if (v === undefined) return null
  if (v instanceof Timestamp) return v
  if (esPersona(v)) return v.nombre
  if (Array.isArray(v)) {
    if (campo === 'docs') return v.map((d) => (d as { nombre?: string }).nombre ?? '').join(', ')
    if (campo === 'fotos') return v.length === 0 ? '' : `${v.length} ${v.length === 1 ? 'foto' : 'fotos'}`
    if (campo === 'puntos')
      return v
        .map((p) => {
          const x = p as { entrada: number; asFound: number | null; asLeft: number | null }
          return `${x.entrada}: ${x.asFound ?? '—'} / ${x.asLeft ?? '—'}`
        })
        .join('; ')
    return v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ')
  }
  if (typeof v === 'object' && v !== null) return JSON.stringify(v)
  return v
}

/** Clave estable para comparar valores (los Timestamp por su instante). */
function clave(v: unknown): string {
  if (v instanceof Timestamp) return `ts:${v.toMillis()}`
  return JSON.stringify(v ?? null)
}

const vacio = (v: unknown) => v === null || v === '' || (Array.isArray(v) && v.length === 0)

/** Campos que cambiaron entre dos versiones, ya resumidos. */
export function diferencias(antes: DocumentData | undefined, despues: DocumentData | undefined) {
  const a: Record<string, unknown> = {}
  const d: Record<string, unknown> = {}
  const campos = new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})])
  for (const c of campos) {
    if (IGNORADOS.has(c)) continue
    const va = resumir(c, antes?.[c])
    const vd = resumir(c, despues?.[c])
    if (clave(va) === clave(vd)) continue
    // En altas y bajas solo se anotan los campos con valor.
    if (!antes && vacio(vd)) continue
    if (!despues && vacio(va)) continue
    if (antes) a[c] = va
    if (despues) d[c] = vd
  }
  return { antes: a, despues: d }
}

const nombres = new Map<string, string | null>()

/**
 * Quién hizo el cambio, según el contexto de autenticación del evento. Los cambios
 * hechos por las Functions quedan como "Sistema" (null). Si el usuario no se
 * reconoce, se usa la persona que el propio documento nombra (técnico, quien reporta).
 */
async function quien(ev: FirestoreAuthEvent<unknown>, pista: unknown): Promise<Persona | null> {
  const uid = ev.authId
  if (ev.authType === 'service_account' || ev.authType === 'system') return null
  if (uid && !nombres.has(uid)) {
    const u = await db().doc(`usuarios/${uid}`).get()
    nombres.set(uid, u.exists ? String(u.get('nombre') ?? u.get('email') ?? uid) : null)
  }
  const nombre = uid ? nombres.get(uid) : null
  if (uid && nombre) return { uid, nombre }
  if (esPersona(pista)) return pista
  return uid ? { uid, nombre: uid } : null
}

async function tagDe(instrumentoId: string, ...docs: (DocumentData | undefined)[]): Promise<string> {
  for (const d of docs) if (typeof d?.tagISA === 'string') return d.tagISA
  const inst = await db().doc(`instrumentos/${instrumentoId}`).get()
  return (inst.get('tagISA') as string | undefined) ?? '(borrado)'
}

async function auditar(
  ev: FirestoreAuthEvent<Change<DocumentSnapshot> | undefined>,
  coleccion: Coleccion,
  instrumentoId: string | null,
  etiqueta: (antes?: DocumentData, despues?: DocumentData) => Promise<string>,
) {
  const antes = ev.data?.before.exists ? ev.data.before.data() : undefined
  const despues = ev.data?.after.exists ? ev.data.after.data() : undefined
  if (!antes && !despues) return
  const cambios = diferencias(antes, despues)
  const accion: Accion = !antes ? 'crear' : !despues ? 'borrar' : 'editar'
  // Al borrar un instrumento completo, borrarInstrumento deja una sola entrada con el resumen.
  if (accion === 'borrar' && (await enBorrado(instrumentoId))) return
  if (accion === 'editar' && Object.keys(cambios.despues).length === 0) return
  const d = despues ?? antes
  const pista = d?.tecnico ?? (accion === 'crear' ? d?.reportadoPor : despues?.tecnicoAsignado)
  await registrar({
    usuario: await quien(ev, pista),
    coleccion,
    docId: ev.data!.after.id,
    ruta: ev.document,
    instrumentoId,
    etiqueta: await etiqueta(antes, despues),
    accion,
    ...cambios,
  })
}

export const auditarInstrumento = onDocumentWrittenWithAuthContext('instrumentos/{id}', (ev) =>
  auditar(ev, 'instrumentos', ev.params.id, (a, d) => tagDe(ev.params.id, d, a)),
)

export const auditarFotoUbicacion = onDocumentWrittenWithAuthContext('instrumentos/{id}/ubicacion/{fotoId}', (ev) =>
  auditar(ev, 'ubicacion', ev.params.id, () => tagDe(ev.params.id)),
)

export const auditarCalibracion = onDocumentWrittenWithAuthContext('instrumentos/{id}/calibraciones/{calId}', (ev) =>
  auditar(ev, 'calibraciones', ev.params.id, () => tagDe(ev.params.id)),
)

export const auditarFalla = onDocumentWrittenWithAuthContext('fallas/{id}', (ev) => {
  const d = ev.data?.after.data() ?? ev.data?.before.data()
  return auditar(ev, 'fallas', (d?.instrumentoId as string | undefined) ?? null, async () => (d?.tagISA as string | undefined) ?? '')
})

/** El admin cambia el área de un usuario directo en Firestore (sin función): se anota aquí. */
export const auditarAreaUsuario = onDocumentWrittenWithAuthContext('usuarios/{uid}', async (ev) => {
  const antes = ev.data?.before.data()
  const despues = ev.data?.after.data()
  if (!antes || !despues || (antes.area ?? '') === (despues.area ?? '')) return
  await registrar({
    usuario: await quien(ev, null),
    coleccion: 'usuarios',
    docId: ev.params.uid,
    ruta: ev.document,
    instrumentoId: null,
    etiqueta: String(despues.nombre ?? despues.email ?? ev.params.uid),
    accion: 'editar',
    antes: { area: antes.area || 'Todas' },
    despues: { area: despues.area || 'Todas' },
  })
})
