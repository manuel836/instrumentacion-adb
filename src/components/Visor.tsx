import { useEffect, useState } from 'react'
import { FotoImg } from './FotoImg'
import { Icono } from './Icono'

export interface FotoVisor {
  url: string | null
  ruta?: string
  /** Mientras la foto completa no se sube, se ve la miniatura. */
  miniaturaUrl?: string | null
  pie: string
}

/** Nombre del botón que abre una foto, para el lector de pantalla: "Ver foto 2 de 4: Lado norte". */
export function nombreFoto(i: number, total: number, pie?: string) {
  return `Ver foto${total > 1 ? ` ${i + 1} de ${total}` : ''}${pie ? `: ${pie}` : ''}`
}

/** Fotos a pantalla completa con zoom (doble toque o pellizco) y paso entre fotos. */
export function Visor({ fotos, inicio, onCerrar }: { fotos: FotoVisor[]; inicio: number; onCerrar: () => void }) {
  const [i, setI] = useState(inicio)
  const [zoom, setZoom] = useState(false)
  const foto = fotos[i]

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
      if (e.key === 'ArrowRight') setI((x) => Math.min(fotos.length - 1, x + 1))
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [fotos.length, onCerrar])

  useEffect(() => setZoom(false), [i])

  if (!foto) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white" role="dialog" aria-modal="true">
      <div className="flex items-center justify-between p-3">
        <span className="text-sm text-white/70">
          {i + 1} de {fotos.length}
        </span>
        <button className="rounded-full px-4 py-2 text-lg" onClick={onCerrar} aria-label="Cerrar">
          <Icono nombre="cerrar" className="size-6" />
        </button>
      </div>
      <div className="relative flex-1 overflow-auto" style={{ touchAction: zoom ? 'pan-x pan-y' : 'pinch-zoom' }}>
        <div
          className={zoom ? 'w-[250%]' : 'flex h-full w-full items-center justify-center'}
          onDoubleClick={() => setZoom((z) => !z)}
        >
          <FotoImg
            url={foto.url}
            ruta={foto.ruta}
            respaldo={foto.miniaturaUrl}
            alt={foto.pie}
            className={zoom ? 'w-full' : 'max-h-full max-w-full object-contain'}
          />
        </div>
      </div>
      <div className="space-y-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {!foto.url && <p className="text-sm text-white/70">Vista previa: la foto completa aún no se sube desde el teléfono que la tomó.</p>}
        {foto.pie && <p className="text-base">{foto.pie}</p>}
        <div className="flex gap-2">
          <button className="btn flex-1 bg-white/10" disabled={i === 0} onClick={() => setI(i - 1)}>
            ‹ Anterior
          </button>
          <button className="btn flex-1 bg-white/10" onClick={() => setZoom((z) => !z)}>
            {zoom ? 'Alejar' : 'Acercar'}
          </button>
          <button className="btn flex-1 bg-white/10" disabled={i === fotos.length - 1} onClick={() => setI(i + 1)}>
            Siguiente ›
          </button>
        </div>
      </div>
    </div>
  )
}
