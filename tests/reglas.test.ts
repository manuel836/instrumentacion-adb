import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore'

// Se corre con: npm run test:reglas (levanta el emulador de Firestore).

let env: RulesTestEnvironment

const instrumento = {
  tagISA: 'PT-101',
  servicio: 'Presión de vapor a cabezal',
  area: 'Generación de vapor',
  estado: 'Operando',
  nfcToken: 'k7Qx9mP2vR4tLwAbCd',
  docs: [],
  portadaMiniatura: null,
  rangoMin: 0,
  rangoMax: 20,
}

const como = (rol: string | null, uid = `u-${rol}`) =>
  rol ? env.authenticatedContext(uid, { rol }).firestore() : env.unauthenticatedContext().firestore()

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-reglas',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(() => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'instrumentos/i1'), instrumento)
    await setDoc(doc(db, 'publico/k7Qx9mP2vR4tLwAbCd'), { tagISA: 'PT-101', fotosUbicacion: [] })
    await setDoc(doc(db, 'usuarios/u-operador'), { nombre: 'Op', rol: 'operador', tokensFCM: [] })
    await setDoc(doc(db, 'auditoria/a1'), { accion: 'x' })
  })
})

describe('instrumentos', () => {
  it('el invitado no ve el catálogo', async () => {
    await assertFails(getDoc(doc(como(null), 'instrumentos/i1')))
    await assertFails(getDocs(collection(como(null), 'instrumentos')))
  })

  it('una cuenta sin rol no ve nada', async () => {
    await assertFails(getDoc(doc(env.authenticatedContext('x').firestore(), 'instrumentos/i1')))
  })

  it('operador lee pero no edita', async () => {
    await assertSucceeds(getDoc(doc(como('operador'), 'instrumentos/i1')))
    await assertFails(updateDoc(doc(como('operador'), 'instrumentos/i1'), { servicio: 'otro' }))
    await assertFails(setDoc(doc(como('operador'), 'instrumentos/i2'), { ...instrumento, tagISA: 'TT-1' }))
  })

  it('técnico da de alta y edita', async () => {
    await assertSucceeds(setDoc(doc(como('tecnico'), 'instrumentos/i2'), { ...instrumento, tagISA: 'TT-1', nfcToken: null }))
    await assertSucceeds(updateDoc(doc(como('tecnico'), 'instrumentos/i1'), { servicio: 'otro' }))
  })

  it('nadie escribe la portada a mano ni un área inventada', async () => {
    await assertFails(updateDoc(doc(como('tecnico'), 'instrumentos/i1'), { portadaMiniatura: 'http://x' }))
    await assertFails(updateDoc(doc(como('tecnico'), 'instrumentos/i1'), { area: 'Otra' }))
    await assertFails(updateDoc(doc(como('tecnico'), 'instrumentos/i1'), { nfcToken: 'corto' }))
  })

  it('solo el admin borra', async () => {
    await assertFails(deleteDoc(doc(como('tecnico'), 'instrumentos/i1')))
    await assertSucceeds(deleteDoc(doc(como('admin'), 'instrumentos/i1')))
  })

  it('el tipo y la acción de la válvula se validan', async () => {
    await assertSucceeds(updateDoc(doc(como('tecnico'), 'instrumentos/i1'), { tipo: 'Válvula de corte', accionValvula: 'Aire para abrir' }))
    await assertSucceeds(updateDoc(doc(como('tecnico'), 'instrumentos/i1'), { accionValvula: 'Aire para abrir y cerrar' }))
    await assertSucceeds(updateDoc(doc(como('tecnico'), 'instrumentos/i1'), { tipo: 'Interruptor de presión', puntoAjuste: 10.5 }))
    await assertFails(updateDoc(doc(como('tecnico'), 'instrumentos/i1'), { accionValvula: 'Neumática' }))
    await assertFails(updateDoc(doc(como('tecnico'), 'instrumentos/i1'), { puntoAjuste: '10' }))
    await assertFails(updateDoc(doc(como('tecnico'), 'instrumentos/i1'), { tipo: 'x'.repeat(61) }))
  })

  it('la salida del transmisor es lineal o raíz cuadrada', async () => {
    await assertSucceeds(updateDoc(doc(como('tecnico'), 'instrumentos/i1'), { tipo: 'Transmisor de flujo', salidaTransmisor: 'Raíz cuadrada' }))
    await assertSucceeds(updateDoc(doc(como('tecnico'), 'instrumentos/i1'), { salidaTransmisor: 'Lineal' }))
    await assertFails(updateDoc(doc(como('tecnico'), 'instrumentos/i1'), { salidaTransmisor: 'Cuadrática' }))
  })
})

describe('sub áreas', () => {
  it('todos las ven; solo el admin las agrega, renombra o quita', async () => {
    const sub = { area: 'Generación de vapor', nombre: 'Caldera 2' }
    await assertFails(setDoc(doc(como('tecnico'), 'subareas/s1'), sub))
    await assertSucceeds(setDoc(doc(como('admin'), 'subareas/s1'), sub))
    await assertSucceeds(getDocs(collection(como('operador'), 'subareas')))
    await assertFails(getDocs(collection(como(null), 'subareas')))
    await assertFails(setDoc(doc(como('admin'), 'subareas/s2'), { ...sub, area: 'Cocina' }))
    await assertFails(setDoc(doc(como('admin'), 'subareas/s3'), { ...sub, nombre: '' }))
    await assertFails(setDoc(doc(como('admin'), 'subareas/s4'), { ...sub, orden: 1 }))
    await assertSucceeds(updateDoc(doc(como('admin'), 'subareas/s1'), { nombre: 'Caldera B' }))
    await assertFails(deleteDoc(doc(como('tecnico'), 'subareas/s1')))
    await assertSucceeds(deleteDoc(doc(como('admin'), 'subareas/s1')))
  })

  it('la marca de disparo de caldera es sí/no con una nota corta', async () => {
    await assertSucceeds(updateDoc(doc(como('tecnico'), 'instrumentos/i1'), { disparaCaldera: true, notaDisparo: 'Bypass del disparo por bajo nivel' }))
    await assertFails(updateDoc(doc(como('tecnico'), 'instrumentos/i1'), { disparaCaldera: 'sí' }))
    await assertFails(updateDoc(doc(como('tecnico'), 'instrumentos/i1'), { notaDisparo: 'x'.repeat(301) }))
    await assertFails(updateDoc(doc(como('operador'), 'instrumentos/i1'), { disparaCaldera: false }))
  })

  it('el instrumento guarda su sub área como texto corto', async () => {
    await assertSucceeds(updateDoc(doc(como('tecnico'), 'instrumentos/i1'), { subArea: 'Caldera 2' }))
    await assertFails(updateDoc(doc(como('tecnico'), 'instrumentos/i1'), { subArea: 2 }))
    await assertFails(updateDoc(doc(como('tecnico'), 'instrumentos/i1'), { subArea: 'x'.repeat(61) }))
  })
})

describe('galería de ubicación', () => {
  const foto = { ruta: 'a', miniatura: 'b', pie: 'Nivel 2', orden: 0, esPortada: true, url: null, miniaturaUrl: null }
  it('técnico agrega fotos, operador no', async () => {
    await assertSucceeds(setDoc(doc(como('tecnico'), 'instrumentos/i1/ubicacion/f1'), foto))
    await assertFails(setDoc(doc(como('operador'), 'instrumentos/i1/ubicacion/f2'), foto))
  })
  it('cualquiera con rol consulta todas las galerías', async () => {
    const { collectionGroup, getDocs: gd } = await import('firebase/firestore')
    await assertSucceeds(gd(collectionGroup(como('operador'), 'ubicacion')))
    await assertFails(gd(collectionGroup(como(null), 'ubicacion')))
  })
})

describe('vista pública', () => {
  it('el invitado lee un token exacto pero no lista', async () => {
    await assertSucceeds(getDoc(doc(como(null), 'publico/k7Qx9mP2vR4tLwAbCd')))
    await assertFails(getDocs(collection(como(null), 'publico')))
    await assertFails(setDoc(doc(como('admin'), 'publico/zzz'), { tagISA: 'X' }))
  })
})

describe('usuarios y bitácora', () => {
  it('un usuario solo cambia sus tokens de notificación', async () => {
    await assertSucceeds(updateDoc(doc(como('operador'), 'usuarios/u-operador'), { tokensFCM: ['t'] }))
    await assertFails(updateDoc(doc(como('operador'), 'usuarios/u-operador'), { rol: 'admin' }))
    await assertFails(getDoc(doc(como('tecnico'), 'usuarios/u-operador')))
  })
  it('quien tiene contraseña temporal solo puede quitarse el aviso, no ponérselo', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'usuarios/u-operador'), { cambiarContrasena: true }))
    const ref = doc(como('operador'), 'usuarios/u-operador')
    await assertSucceeds(updateDoc(ref, { tokensFCM: ['t'] }))
    await assertSucceeds(updateDoc(ref, { cambiarContrasena: false }))
    await assertFails(updateDoc(ref, { cambiarContrasena: true }))
    await assertFails(updateDoc(doc(como('operador', 'u-otro'), 'usuarios/u-operador'), { cambiarContrasena: false }))
  })
  it('solo el admin asigna el área de un usuario, y solo áreas válidas', async () => {
    await assertSucceeds(updateDoc(doc(como('admin'), 'usuarios/u-operador'), { area: 'Tratamiento de agua' }))
    await assertSucceeds(updateDoc(doc(como('admin'), 'usuarios/u-operador'), { area: '' }))
    await assertFails(updateDoc(doc(como('admin'), 'usuarios/u-operador'), { area: 'Cocina' }))
    await assertFails(updateDoc(doc(como('admin'), 'usuarios/u-operador'), { area: 'Tratamiento de agua', rol: 'admin' }))
    await assertFails(updateDoc(doc(como('tecnico'), 'usuarios/u-operador'), { area: 'Tratamiento de agua' }))
    await assertFails(updateDoc(doc(como('operador'), 'usuarios/u-operador'), { area: 'Tratamiento de agua' }))
  })
  it('la bitácora no la edita nadie y el operador no la ve', async () => {
    await assertSucceeds(getDoc(doc(como('tecnico'), 'auditoria/a1')))
    await assertFails(getDoc(doc(como('operador'), 'auditoria/a1')))
    await assertFails(updateDoc(doc(como('admin'), 'auditoria/a1'), { accion: 'y' }))
  })
})

describe('fallas', () => {
  const nueva = (uid: string) => ({
    instrumentoId: 'i1',
    tagISA: 'PT-101',
    area: 'Generación de vapor',
    estado: 'Abierta',
    reportadoPor: { uid, nombre: 'Op' },
    tecnicoAsignado: null,
    descripcion: 'Lectura congelada en cero',
    fotos: [{ ruta: 'fallas/f1/0.webp', miniatura: 'fallas/f1/0_min.webp', url: null, miniaturaUrl: null }],
    causaRaiz: '',
    accionCorrectiva: '',
    fechas: { creada: null, tomada: null, cerrada: null },
  })
  const tecnico = { uid: 'u-tecnico', nombre: 'Téc' }

  async function sembrar(datos: Record<string, unknown>) {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'fallas/f1'), datos))
  }

  it('el operador reporta a su nombre; el invitado no', async () => {
    await assertSucceeds(setDoc(doc(como('operador'), 'fallas/f1'), nueva('u-operador')))
    await assertFails(setDoc(doc(como('operador'), 'fallas/f2'), nueva('otro')))
    await assertFails(setDoc(doc(como(null), 'fallas/f3'), nueva('x')))
    await assertFails(setDoc(doc(como('operador'), 'fallas/f4'), { ...nueva('u-operador'), estado: 'Cerrada' }))
    await assertFails(setDoc(doc(como('operador'), 'fallas/f5'), { ...nueva('u-operador'), instrumentoId: 'no-existe' }))
  })

  it('el operador no cambia estado ni asignación, solo completa sus fotos', async () => {
    await sembrar(nueva('u-operador'))
    const ref_ = doc(como('operador'), 'fallas/f1')
    await assertFails(updateDoc(ref_, { estado: 'En proceso', tecnicoAsignado: { uid: 'u-operador', nombre: 'Op' } }))
    await assertSucceeds(
      updateDoc(ref_, { fotos: [{ ruta: 'fallas/f1/0.webp', miniatura: 'fallas/f1/0_min.webp', url: 'https://x', miniaturaUrl: null }] }),
    )
    await assertFails(updateDoc(ref_, { fotos: [] }))
  })

  it('el técnico la toma y la cierra con causa raíz y acción correctiva', async () => {
    await sembrar(nueva('u-operador'))
    const ref_ = doc(como('tecnico'), 'fallas/f1')
    await assertFails(updateDoc(ref_, { estado: 'En proceso' }))
    await assertSucceeds(updateDoc(ref_, { estado: 'En proceso', tecnicoAsignado: tecnico }))
    await assertFails(updateDoc(ref_, { estado: 'Cerrada', causaRaiz: '', accionCorrectiva: 'Se cambió' }))
    await assertFails(updateDoc(ref_, { descripcion: 'otra cosa' }))
    await assertSucceeds(updateDoc(ref_, { estado: 'Cerrada', causaRaiz: 'Diafragma dañado', accionCorrectiva: 'Se cambió el sensor' }))
    await assertFails(updateDoc(ref_, { estado: 'Abierta' }))
  })

  it('guarda la hora real del reporte en el teléfono, y después no se cambia', async () => {
    const enTelefono = Timestamp.fromDate(new Date('2026-10-27T03:00:00'))
    await assertSucceeds(
      setDoc(doc(como('operador'), 'fallas/f1'), { ...nueva('u-operador'), fechas: { creada: null, tomada: null, cerrada: null, enTelefono } }),
    )
    await assertFails(
      setDoc(doc(como('operador'), 'fallas/f2'), { ...nueva('u-operador'), fechas: { creada: null, tomada: null, cerrada: null, enTelefono: 'ayer' } }),
    )
    await assertFails(updateDoc(doc(como('tecnico'), 'fallas/f1'), { 'fechas.enTelefono': Timestamp.now() }))
  })

  it('si otro técnico ya la tomó, no se la quita (los dos la tomaron sin señal)', async () => {
    await sembrar(nueva('u-operador'))
    await assertSucceeds(updateDoc(doc(como('tecnico'), 'fallas/f1'), { estado: 'En proceso', tecnicoAsignado: tecnico }))
    const otro = { uid: 'u-otro', nombre: 'Otro' }
    await assertFails(updateDoc(doc(como('tecnico', 'u-otro'), 'fallas/f1'), { estado: 'En proceso', tecnicoAsignado: otro }))
    // Pero sí la puede cerrar, y la asignación se queda con quien la tomó.
    await assertSucceeds(
      updateDoc(doc(como('tecnico', 'u-otro'), 'fallas/f1'), { estado: 'Cerrada', causaRaiz: 'Diafragma dañado', accionCorrectiva: 'Se cambió' }),
    )
    // Ya cerrada, un segundo cierre (otro teléfono sin señal) no entra.
    await assertFails(updateDoc(doc(como('tecnico'), 'fallas/f1'), { estado: 'Cerrada', causaRaiz: 'Otra causa', accionCorrectiva: 'Otra acción' }))
  })

  it('solo el admin la elimina, esté abierta, en proceso o cerrada', async () => {
    for (const estado of ['Abierta', 'En proceso', 'Cerrada']) {
      await sembrar({ ...nueva('u-operador'), estado, tecnicoAsignado: estado === 'Abierta' ? null : tecnico })
      // Ni quien la reportó ni el técnico que la atiende.
      await assertFails(deleteDoc(doc(como('operador'), 'fallas/f1')))
      await assertFails(deleteDoc(doc(como('tecnico'), 'fallas/f1')))
      await assertFails(deleteDoc(doc(como(null), 'fallas/f1')))
      await assertSucceeds(deleteDoc(doc(como('admin'), 'fallas/f1')))
    }
  })
})

describe('chat', () => {
  const msg = (uid: string, extra: Record<string, unknown> = {}) => ({
    autor: { uid, nombre: 'Op' },
    texto: 'Ya voy para allá',
    fotos: [],
    fecha: serverTimestamp(),
    ...extra,
  })

  beforeEach(async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'fallas/f1'), { instrumentoId: 'i1', estado: 'Abierta', reportadoPor: { uid: 'u-operador', nombre: 'Op' } }),
    )
  })

  it('cualquiera con rol escribe en el hilo de una falla a su nombre', async () => {
    await assertSucceeds(setDoc(doc(como('operador'), 'fallas/f1/mensajes/m1'), msg('u-operador')))
    await assertSucceeds(getDocs(collection(como('tecnico'), 'fallas/f1/mensajes')))
    await assertFails(setDoc(doc(como('operador'), 'fallas/f1/mensajes/m2'), msg('otro')))
    await assertFails(setDoc(doc(como(null), 'fallas/f1/mensajes/m3'), msg('x')))
    await assertFails(getDocs(collection(como(null), 'fallas/f1/mensajes')))
    await assertFails(setDoc(doc(como('operador'), 'fallas/no-existe/mensajes/m4'), msg('u-operador')))
    await assertFails(setDoc(doc(como('operador'), 'fallas/f1/mensajes/m5'), msg('u-operador', { texto: '' })))
  })

  it('una falla eliminada ya no recibe mensajes', async () => {
    await assertSucceeds(deleteDoc(doc(como('admin'), 'fallas/f1')))
    await assertFails(setDoc(doc(como('operador'), 'fallas/f1/mensajes/m1'), msg('u-operador')))
  })

  it('al cerrar la falla se cierra su chat, pero lo escrito se sigue leyendo', async () => {
    const foto = { ruta: 'a', miniatura: 'b', url: null, miniaturaUrl: null }
    await assertSucceeds(setDoc(doc(como('operador'), 'fallas/f1/mensajes/m1'), msg('u-operador', { fotos: [foto] })))
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'fallas/f1'), { estado: 'Cerrada' }))
    await assertFails(setDoc(doc(como('operador'), 'fallas/f1/mensajes/m2'), msg('u-operador')))
    await assertFails(setDoc(doc(como('admin'), 'fallas/f1/mensajes/m3'), msg('u-admin')))
    await assertSucceeds(getDocs(collection(como('operador'), 'fallas/f1/mensajes')))
    // La foto que se mandó sin señal antes del cierre todavía puede completar su URL.
    await assertSucceeds(updateDoc(doc(como('operador'), 'fallas/f1/mensajes/m1'), { fotos: [{ ...foto, url: 'https://x' }] }))
  })

  it('el autor solo completa las URLs de sus fotos', async () => {
    const foto = { ruta: 'a', miniatura: 'b', url: null, miniaturaUrl: null }
    await assertSucceeds(setDoc(doc(como('operador'), 'fallas/f1/mensajes/m1'), msg('u-operador', { texto: '', fotos: [foto] })))
    await assertSucceeds(updateDoc(doc(como('operador'), 'fallas/f1/mensajes/m1'), { fotos: [{ ...foto, url: 'https://x' }] }))
    await assertFails(updateDoc(doc(como('operador'), 'fallas/f1/mensajes/m1'), { texto: 'editado' }))
    await assertFails(updateDoc(doc(como('tecnico'), 'fallas/f1/mensajes/m1'), { fotos: [{ ...foto, url: 'https://y' }] }))
  })

  it('canal general: solo texto, sin editar', async () => {
    await assertSucceeds(setDoc(doc(como('operador'), 'chat_general/m1'), msg('u-operador')))
    await assertFails(setDoc(doc(como('operador'), 'chat_general/m2'), msg('u-operador', { fotos: [{ ruta: 'a' }] })))
    await assertFails(updateDoc(doc(como('operador'), 'chat_general/m1'), { texto: 'otro' }))
    await assertFails(getDocs(collection(como(null), 'chat_general')))
  })
})

describe('chats privados', () => {
  // uids en orden: el id del chat es "u-operador_u-tecnico".
  const chatId = 'u-operador_u-tecnico'
  const msg = (uid: string, extra: Record<string, unknown> = {}) => ({
    autor: { uid, nombre: 'X' },
    texto: 'Te marco al rato',
    fotos: [],
    fecha: serverTimestamp(),
    ...extra,
  })
  const resumen = (uid: string, extra: Record<string, unknown> = {}) => ({
    miembros: ['u-operador', 'u-tecnico'],
    nombres: { 'u-operador': 'Op', 'u-tecnico': 'Téc' },
    ultimo: { texto: 'Te marco al rato', autor: uid, fecha: serverTimestamp() },
    leido: { [uid]: serverTimestamp() },
    ...extra,
  })

  /** Mensaje y resumen en un lote, como lo hace la app. */
  async function enviar(db: ReturnType<typeof como>, uid: string, msgId: string) {
    const { writeBatch } = await import('firebase/firestore')
    const lote = writeBatch(db)
    lote.set(doc(db, `chats_privados/${chatId}/mensajes/${msgId}`), msg(uid))
    lote.set(doc(db, `chats_privados/${chatId}`), resumen(uid), { merge: true })
    return lote.commit()
  }

  it('solo las dos personas escriben y leen; ni el admin entra', async () => {
    await assertSucceeds(enviar(como('operador'), 'u-operador', 'm1'))
    await assertSucceeds(enviar(como('tecnico'), 'u-tecnico', 'm2'))
    await assertSucceeds(getDocs(collection(como('tecnico'), `chats_privados/${chatId}/mensajes`)))
    await assertSucceeds(getDoc(doc(como('operador'), `chats_privados/${chatId}`)))
    await assertFails(getDocs(collection(como('admin'), `chats_privados/${chatId}/mensajes`)))
    await assertFails(getDoc(doc(como('admin'), `chats_privados/${chatId}`)))
    await assertFails(setDoc(doc(como('admin'), `chats_privados/${chatId}/mensajes/m3`), msg('u-admin')))
    await assertFails(setDoc(doc(como('operador'), `chats_privados/${chatId}/mensajes/m4`), msg('u-tecnico')))
  })

  it('la lista de chats solo trae los míos', async () => {
    const { query: q, where: w } = await import('firebase/firestore')
    await assertSucceeds(enviar(como('operador'), 'u-operador', 'm1'))
    await assertSucceeds(getDocs(q(collection(como('tecnico'), 'chats_privados'), w('miembros', 'array-contains', 'u-tecnico'))))
    await assertFails(getDocs(collection(como('tecnico'), 'chats_privados')))
    await assertFails(getDocs(q(collection(como('admin'), 'chats_privados'), w('miembros', 'array-contains', 'u-tecnico'))))
  })

  it('el id tiene que ser de sus miembros y cada quien solo marca lo que él leyó', async () => {
    await assertFails(setDoc(doc(como('operador'), 'chats_privados/u-admin_u-operador'), resumen('u-operador')))
    await assertFails(setDoc(doc(como('operador'), `chats_privados/${chatId}`), resumen('u-tecnico')))
    await assertSucceeds(enviar(como('operador'), 'u-operador', 'm1'))
    const { serverTimestamp: ahora } = await import('firebase/firestore')
    await assertSucceeds(updateDoc(doc(como('tecnico'), `chats_privados/${chatId}`), { 'leido.u-tecnico': ahora() }))
    await assertFails(updateDoc(doc(como('tecnico'), `chats_privados/${chatId}`), { 'leido.u-operador': ahora() }))
    await assertFails(updateDoc(doc(como('tecnico'), `chats_privados/${chatId}`), { miembros: ['u-admin', 'u-tecnico'] }))
    await assertFails(deleteDoc(doc(como('operador'), `chats_privados/${chatId}`)))
  })

  it('el directorio lo leen todos; cada quien solo se anota a sí mismo con su rol', async () => {
    const yo = { nombre: 'Op', rol: 'operador', area: '', activo: true }
    await assertFails(setDoc(doc(como('operador'), 'directorio/u-otro'), yo))
    await assertFails(setDoc(doc(como('operador'), 'directorio/u-operador'), { ...yo, rol: 'admin' }))
    await assertFails(setDoc(doc(como('operador'), 'directorio/u-operador'), { ...yo, email: 'x@y.z' }))
    await assertSucceeds(setDoc(doc(como('operador'), 'directorio/u-operador'), yo))
    await assertFails(updateDoc(doc(como('operador'), 'directorio/u-operador'), { nombre: 'Otro' }))
    await assertSucceeds(getDocs(collection(como('tecnico'), 'directorio')))
    await assertFails(getDocs(collection(como(null), 'directorio')))
  })
})

describe('estado de los teléfonos', () => {
  const estado = (uid: string) => ({
    uid,
    nombre: 'Op',
    dispositivo: 'Android · Chrome',
    version: '2026-10-27 23:40',
    instalada: true,
    almacenamientoProtegido: true,
    sinConfirmar: 0,
    subidas: 2,
    detenidas: 0,
    rechazos: 0,
    errores: [{ mensaje: 'x', donde: '/fallas', fecha: 1 }],
    actualizado: serverTimestamp(),
  })

  it('cada teléfono escribe solo el suyo y solo el admin lo lee', async () => {
    await assertSucceeds(setDoc(doc(como('operador'), 'telefonos/u-operador_abcd1234'), estado('u-operador')))
    await assertFails(setDoc(doc(como('operador'), 'telefonos/u-tecnico_abcd1234'), estado('u-tecnico')))
    await assertFails(setDoc(doc(como('operador'), 'telefonos/u-operador_abcd1234'), { ...estado('u-operador'), extra: 1 }))
    await assertFails(setDoc(doc(como('operador'), 'telefonos/u-operador_abcd1234'), { ...estado('u-operador'), actualizado: Timestamp.now() }))
    await assertFails(setDoc(doc(como(null), 'telefonos/x_abcd1234'), estado('x')))
    await assertFails(getDoc(doc(como('operador'), 'telefonos/u-operador_abcd1234')))
    await assertFails(getDocs(collection(como('tecnico'), 'telefonos')))
    await assertSucceeds(getDocs(collection(como('admin'), 'telefonos')))
  })
})

describe('calibraciones', () => {
  const cal = (uid: string, extra: Record<string, unknown> = {}) => ({
    fecha: Timestamp.now(),
    tecnico: { uid, nombre: 'Téc' },
    puntos: [
      { entrada: 0, asFound: 0.1, asLeft: null },
      { entrada: 20, asFound: 19.9, asLeft: null },
    ],
    tolerancia: 0.5,
    rangoMin: 0,
    rangoMax: 20,
    unidades: 'kg/cm²',
    patron: '',
    resultado: 'Aprobada sin ajuste',
    observaciones: '',
    proxima: null,
    ...extra,
  })

  it('el técnico registra a su nombre; el operador solo consulta', async () => {
    await assertSucceeds(setDoc(doc(como('tecnico'), 'instrumentos/i1/calibraciones/c1'), cal('u-tecnico')))
    await assertSucceeds(getDocs(collection(como('operador'), 'instrumentos/i1/calibraciones')))
    await assertFails(setDoc(doc(como('operador'), 'instrumentos/i1/calibraciones/c2'), cal('u-operador')))
    await assertFails(setDoc(doc(como('tecnico'), 'instrumentos/i1/calibraciones/c3'), cal('otro')))
    await assertFails(setDoc(doc(como('tecnico'), 'instrumentos/i1/calibraciones/c4'), cal('u-tecnico', { resultado: 'Bien' })))
    await assertFails(setDoc(doc(como('tecnico'), 'instrumentos/i1/calibraciones/c5'), cal('u-tecnico', { rangoMax: 0 })))
  })

  it('la válvula de corte va sin puntos pero con revisiones', async () => {
    const kv = { tipo: 'Válvula de corte', puntos: [], tolerancia: 0, rangoMin: 0, rangoMax: 0, revisiones: [{ nombre: 'Abre completo', estado: 'Bien' }] }
    await assertSucceeds(setDoc(doc(como('tecnico'), 'instrumentos/i1/calibraciones/c1'), cal('u-tecnico', kv)))
    await assertFails(setDoc(doc(como('tecnico'), 'instrumentos/i1/calibraciones/c2'), cal('u-tecnico', { ...kv, revisiones: [] })))
    // Una calibración con puntos sigue pidiendo rango y tolerancia.
    await assertFails(setDoc(doc(como('tecnico'), 'instrumentos/i1/calibraciones/c3'), cal('u-tecnico', { tolerancia: 0, revisiones: kv.revisiones })))
  })

  it('el transmisor guarda si su salida es lineal o raíz cuadrada', async () => {
    const ft = { tipo: 'Transmisor de flujo', lecturaEn: 'mA', puntos: [{ entrada: 37.5, asFound: 12.02, asLeft: null }, { entrada: 150, asFound: 20, asLeft: null }], rangoMax: 150 }
    await assertSucceeds(setDoc(doc(como('tecnico'), 'instrumentos/i1/calibraciones/c1'), cal('u-tecnico', { ...ft, salidaTransmisor: 'Raíz cuadrada' })))
    await assertFails(setDoc(doc(como('tecnico'), 'instrumentos/i1/calibraciones/c2'), cal('u-tecnico', { ...ft, salidaTransmisor: 'sqrt' })))
  })

  it('el interruptor se evalúa en unidades y puede ir sin rango', async () => {
    const ps = { tipo: 'Interruptor de presión', puntos: [{ entrada: 10, asFound: 10.2, asLeft: null }], tolerancia: 0.3, rangoMin: 0, rangoMax: 0 }
    await assertSucceeds(setDoc(doc(como('tecnico'), 'instrumentos/i1/calibraciones/c1'), cal('u-tecnico', { ...ps, toleranciaEn: 'unidades', reposicion: { asFound: 9.6, asLeft: null } })))
    await assertFails(setDoc(doc(como('tecnico'), 'instrumentos/i1/calibraciones/c2'), cal('u-tecnico', ps)))
  })

  it('solo el admin corrige o borra un registro', async () => {
    await assertSucceeds(setDoc(doc(como('tecnico'), 'instrumentos/i1/calibraciones/c1'), cal('u-tecnico')))
    await assertFails(updateDoc(doc(como('tecnico'), 'instrumentos/i1/calibraciones/c1'), { resultado: 'Ajustada' }))
    await assertSucceeds(updateDoc(doc(como('admin'), 'instrumentos/i1/calibraciones/c1'), { resultado: 'Ajustada' }))
    await assertFails(deleteDoc(doc(como('tecnico'), 'instrumentos/i1/calibraciones/c1')))
    await assertSucceeds(deleteDoc(doc(como('admin'), 'instrumentos/i1/calibraciones/c1')))
  })
})

describe('bitácora y reportes', () => {
  it('cualquiera con rol consulta todas las calibraciones para el reporte; el invitado no', async () => {
    const { collectionGroup, getDocs: gd } = await import('firebase/firestore')
    await assertSucceeds(gd(collectionGroup(como('tecnico'), 'calibraciones')))
    await assertFails(gd(collectionGroup(como(null), 'calibraciones')))
  })

  it('nadie escribe ni borra en la bitácora; el técnico la consulta por instrumento', async () => {
    const { query: q, where: w } = await import('firebase/firestore')
    await assertSucceeds(getDocs(q(collection(como('tecnico'), 'auditoria'), w('instrumentoId', '==', 'i1'))))
    await assertFails(setDoc(doc(como('admin'), 'auditoria/a2'), { accion: 'crear' }))
    await assertFails(deleteDoc(doc(como('admin'), 'auditoria/a1')))
    await assertFails(getDocs(collection(como('operador'), 'auditoria')))
  })
})

describe('refacciones', () => {
  const refaccion = (extra: Record<string, unknown> = {}) => ({
    nombre: 'Sello de diafragma',
    numeroParte: '03031-1045',
    marca: 'Rosemount',
    ubicacion: 'Almacén A, anaquel 3',
    unidad: 'pza',
    existencia: 0,
    minimo: 2,
    instrumentos: ['i1'],
    notas: '',
    ultimoMovimiento: null,
    ...extra,
  })
  const mov = (uid: string, cantidad: number, extra: Record<string, unknown> = {}) => ({
    refaccionId: 'r1',
    refaccionNombre: 'Sello de diafragma',
    tipo: cantidad > 0 ? 'entrada' : 'salida',
    cantidad,
    nota: '',
    quien: { uid, nombre: 'Téc' },
    fecha: serverTimestamp(),
    fallaId: null,
    instrumentoId: null,
    tagISA: null,
    ...extra,
  })

  /** Movimiento y cambio de existencia en un mismo lote, como lo hace la app. */
  async function mover(db: ReturnType<typeof como>, movId: string, cantidad: number, opciones: { movimiento?: Record<string, unknown>; existencia?: unknown } = {}) {
    const { writeBatch, increment } = await import('firebase/firestore')
    const lote = writeBatch(db)
    lote.set(doc(db, `movimientos/${movId}`), mov(`u-${movId.split('-')[0]}`, cantidad, opciones.movimiento))
    lote.update(doc(db, 'refacciones/r1'), { existencia: opciones.existencia ?? increment(cantidad), ultimoMovimiento: movId })
    return lote.commit()
  }

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'refacciones/r1'), refaccion({ existencia: 5 }))
      await setDoc(doc(ctx.firestore(), 'movimientos/viejo'), mov('u-tecnico', 5, { fecha: Timestamp.now() }))
    })
  })

  it('el técnico da de alta (con o sin existencia inicial); el operador solo consulta', async () => {
    const { writeBatch } = await import('firebase/firestore')
    await assertSucceeds(setDoc(doc(como('tecnico'), 'refacciones/r2'), refaccion()))
    await assertSucceeds(getDoc(doc(como('operador'), 'refacciones/r1')))
    await assertFails(setDoc(doc(como('operador'), 'refacciones/r3'), refaccion()))
    // Existencia inicial sin su movimiento: no.
    await assertFails(setDoc(doc(como('tecnico'), 'refacciones/r4'), refaccion({ existencia: 3 })))
    const db = como('tecnico')
    const lote = writeBatch(db)
    lote.set(doc(db, 'movimientos/inicial'), mov('u-tecnico', 3, { refaccionId: 'r5', nota: 'Existencia inicial' }))
    lote.set(doc(db, 'refacciones/r5'), refaccion({ existencia: 3, ultimoMovimiento: 'inicial' }))
    await assertSucceeds(lote.commit())
    await assertFails(setDoc(doc(como('tecnico'), 'refacciones/r6'), refaccion({ minimo: -1 })))
  })

  it('la existencia solo cambia con un movimiento nuevo y por su cantidad exacta', async () => {
    await assertSucceeds(mover(como('tecnico'), 'tecnico-1', -2))
    await assertSucceeds(mover(como('admin'), 'admin-1', 4))
    const r = await getDoc(doc(como('tecnico'), 'refacciones/r1'))
    if (r.get('existencia') !== 7) throw new Error(`existencia ${r.get('existencia')}`)
    // Sin movimiento, con otra cantidad, reusando uno viejo o con el signo al revés: no.
    await assertFails(updateDoc(doc(como('tecnico'), 'refacciones/r1'), { existencia: 100 }))
    await assertFails(mover(como('tecnico'), 'tecnico-2', -1, { existencia: 1 }))
    await assertFails(updateDoc(doc(como('tecnico'), 'refacciones/r1'), { existencia: 12, ultimoMovimiento: 'viejo' }))
    await assertFails(mover(como('tecnico'), 'tecnico-3', 2, { movimiento: { tipo: 'salida' } }))
    await assertFails(mover(como('tecnico'), 'tecnico-4', -1, { movimiento: { quien: { uid: 'otro', nombre: 'X' } } }))
    await assertFails(mover(como('operador'), 'operador-1', -1))
    // Un movimiento suelto, sin cambiar la existencia: no.
    await assertFails(setDoc(doc(como('tecnico'), 'movimientos/suelto'), mov('u-tecnico', -1)))
  })

  it('puede quedar en negativo (dos teléfonos sin señal sacaron la última)', async () => {
    await assertSucceeds(mover(como('tecnico'), 'tecnico-1', -5))
    await assertSucceeds(mover(como('tecnico'), 'tecnico-2', -1))
  })

  it('los datos se editan sin tocar la existencia; el kardex no se edita; solo el admin borra', async () => {
    await assertSucceeds(updateDoc(doc(como('tecnico'), 'refacciones/r1'), { minimo: 4, ubicacion: 'Anaquel 5' }))
    await assertFails(updateDoc(doc(como('operador'), 'refacciones/r1'), { minimo: 1 }))
    await assertFails(updateDoc(doc(como('admin'), 'movimientos/viejo'), { cantidad: 50 }))
    await assertFails(deleteDoc(doc(como('admin'), 'movimientos/viejo')))
    await assertSucceeds(getDoc(doc(como('operador'), 'movimientos/viejo')))
    await assertFails(deleteDoc(doc(como('tecnico'), 'refacciones/r1')))
    await assertSucceeds(deleteDoc(doc(como('admin'), 'refacciones/r1')))
  })
})
