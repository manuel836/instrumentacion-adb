import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc } from 'firebase/firestore'

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
