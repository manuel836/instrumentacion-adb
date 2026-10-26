import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { permisos, useAuth } from '../auth/AuthContext'
import { useInstrumentos } from '../lib/instrumentos'
import { ajustarExistencia, borrarRefaccion, porPedir, registrarMovimiento, sinExistencia, useMovimientos, useRefaccion } from '../lib/refacciones'
import { useOnline } from '../hooks/useOnline'
import { Pendiente } from '../components/Estado'
import { ListaMovimientos } from '../components/RefaccionesUsadas'
import { Existencia } from './Refacciones'

type Modo = 'entrada' | 'salida' | 'conteo'

const TITULOS: Record<Modo, { titulo: string; pregunta: string; boton: string }> = {
  entrada: { titulo: 'Entrada al almacén', pregunta: '¿Cuántas llegaron?', boton: 'Registrar entrada' },
  salida: { titulo: 'Salida del almacén', pregunta: '¿Cuántas se sacaron?', boton: 'Registrar salida' },
  conteo: { titulo: 'Conteo físico', pregunta: '¿Cuántas hay en el anaquel?', boton: 'Ajustar existencia' },
}

/** Una refacción: existencia, entradas y salidas, instrumentos donde se usa y su kardex. */
export function DetalleRefaccion() {
  const { id } = useParams()
  const r = useRefaccion(id)
  const movimientos = useMovimientos(id)
  const instrumentos = useInstrumentos()
  const navigate = useNavigate()
  const online = useOnline()
  const { user, rol } = useAuth()
  const p = permisos(rol)
  const [modo, setModo] = useState<Modo | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [nota, setNota] = useState('')
  const [instrumento, setInstrumento] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [borrando, setBorrando] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const compatibles = useMemo(
    () => (instrumentos ?? []).filter((i) => r?.instrumentos.includes(i.id)).sort((a, b) => a.tagISA.localeCompare(b.tagISA)),
    [instrumentos, r?.instrumentos],
  )

  if (r === undefined) return <p className="p-6 text-slate-500">Cargando…</p>
  if (r === null) return <p className="p-6 text-slate-500">Esta refacción no existe.</p>

  const quien = { uid: user?.uid ?? '', nombre: user?.displayName || user?.email || 'Técnico' }

  function abrir(m: Modo) {
    setModo(m)
    setCantidad('')
    setNota('')
    setInstrumento('')
    setError('')
    setAviso('')
  }

  async function onRegistrar(e: FormEvent) {
    e.preventDefault()
    if (!r || !modo) return
    setError('')
    const n = /^\d+$/.test(cantidad.trim()) ? Number(cantidad) : null
    if (n === null || n > 100000 || (modo !== 'conteo' && n === 0)) return setError('Escribe una cantidad entera.')
    if (modo === 'salida' && n > r.existencia) return setError(`Solo hay ${r.existencia} ${r.unidad} en existencia. Si contaste más, primero haz un conteo.`)
    if (modo === 'conteo') {
      setEnviando(true)
      try {
        const dif = await ajustarExistencia(r, n, nota, quien)
        setAviso(dif === 0 ? 'La existencia ya cuadraba: no hubo cambio.' : `Existencia ajustada a ${n} (${dif > 0 ? '+' : ''}${dif}).`)
        setModo(null)
      } catch {
        setError('No se pudo leer la existencia del servidor. El conteo necesita señal.')
      } finally {
        setEnviando(false)
      }
      return
    }
    const inst = compatibles.find((i) => i.id === instrumento)
    registrarMovimiento(r, {
      tipo: modo,
      cantidad: modo === 'entrada' ? n : -n,
      nota,
      quien,
      instrumento: inst ? { id: inst.id, tagISA: inst.tagISA } : null,
    })
    setAviso(modo === 'entrada' ? `Entrada de ${n} ${r.unidad} registrada.` : `Salida de ${n} ${r.unidad} registrada.`)
    setModo(null)
  }

  async function onBorrar() {
    if (!r) return
    await borrarRefaccion(r.id)
    navigate('/refacciones', { replace: true, state: { aviso: `Se borró ${r.nombre}.` } })
  }

  return (
    <div className="space-y-3 p-3">
      <section className="tarjeta space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold">{r.nombre}</h1>
            <p className="text-sm text-slate-600">{[r.numeroParte, r.marca].filter(Boolean).join(' · ') || 'Sin número de parte'}</p>
            {r.ubicacion && <p className="text-sm text-slate-500">{r.ubicacion}</p>}
            <div className="mt-1 flex flex-wrap gap-1.5">
              {sinExistencia(r) && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">Sin existencia</span>}
              {!sinExistencia(r) && porPedir(r) && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Por pedir</span>}
              {r.sinSincronizar && <Pendiente />}
            </div>
          </div>
          <Existencia r={r} grande />
        </div>
        {r.notas && <p className="text-sm whitespace-pre-wrap text-slate-700">{r.notas}</p>}
        {aviso && <p className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-800">{aviso}</p>}
        {p.refacciones && !modo && (
          <div className="grid grid-cols-3 gap-2">
            <button className="btn-secundario px-2" onClick={() => abrir('entrada')}>
              Entrada
            </button>
            <button className="btn-secundario px-2" onClick={() => abrir('salida')} disabled={r.existencia <= 0}>
              Salida
            </button>
            <button className="btn-secundario px-2" onClick={() => abrir('conteo')} disabled={!online}>
              Conteo
            </button>
          </div>
        )}
        {modo && (
          <form onSubmit={(e) => void onRegistrar(e)} className="space-y-3 rounded-lg bg-slate-50 p-3">
            <h2 className="font-semibold">{TITULOS[modo].titulo}</h2>
            <label className="block">
              <span className="etiqueta">{TITULOS[modo].pregunta}</span>
              <input className="campo" inputMode="numeric" autoFocus value={cantidad} onChange={(e) => setCantidad(e.target.value)} aria-label="Cantidad" />
            </label>
            {modo === 'salida' && compatibles.length > 0 && (
              <label className="block">
                <span className="etiqueta">¿Para qué instrumento?</span>
                <select className="campo" value={instrumento} onChange={(e) => setInstrumento(e.target.value)}>
                  <option value="">Ninguno en particular</option>
                  {compatibles.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.tagISA}
                      {i.subArea && ` (${i.subArea})`} · {i.servicio}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block">
              <span className="etiqueta">Nota (opcional)</span>
              <input
                className="campo"
                maxLength={300}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder={modo === 'entrada' ? 'Orden de compra, proveedor…' : modo === 'salida' ? 'Para qué se usó' : 'Motivo de la diferencia'}
              />
            </label>
            {modo === 'conteo' && <p className="text-xs text-slate-500">Se registra la diferencia contra lo que dice el sistema. Necesita señal.</p>}
            {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div className="flex gap-2">
              <button type="button" className="btn-secundario" onClick={() => setModo(null)}>
                Cancelar
              </button>
              <button className="btn-primario flex-1" disabled={enviando}>
                {TITULOS[modo].boton}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="tarjeta space-y-2">
        <h2 className="font-semibold">Instrumentos donde se usa</h2>
        {compatibles.length === 0 ? (
          <p className="text-sm text-slate-500">Ninguno registrado.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {compatibles.map((i) => (
              <li key={i.id}>
                <Link to={`/instrumentos/${i.id}`} className="block rounded-full bg-marca-50 px-3 py-1 font-mono text-sm font-semibold text-marca-800">
                  {i.tagISA}
                  {i.subArea && <span className="font-sans text-xs font-medium"> · {i.subArea}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tarjeta space-y-2">
        <h2 className="font-semibold">Movimientos</h2>
        {movimientos === null ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : movimientos.length === 0 ? (
          <p className="text-sm text-slate-500">Sin entradas ni salidas todavía.</p>
        ) : (
          <ListaMovimientos movimientos={movimientos} unidad={r.unidad} />
        )}
      </section>

      {p.refacciones && (
        <Link to={`/refacciones/${r.id}/editar`} className="btn-secundario w-full">
          Editar datos
        </Link>
      )}
      {p.borrarRefacciones && (
        <div className="space-y-2 pt-2">
          {!borrando ? (
            <button className="btn-peligro w-full" onClick={() => setBorrando(true)} disabled={!online}>
              Borrar refacción
            </button>
          ) : (
            <div className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-900">
              <p>
                ¿Borrar <b>{r.nombre}</b>? Sus movimientos se conservan en las fallas donde se usó.
              </p>
              <div className="flex gap-2">
                <button className="btn-secundario flex-1" onClick={() => setBorrando(false)}>
                  Cancelar
                </button>
                <button className="btn-peligro flex-1" onClick={() => void onBorrar()}>
                  Sí, borrar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
