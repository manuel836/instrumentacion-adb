import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useFallas } from '../lib/fallas'
import { AREAS, ESTADOS_FALLA, type EstadoFalla } from '../types'
import { ListaFallas } from '../components/ListaFallas'

export function Fallas() {
  const fallas = useFallas()
  const [estado, setEstado] = useState<EstadoFalla>('Abierta')
  const [area, setArea] = useState('')

  const conteo = useMemo(() => {
    const c: Record<string, number> = {}
    for (const f of fallas ?? []) if (!area || f.area === area) c[f.estado] = (c[f.estado] ?? 0) + 1
    return c
  }, [fallas, area])

  const vista = (fallas ?? []).filter((f) => f.estado === estado && (!area || f.area === area))

  return (
    <div>
      <div className="space-y-2 border-b border-slate-200 bg-white p-3">
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
          {ESTADOS_FALLA.map((e) => (
            <button
              key={e}
              onClick={() => setEstado(e)}
              className={`rounded-md py-2 text-sm font-semibold ${estado === e ? 'bg-white shadow-sm' : 'text-slate-500'}`}
            >
              {e} {conteo[e] ? `(${conteo[e]})` : ''}
            </button>
          ))}
        </div>
        <select className="campo py-2 text-sm" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Área">
          <option value="">Todas las áreas</option>
          {AREAS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </div>
      <div className="px-3">
        {fallas === null ? (
          <p className="p-6 text-center text-slate-500">Cargando…</p>
        ) : vista.length === 0 ? (
          <p className="p-6 text-center text-slate-500">No hay fallas {{ Abierta: 'abiertas', 'En proceso': 'en proceso', Cerrada: 'cerradas' }[estado]}.</p>
        ) : (
          <ListaFallas fallas={vista} />
        )}
      </div>
      <Link
        to="/fallas/nueva"
        className="btn-primario fixed right-4 bottom-24 z-10 rounded-full px-5 py-3.5 shadow-lg"
      >
        ⚠ Reportar falla
      </Link>
    </div>
  )
}
