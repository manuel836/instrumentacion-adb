import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { borrarBorrador, guardarBorrador, leerBorrador, marcarCaptura } from '../lib/borradores'

/** Para comparar: las fotos cuentan por nombre, tamaño y fecha (JSON las dejaría en {}). */
function huella(datos: unknown): string {
  return JSON.stringify(datos, (_k, v: unknown) => (v instanceof Blob ? `${v instanceof File ? v.name : ''}:${v.size}:${v.type}` : v))
}

export interface ControlBorrador {
  /** Cuándo se guardó el borrador que se recuperó al abrir (null si se empezó en blanco). */
  recuperado: number | null
  /** "Empezar de nuevo": tira el borrador y deja el formulario como estaba al abrir. */
  descartar: () => void
  /** Se guardó de verdad (o se canceló a propósito): el borrador ya no hace falta. */
  terminar: () => void
}

/**
 * Guarda en el teléfono lo que se va escribiendo en un formulario y lo recupera al volver.
 * `nombre` distingue el formulario ("calibracion:<id>"); `listo` dice cuándo el formulario
 * ya tiene sus valores iniciales (por ejemplo, la ficha que se va a editar), y `restaurar`
 * pone en pantalla lo que se recuperó.
 */
export function useBorrador<T>(nombre: string | null, datos: T, listo: boolean, restaurar: (d: T) => void): ControlBorrador {
  const { user } = useAuth()
  const clave = user && nombre ? `${user.uid}:${nombre}` : null
  const [recuperado, setRecuperado] = useState<number | null>(null)
  const [cargado, setCargado] = useState(false)
  /** Cómo estaba el formulario al abrir: si vuelve a quedar igual, no hay nada que guardar. */
  const base = useRef<string | null>(null)
  const inicial = useRef<T | null>(null)
  const ultimo = useRef(datos)
  ultimo.current = datos
  const restaurarRef = useRef(restaurar)
  restaurarRef.current = restaurar
  const terminado = useRef(false)
  const pendiente = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!clave || !listo || cargado) return
    let vigente = true
    void leerBorrador<T>(clave)
      .catch(() => null)
      .then((b) => {
        if (!vigente) return
        inicial.current = ultimo.current
        base.current = huella(ultimo.current)
        if (b) {
          restaurarRef.current(b.datos)
          setRecuperado(b.guardado)
        }
        setCargado(true)
      })
    return () => {
      vigente = false
    }
  }, [clave, listo, cargado])

  const actual = cargado ? huella(datos) : null
  useEffect(() => {
    if (!clave || actual === null || terminado.current) return
    const sucio = actual !== base.current
    marcarCaptura(clave, sucio)
    if (!sucio) {
      void borrarBorrador(clave).catch(() => undefined)
      return
    }
    const guardar = () => {
      pendiente.current = null
      if (!terminado.current) void guardarBorrador(clave, ultimo.current).catch(() => undefined)
    }
    pendiente.current = guardar
    const t = setTimeout(guardar, 400)
    return () => clearTimeout(t)
  }, [clave, actual])

  // Al abrir la cámara (o cambiar de app) se guarda ya: Android puede cerrar Chrome por detrás.
  useEffect(() => {
    const alOcultar = () => {
      if (document.visibilityState === 'hidden') pendiente.current?.()
    }
    document.addEventListener('visibilitychange', alOcultar)
    return () => document.removeEventListener('visibilitychange', alOcultar)
  }, [])

  // Al salir de la pantalla el borrador se queda (se recupera al volver), pero ya no detiene una actualización.
  useEffect(
    () => () => {
      pendiente.current?.()
      if (clave) marcarCaptura(clave, false)
    },
    [clave],
  )

  const terminar = useCallback(() => {
    terminado.current = true
    pendiente.current = null
    if (!clave) return
    marcarCaptura(clave, false)
    void borrarBorrador(clave).catch(() => undefined)
  }, [clave])

  const descartar = useCallback(() => {
    if (clave) void borrarBorrador(clave).catch(() => undefined)
    setRecuperado(null)
    if (inicial.current !== null) restaurarRef.current(inicial.current)
  }, [clave])

  return { recuperado, descartar, terminar }
}
