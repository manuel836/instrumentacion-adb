import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { permisos, useAuth } from '../auth/AuthContext'
import { porPedir, registrarMovimiento, sinExistencia, useMovimientosDeFalla, useRefacciones } from '../lib/refacciones'
import { TIPOS_MOVIMIENTO, type Falla, type Movimiento } from '../types'
import type { ConPendiente } from '../lib/instrumentos'
import { Pendiente } from './Estado'
import { fechaCorta } from './EstadoFalla'

const colores = { entrada: 'text-emerald-700', salida: 'text-red-700', ajuste: 'text-sky-700' }

/** Kardex: fecha, tipo, cantidad, quién y para qué. */
export function ListaMovimientos({
  movimientos,
  unidad,
  conRefaccion = false,
}: {
  movimientos: ConPendiente<Movimiento>[]
  /** Una sola unidad (kardex de una refacción) o la de cada refacción por su id. */
  unidad?: string | Map<string, string>
  conRefaccion?: boolean
}) {
  const unidadDe = (m: Movimiento) => (typeof unidad === 'string' ? unidad : unidad?.get(m.refaccionId))
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {movimientos.map((m) => (
        <li key={m.id} className="flex items-start gap-3 py-2">
          <span className={`w-14 shrink-0 text-right text-lg font-bold ${colores[m.tipo]}`}>
            {m.cantidad > 0 ? '+' : ''}
            {m.cantidad}
            {unidadDe(m) && <span className="ml-0.5 text-[11px] font-normal">{unidadDe(m)}</span>}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">
              {conRefaccion ? (
                <Link to={`/refacciones/${m.refaccionId}`} className="text-marca-700 underline">
                  {m.refaccionNombre}
                </Link>
              ) : (
                TIPOS_MOVIMIENTO[m.tipo]
              )}
              {m.tagISA && !m.fallaId && <span className="font-normal text-slate-500"> · {m.tagISA}</span>}
              {m.fallaId && !conRefaccion && (
                <Link to={`/fallas/${m.fallaId}`} className="font-normal text-marca-700 underline">
                  {' '}
                  · falla de {m.tagISA}
                </Link>
              )}
            </span>
            {m.nota && <span className="block text-slate-600">{m.nota}</span>}
            <span className="block text-xs text-slate-500">
              {m.quien.nombre}
              {m.fecha && ` · ${fechaCorta(m.fecha)}`}
            </span>
            {m.sinSincronizar && <Pendiente />}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** En una falla: qué refacciones se usaron y, para técnicos, registrar una. */
export function RefaccionesUsadas({ falla }: { falla: Falla }) {
  const usadas = useMovimientosDeFalla(falla.id)
  const refacciones = useRefacciones()
  const { user, rol } = useAuth()
  const p = permisos(rol)
  const [abierto, setAbierto] = useState(false)
  const [elegida, setElegida] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')

  // Primero las que sirven para este instrumento.
  const [compatibles, otras] = useMemo(() => {
    const todas = (refacciones ?? []).filter((r) => r.existencia > 0)
    return [todas.filter((r) => r.instrumentos.includes(falla.instrumentoId)), todas.filter((r) => !r.instrumentos.includes(falla.instrumentoId))]
  }, [refacciones, falla.instrumentoId])

  function onRegistrar(e: FormEvent) {
    e.preventDefault()
    setError('')
    const r = refacciones?.find((x) => x.id === elegida)
    const n = /^\d+$/.test(cantidad.trim()) ? Number(cantidad) : 0
    if (!r) return setError('Elige la refacción.')
    if (n < 1) return setError('Escribe cuántas se usaron.')
    if (n > r.existencia) return setError(`Solo hay ${r.existencia} ${r.unidad} de ${r.nombre}.`)
    registrarMovimiento(r, {
      tipo: 'salida',
      cantidad: -n,
      nota,
      quien: { uid: user?.uid ?? '', nombre: user?.displayName || user?.email || 'Técnico' },
      falla: { id: falla.id, instrumentoId: falla.instrumentoId, tagISA: falla.tagISA },
    })
    setAbierto(false)
    setElegida('')
    setCantidad('1')
    setNota('')
  }

  if (!p.refacciones && (usadas === null || usadas.length === 0)) return null

  return (
    <section className="tarjeta space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Refacciones usadas</h2>
        {p.refacciones && !abierto && (
          <button className="text-sm font-semibold text-marca-700" onClick={() => setAbierto(true)}>
            + Registrar
          </button>
        )}
      </div>
      {usadas && usadas.length > 0 && <ListaMovimientos movimientos={usadas} unidad={new Map((refacciones ?? []).map((r) => [r.id, r.unidad]))} conRefaccion />}
      {usadas?.length === 0 && !abierto && <p className="text-sm text-slate-500">Ninguna registrada.</p>}
      {abierto && (
        <form onSubmit={onRegistrar} className="space-y-3 rounded-lg bg-slate-50 p-3">
          {compatibles.length + otras.length === 0 ? (
            <p className="text-sm text-slate-600">
              No hay refacciones con existencia.{' '}
              <Link to={`/refacciones/nueva?instrumento=${falla.instrumentoId}`} className="font-semibold text-marca-700 underline">
                Dar de alta una
              </Link>
            </p>
          ) : (
            <label className="block">
              <span className="etiqueta">Refacción</span>
              <select className="campo" value={elegida} onChange={(e) => setElegida(e.target.value)} aria-label="Refacción usada">
                <option value="">Elige…</option>
                {compatibles.length > 0 && (
                  <optgroup label={`Para ${falla.tagISA}`}>
                    {compatibles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nombre} (hay {r.existencia})
                      </option>
                    ))}
                  </optgroup>
                )}
                {otras.length > 0 && (
                  <optgroup label="Otras">
                    {otras.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nombre} (hay {r.existencia})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
          )}
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="etiqueta">Cuántas</span>
              <input className="campo" inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} aria-label="Cantidad usada" />
            </label>
            <label className="col-span-2 block">
              <span className="etiqueta">Nota (opcional)</span>
              <input className="campo" maxLength={300} value={nota} onChange={(e) => setNota(e.target.value)} />
            </label>
          </div>
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </button>
            <button className="btn-primario flex-1">Registrar salida</button>
          </div>
          <p className="text-xs text-slate-500">Se descuenta del almacén y queda en el historial de la refacción.</p>
        </form>
      )}
    </section>
  )
}

/** En la ficha: refacciones que sirven para este instrumento y cuántas hay. */
export function RefaccionesDelInstrumento({ instrumentoId }: { instrumentoId: string }) {
  const refacciones = useRefacciones()
  const { rol } = useAuth()
  const p = permisos(rol)
  const lista = (refacciones ?? []).filter((r) => r.instrumentos.includes(instrumentoId))
  if (lista.length === 0 && !p.refacciones) return null
  return (
    <section className="tarjeta">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Refacciones</h2>
        {p.refacciones && (
          <Link to={`/refacciones/nueva?instrumento=${instrumentoId}`} className="text-sm font-semibold text-marca-700">
            + Agregar
          </Link>
        )}
      </div>
      {lista.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Ninguna registrada para este instrumento.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {lista.map((r) => (
            <li key={r.id}>
              <Link to={`/refacciones/${r.id}`} className="flex items-center justify-between gap-2 py-3 text-sm active:bg-slate-50">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.nombre}</span>
                  {r.numeroParte && <span className="block truncate text-xs text-slate-500">{r.numeroParte}</span>}
                </span>
                <span className={`shrink-0 font-semibold ${sinExistencia(r) ? 'text-red-700' : porPedir(r) ? 'text-amber-700' : 'text-slate-700'}`}>
                  {r.existencia} {r.unidad}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
