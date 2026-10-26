import { useDeferredValue, useLayoutEffect, useMemo, useRef } from 'react'
import { Link, useLocation, useNavigationType, useSearchParams } from 'react-router'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { permisos, useAuth } from '../auth/AuthContext'
import { useInstrumentos, type ConPendiente } from '../lib/instrumentos'
import { useSubareas } from '../lib/subareas'
import { AREAS, ESTADOS_INSTRUMENTO, type Instrumento } from '../types'
import { Estado, Pendiente } from '../components/Estado'
import { FotoImg } from '../components/FotoImg'
import { vencimiento } from '../lib/tolerancia'
import { Icono } from '../components/Icono'

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Filtros extra del catálogo; también los usa la pantalla de inicio para sus atajos. */
export const OTROS_FILTROS = {
  'sin-tag': { titulo: 'Sin tag NFC', cumple: (i: Instrumento) => !i.nfcToken },
  'sin-fotos': { titulo: 'Sin fotos de ubicación', cumple: (i: Instrumento) => !i.portadaMiniatura },
  vencidas: { titulo: 'Calibración vencida', cumple: (i: Instrumento) => vencimiento(i.proximaCalibracion) === 'vencida' },
  'por-vencer': { titulo: 'Calibración vence en 30 días', cumple: (i: Instrumento) => vencimiento(i.proximaCalibracion) === 'pronto' },
  'sin-calibracion': { titulo: 'Sin calibración programada', cumple: (i: Instrumento) => !i.proximaCalibracion },
  'dispara-caldera': { titulo: 'Pueden disparar la caldera', cumple: (i: Instrumento) => i.disparaCaldera },
} as const
export type OtroFiltro = keyof typeof OTROS_FILTROS

/** Texto en el que busca el buscador: todo lo que alguien podría recordar del instrumento. */
const textoBuscable = (i: Instrumento) =>
  normalizar([i.tagISA, i.servicio, i.area, i.subArea, i.lazo, i.ubicacionTexto, i.pid, i.marca, i.modelo, i.serie].join(' '))

const CLAVE_SCROLL = 'catalogo-scroll'
/** Valor del filtro de sub área para los instrumentos que no tienen. */
const SIN_SUB = '-'

export function Catalogo() {
  const lista = useInstrumentos()
  const subareas = useSubareas()
  const { rol } = useAuth()
  const p = permisos(rol)
  const location = useLocation()
  const aviso = (location.state as { aviso?: string } | null)?.aviso
  const navegacion = useNavigationType()

  // La búsqueda y los filtros viven en la dirección (?q=…&area=…): al abrir una ficha y
  // regresar, el catálogo queda igual que como se dejó.
  const [params, setParams] = useSearchParams()
  const texto = params.get('q') ?? ''
  const area = params.get('area') ?? ''
  const sub = area ? (params.get('sub') ?? '') : ''
  const estado = params.get('estado') ?? ''
  const filtro = (params.get('filtro') ?? '') as OtroFiltro | ''
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
  const hayFiltros = !!(texto || area || estado || filtro)
  const subsDelArea = (subareas ?? []).filter((s) => s.area === area).map((s) => s.nombre)

  const q = useDeferredValue(normalizar(texto.trim()))
  const buscables = useMemo(() => new Map((lista ?? []).map((i) => [i.id, textoBuscable(i)])), [lista])

  const filtrados = useMemo(() => {
    if (!lista) return []
    const extra = filtro && OTROS_FILTROS[filtro] ? OTROS_FILTROS[filtro].cumple : null
    return lista.filter(
      (i) =>
        (!area || i.area === area) &&
        (!sub || i.subArea === (sub === SIN_SUB ? '' : sub)) &&
        (!estado || i.estado === estado) &&
        (!extra || extra(i)) &&
        (!q || (buscables.get(i.id) ?? '').includes(q)),
    )
  }, [lista, buscables, q, area, sub, estado, filtro])

  const contenedor = useRef<HTMLDivElement>(null)
  const virtual = useWindowVirtualizer({
    count: filtrados.length,
    estimateSize: () => 76,
    overscan: 8,
    scrollMargin: contenedor.current?.offsetTop ?? 0,
  })

  // Al volver (botón Atrás) se regresa a la misma altura de la lista.
  const restaurado = useRef(false)
  useLayoutEffect(() => {
    if (restaurado.current || lista === null) return
    restaurado.current = true
    if (navegacion !== 'POP') return
    try {
      const y = Number(sessionStorage.getItem(CLAVE_SCROLL) ?? 0)
      if (y > 0) requestAnimationFrame(() => window.scrollTo(0, y))
    } catch {
      // Sin almacenamiento de sesión simplemente se empieza arriba.
    }
  }, [lista, navegacion])
  // useLayoutEffect: al salir del catálogo el oyente se quita antes de que la página nueva,
  // más corta, mueva el scroll y se guarde una altura equivocada.
  useLayoutEffect(() => {
    const guardar = () => {
      try {
        sessionStorage.setItem(CLAVE_SCROLL, String(window.scrollY))
      } catch {
        // Ídem.
      }
    }
    window.addEventListener('scroll', guardar, { passive: true })
    return () => window.removeEventListener('scroll', guardar)
  }, [])

  return (
    <div>
      <div className="space-y-2 border-b border-slate-200 bg-white p-3">
        {aviso && <p className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-800">{aviso}</p>}
        <input
          className="campo"
          type="search"
          placeholder="Buscar por tag, servicio, marca, serie…"
          value={texto}
          onChange={(e) => cambiar('q', e.target.value)}
          aria-label="Buscar"
        />
        <div className="flex gap-2">
          <select
            className="campo py-2 text-sm"
            value={area}
            onChange={(e) =>
              setParams(
                (prev) => {
                  // Cada área tiene sus propias sub áreas: al cambiarla se quita la elegida.
                  const p = new URLSearchParams(prev)
                  if (e.target.value) p.set('area', e.target.value)
                  else p.delete('area')
                  p.delete('sub')
                  return p
                },
                { replace: true },
              )
            }
            aria-label="Área"
          >
            <option value="">Todas las áreas</option>
            {AREAS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <select className="campo py-2 text-sm" value={estado} onChange={(e) => cambiar('estado', e.target.value)} aria-label="Estado">
            <option value="">Todos los estados</option>
            {ESTADOS_INSTRUMENTO.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
        {area && subsDelArea.length > 0 && (
          <select className="campo py-2 text-sm" value={sub} onChange={(e) => cambiar('sub', e.target.value)} aria-label="Sub área">
            <option value="">Todas las sub áreas</option>
            {subsDelArea.map((s) => (
              <option key={s}>{s}</option>
            ))}
            <option value={SIN_SUB}>Sin sub área</option>
          </select>
        )}
        <select className="campo py-2 text-sm" value={filtro} onChange={(e) => cambiar('filtro', e.target.value)} aria-label="Otros filtros">
          <option value="">Sin otros filtros</option>
          {(Object.keys(OTROS_FILTROS) as OtroFiltro[]).map((k) => (
            <option key={k} value={k}>
              {OTROS_FILTROS[k].titulo}
            </option>
          ))}
        </select>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{lista === null ? 'Cargando…' : `${filtrados.length} de ${lista.length} instrumentos`}</span>
          {hayFiltros && (
            <button className="font-semibold text-marca-700" onClick={() => setParams({}, { replace: true })}>
              Quitar filtros
            </button>
          )}
        </div>
      </div>

      <div ref={contenedor}>
        {lista?.length === 0 && (
          <p className="p-8 text-center text-slate-500">
            Aún no hay instrumentos.
            {p.editarInstrumentos && ' Da de alta el primero con el botón Alta o impórtalos desde Excel.'}
          </p>
        )}
        {lista && lista.length > 0 && filtrados.length === 0 && (
          <p className="p-8 text-center text-slate-500">Ningún instrumento coincide con la búsqueda.</p>
        )}
        {p.editarInstrumentos && (
          <Link to="/instrumentos/nuevo" className="btn-primario fixed right-4 bottom-24 z-10 rounded-full px-5 py-3.5 shadow-lg">
            <Icono nombre="mas" /> Alta
          </Link>
        )}
        <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
          {virtual.getVirtualItems().map((v) => (
            <Fila key={filtrados[v.index].id} i={filtrados[v.index]} alto={v.size} y={v.start - virtual.options.scrollMargin} />
          ))}
        </div>
      </div>
    </div>
  )
}

function Fila({ i, alto, y }: { i: ConPendiente<Instrumento>; alto: number; y: number }) {
  const v = vencimiento(i.proximaCalibracion)
  return (
    <Link
      to={`/instrumentos/${i.id}`}
      className="absolute inset-x-0 flex items-center gap-3 border-b border-slate-100 bg-white px-3 active:bg-slate-50"
      style={{ height: alto, transform: `translateY(${y}px)` }}
    >
      <span className="relative shrink-0">
        <FotoImg url={i.portadaMiniatura} alt="" className="h-14 w-14 rounded-lg object-cover" />
        {i.disparaCaldera && (
          <span className="absolute -top-1 -left-1 rounded-full border-2 border-white bg-red-600 p-0.5 text-white" title="Puede disparar la caldera">
            <Icono nombre="rayo" className="size-3.5" />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold">{i.tagISA}</span>
          {i.subArea && <span className="truncate rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">{i.subArea}</span>}
          <Estado estado={i.estado} />
          {i.sinSincronizar && <Pendiente />}
        </div>
        <p className="truncate text-sm text-slate-600">{i.servicio}</p>
        <p className="truncate text-xs text-slate-400">
          {i.disparaCaldera && <span className="font-semibold text-red-700">Dispara caldera · </span>}
          {i.area}
          {!i.nfcToken && ' · sin tag'}
          {v === 'vencida' && <span className="text-red-700"> · calibración vencida</span>}
          {v === 'pronto' && <span className="text-amber-700"> · calibración por vencer</span>}
        </p>
      </div>
    </Link>
  )
}
