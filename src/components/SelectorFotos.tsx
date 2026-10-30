import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { sePuedeAbrir } from '../lib/images'
import { Icono, type NombreIcono } from './Icono'

export interface FotoNueva {
  archivo: File
  pie: string
}

/** Fotos con la cámara trasera o de la galería, cada una con su pie de texto opcional. */
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
  const camara = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const previews = useMemo(() => fotos.map((f) => URL.createObjectURL(f.archivo)), [fotos])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])
  // Revisar las fotos toma un momento: se agregan a la lista como esté en ese momento.
  const actuales = useRef(fotos)
  useEffect(() => {
    actuales.current = fotos
  }, [fotos])

  async function agregar(lista: FileList | null) {
    const elegidas = Array.from(lista ?? [])
    const buenas: File[] = []
    const malas: File[] = []
    for (const f of elegidas) (await sePuedeAbrir(f) ? buenas : malas).push(f)
    const libres = max - actuales.current.length
    const nuevas = buenas.slice(0, libres)
    const avisos: string[] = []
    if (malas.length) {
      avisos.push(`No se pudo abrir ${malas.map((f) => `“${f.name}”`).join(', ')} como foto. Elige otra o tómala con la cámara.`)
    }
    if (buenas.length > nuevas.length) {
      avisos.push(`Solo se ${nuevas.length === 1 ? 'agregó 1 foto' : `agregaron ${nuevas.length} fotos`}: ya no caben más.`)
    }
    setAviso(avisos.length ? avisos.join(' ') : null)
    if (nuevas.length) onChange([...actuales.current, ...nuevas.map((archivo) => ({ archivo, pie: '' }))])
  }

  const entrada = (ref: RefObject<HTMLInputElement | null>, deCamara: boolean) => (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      capture={deCamara ? 'environment' : undefined}
      multiple
      hidden
      onChange={(e) => {
        void agregar(e.target.files)
        e.target.value = ''
      }}
    />
  )
  const opciones: { nombre: string; icono: NombreIcono; ref: RefObject<HTMLInputElement | null> }[] = [
    { nombre: 'Tomar foto', icono: 'camara', ref: camara },
    { nombre: 'Galería', icono: 'imagen', ref: galeria },
  ]
  const quedan = max - fotos.length

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
                className="text-peligro-700"
                onClick={() => {
                  setAviso(null)
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
      {quedan > 0 && (
        <>
          {/* Mismos botones que en Documentos: el ícono arriba para que el texto quepa en teléfonos angostos. */}
          <div className="grid grid-cols-2 gap-2">
            {opciones.map((o) => (
              <button
                key={o.nombre}
                type="button"
                className="flex flex-col items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-3 text-sm font-semibold text-slate-800 active:bg-slate-50"
                onClick={() => o.ref.current?.click()}
              >
                <Icono nombre={o.icono} className="size-6 text-marca-700" />
                {o.nombre}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            {fotos.length === 0
              ? `Puedes agregar hasta ${max} ${max === 1 ? 'foto' : 'fotos'}.`
              : `${fotos.length} de ${max} fotos. Puedes agregar ${quedan} más.`}
          </p>
          {entrada(camara, true)}
          {entrada(galeria, false)}
        </>
      )}
      {aviso && <p className="rounded-lg bg-aviso-50 p-3 text-sm text-aviso-800">{aviso}</p>}
    </div>
  )
}
