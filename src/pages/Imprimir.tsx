import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { describirFiltros, textoCelda, TIPOS_REPORTE, useReporte, type TipoReporte } from '../lib/reportes'

/**
 * Vista de impresión: el navegador la guarda como PDF ("Imprimir" → "Guardar como PDF").
 * Va fuera del menú de la app para que la hoja salga limpia.
 */
export function Imprimir() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const tipo = (params.get('tipo') ?? 'instrumentos') as TipoReporte
  const filtros = useMemo(
    () => ({ area: params.get('area') ?? '', desde: params.get('desde') ?? '2000-01-01', hasta: params.get('hasta') ?? '2100-12-31' }),
    [params],
  )
  const { reporte } = useReporte(tipo in TIPOS_REPORTE ? tipo : 'instrumentos', filtros)
  const hoja = reporte?.hojas[0]

  return (
    <div className="min-h-dvh bg-white p-4 print:p-0">
      <style>{'@page { size: landscape; margin: 10mm; }'}</style>
      <div className="mb-4 flex gap-2 print:hidden">
        <button className="btn-secundario" onClick={() => navigate(-1)}>
          Volver
        </button>
        <button className="btn-primario flex-1" disabled={!hoja} onClick={() => window.print()}>
          Imprimir / Guardar PDF
        </button>
      </div>
      <p className="mb-3 text-sm text-slate-500 print:hidden">En el teléfono elige “Guardar como PDF” como impresora.</p>

      <header className="mb-3 border-b border-slate-300 pb-2">
        <p className="text-xs text-slate-500">Agroindustrias del Balsas · Instrumentación</p>
        <h1 className="text-lg font-bold">{TIPOS_REPORTE[tipo]?.titulo ?? 'Reporte'}</h1>
        <p className="text-xs text-slate-600">
          {describirFiltros(tipo, filtros)} · {hoja ? `${hoja.filas.length} ${hoja.filas.length === 1 ? 'registro' : 'registros'}` : 'cargando…'} · Generado el{' '}
          {new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
          {user ? ` por ${user.displayName || user.email}` : ''}
        </p>
      </header>

      {hoja && (
        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full border-collapse text-[11px] leading-snug print:text-[9px]">
            <thead>
              <tr>
                {hoja.columnas.map((c) => (
                  <th key={c.titulo} className="border border-slate-300 bg-slate-100 px-1.5 py-1 text-left font-semibold whitespace-nowrap">
                    {c.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hoja.filas.map((fila, i) => (
                <tr key={i} className="break-inside-avoid">
                  {fila.map((v, j) => (
                    <td key={j} className={`border border-slate-300 px-1.5 py-1 align-top ${hoja.columnas[j].ancho >= 30 ? 'min-w-40' : ''}`}>
                      {textoCelda(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {hoja.filas.length === 0 && <p className="p-6 text-center text-slate-500">Sin registros con estos filtros.</p>}
        </div>
      )}
    </div>
  )
}
