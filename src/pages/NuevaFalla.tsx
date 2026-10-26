import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { reportarFalla } from '../lib/fallas'
import { useInstrumentos } from '../lib/instrumentos'
import { SelectorFotos, type FotoNueva } from '../components/SelectorFotos'
import { dondeEsta } from '../types'

export function NuevaFalla() {
  const [params] = useSearchParams()
  const instrumentos = useInstrumentos()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [instrumentoId, setInstrumentoId] = useState(params.get('instrumento') ?? '')
  const [busqueda, setBusqueda] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fotos, setFotos] = useState<FotoNueva[]>([])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const inst = instrumentos?.find((i) => i.id === instrumentoId)
  const sugerencias = useMemo(() => {
    const q = busqueda.trim().toUpperCase()
    if (!q || !instrumentos) return []
    return instrumentos
      .filter((i) => i.tagISA.includes(q) || i.servicio.toUpperCase().includes(q) || i.subArea.toUpperCase().includes(q))
      .slice(0, 8)
  }, [busqueda, instrumentos])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!inst || !user) return
    if (descripcion.trim().length < 3) {
      setError('Describe brevemente qué pasa.')
      return
    }
    setEnviando(true)
    try {
      const id = await reportarFalla(
        inst,
        descripcion,
        fotos.map((f) => f.archivo),
        { uid: user.uid, nombre: user.displayName || user.email || 'Usuario' },
      )
      navigate(`/fallas/${id}`, { replace: true })
    } catch (err) {
      setError(`No se pudo guardar: ${(err as Error).message}`)
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-4">
      <h1 className="text-xl font-bold">Reportar falla</h1>

      <div>
        <span className="etiqueta">Instrumento *</span>
        {inst ? (
          <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2.5">
            <div>
              <span className="font-mono font-bold">{inst.tagISA}</span>
              <span className="ml-2 text-sm text-slate-600">{inst.servicio}</span>
              <span className="block text-xs text-slate-500">{dondeEsta(inst)}</span>
            </div>
            {!params.get('instrumento') && (
              <button type="button" className="text-sm text-marca-700" onClick={() => setInstrumentoId('')}>
                Cambiar
              </button>
            )}
          </div>
        ) : (
          <>
            <input
              className="campo"
              placeholder="Busca por tag o servicio"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              autoCapitalize="characters"
            />
            {sugerencias.length > 0 && (
              <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                {sugerencias.map((i) => (
                  <li key={i.id}>
                    <button type="button" className="w-full px-3 py-2 text-left" onClick={() => setInstrumentoId(i.id)}>
                      <span className="font-mono font-bold">{i.tagISA}</span>
                      <span className="ml-2 text-sm text-slate-600">{i.servicio}</span>
                      <span className="block text-xs text-slate-500">{dondeEsta(i)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <label className="block">
        <span className="etiqueta">¿Qué pasa? *</span>
        <textarea
          className="campo min-h-28"
          placeholder="Lectura congelada en 0, fuga en la conexión, sin señal en el DCS…"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
      </label>

      <div>
        <span className="etiqueta">Fotos (opcional)</span>
        <SelectorFotos fotos={fotos} onChange={setFotos} max={6} />
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <p className="text-xs text-slate-500">Sin señal se guarda en el teléfono y se avisa a los técnicos al reconectar.</p>
      <button className="btn-primario w-full" disabled={!inst || enviando}>
        {enviando ? 'Guardando…' : 'Reportar'}
      </button>
    </form>
  )
}
