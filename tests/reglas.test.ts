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
