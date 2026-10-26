import { useEffect, useState } from 'react'
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../firebase'
import type { DocAdjunto, FotoUbicacion, Instrumento, InstrumentoNuevo } from '../types'
import { comprimirFoto } from './images'
import { descartarDeDocumento, descartarRuta, encolar } from './uploadQueue'

export type ConPendiente<T> = T & { sinSincronizar: boolean }

const colInstrumentos = collection(db, 'instrumentos')

export function instrumentoVacio(): InstrumentoNuevo {
  return {
    tagISA: '',
    lazo: '',
    servicio: '',
    area: 'Generación de vapor',
    ubicacionTexto: '',
    pid: '',
    marca: '',
    modelo: '',
    serie: '',
    rangoMin: null,
    rangoMax: null,
    unidades: '',
    senal: '4-20 mA',
    alimentacion: '',
    nfcToken: null,
    estado: 'Operando',
    proximaCalibracion: null,
    docs: [],
    portadaMiniatura: null,
  }
}

function aInstrumento(id: string, d: DocumentData): Instrumento {
  return { ...instrumentoVacio(), ...d, id } as Instrumento
}

/** Catálogo completo, servido desde la caché del teléfono cuando no hay señal. */
export function useInstrumentos() {
  const [lista, setLista] = useState<ConPendiente<Instrumento>[] | null>(null)
  useEffect(
    () =>
      onSnapshot(query(colInstrumentos, orderBy('tagISA')), { includeMetadataChanges: true }, (snap) => {
        setLista(snap.docs.map((d) => ({ ...aInstrumento(d.id, d.data()), sinSincronizar: d.metadata.hasPendingWrites })))
      }),
    [],
  )
  return lista
}

export function useInstrumento(id: string | undefined) {
  const [inst, setInst] = useState<ConPendiente<Instrumento> | null | undefined>(undefined)
  useEffect(() => {
    if (!id) return
    return onSnapshot(doc(db, 'instrumentos', id), { includeMetadataChanges: true }, (snap) => {
      setInst(snap.exists() ? { ...aInstrumento(snap.id, snap.data()), sinSincronizar: snap.metadata.hasPendingWrites } : null)
    })
  }, [id])
  return inst
}

export function useFotosUbicacion(instrumentoId: string | undefined) {
  const [fotos, setFotos] = useState<ConPendiente<FotoUbicacion>[]>([])
  useEffect(() => {
    if (!instrumentoId) return
    return onSnapshot(
      query(collection(db, 'instrumentos', instrumentoId, 'ubicacion'), orderBy('orden')),
      { includeMetadataChanges: true },
      (snap) =>
        setFotos(
          snap.docs.map((d) => ({ ...(d.data() as FotoUbicacion), id: d.id, sinSincronizar: d.metadata.hasPendingWrites })),
        ),
    )
  }, [instrumentoId])
  return fotos
}

/**
 * Escucha las fotos de ubicación de todos los instrumentos y precarga sus
 * miniaturas en la caché del service worker, para verlas en campo sin señal.
 */
export function precargarMiniaturas(): () => void {
  const vistas = new Set<string>()
  return onSnapshot(collectionGroup(db, 'ubicacion'), (snap) => {
    if (!navigator.onLine) return
    for (const d of snap.docs) {
      const url = d.get('miniaturaUrl') as string | null
      if (url && !vistas.has(url)) {
        vistas.add(url)
        void fetch(url, { mode: 'no-cors' }).catch(() => vistas.delete(url))
      }
    }
  })
}

export async function buscarPorToken(token: string): Promise<string | null> {
  return (await instrumentoPorToken(token))?.id ?? null
}

/** El instrumento que tiene vinculado ese token (sin señal busca en la caché del teléfono). */
export async function instrumentoPorToken(token: string): Promise<Instrumento | null> {
  const snap = await getDocs(query(colInstrumentos, where('nfcToken', '==', token), limit(1)))
  return snap.empty ? null : aInstrumento(snap.docs[0].id, snap.docs[0].data())
}

export async function tagISAExiste(tagISA: string, exceptoId?: string): Promise<boolean> {
  const snap = await getDocs(query(colInstrumentos, where('tagISA', '==', tagISA), limit(2)))
  return snap.docs.some((d) => d.id !== exceptoId)
}

/**
 * Crea el instrumento. No se espera la confirmación del servidor: sin señal
 * la escritura queda en la caché y se sincroniza sola.
 */
export function crearInstrumento(datos: InstrumentoNuevo): string {
  const ref_ = doc(colInstrumentos)
  void setDoc(ref_, { ...datos, actualizado: serverTimestamp() })
  return ref_.id
}

export function actualizarInstrumento(id: string, cambios: Partial<InstrumentoNuevo>) {
  void updateDoc(doc(db, 'instrumentos', id), { ...cambios, actualizado: serverTimestamp() })
}

export function asignarToken(id: string, token: string) {
  actualizarInstrumento(id, { nfcToken: token })
}

/** El tag físico se regrabó para otro instrumento: este se queda sin tag. */
export function quitarToken(id: string) {
  actualizarInstrumento(id, { nfcToken: null })
}

// ---------- Galería de ubicación ----------

export async function agregarFotosUbicacion(
  instrumentoId: string,
  archivos: { archivo: Blob; pie: string }[],
  autor: string,
  ordenInicial: number,
  hayPortada: boolean,
) {
  const items: Parameters<typeof encolar>[0] = []
  for (const [i, { archivo, pie }] of archivos.entries()) {
    const { completa, miniatura } = await comprimirFoto(archivo)
    const fotoRef = doc(collection(db, 'instrumentos', instrumentoId, 'ubicacion'))
    const base = `instrumentos/${instrumentoId}/ubicacion/${fotoRef.id}`
    const foto: Omit<FotoUbicacion, 'id' | 'fecha'> = {
      ruta: `${base}.webp`,
      miniatura: `${base}_min.webp`,
      url: null,
      miniaturaUrl: null,
      pie,
      orden: ordenInicial + i,
      esPortada: !hayPortada && i === 0,
      autor,
      pendiente: true,
    }
    void setDoc(fotoRef, { ...foto, fecha: serverTimestamp() })
    const docPath = fotoRef.path
    items.push(
      { ruta: foto.ruta, blob: completa, contentType: 'image/webp', destino: { tipo: 'campo', docPath, campo: 'url' } },
      {
        ruta: foto.miniatura,
        blob: miniatura,
        contentType: 'image/webp',
        destino: { tipo: 'campo', docPath, campo: 'miniaturaUrl' },
      },
    )
  }
  await encolar(items)
}

export function editarPie(instrumentoId: string, fotoId: string, pie: string) {
  void updateDoc(doc(db, 'instrumentos', instrumentoId, 'ubicacion', fotoId), { pie })
}

export function marcarPortada(instrumentoId: string, fotos: FotoUbicacion[], fotoId: string) {
  const b = writeBatch(db)
  for (const f of fotos) {
    if (f.esPortada !== (f.id === fotoId)) {
      b.update(doc(db, 'instrumentos', instrumentoId, 'ubicacion', f.id), { esPortada: f.id === fotoId })
    }
  }
  void b.commit()
}

export function reordenar(instrumentoId: string, ordenados: FotoUbicacion[]) {
  const b = writeBatch(db)
  ordenados.forEach((f, i) => {
    if (f.orden !== i) b.update(doc(db, 'instrumentos', instrumentoId, 'ubicacion', f.id), { orden: i })
  })
  void b.commit()
}

export async function borrarFoto(instrumentoId: string, fotos: FotoUbicacion[], fotoId: string) {
  const ref_ = doc(db, 'instrumentos', instrumentoId, 'ubicacion', fotoId)
  await descartarDeDocumento(ref_.path)
  void deleteDoc(ref_)
  const borrada = fotos.find((f) => f.id === fotoId)
  const resto = fotos.filter((f) => f.id !== fotoId)
  if (borrada?.esPortada && resto.length > 0) marcarPortada(instrumentoId, resto, resto[0].id)
  // Los archivos en Storage los borra una Cloud Function al eliminar el documento.
}

// ---------- Documentos adjuntos ----------

export async function adjuntarDocumento(inst: Instrumento, archivo: File) {
  const limpio = archivo.name.replace(/[^\w.\-]+/g, '_')
  const ruta = `instrumentos/${inst.id}/docs/${Date.now()}_${limpio}`
  const nuevo: DocAdjunto = { nombre: archivo.name, ruta, url: null, tipo: archivo.type || 'application/octet-stream' }
  actualizarInstrumento(inst.id, { docs: [...inst.docs, nuevo] })
  await encolar([
    {
      ruta,
      blob: archivo,
      contentType: nuevo.tipo,
      destino: { tipo: 'arreglo', docPath: `instrumentos/${inst.id}`, campo: 'docs' },
    },
  ])
}

/** Quita el documento de la ficha; el archivo en Storage lo borra una Cloud Function. */
export function quitarDocumento(inst: Instrumento, ruta: string) {
  void descartarRuta(ruta)
  actualizarInstrumento(inst.id, { docs: inst.docs.filter((d) => d.ruta !== ruta) })
}

const fnBorrarInstrumento = httpsCallable<{ id: string }, { fallas: number }>(functions, 'borrarInstrumento')

/** Borra el instrumento con sus fotos, calibraciones, documentos y fallas (solo admin, con señal). */
export async function borrarInstrumento(id: string): Promise<void> {
  await fnBorrarInstrumento({ id })
}
