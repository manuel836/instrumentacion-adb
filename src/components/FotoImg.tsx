import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import { blobLocal } from '../lib/uploadQueue'

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  url: string | null | undefined
  /** Ruta en Storage; si la foto sigue en la cola local se muestra desde el teléfono. */
  ruta?: string
}

export function FotoImg({ url, ruta, className, ...rest }: Props) {
  const [local, setLocal] = useState<string | null>(null)
  const [fallo, setFallo] = useState(false)

  // Una foto que no cargó sin señal se reintenta al volver la conexión.
  useEffect(() => {
    if (!fallo) return
    const reintentar = () => setFallo(false)
    window.addEventListener('online', reintentar)
    return () => window.removeEventListener('online', reintentar)
  }, [fallo])

  useEffect(() => {
    if (url || !ruta) return
    let objectUrl: string | null = null
    let vivo = true
    void blobLocal(ruta).then((b) => {
      if (b && vivo) {
        objectUrl = URL.createObjectURL(b)
        setLocal(objectUrl)
      }
    })
    return () => {
      vivo = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url, ruta])

  const src = url ?? local
  if (!src) return <div className={`animate-pulse bg-slate-200 ${className ?? ''}`} aria-label="Foto pendiente" />
  if (fallo) return <div className={`bg-slate-200 ${className ?? ''}`} aria-label="Foto no disponible sin señal" />
  return <img src={src} loading="lazy" decoding="async" className={className} onError={() => setFallo(true)} {...rest} />
}
