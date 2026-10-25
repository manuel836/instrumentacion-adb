import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { useInstrumentos } from '../lib/instrumentos'
import { AREAS, ESTADOS_INSTRUMENTO } from '../types'
import { Estado, Pendiente } from '../components/Estado'
import { FotoImg } from '../components/FotoImg'
import { vencimiento } from '../lib/tolerancia'

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function Catalogo() {
  const lista = useInstrumentos()
  const [texto, setTexto] = useState('')
  const [area, setArea] = useState<string>('')
  const [estado, setEstado] = useState<string>('')
  const q = useDeferredValue(normalizar(texto.trim()))

  const filtrados = useMemo(() => {
    if (!lista) return []
    return lista.filter(
      (i) =>
        (!area || i.area === area) &&
        (!estado || i.estado === estado) &&
        (!q || normalizar(`${i.tagISA} ${i.servicio} ${i.area} ${i.lazo}`).includes(q)),
    )
  }, [lista, q, area, estado])

  const contenedor = useRef<HTMLDivElement>(null)
  const virtual = useWindowVirtualizer({
    count: filtrados.length,
    estimateSize: () => 76,
    overscan: 8,
    scrollMargin: contenedor.current?.offsetTop ?? 0,
  })

  return (
    <div>
      <div className="space-y-2 border-b border-slate-200 bg-white p-3">
        <input
          className="campo"
          type="search"
          placeholder="Buscar por tag, servicio o área"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          aria-label="Buscar"
        />
        <div className="flex gap-2">
          <select className="campo py-2 text-sm" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Área">
            <option value="">Todas las áreas</option>
            {AREAS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <select className="campo py-2 text-sm" value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado">
            <option value="">Todos los estados</option>
            {ESTADOS_INSTRUMENTO.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-slate-500">
          {lista === null ? 'Cargando…' : `${filtrados.length} de ${lista.length} instrumentos`}
        </p>
      </div>

      <div ref={contenedor}>
        {lista?.length === 0 && (
          <p className="p-8 text-center text-slate-500">Aún no hay instrumentos. Da de alta el primero con el botón ＋.</p>
        )}
        <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
          {virtual.getVirtualItems().map((v) => {
            const i = filtrados[v.index]
            return (
              <Link
                key={i.id}
                to={`/instrumentos/${i.id}`}
                className="absolute inset-x-0 flex items-center gap-3 border-b border-slate-100 bg-white px-3 active:bg-slate-50"
                style={{ height: v.size, transform: `translateY(${v.start - virtual.options.scrollMargin}px)` }}
              >
                <FotoImg url={i.portadaMiniatura} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold">{i.tagISA}</span>
                    <Estado estado={i.estado} />
                    {i.sinSincronizar && <Pendiente />}
                  </div>
                  <p className="truncate text-sm text-slate-600">{i.servicio}</p>
                  <p className="truncate text-xs text-slate-400">
                    {i.area}
                    {!i.nfcToken && ' · sin tag'}
                    {vencimiento(i.proximaCalibracion) === 'vencida' && <span className="text-red-700"> · calibración vencida</span>}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
