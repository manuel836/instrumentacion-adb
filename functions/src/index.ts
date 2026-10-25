import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { getStorage } from 'firebase-admin/storage'
import { setGlobalOptions } from 'firebase-functions/v2'
import { defineString } from 'firebase-functions/params'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'
import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions/v2'
import { registrar } from './bitacora.js'

export { auditarCalibracion, auditarFalla, auditarFotoUbicacion, auditarInstrumento } from './bitacora.js'

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

const adminDe = (req: CallableRequest) => ({ uid: req.auth!.uid, nombre: String(req.auth!.token.name ?? req.auth!.token.email ?? 'Admin') })

/** Anota en la bitácora un cambio de usuario hecho por el admin. */
async function auditarUsuario(req: CallableRequest, uid: string, accion: 'crear' | 'editar', antes: Record<string, unknown>, despues: Record<string, unknown>) {
  const u = await db.doc(`usuarios/${uid}`).get()
  await registrar({
    usuario: adminDe(req),
    coleccion: 'usuarios',
    docId: uid,
    ruta: `usuarios/${uid}`,
    instrumentoId: null,
    etiqueta: String(u.get('nombre') ?? u.get('email') ?? uid),
    accion,
    antes,
    despues,
  })
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
  await auditarUsuario(req, user.uid, 'crear', {}, { nombre, email, rol, ...(area ? { area } : {}) })
  return { uid: user.uid }
})

export const asignarRol = onCall(PUBLICA, async (req) => {
  exigirAdmin(req)
  const uid = exigirTexto(req.data?.uid, 'el usuario')
  const rol = exigirRol(req.data?.rol)
  if (uid === req.auth?.uid) throw new HttpsError('failed-precondition', 'No puedes cambiar tu propio rol.')
  const rolAnterior = (await db.doc(`usuarios/${uid}`).get()).get('rol') ?? null
  await getAuth().setCustomUserClaims(uid, { rol })
  // rolActualizado avisa al teléfono del usuario que renueve su token para ver el rol nuevo.
  await db.doc(`usuarios/${uid}`).update({ rol, rolActualizado: FieldValue.serverTimestamp() })
  if (rolAnterior !== rol) await auditarUsuario(req, uid, 'editar', { rol: rolAnterior }, { rol })
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
  const antes = (await db.doc(`usuarios/${uid}`).get()).get('activo') ?? null
  await db.doc(`usuarios/${uid}`).update({ activo })
  if (antes !== activo) await auditarUsuario(req, uid, 'editar', { activo: antes }, { activo })
  return {}
})

/**
 * Borra la cuenta y su ficha de usuario. Fallas, mensajes, calibraciones y bitácora
 * guardan el nombre de quien los hizo, así que el historial se conserva tal cual.
 */
export const eliminarUsuario = onCall(PUBLICA, async (req) => {
  exigirAdmin(req)
  const uid = exigirTexto(req.data?.uid, 'el usuario')
  if (uid === req.auth?.uid) throw new HttpsError('failed-precondition', 'No puedes eliminarte a ti mismo.')
  const ref = db.doc(`usuarios/${uid}`)
  const u = await ref.get()
  await getAuth()
    .deleteUser(uid)
    .catch((e: { code?: string }) => {
      // Si la cuenta ya no existía, igual se limpia su ficha.
      if (e.code !== 'auth/user-not-found') throw e
    })
  await ref.delete()
  const datos = u.data() ?? {}
  await registrar({
    usuario: adminDe(req),
    coleccion: 'usuarios',
    docId: uid,
    ruta: `usuarios/${uid}`,
    instrumentoId: null,
    etiqueta: String(datos.nombre ?? datos.email ?? uid),
    accion: 'borrar',
    antes: { nombre: datos.nombre ?? null, email: datos.email ?? null, rol: datos.rol ?? null },
    despues: {},
  })
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

// ---------- Fallas ----------

/** URL pública de la app para los enlaces de las notificaciones. */
const ORIGEN = process.env.PUBLIC_ORIGIN ?? 'https://instrumentacion-adb-fertinal.web.app'

interface Aviso {
  titulo: string
  cuerpo: string
  ruta: string
}

/** Envía un push web a los usuarios indicados y limpia los tokens que ya no sirven. */
async function avisar(uids: string[], aviso: Aviso) {
  if (uids.length === 0) return
  const docs = await Promise.all(uids.map((u) => db.doc(`usuarios/${u}`).get()))
  const destinos = docs.flatMap((d) =>
    d.exists && d.get('activo') !== false ? ((d.get('tokensFCM') as string[] | undefined) ?? []).map((t) => ({ uid: d.id, token: t })) : [],
  )
  if (destinos.length === 0) return
  try {
    const res = await getMessaging().sendEachForMulticast({
      tokens: destinos.map((d) => d.token),
      webpush: {
        notification: { title: aviso.titulo, body: aviso.cuerpo, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: aviso.ruta, renotify: true },
        fcmOptions: { link: `${ORIGEN}${aviso.ruta}` },
        headers: { Urgency: 'high', TTL: String(60 * 60 * 24) },
      },
      data: { ruta: aviso.ruta },
    })
    const invalidos = res.responses
      .map((r, i) => ({ r, d: destinos[i] }))
      .filter(({ r }) => !r.success && ['messaging/registration-token-not-registered', 'messaging/invalid-argument'].includes(r.error?.code ?? ''))
    await Promise.all(invalidos.map(({ d }) => db.doc(`usuarios/${d.uid}`).update({ tokensFCM: FieldValue.arrayRemove(d.token) })))
  } catch (err) {
    // Sin FCM (por ejemplo en los emuladores) el resto del trigger sigue.
    logger.warn('No se pudo enviar el push', err)
  }
}

async function tecnicos(): Promise<string[]> {
  const snap = await db.collection('usuarios').where('rol', 'in', ['tecnico', 'admin']).where('activo', '==', true).get()
  return snap.docs.map((d) => d.id)
}

/** Con alguna falla abierta o en proceso el instrumento queda "Con falla"; al cerrarse todas vuelve a "Operando". */
async function actualizarEstadoInstrumento(instrumentoId: string) {
  const ref = db.doc(`instrumentos/${instrumentoId}`)
  const [inst, abiertas] = await Promise.all([
    ref.get(),
    db.collection('fallas').where('instrumentoId', '==', instrumentoId).where('estado', 'in', ['Abierta', 'En proceso']).limit(1).get(),
  ])
  if (!inst.exists) return
  const actual = inst.get('estado') as string
  if (actual === 'Fuera de servicio') return
  const nuevo = abiertas.empty ? 'Operando' : 'Con falla'
  if (actual !== nuevo) await ref.update({ estado: nuevo })
}

export const alCrearFalla = onDocumentCreated('fallas/{id}', async (ev) => {
  const f = ev.data?.data()
  if (!f) return
  await actualizarEstadoInstrumento(f.instrumentoId)
  // Sale cuando el teléfono que reportó sincroniza, aunque haya reportado sin señal.
  const reporta = f.reportadoPor?.uid as string | undefined
  const uids = (await tecnicos()).filter((u) => u !== reporta)
  await avisar(uids, {
    titulo: `Falla en ${f.tagISA}`,
    cuerpo: `${f.reportadoPor?.nombre ?? 'Alguien'}: ${String(f.descripcion).slice(0, 140)}`,
    ruta: `/fallas/${ev.params.id}`,
  })
})

export const alActualizarFalla = onDocumentUpdated('fallas/{id}', async (ev) => {
  const antes = ev.data?.before.data()
  const despues = ev.data?.after.data()
  if (!antes || !despues || antes.estado === despues.estado) return
  await actualizarEstadoInstrumento(despues.instrumentoId)
  const reporta = despues.reportadoPor?.uid as string | undefined
  const quien = despues.tecnicoAsignado?.nombre ?? 'Un técnico'
  if (reporta && reporta !== despues.tecnicoAsignado?.uid) {
    await avisar([reporta], {
      titulo: `${despues.tagISA}: falla ${String(despues.estado).toLowerCase()}`,
      cuerpo: despues.estado === 'Cerrada' ? `${quien} la cerró: ${String(despues.accionCorrectiva).slice(0, 120)}` : `${quien} la está atendiendo.`,
      ruta: `/fallas/${ev.params.id}`,
    })
  }
})

// ---------- Chat ----------

const resumen = (m: FirebaseFirestore.DocumentData) =>
  String(m.texto ?? '').slice(0, 140) || (Array.isArray(m.fotos) && m.fotos.length > 0 ? '📷 Foto' : '')

/**
 * Avisa a los participantes del hilo de una falla: quien la reportó, el técnico
 * asignado y quienes ya escribieron. Mientras nadie la toma, también a los técnicos.
 */
export const alCrearMensaje = onDocumentCreated('fallas/{fallaId}/mensajes/{msgId}', async (ev) => {
  const m = ev.data?.data()
  if (!m) return
  const falla = await db.doc(`fallas/${ev.params.fallaId}`).get()
  if (!falla.exists) return
  const autores = await db.collection(`fallas/${ev.params.fallaId}/mensajes`).select('autor').get()
  const uids = new Set<string>([
    falla.get('reportadoPor.uid'),
    falla.get('tecnicoAsignado.uid'),
    ...autores.docs.map((d) => d.get('autor.uid')),
    ...(falla.get('tecnicoAsignado') ? [] : await tecnicos()),
  ])
  uids.delete(m.autor?.uid)
  await avisar(
    [...uids].filter((u): u is string => typeof u === 'string' && u !== ''),
    { titulo: `${falla.get('tagISA')} · ${m.autor?.nombre ?? 'Mensaje'}`, cuerpo: resumen(m), ruta: `/fallas/${ev.params.fallaId}` },
  )
})

/** Avisa al equipo de cada mensaje del canal general. */
export const alCrearMensajeGeneral = onDocumentCreated('chat_general/{msgId}', async (ev) => {
  const m = ev.data?.data()
  if (!m) return
  const activos = await db.collection('usuarios').where('activo', '==', true).get()
  await avisar(
    activos.docs.map((d) => d.id).filter((u) => u !== m.autor?.uid),
    { titulo: `Canal general · ${m.autor?.nombre ?? 'Mensaje'}`, cuerpo: resumen(m), ruta: '/chat' },
  )
})
