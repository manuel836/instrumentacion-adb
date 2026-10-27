import { Link, useParams } from 'react-router'
import { useCalibracion } from '../lib/calibraciones'
import { useInstrumento } from '../lib/instrumentos'
import { errorLectura, esperado, textoError, textoTolerancia } from '../lib/tolerancia'
import { diferencial, pruebaDe } from '../lib/tipos'
import { fechaDia, ResultadoCal } from '../components/Calibracion'
import { Pendiente } from '../components/Estado'
import type { Calibracion, EstadoRevision } from '../types'

function Celda({ v, err, cal }: { v: number | null; err: number | null; cal: Calibracion }) {
  if (v === null) return <td className="py-2 text-slate-500">—</td>
  const fuera = err !== null && Math.abs(err) > cal.tolerancia + 1e-9
  return (
    <td className="py-2">
      {v}
      {err !== null && <span className={`block text-xs ${fuera ? 'font-semibold text-peligro-700' : 'text-slate-500'}`}>{textoError(err, cal)}</span>}
    </td>
  )
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  )
}

const COLOR: Record<EstadoRevision | '', string> = {
  Bien: 'bg-bien-100 text-bien-800',
  Mal: 'bg-peligro-100 text-peligro-800',
  'No aplica': 'bg-slate-100 text-slate-600',
  '': 'bg-slate-100 text-slate-600',
}

const n = (v: number | null) => (v === null ? '—' : String(v))

export function DetalleCalibracion() {
  const { id, calId } = useParams()
  const inst = useInstrumento(id)
  const cal = useCalibracion(id, calId)

  if (cal === undefined) return <p className="p-6 text-slate-500">Cargando…</p>
  if (cal === null) return <p className="p-6 text-slate-500">Esta calibración no existe.</p>

  const p = pruebaDe(cal.tipo)
  const err = (v: number | null, e: number) => errorLectura(cal, v, e)
  const mA = cal.lecturaEn === 'mA'
  const titulos =
    p === 'carrera' ? ['Señal %', 'As-Found %', 'As-Left %'] : p === 'analizador' ? ['Solución', 'As-Found', 'As-Left'] : mA ? ['Entrada', 'As-Found mA', 'As-Left mA'] : ['Entrada', 'As-Found', 'As-Left']
  /** Lo que debía marcar, bajo la entrada, cuando no es la misma entrada. */
  const debe = (e: number) => {
    if (p === 'carrera') return `${(4 + 0.16 * e).toFixed(1)} mA${cal.senalInvertida ? ` · debe quedar ${esperado(cal, e)} %` : ''}`
    const x = mA ? esperado(cal, e) : null
    return x === null ? null : `debe dar ${x.toFixed(2)} mA`
  }

  return (
    <div className="space-y-3 p-3">
      <section className="tarjeta space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/instrumentos/${id}`} className="font-mono text-2xl font-bold text-marca-700 underline">
            {inst?.tagISA ?? 'Instrumento'}
          </Link>
          <ResultadoCal resultado={cal.resultado} tipo={cal.tipo} />
          {cal.sinSincronizar && <Pendiente />}
        </div>
        {cal.tipo && <p className="text-sm font-medium text-slate-700">{cal.tipo}</p>}
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Dato k="Fecha" v={fechaDia(cal.fecha) ?? '—'} />
          <Dato k="Técnico" v={cal.tecnico.nombre} />
          {cal.rangoMax > cal.rangoMin && p !== 'carrera' && <Dato k="Rango" v={`${cal.rangoMin} a ${cal.rangoMax} ${cal.unidades}`} />}
          {cal.tolerancia > 0 && <Dato k="Tolerancia" v={textoTolerancia(cal)} />}
          {p === 'transmisor' && <Dato k="Salida leída en" v={mA ? 'mA (4-20)' : 'Unidades de proceso'} />}
          {p === 'carrera' && cal.senalInvertida && <Dato k="Señal" v="Invertida (4 mA = abierta)" />}
          {p === 'funcional' && <Dato k="Tiempo para abrir" v={cal.tiempoApertura === null ? '—' : `${cal.tiempoApertura} s`} />}
          {p === 'funcional' && <Dato k="Tiempo para cerrar" v={cal.tiempoCierre === null ? '—' : `${cal.tiempoCierre} s`} />}
          {p === 'analizador' && cal.pendiente !== null && <Dato k="Pendiente" v={`${cal.pendiente} %`} />}
          {p === 'analizador' && cal.offset !== null && <Dato k="Offset" v={`${cal.offset} mV`} />}
          {p !== 'funcional' && <Dato k={p === 'analizador' ? 'Soluciones patrón' : 'Patrón'} v={cal.patron || '—'} />}
          <Dato k="Próxima" v={fechaDia(cal.proxima) ?? 'sin programar'} />
        </dl>
      </section>

      {p === 'interruptor' && cal.puntos[0] ? (
        <section className="tarjeta">
          <h2 className="mb-1 font-semibold">Prueba</h2>
          <p className="mb-2 text-sm text-slate-600">
            Punto de ajuste: <span className="font-medium text-slate-800">{`${cal.puntos[0].entrada} ${cal.unidades}`.trim()}</span>
            {cal.disparaAl && ` · dispara ${cal.disparaAl.toLowerCase()}`}
          </p>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="font-medium" />
                <th className="font-medium">As-Found</th>
                <th className="font-medium">As-Left</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-2 font-medium">Disparo</td>
                <Celda v={cal.puntos[0].asFound} err={err(cal.puntos[0].asFound, cal.puntos[0].entrada)} cal={cal} />
                <Celda v={cal.puntos[0].asLeft} err={err(cal.puntos[0].asLeft, cal.puntos[0].entrada)} cal={cal} />
              </tr>
              <tr>
                <td className="py-2 font-medium">Reposición</td>
                <td className="py-2">{n(cal.reposicion?.asFound ?? null)}</td>
                <td className="py-2">{n(cal.reposicion?.asLeft ?? null)}</td>
              </tr>
              <tr className="text-slate-600">
                <td className="py-2">Diferencial</td>
                <td className="py-2">{n(diferencial(cal.puntos[0].asFound, cal.reposicion?.asFound ?? null))}</td>
                <td className="py-2">{n(diferencial(cal.puntos[0].asLeft, cal.reposicion?.asLeft ?? null))}</td>
              </tr>
            </tbody>
          </table>
        </section>
      ) : (
        cal.puntos.length > 0 && (
          <section className="tarjeta">
            <h2 className="mb-2 font-semibold">{p === 'carrera' ? 'Prueba de carrera' : p === 'analizador' ? 'Soluciones patrón' : 'Puntos'}</h2>
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  {titulos.map((t) => (
                    <th key={t} className="font-medium">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cal.puntos.map((pt, i) => (
                  <tr key={i}>
                    <td className="py-2">
                      {pt.entrada}
                      {debe(pt.entrada) && <span className="block text-xs text-slate-500">{debe(pt.entrada)}</span>}
                    </td>
                    <Celda v={pt.asFound} err={err(pt.asFound, pt.entrada)} cal={cal} />
                    <Celda v={pt.asLeft} err={err(pt.asLeft, pt.entrada)} cal={cal} />
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      )}

      {cal.revisiones.length > 0 && (
        <section className="tarjeta">
          <h2 className="mb-2 font-semibold">Revisiones</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {cal.revisiones.map((r) => (
              <li key={r.nombre} className="flex items-center justify-between gap-2 py-2">
                <span>{r.nombre}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR[r.estado]}`}>{r.estado || '—'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {cal.observaciones && (
        <section className="tarjeta">
          <h2 className="mb-1 font-semibold">Observaciones</h2>
          <p className="text-sm whitespace-pre-wrap">{cal.observaciones}</p>
        </section>
      )}
    </div>
  )
}
