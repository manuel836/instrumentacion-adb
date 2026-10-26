import { useEffect, useMemo, useRef } from 'react'
import { Icono } from './Icono'

export interface FotoNueva {
  archivo: File
  pie: string
}

/** Captura de fotos con la cámara trasera, cada una con su pie de texto opcional. */
export function SelectorFotos({
  fotos,
  onChange,
  max,
  portada,
  onPortada,
}: {
  fotos: FotoNueva[]
  onChange: (f: FotoNueva[]) => void
  max: number
  portada?: number
  onPortada?: (i: number) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const previews = useMemo(() => fotos.map((f) => URL.createObjectURL(f.archivo)), [fotos])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  const sugerencias = ['Toma general: equipo, nivel, columna', 'Toma de cerca del instrumento']

  return (
    <div className="space-y-3">
      {fotos.map((f, i) => (
        <div key={previews[i]} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-2">
          <img src={previews[i]} alt="" className="h-20 w-20 shrink-0 rounded object-cover" />
          <div className="flex-1 space-y-2">
            <input
              className="campo py-2 text-sm"
              placeholder={sugerencias[i] ?? 'Pie de foto (opcional)'}
              value={f.pie}
              onChange={(e) => onChange(fotos.map((x, j) => (j === i ? { ...x, pie: e.target.value } : x)))}
            />
            <div className="flex items-center justify-between text-sm">
              {onPortada ? (
                <label className="flex items-center gap-2">
                  <input type="radio" name="portada" checked={portada === i} onChange={() => onPortada(i)} />
                  Portada
                </label>
              ) : (
                <span />
              )}
              <button
                type="button"
                className="text-red-700"
                onClick={() => {
                  onChange(fotos.filter((_, j) => j !== i))
                  if (onPortada && portada !== undefined) onPortada(portada === i ? 0 : portada > i ? portada - 1 : portada)
                }}
              >
                Quitar
              </button>
            </div>
          </div>
        </div>
      ))}
      {fotos.length < max && (
        <>
          <button type="button" className="btn-secundario w-full" onClick={() => input.current?.click()}>
            <Icono nombre="camara" /> {fotos.length === 0 ? 'Tomar foto' : 'Agregar otra foto'} ({fotos.length}/{max})
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            hidden
            onChange={(e) => {
              const nuevos = Array.from(e.target.files ?? []).slice(0, max - fotos.length)
              onChange([...fotos, ...nuevos.map((archivo) => ({ archivo, pie: '' }))])
              e.target.value = ''
            }}
          />
        </>
      )}
    </div>
  )
}
