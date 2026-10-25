import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Timestamp } from 'firebase/firestore'
import { useAuth } from '../auth/AuthContext'
import { registrarCalibracion, useCalibraciones } from '../lib/calibraciones'
import { useInstrumento } from '../lib/instrumentos'
import { errorPct, puntosDelRango, resultadoSugerido } from '../lib/tolerancia'
import { RESULTADOS_CALIBRACION, type ResultadoCalibracion } from '../types'

interface Fila {
  entrada: string
  asFound: string
  asLeft: string
}

const MAX_PUNTOS = 11

/** Acepta coma o punto decimal; vacío es null. */
function numero(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function hoyISO(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function sumarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const f = new Date(a, m - 1 + meses, d, 12)
  return new Date(f.getTime() - f.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

const aTimestamp = (iso: string) => Timestamp.fromDate(new Date(`${iso}T12:00:00`))

function ErrorPct({ v }: { v: number | null }) {
  if (v === null) return null
  return <span className="block text-[11px] text-slate-500">{`${v >= 0 ? '+' : ''}${v.toFixed(2)} %`}</span>
}

export function NuevaCalibracion() {
  const { id } = useParams()
  const inst = useInstrumento(id)
  const anteriores = useCalibraciones(id)
  const { user } = useAuth()
  const navigate = useNavigate()

  const [fecha, setFecha] = useState(hoyISO)
  const [proxima, setProxima] = useState(() => sumarMeses(hoyISO(), 12))
  const [patron, setPatron] = useState('')
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const [unidades, setUnidades] = useState('')
  const [tolerancia, setTolerancia] = useState('0.5')
  const [filas, setFilas] = useState<Fila[]>([])
  const [resultado, setResultado] = useState<ResultadoCalibracion | ''>('')
  const [observaciones, setObservaciones] = useState('')
  const [error, setError] = useState('')
  const [listo, setListo] = useState(false)

  // Rango, unidades y puntos salen de la ficha del instrumento.
  useEffect(() => {
    if (!inst || listo) return
    setListo(true)
    if (inst.rangoMin !== null) setMin(String(inst.rangoMin))
    if (inst.rangoMax !== null) setMax(String(inst.rangoMax))
    setUnidades(inst.unidades)
    const puntos = inst.rangoMin !== null && inst.rangoMax !== null && inst.rangoMax > inst.rangoMin ? puntosDelRango(inst.rangoMin, inst.rangoMax) : [null, null, null]
    setFilas(puntos.map((p) => ({ entrada: p === null ? '' : String(p), asFound: '', asLeft: '' })))
  }, [inst, listo])

  const nMin = numero(min)
  const nMax = numero(max)
  const nTol = numero(tolerancia)
  const rangoOk = nMin !== null && nMax !== null && nMax > nMin
  const puntos = useMemo(
    () =>
      filas
        .map((f) => ({ entrada: numero(f.entrada), asFound: numero(f.asFound), asLeft: numero(f.asLeft) }))
        .filter((p): p is { entrada: number; asFound: number; asLeft: number | null } => p.entrada !== null && p.asFound !== null),
    [filas],
  )
  const sugerido = rangoOk && nTol !== null && puntos.length > 0 ? resultadoSugerido(puntos, nTol, nMin, nMax) : null

  if (inst === undefined) return <p className="p-6 text-slate-500">Cargando…</p>
  if (inst === null) return <p className="p-6 text-slate-500">Este instrumento no existe.</p>

  const setFila = (i: number, k: keyof Fila, v: string) => setFilas(filas.map((f, j) => (j === i ? { ...f, [k]: v } : f)))

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!user || !inst) return
    if (!rangoOk) return setError('Captura el rango: el máximo debe ser mayor que el mínimo.')
    if (nTol === null || nTol <= 0) return setError('La tolerancia debe ser mayor que 0.')
    if (puntos.length < 2) return setError('Captura al menos 2 puntos con entrada y lectura As-Found.')
    const final = resultado || sugerido
    if (!final) return
    const fechaTs = aTimestamp(fecha)
    const masReciente = (anteriores ?? []).every((c) => c.fecha.toMillis() <= fechaTs.toMillis())
    registrarCalibracion(
      inst.id,
      {
        fecha: fechaTs,
        tecnico: { uid: user.uid, nombre: user.displayName || user.email || 'Técnico' },
        puntos,
        tolerancia: nTol,
        rangoMin: nMin,
        rangoMax: nMax,
        unidades: unidades.trim(),
        patron: patron.trim(),
        resultado: final,
        observaciones: observaciones.trim(),
        proxima: proxima ? aTimestamp(proxima) : null,
      },
      masReciente,
    )
    navigate(`/instrumentos/${inst.id}`, { replace: true })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold">Registrar calibración</h1>
        <p className="font-mono text-slate-600">{inst.tagISA}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="etiqueta">Fecha *</span>
          <input
            className="campo"
            type="date"
            required
            value={fecha}
            max={hoyISO()}
            onChange={(e) => {
              setFecha(e.target.value)
              if (e.target.value) setProxima(sumarMeses(e.target.value, 12))
            }}
          />
        </label>
        <label className="block">
          <span className="etiqueta">Tolerancia ± % span *</span>
          <input className="campo" inputMode="decimal" value={tolerancia} onChange={(e) => setTolerancia(e.target.value)} />
        </label>
        <label className="block">
          <span className="etiqueta">Rango mínimo *</span>
          <input className="campo" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} />
        </label>
        <label className="block">
          <span className="etiqueta">Rango máximo *</span>
          <input className="campo" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />
        </label>
        <label className="block">
          <span className="etiqueta">Unidades</span>
          <input className="campo" placeholder="kg/cm²" value={unidades} onChange={(e) => setUnidades(e.target.value)} />
        </label>
        <label className="block">
          <span className="etiqueta">Patrón usado</span>
          <input className="campo" placeholder="Fluke 754" value={patron} onChange={(e) => setPatron(e.target.value)} />
        </label>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">Puntos</h2>
        <p className="text-xs text-slate-500">
          Entrada: valor aplicado con el patrón. As-Found: lo que marcó antes de ajustar. As-Left: lo que marcó después (déjalo vacío si no se ajustó).
        </p>
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs font-medium text-slate-600">
          <span>Entrada</span>
          <span>As-Found</span>
          <span>As-Left</span>
          <span className="w-6" />
        </div>
        {filas.map((f, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-start gap-2">
            <input className="campo px-2 py-2" inputMode="decimal" aria-label={`Entrada ${i + 1}`} value={f.entrada} onChange={(e) => setFila(i, 'entrada', e.target.value)} />
            <div>
              <input className="campo px-2 py-2" inputMode="decimal" aria-label={`As-Found ${i + 1}`} value={f.asFound} onChange={(e) => setFila(i, 'asFound', e.target.value)} />
              {rangoOk && numero(f.entrada) !== null && <ErrorPct v={errorPct(numero(f.asFound), numero(f.entrada)!, nMin, nMax)} />}
            </div>
            <div>
              <input className="campo px-2 py-2" inputMode="decimal" aria-label={`As-Left ${i + 1}`} value={f.asLeft} onChange={(e) => setFila(i, 'asLeft', e.target.value)} />
              {rangoOk && numero(f.entrada) !== null && <ErrorPct v={errorPct(numero(f.asLeft), numero(f.entrada)!, nMin, nMax)} />}
            </div>
            <button type="button" aria-label="Quitar punto" className="w-6 py-2 text-red-700" onClick={() => setFilas(filas.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        ))}
        {filas.length < MAX_PUNTOS && (
          <button type="button" className="text-sm font-semibold text-marca-700" onClick={() => setFilas([...filas, { entrada: '', asFound: '', asLeft: '' }])}>
            + Agregar punto
          </button>
        )}
      </section>

      <label className="block">
        <span className="etiqueta">Resultado *</span>
        <select className="campo" value={resultado} onChange={(e) => setResultado(e.target.value as ResultadoCalibracion | '')}>
          <option value="">{sugerido ? `Según tolerancia: ${sugerido}` : 'Se calcula con los puntos'}</option>
          {RESULTADOS_CALIBRACION.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>

      <div>
        <label className="block">
          <span className="etiqueta">Próxima calibración</span>
          <input className="campo" type="date" value={proxima} min={fecha} onChange={(e) => setProxima(e.target.value)} />
        </label>
        <div className="mt-2 flex gap-2">
          {[6, 12, 24].map((m) => (
            <button key={m} type="button" className="rounded-full border border-slate-300 px-3 py-1 text-sm" onClick={() => setProxima(sumarMeses(fecha, m))}>
              {m} meses
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="etiqueta">Observaciones</span>
        <textarea className="campo min-h-20" value={observaciones} maxLength={2000} onChange={(e) => setObservaciones(e.target.value)} />
      </label>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <p className="text-xs text-slate-500">Sin señal se guarda en el teléfono y se sincroniza al reconectar.</p>
      <div className="flex gap-2">
        <button type="button" className="btn-secundario flex-1" onClick={() => navigate(-1)}>
          Cancelar
        </button>
        <button className="btn-primario flex-1">Guardar</button>
      </div>
    </form>
  )
}
