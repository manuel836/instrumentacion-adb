import { Link, useParams } from 'react-router'
import { useCalibracion } from '../lib/calibraciones'
import { useInstrumento } from '../lib/instrumentos'
import { errorPct } from '../lib/tolerancia'
import { fechaDia, ResultadoCal } from '../components/Calibracion'
import { Pendiente } from '../components/Estado'

function Celda({ v, err, tol }: { v: number | null; err: number | null; tol: number }) {
  if (v === null) return <td className="py-2 text-slate-400">—</td>
  const fuera = err !== null && Math.abs(err) > tol + 1e-9
  return (
    <td className="py-2">
      {v}
      {err !== null && <span className={`block text-[11px] ${fuera ? 'font-semibold text-red-700' : 'text-slate-500'}`}>{`${err >= 0 ? '+' : ''}${err.toFixed(2)} %`}</span>}
    </td>
  )
}

export function DetalleCalibracion() {
  const { id, calId } = useParams()
  const inst = useInstrumento(id)
  const cal = useCalibracion(id, calId)

  if (cal === undefined) return <p className="p-6 text-slate-500">Cargando…</p>
  if (cal === null) return <p className="p-6 text-slate-500">Esta calibración no existe.</p>

  const err = (v: number | null, e: number) => errorPct(v, e, cal.rangoMin, cal.rangoMax)

  return (
    <div className="space-y-3 p-3">
      <section className="tarjeta space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/instrumentos/${id}`} className="font-mono text-2xl font-bold text-marca-700 underline">
            {inst?.tagISA ?? 'Instrumento'}
          </Link>
          <ResultadoCal resultado={cal.resultado} />
          {cal.sinSincronizar && <Pendiente />}
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Fecha</dt>
            <dd className="font-medium">{fechaDia(cal.fecha)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Técnico</dt>
            <dd className="font-medium">{cal.tecnico.nombre}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Rango</dt>
            <dd className="font-medium">
              {cal.rangoMin} a {cal.rangoMax} {cal.unidades}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Tolerancia</dt>
            <dd className="font-medium">± {cal.tolerancia} % del span</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Patrón</dt>
            <dd className="font-medium">{cal.patron || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Próxima</dt>
            <dd className="font-medium">{fechaDia(cal.proxima) ?? 'sin programar'}</dd>
          </div>
        </dl>
      </section>

      <section className="tarjeta">
        <h2 className="mb-2 font-semibold">Puntos</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="font-medium">Entrada</th>
              <th className="font-medium">As-Found</th>
              <th className="font-medium">As-Left</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cal.puntos.map((p, i) => (
              <tr key={i}>
                <td className="py-2">{p.entrada}</td>
                <Celda v={p.asFound} err={err(p.asFound, p.entrada)} tol={cal.tolerancia} />
                <Celda v={p.asLeft} err={err(p.asLeft, p.entrada)} tol={cal.tolerancia} />
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {cal.observaciones && (
        <section className="tarjeta">
          <h2 className="mb-1 font-semibold">Observaciones</h2>
          <p className="text-sm whitespace-pre-wrap">{cal.observaciones}</p>
        </section>
      )}
    </div>
  )
}
