import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { setGlobalOptions } from 'firebase-functions/v2'
import { defineString } from 'firebase-functions/params'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'
import { onDocumentDeleted, onDocumentWritten } from 'firebase-functions/v2/firestore'

initializeApp()
setGlobalOptions({ region: 'us-central1', maxInstances: 5 })

const db = getFirestore()
const ROLES = ['admin', 'tecnico', 'operador'] as const
type Rol = (typeof ROLES)[number]

function exigirAdmin(req: CallableRequest) {
  if (req.auth?.token.rol !== 'admin') throw new HttpsError('permission-denied', 'Solo el administrador puede hacer esto.')
}

function exigirRol(rol: unknown): Rol {
  if (!ROLES.includes(rol as Rol)) throw new HttpsError('invalid-argument', 'Rol inválido.')
  return rol as Rol
}

function exigirTexto(v: unknown, campo: string): string {
  if (typeof v !== 'string' || !v.trim()) throw new HttpsError('invalid-argument', `Falta ${campo}.`)
  return v.trim()
}

// ---------- Usuarios y roles ----------

// Las funciones invocables son públicas a nivel de Cloud Run (cada una revisa el rol).
// Declararlo hace que cada despliegue vuelva a aplicar el permiso, no solo el primero.
const PUBLICA = { invoker: 'public' as const }

// Correo del administrador inicial. `firebase deploy` lo pregunta la primera vez y lo
// guarda en functions/.env.<proyecto> (no se sube al repositorio).
const ADMIN_INICIAL = defineString('ADMIN_INICIAL', {
  description: 'Correo del administrador inicial (el que creaste en Authentication)',
})

/** Convierte en admin a la cuenta de ADMIN_INICIAL, solo mientras no exista ningún admin. */
export const reclamarAdminInicial = onCall(PUBLICA, async (req) => {
  const email = (req.auth?.token.email ?? '').toLowerCase()
  const esperado = ADMIN_INICIAL.value().trim().toLowerCase()
  if (!req.auth || !email || !esperado || email !== esperado) {
    throw new HttpsError('permission-denied', 'Esta cuenta no es la del administrador inicial.')
  }
  const admins = await db.collection('usuarios').where('rol', '==', 'admin').limit(1).get()
  if (!admins.empty) throw new HttpsError('failed-precondition', 'Ya hay un administrador. Pídele que te asigne un rol.')
  await getAuth().setCustomUserClaims(req.auth.uid, { rol: 'admin' })
  await db.doc(`usuarios/${req.auth.uid}`).set(
    {
      nombre: req.auth.token.name ?? email,
      email,
      rol: 'admin',
      area: '',
      activo: true,
      tokensFCM: [],
      creado: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  return {}
})

export const crearUsuario = onCall(PUBLICA, async (req) => {
  exigirAdmin(req)
  const nombre = exigirTexto(req.data?.nombre, 'el nombre')
  const email = exigirTexto(req.data?.email, 'el correo').toLowerCase()
  const password = exigirTexto(req.data?.password, 'la contraseña')
  const rol = exigirRol(req.data?.rol)
  const area = typeof req.data?.area === 'string' ? req.data.area : ''
  if (password.length < 8) throw new HttpsError('invalid-argument', 'La contraseña debe tener al menos 8 caracteres.')

  const user = await getAuth()
    .createUser({ email, password, displayName: nombre })
    .catch((e: { code?: string }) => {
      if (e.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'Ese correo ya tiene usuario.')
      if (e.code === 'auth/invalid-email') throw new HttpsError('invalid-argument', 'El correo no es válido.')
      if (e.code === 'auth/invalid-password') throw new HttpsError('invalid-argument', 'La contraseña no es válida.')
      throw e
    })
  await getAuth().setCustomUserClaims(user.uid, { rol })
  await db.doc(`usuarios/${user.uid}`).set({ nombre, email, rol, area, activo: true, tokensFCM: [], creado: FieldValue.serverTimestamp() })
  return { uid: user.uid }
})

export const asignarRol = onCall(PUBLICA, async (req) => {
  exigirAdmin(req)
  const uid = exigirTexto(req.data?.uid, 'el usuario')
  const rol = exigirRol(req.data?.rol)
  if (uid === req.auth?.uid) throw new HttpsError('failed-precondition', 'No puedes cambiar tu propio rol.')
  await getAuth().setCustomUserClaims(uid, { rol })
  // rolActualizado avisa al teléfono del usuario que renueve su token para ver el rol nuevo.
  await db.doc(`usuarios/${uid}`).update({ rol, rolActualizado: FieldValue.serverTimestamp() })
  return {}
})

export const cambiarActivo = onCall(PUBLICA, async (req) => {
  exigirAdmin(req)
  const uid = exigirTexto(req.data?.uid, 'el usuario')
  const activo = req.data?.activo === true
  if (uid === req.auth?.uid) throw new HttpsError('failed-precondition', 'No puedes darte de baja a ti mismo.')
  await getAuth().updateUser(uid, { disabled: !activo })
  if (!activo) await getAuth().revokeRefreshTokens(uid)
  // El historial del usuario se conserva; solo se marca inactivo.
  await db.doc(`usuarios/${uid}`).update({ activo })
  return {}
})

export const revocarSesiones = onCall(PUBLICA, async (req) => {
  exigirAdmin(req)
  const uid = exigirTexto(req.data?.uid, 'el usuario')
  await getAuth().revokeRefreshTokens(uid)
  return {}
})

// ---------- Vista pública y portada ----------

interface Foto {
  url: string | null
  miniaturaUrl: string | null
  pie: string
  orden: number
  esPortada: boolean
}

/**
 * Recalcula la portada del instrumento y su documento publico/{nfcToken}
 * (solo datos no sensibles: tag, servicio, área, estado y fotos de ubicación).
 */
async function reconstruir(instrumentoId: string, tokenAnterior?: string | null) {
  const instRef = db.doc(`instrumentos/${instrumentoId}`)
  const [inst, fotosSnap] = await Promise.all([instRef.get(), instRef.collection('ubicacion').orderBy('orden').get()])

  if (tokenAnterior) await db.doc(`publico/${tokenAnterior}`).delete()
  if (!inst.exists) return

  const fotos = fotosSnap.docs.map((d) => d.data() as Foto)
  const portada = fotos.find((f) => f.esPortada) ?? fotos[0]
  const portadaMiniatura = portada?.miniaturaUrl ?? null
  if (inst.get('portadaMiniatura') !== portadaMiniatura) await instRef.update({ portadaMiniatura })

  const token = inst.get('nfcToken') as string | null
  if (!token) return
  await db.doc(`publico/${token}`).set({
    instrumentoId,
    tagISA: inst.get('tagISA') ?? '',
    servicio: inst.get('servicio') ?? '',
    area: inst.get('area') ?? '',
    estado: inst.get('estado') ?? '',
    ubicacionTexto: inst.get('ubicacionTexto') ?? '',
    fotosUbicacion: fotos.map((f) => ({ url: f.url ?? null, miniaturaUrl: f.miniaturaUrl ?? null, pie: f.pie ?? '', esPortada: !!f.esPortada })),
    actualizado: FieldValue.serverTimestamp(),
  })
}

const CAMPOS_PUBLICOS = ['tagISA', 'servicio', 'area', 'estado', 'ubicacionTexto', 'nfcToken']

export const alEscribirInstrumento = onDocumentWritten('instrumentos/{id}', async (ev) => {
  const antes = ev.data?.before.data()
  const despues = ev.data?.after.data()
  const tokenAntes = (antes?.nfcToken as string | null | undefined) ?? null
  const tokenDespues = (despues?.nfcToken as string | null | undefined) ?? null
  const cambioPublico = !antes || !despues || CAMPOS_PUBLICOS.some((k) => antes[k] !== despues[k])
  if (!cambioPublico) return
  // Al regrabar un tag el token anterior deja de funcionar.
  await reconstruir(ev.params.id, tokenAntes && tokenAntes !== tokenDespues ? tokenAntes : null)
})

export const alEscribirFotoUbicacion = onDocumentWritten('instrumentos/{id}/ubicacion/{fotoId}', async (ev) => {
  await reconstruir(ev.params.id)
})

export const alBorrarFotoUbicacion = onDocumentDeleted('instrumentos/{id}/ubicacion/{fotoId}', async (ev) => {
  const d = ev.data?.data()
  if (!d) return
  const bucket = getStorage().bucket()
  await Promise.all(
    [d.ruta, d.miniatura]
      .filter((r): r is string => typeof r === 'string')
      .map((r) => bucket.file(r).delete({ ignoreNotFound: true })),
  )
})
