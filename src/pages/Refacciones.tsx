import { useDeferredValue, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { permisos, useAuth } from '../auth/AuthContext'
import { useInstrumentos } from '../lib/instrumentos'
import { FILTROS_REFACCION, porPedir, sinExistencia, useRefacciones, type FiltroRefaccion } from '../lib/refacciones'
import type { Refaccion } from '../types'
import { Pendiente } from '../components/Estado'
import { Icono } from '../components/Icono'
import { Silueta } from '../components/Silueta'

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Existencia con color: rojo sin existencia, ámbar por pedir. */
export function Existencia({ r, grande = false }: { r: Refaccion; grande?: boolean }) {
  const color = sinExistencia(r) ? 'text-peligro-700' : porPedir(r) ? 'text-aviso-700' : 'text-slate-800'
  return (
    <span className={`block text-right leading-tight ${color}`}>
      <span className={`font-bold tabular-nums ${grande ? 'text-4xl' : 'text-xl'}`}>{r.existencia}</span>
      <span className="ml-1 text-xs">{r.unidad}</span>
      {r.minimo > 0 && <span className="block text-xs text-slate-500">mínimo {r.minimo}</span>}
    </span>
  )
}

/** Inventario de refacciones con búsqueda y los filtros "por pedir" y "sin existencia". */
export function Refacciones() {
  const lista = useRefacciones()
  const instrumentos = useInstrumentos()
  const { rol } = useAuth()
  const p = permisos(rol)
  const [params, setParams] = useSearchParams()
  const texto = params.get('q') ?? ''
  const filtro = (params.get('filtro') ?? '') as FiltroRefaccion | ''
  const cambiar = (clave: string, valor: string) =>
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        if (valor) n.set(clave, valor)
        else n.delete(clave)
        return n
      },
      { replace: true },
    )

  const tags = useMemo(() => new Map((instrumentos ?? []).map((i) => [i.id, i.tagISA])), [instrumentos])
  const q = useDeferredValue(normalizar(texto.trim()))
  const filtrados = useMemo(() => {
    const cumple = filtro && FILTROS_REFACCION[filtro] ? FILTROS_REFACCION[filtro].cumple : null
    return (lista ?? []).filter((r) => {
      if (cumple && !cumple(r)) return false
      if (!q) return true
      const buscable = [r.nombre, r.numeroParte, r.marca, r.ubicacion, r.notas, ...r.instrumentos.map((id) => tags.get(id) ?? '')].join(' ')
      return normalizar(buscable).includes(q)
    })
  }, [lista, tags, q, filtro])
  const cuantas = (f: FiltroRefaccion) => (lista ?? []).filter(FILTROS_REFACCION[f].cumple).length

  return (
    <div>
      <div className="space-y-2 border-b border-slate-200 bg-white p-3">
        <input
          className="campo"
          type="search"
          placeholder="Buscar por nombre, número de parte, tag…"
          value={texto}
          onChange={(e) => cambiar('q', e.target.value)}
          aria-label="Buscar refacción"
        />
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
          <button className={`flex-1 rounded-md py-1.5 ${!filtro ? 'bg-white font-semibold shadow-sm' : 'text-slate-600'}`} onClick={() => cambiar('filtro', '')}>
            Todas ({lista?.length ?? 0})
          </button>
          {(Object.keys(FILTROS_REFACCION) as FiltroRefaccion[]).map((f) => (
            <button
              key={f}
              className={`flex-1 rounded-md py-1.5 ${filtro === f ? 'bg-white font-semibold shadow-sm' : 'text-slate-600'}`}
              onClick={() => cambiar('filtro', f)}
            >
              {FILTROS_REFACCION[f].texto} ({cuantas(f)})
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">{lista === null ? 'Cargando…' : `${filtrados.length} de ${lista.length} refacciones`}</p>
      </div>

      {lista === null && (
        <div className="bg-white px-4">
          <Silueta forma="lista" />
        </div>
      )}
      {lista?.length === 0 && (
        <p className="p-8 text-center text-slate-500">
          Aún no hay refacciones.{p.refacciones && ' Da de alta la primera con el botón Nueva.'}
        </p>
      )}
      {lista && lista.length > 0 && filtrados.length === 0 && <p className="p-8 text-center text-slate-500">Ninguna refacción coincide.</p>}
      <ul className="divide-y divide-slate-200 bg-white">
        {filtrados.map((r) => (
          <li key={r.id}>
            <Link to={`/refacciones/${r.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{r.nombre}</span>
                <span className="block truncate text-sm text-slate-500">{[r.numeroParte, r.marca].filter(Boolean).join(' · ') || 'Sin número de parte'}</span>
                {r.ubicacion && <span className="block truncate text-xs text-slate-500">{r.ubicacion}</span>}
                {r.sinSincronizar && <Pendiente />}
              </span>
              <Existencia r={r} />
            </Link>
          </li>
        ))}
      </ul>

      {p.refacciones && (
        <Link to="/refacciones/nueva" className="btn-primario fixed right-4 bottom-24 z-10 rounded-full px-5 py-3.5 shadow-lg">
          <Icono nombre="mas" /> Nueva
        </Link>
      )}
    </div>
  )
}
