import { useEffect, useState } from 'react'
import { suscribirPendientes } from '../lib/uploadQueue'

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

export function useSubidasPendientes(): number {
  const [n, setN] = useState(0)
  useEffect(() => suscribirPendientes(setN), [])
  return n
}
