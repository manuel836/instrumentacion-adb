import { useEffect, useState } from 'react'
import { rechazosDe, sinConfirmar, suscribirRegistros, type Rechazo } from '../lib/rechazos'
import { suscribirPendientes, type EstadoCola } from '../lib/uploadQueue'

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export function useSubidasPendientes(): EstadoCola {
  const [estado, setEstado] = useState<EstadoCola>({ pendientes: 0, detenidas: 0 })
  useEffect(() => suscribirPendientes(setEstado), [])
  return estado
}

/** Registros de esta persona que el servidor aún no confirma, y los que ya rechazó. */
export function useRegistros(uid: string | undefined): { sinConfirmar: number; rechazos: Rechazo[] } {
  const [estado, setEstado] = useState<{ sinConfirmar: number; rechazos: Rechazo[] }>({ sinConfirmar: 0, rechazos: [] })
  useEffect(() => {
    if (!uid) return
    let vigente = true
    const leer = () =>
      void Promise.all([sinConfirmar(uid), rechazosDe(uid)])
        .then(([n, rechazos]) => vigente && setEstado({ sinConfirmar: n, rechazos }))
        .catch(() => undefined)
    leer()
    const quitar = suscribirRegistros(leer)
    return () => {
      vigente = false
      quitar()
    }
  }, [uid])
  return estado
}
