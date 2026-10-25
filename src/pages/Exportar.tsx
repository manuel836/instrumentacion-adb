import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { descargarExcel, TIPOS_REPORTE, useReporte, type TipoReporte } from '../lib/reportes'
import { AREAS } from '../types'

function hoyISO(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

export function Exportar() {
  const [tipo, setTipo] = useState<TipoReporte>('instrumentos')
  const [area, setArea] = useState('')
  const [desde, setDesde] = useState(() => `${new Date().getFullYear()}-01-01`)
  const [hasta, setHasta] = useState(hoyISO)
  const [estado, setEstado] = useState('')
  const filtros = useMemo(() => ({ area, desde, hasta }), [area, desde, hasta])
  const { reporte, error } = useReporte(tipo, filtros)
  const filas = reporte?.hojas[0].filas.length
  const conPeriodo = TIPOS_REPORTE[tipo].conPeriodo
  const parametros = new URLSearchParams({ tipo, area, desde, hasta }).toString()

  async function excel() {
    if (!reporte) return
    setEstado('Generando…')
    try {
      await descargarExcel(reporte, `${tipo}-${hoyISO()}.xlsx`)
      setEstado('Listo: revisa tus descargas.')
    } catch (err) {
      setEstado(`No se pudo generar: ${(err as Error).message}`)
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold">Exportar</h1>
        <p className="text-sm text-slate-500">Excel para trabajar los datos; PDF para imprimir o compartir.</p>
      </div>

      <div className="space-y-2">
        {(Object.keys(TIPOS_REPORTE) as TipoReporte[]).map((t) => (
          <label key={t} className={`tarjeta flex cursor-pointer gap-3 p-3 ${tipo === t ? 'border-marca-600 ring-2 ring-marca-100' : ''}`}>
            <input type="radio" name="tipo" className="mt-1" checked={tipo === t} onChange={() => setTipo(t)} />
            <span>
              <span className="block font-semibold">{TIPOS_REPORTE[t].titulo}</span>
              <span className="block text-sm text-slate-500">{TIPOS_REPORTE[t].descripcion}</span>
            </span>
          </label>
        ))}
      </div>

      <label className="block">
        <span className="etiqueta">Área</span>
        <select className="campo" value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">Todas las áreas</option>
          {AREAS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </label>

      {conPeriodo && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="etiqueta">Desde</span>
            <input className="campo" type="date" value={desde} max={hasta} onChange={(e) => e.target.value && setDesde(e.target.value)} />
          </label>
          <label className="block">
            <span className="etiqueta">Hasta</span>
            <input className="campo" type="date" value={hasta} min={desde} onChange={(e) => e.target.value && setHasta(e.target.value)} />
          </label>
        </div>
      )}

      <p className="text-sm text-slate-600">
        {error ? `No se pudieron leer los datos: ${error}` : filas === undefined ? 'Cargando datos…' : `${filas} ${filas === 1 ? 'registro' : 'registros'}`}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <button className="btn-primario" disabled={!reporte || estado === 'Generando…'} onClick={() => void excel()}>
          Descargar Excel
        </button>
        <Link to={`/imprimir?${parametros}`} className={`btn-secundario ${reporte ? '' : 'pointer-events-none opacity-50'}`}>
          Ver para PDF
        </Link>
      </div>
      {estado && <p className="text-sm text-slate-600">{estado}</p>}
    </div>
  )
}
