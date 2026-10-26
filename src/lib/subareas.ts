import { useEffect, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { AREAS, type Area, type Instrumento, type Subarea } from '../types'

// Sub áreas (calderas, tanques, secciones) dentro de cada área. Las da de alta el admin
// y se eligen al dar de alta un instrumento, igual que el área.

const col = collection(db, 'subareas')

const orden = (a: Subarea, b: Subarea) =>
  AREAS.indexOf(a.area) - AREAS.indexOf(b.area) || a.nombre.localeCompare(b.nombre, 'es', { numeric: true })

/** Todas las sub áreas, por área y en orden natural (Caldera 2 antes que Caldera 10). */
export function useSubareas() {
  const [lista, setLista] = useState<Subarea[] | null>(null)
  useEffect(
    () => onSnapshot(col, (snap) => setLista(snap.docs.map((d) => ({ ...(d.data() as Omit<Subarea, 'id'>), id: d.id })).sort(orden))),
    [],
  )
  return lista
}

const igual = (a: string, b: string) => a.trim().localeCompare(b.trim(), 'es', { sensitivity: 'base' }) === 0

/** Mensaje de error si el nombre no sirve para esa área; null si está bien. */
export function revisarNombre(lista: Subarea[], area: Area, nombre: string, exceptoId?: string): string | null {
  const n = nombre.trim()
  if (n.length < 1) return 'Escribe el nombre de la sub área.'
  if (n.length > 60) return 'El nombre es muy largo (máximo 60 letras).'
  if (lista.some((s) => s.id !== exceptoId && s.area === area && igual(s.nombre, n))) return `Ya existe “${n}” en ${area}.`
  return null
}

export function crearSubarea(area: Area, nombre: string) {
  void addDoc(col, { area, nombre: nombre.trim() })
}

/** Cambia el nombre y lo pasa a los instrumentos que la usan (en lotes de 400). */
export function renombrarSubarea(sub: Subarea, nombre: string, instrumentos: Instrumento[]) {
  const nuevo = nombre.trim()
  const afectados = instrumentos.filter((i) => i.area === sub.area && i.subArea === sub.nombre)
  const lotes = [writeBatch(db)]
  lotes[0].update(doc(col, sub.id), { nombre: nuevo })
  afectados.forEach((i, n) => {
    if ((n + 1) % 400 === 0) lotes.push(writeBatch(db))
    lotes.at(-1)!.update(doc(db, 'instrumentos', i.id), { subArea: nuevo, actualizado: serverTimestamp() })
  })
  lotes.forEach((l) => void l.commit())
}

/** Solo se quita si ningún instrumento la usa (así no se juntan tags repetidos). */
export function borrarSubarea(sub: Subarea) {
  void deleteDoc(doc(col, sub.id))
}

export const enUso = (sub: Subarea, instrumentos: Instrumento[]) =>
  instrumentos.filter((i) => i.area === sub.area && i.subArea === sub.nombre).length
