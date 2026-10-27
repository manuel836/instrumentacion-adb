import { useMemo } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { useFallas } from '../lib/fallas'
import { AREAS, ESTADOS_FALLA, type EstadoFalla } from '../types'
import { ListaFallas } from '../components/ListaFallas'
import { Icono } from '../components/Icono'

export function Fallas() {
  const fallas = useFallas()
  // Al eliminar una falla se llega aquí con el aviso.
  const aviso = (useLocation().state as { aviso?: string } | null)?.aviso
  // Estado y área en la dirección: al volver de una falla la lista queda igual, y el inicio enlaza aquí.
  const [params, setParams] = useSearchParams()
  const estado = (ESTADOS_FALLA as readonly string[]).includes(params.get('estado') ?? '') ? (params.get('estado') as EstadoFalla) : 'Abierta'
  const area = params.get('area') ?? ''
  const cambiar = (clave: string, valor: string) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (valor) p.set(clave, valor)
        else p.delete(clave)
        return p
      },
      { replace: true },
    )
  const setEstado = (e: EstadoFalla) => cambiar('estado', e)
  const setArea = (a: string) => cambiar('area', a)

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
              aria-pressed={estado === e}
              className={`rounded-md py-2.5 text-sm font-semibold ${estado === e ? 'bg-white shadow-sm' : 'text-slate-600'}`}
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
        {aviso && <p className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-800">{aviso}</p>}
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
        <Icono nombre="falla" /> Reportar falla
      </Link>
    </div>
  )
}
