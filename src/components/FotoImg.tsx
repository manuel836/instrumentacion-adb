import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import { blobLocal } from '../lib/uploadQueue'

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  url: string | null | undefined
  /** Ruta en Storage; si la foto sigue en la cola local se muestra desde el teléfono. */
  ruta?: string
  /** Lo que se muestra si la foto aún no se sube, no está en este teléfono o no cargó (la miniatura). */
  respaldo?: string | null
  /** Quién tomó la foto, para decir de qué teléfono falta que se suba. */
  autor?: string
}

export function FotoImg({ url, ruta, respaldo, autor, className, ...rest }: Props) {
  const [local, setLocal] = useState<string | null>(null)
  /** La ruta que ya se buscó en la cola local (mientras se busca se ve la silueta). */
  const [buscada, setBuscada] = useState<string | null>(null)
  /** Lo que no cargó: se prueba lo siguiente (la miniatura) y, si nada carga, se avisa. */
  const [fallidas, setFallidas] = useState<string[]>([])

  // Una foto que no cargó se reintenta al volver la señal o al regresar a la app.
  useEffect(() => {
    if (fallidas.length === 0) return
    const reintentar = () => {
      if (document.visibilityState === 'visible') setFallidas([])
    }
    window.addEventListener('online', reintentar)
    document.addEventListener('visibilitychange', reintentar)
    return () => {
      window.removeEventListener('online', reintentar)
      document.removeEventListener('visibilitychange', reintentar)
    }
  }, [fallidas.length])

  useEffect(() => {
    if (url || !ruta) return
    let objectUrl: string | null = null
    let vivo = true
    void blobLocal(ruta).then((b) => {
      if (!vivo) return
      if (b) {
        objectUrl = URL.createObjectURL(b)
        setLocal(objectUrl)
      }
      setBuscada(ruta)
    })
    return () => {
      vivo = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url, ruta])

  const opciones = [url, local, respaldo].filter((s): s is string => !!s)
  const src = opciones.find((s) => !fallidas.includes(s))
  if (src) {
    return (
      <img
        key={src}
        src={src}
        loading="lazy"
        decoding="async"
        className={className}
        onError={() => setFallidas((f) => [...f, src])}
        {...rest}
      />
    )
  }
  if (opciones.length > 0) {
    return navigator.onLine ? (
      <Aviso className={className} titulo="No se pudo cargar la foto" texto="Revisa la señal y vuelve a abrir esta pantalla." />
    ) : (
      <Aviso className={className} titulo="Foto no disponible sin señal" texto="Se verá cuando vuelva la señal." />
    )
  }
  if (ruta && buscada !== ruta) return <div className={`animate-pulse bg-slate-200 ${className ?? ''}`} aria-label="Cargando foto" />
  return (
    <Aviso
      className={className}
      titulo="Foto pendiente de subir"
      texto={`${autor ? `La tomó ${autor}. ` : ''}Se sube sola cuando se abre la app con señal en el teléfono donde se tomó.`}
    />
  )
}

/** Lugar de una foto que no se puede ver. La explicación solo cabe si el espacio es grande (no en miniaturas). */
function Aviso({ className, titulo, texto }: { className?: string; titulo: string; texto: string }) {
  return (
    <div className={`@container flex items-center justify-center bg-slate-200 ${className ?? ''}`}>
      <p className="hidden max-w-72 p-4 text-center text-sm text-slate-600 @min-[12rem]:block">
        <span className="block font-semibold text-slate-800">{titulo}</span>
        {texto}
      </p>
    </div>
  )
}
