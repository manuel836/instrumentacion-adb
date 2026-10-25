import { useState } from 'react'
import { MAX_FOTOS_UBICACION } from '../config'
import {
  agregarFotosUbicacion,
  borrarFoto,
  editarPie,
  marcarPortada,
  reordenar,
  useFotosUbicacion,
} from '../lib/instrumentos'
import { useAuth } from '../auth/AuthContext'
import { FotoImg } from './FotoImg'
import { Visor } from './Visor'
import { SelectorFotos, type FotoNueva } from './SelectorFotos'
import { Pendiente } from './Estado'

/** Portada primero, luego el resto en su orden. */
export function ordenarConPortada<T extends { esPortada: boolean; orden: number }>(fotos: T[]): T[] {
  return [...fotos].sort((a, b) => Number(b.esPortada) - Number(a.esPortada) || a.orden - b.orden)
}

export function Galeria({ instrumentoId, editable }: { instrumentoId: string; editable: boolean }) {
  const { user } = useAuth()
  const fotos = useFotosUbicacion(instrumentoId)
  const [visor, setVisor] = useState<number | null>(null)
  const [editando, setEditando] = useState(false)
  const [nuevas, setNuevas] = useState<FotoNueva[]>([])
  const [borrar, setBorrar] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const vista = ordenarConPortada(fotos)

  async function guardarNuevas() {
    setGuardando(true)
    try {
      await agregarFotosUbicacion(
        instrumentoId,
        nuevas,
        user?.displayName || user?.email || '',
        fotos.length,
        fotos.some((f) => f.esPortada),
      )
      setNuevas([])
    } finally {
      setGuardando(false)
    }
  }

  function mover(idx: number, delta: number) {
    const arr = [...fotos]
    const [x] = arr.splice(idx, 1)
    arr.splice(idx + delta, 0, x)
    reordenar(instrumentoId, arr)
  }

  return (
    <section className="tarjeta space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Ubicación en campo</h2>
        {editable && (
          <button className="text-sm font-semibold text-marca-700" onClick={() => setEditando((e) => !e)}>
            {editando ? 'Listo' : 'Editar fotos'}
          </button>
        )}
      </div>

      {fotos.length === 0 && !editando && <p className="text-sm text-slate-500">Sin fotos de ubicación todavía.</p>}

      {!editando && vista.length > 0 && (
        <>
          <button className="block w-full overflow-hidden rounded-lg" onClick={() => setVisor(0)}>
            <FotoImg url={vista[0].url ?? vista[0].miniaturaUrl} ruta={vista[0].ruta} alt={vista[0].pie} className="aspect-[4/3] w-full object-cover" />
          </button>
          {vista[0].pie && <p className="text-sm text-slate-700">{vista[0].pie}</p>}
          {vista.length > 1 && (
            <div className="grid grid-cols-5 gap-2">
              {vista.slice(1).map((f, i) => (
                <button key={f.id} onClick={() => setVisor(i + 1)} className="overflow-hidden rounded">
                  <FotoImg url={f.miniaturaUrl} ruta={f.miniatura} alt={f.pie} className="aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {editando && (
        <div className="space-y-3">
          {fotos.map((f, idx) => (
            <div key={f.id} className="flex gap-3 rounded-lg border border-slate-200 p-2">
              <FotoImg url={f.miniaturaUrl} ruta={f.miniatura} alt="" className="h-20 w-20 shrink-0 rounded object-cover" />
              <div className="min-w-0 flex-1 space-y-2">
                <input
                  className="campo py-2 text-sm"
                  defaultValue={f.pie}
                  placeholder="Pie de foto"
                  onBlur={(e) => e.target.value !== f.pie && editarPie(instrumentoId, f.id, e.target.value)}
                />
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <label className="flex items-center gap-1">
                    <input type="radio" checked={f.esPortada} onChange={() => marcarPortada(instrumentoId, fotos, f.id)} />
                    Portada
                  </label>
                  <button disabled={idx === 0} onClick={() => mover(idx, -1)} className="disabled:opacity-30" aria-label="Subir">
                    ▲
                  </button>
                  <button disabled={idx === fotos.length - 1} onClick={() => mover(idx, 1)} className="disabled:opacity-30" aria-label="Bajar">
                    ▼
                  </button>
                  {f.sinSincronizar || f.pendiente ? <Pendiente /> : null}
                  {borrar === f.id ? (
                    <button className="ml-auto font-semibold text-red-700" onClick={() => void borrarFoto(instrumentoId, fotos, f.id)}>
                      ¿Borrar? Sí
                    </button>
                  ) : (
                    <button className="ml-auto text-red-700" onClick={() => setBorrar(f.id)}>
                      Borrar
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          <SelectorFotos fotos={nuevas} onChange={setNuevas} max={MAX_FOTOS_UBICACION - fotos.length} />
          {nuevas.length > 0 && (
            <button className="btn-primario w-full" disabled={guardando} onClick={() => void guardarNuevas()}>
              {guardando ? 'Procesando fotos…' : `Guardar ${nuevas.length} ${nuevas.length === 1 ? 'foto' : 'fotos'}`}
            </button>
          )}
        </div>
      )}

      {visor !== null && (
        <Visor
          fotos={vista.map((f) => ({ url: f.url, ruta: f.ruta, pie: f.pie }))}
          inicio={visor}
          onCerrar={() => setVisor(null)}
        />
      )}
    </section>
  )
}
