import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Timestamp } from 'firebase/firestore'
import { useAuth } from '../auth/AuthContext'
import { registrarCalibracion, useCalibraciones } from '../lib/calibraciones'
import { useInstrumento } from '../lib/instrumentos'
import { errorLectura, esperado, puntosDelRango, resultadoSugerido, textoError, type Medida } from '../lib/tolerancia'
import {
  DISPARA_AL,
  RAIZ_CUADRADA,
  SALIDAS_TRANSMISOR,
  camposDeTipo,
  datosDelTipo,
  diferencial,
  pruebaDe,
  resultadoRevisiones,
  revisionesDe,
  textoResultado,
  tipoSugerido,
  type Prueba,
} from '../lib/tipos'
import { RESULTADOS_CALIBRACION, type Calibracion, type Instrumento, type InstrumentoNuevo, type ResultadoCalibracion, type Revision } from '../types'
import { AvisoDisparo } from '../components/AvisoDisparo'
import { SelectorUnidades } from '../components/SelectorUnidades'
import { SelectorTipo } from '../components/SelectorTipo'
import { ListaRevisiones, Segmentado, TablaPuntos, numero, type Fila } from '../components/PruebasCalibracion'
import { unidadConocida } from '../lib/unidades'
import { avisarGuardado } from '../components/Listo'
import { Silueta } from '../components/Silueta'

const MAX_PUNTOS = 11

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

const filasDe = (puntos: (number | null)[]): Fila[] => puntos.map((p) => ({ entrada: p === null ? '' : String(p), asFound: '', asLeft: '' }))

/** Lo que se captura en la prueba; cambia según el tipo del instrumento. */
interface Captura {
  tipo: string
  min: string
  max: string
  unidades: string
  tolerancia: string
  filas: Fila[]
  lecturaEn: 'mA' | 'unidades'
  /** '' si el tipo no la tiene (temperatura y lo que no es transmisor). */
  salidaTransmisor: string
  senalInvertida: boolean
  disparaAl: string
  reposicion: { asFound: string; asLeft: string }
  revisiones: Revision[]
  tiempoApertura: string
  tiempoCierre: string
  ajustada: boolean
  pendiente: string
  offset: string
}

/**
 * Valores con los que empieza la prueba: rango, unidades y puntos salen de la ficha del instrumento.
 * Un transmisor se lee como en su calibración anterior (mA o unidades de proceso); el de raíz
 * cuadrada, si no hay anterior, en mA, que es donde se ve la raíz.
 */
function capturaInicial(inst: Instrumento, tipo: string, anterior?: Calibracion): Captura {
  const p = pruebaDe(tipo)
  const conRango = inst.rangoMin !== null && inst.rangoMax !== null && inst.rangoMax > inst.rangoMin
  const unidades = unidadConocida(inst.unidades) ?? inst.unidades
  const base: Captura = {
    tipo,
    min: conRango ? String(inst.rangoMin) : '',
    max: conRango ? String(inst.rangoMax) : '',
    unidades,
    tolerancia: '0.5',
    filas: filasDe(conRango ? puntosDelRango(inst.rangoMin!, inst.rangoMax!) : [null, null, null]),
    lecturaEn: 'unidades',
    salidaTransmisor: camposDeTipo(tipo).includes('salidaTransmisor') ? inst.salidaTransmisor || 'Lineal' : '',
    senalInvertida: false,
    disparaAl: inst.disparaAl,
    reposicion: { asFound: '', asLeft: '' },
    revisiones: revisionesDe(p, inst).map((nombre) => ({ nombre, estado: '' })),
    tiempoApertura: '',
    tiempoCierre: '',
    ajustada: false,
    pendiente: '',
    offset: '',
  }
  if (p === 'transmisor') {
    const enMA = anterior ? anterior.lecturaEn === 'mA' : base.salidaTransmisor === RAIZ_CUADRADA
    return { ...base, lecturaEn: enMA ? 'mA' : 'unidades' }
  }
  // La carrera va de 0 a 100 % de la señal (4 a 20 mA).
  if (p === 'carrera') return { ...base, min: '0', max: '100', unidades: '%', tolerancia: '2', filas: filasDe([0, 25, 50, 75, 100]) }
  if (p === 'funcional') return { ...base, filas: [], tolerancia: '' }
  // En interruptores la tolerancia se escribe cada vez (cambia mucho de uno a otro).
  if (p === 'interruptor') return { ...base, tolerancia: '', filas: filasDe([inst.puntoAjuste]) }
  if (p === 'analizador') {
    const ph = unidades === 'pH'
    return { ...base, tolerancia: ph ? '0.1' : '', filas: filasDe(ph ? [4, 7, 10] : [null, null]) }
  }
  return base
}

/** Cómo se evalúan las lecturas en esta prueba. */
function medidaDe(p: Prueba, c: Captura, inst: Instrumento): Medida & { unidades: string } {
  const min = numero(c.min)
  const max = numero(c.max)
  const enUnidades = p === 'interruptor' || p === 'analizador'
  // Interruptores y analizadores no necesitan rango: se guarda el de la ficha si lo tiene.
  const rango = enUnidades
    ? inst.rangoMin !== null && inst.rangoMax !== null && inst.rangoMax > inst.rangoMin
      ? { rangoMin: inst.rangoMin, rangoMax: inst.rangoMax }
      : { rangoMin: 0, rangoMax: 0 }
    : { rangoMin: min ?? 0, rangoMax: max ?? 0 }
  return {
    ...rango,
    unidades: c.unidades.trim(),
    lecturaEn: p === 'transmisor' ? c.lecturaEn : 'unidades',
    salidaTransmisor: c.salidaTransmisor,
    toleranciaEn: enUnidades ? 'unidades' : '%',
    senalInvertida: p === 'carrera' && c.senalInvertida,
  }
}

function Campo({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="etiqueta">{label}</span>
      {children}
    </label>
  )
}

export function NuevaCalibracion() {
  const { id } = useParams()
  const inst = useInstrumento(id)
  const anteriores = useCalibraciones(id)
  const { user } = useAuth()
  const navigate = useNavigate()

  const [fecha, setFecha] = useState(hoyISO)
  // La próxima calibración es opcional: empieza vacía y se llena con los atajos o a mano.
  const [proxima, setProxima] = useState('')
  /** Meses elegidos con un atajo: si cambia la fecha, la próxima se recalcula. */
  const [plazo, setPlazo] = useState<number | null>(null)
  const [patron, setPatron] = useState('')
  const [cap, setCap] = useState<Captura | null>(null)
  const [resultado, setResultado] = useState<ResultadoCalibracion | ''>('')
  const [observaciones, setObservaciones] = useState('')
  const [error, setError] = useState('')

  // Se arma una sola vez: lo que llegue de la ficha mientras se captura no borra lo escrito.
  useEffect(() => {
    if (inst && anteriores && !cap) setCap(capturaInicial(inst, inst.tipo, anteriores[0]))
  }, [inst, anteriores, cap])

  const p = pruebaDe(cap?.tipo)
  const medida = inst && cap ? medidaDe(p, cap, inst) : null
  const puntos = useMemo(
    () =>
      (cap?.filas ?? [])
        .map((f) => ({ entrada: numero(f.entrada), asFound: numero(f.asFound), asLeft: numero(f.asLeft) }))
        .filter((x): x is { entrada: number; asFound: number; asLeft: number | null } => x.entrada !== null && x.asFound !== null),
    [cap?.filas],
  )

  if (inst === undefined || (inst && !cap)) return <Silueta />
  if (inst === null || !cap || !medida) return <p className="p-6 text-slate-500">Este instrumento no existe.</p>

  const set = <K extends keyof Captura>(k: K, v: Captura[K]) => {
    setCap((c) => c && { ...c, [k]: v })
    // El aviso de lo que faltaba se quita en cuanto se corrige algo.
    setError('')
  }
  /** Solo si el instrumento aún no tiene tipo: la prueba empieza de nuevo con la del tipo elegido. */
  function cambiarTipo(tipo: string) {
    setCap(capturaInicial(inst!, tipo, anteriores?.[0]))
    setResultado('')
  }

  const nTol = numero(cap.tolerancia)
  const conRango = medida.rangoMax > medida.rangoMin
  const enUnidades = medida.toleranciaEn === 'unidades'
  // El rango hace falta para calcular el error en % del span (y el mA esperado).
  const calcula = (enUnidades || conRango) && nTol !== null && nTol > 0
  const reposicion = { asFound: numero(cap.reposicion.asFound), asLeft: numero(cap.reposicion.asLeft) }
  const revisionMal = cap.revisiones.some((r) => r.estado === 'Mal')

  function sugerencia(): ResultadoCalibracion | null {
    if (p === 'funcional') return resultadoRevisiones(cap!.revisiones, cap!.ajustada)
    if (!calcula || puntos.length === 0) return null
    let r = resultadoSugerido(puntos, nTol!, medida!)
    // En el interruptor también cuenta como ajuste mover solo la reposición.
    if (p === 'interruptor' && r === 'Aprobada sin ajuste' && reposicion.asLeft !== null) r = 'Ajustada'
    if (p === 'carrera' && revisionMal) r = 'Fuera de tolerancia'
    return r
  }
  const sugerido = sugerencia()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!user || !inst || !cap || !medida) return
    if (p !== 'funcional') {
      if (!enUnidades && !conRango) return setError('Captura el rango: el máximo debe ser mayor que el mínimo.')
      if (nTol === null || nTol <= 0) return setError('La tolerancia debe ser mayor que 0.')
    }
    if (p === 'interruptor') {
      if (numero(cap.filas[0]?.entrada ?? '') === null) return setError('Escribe el punto de ajuste.')
      if (puntos.length === 0) return setError('Escribe dónde disparó (As-Found).')
    } else if (p === 'analizador') {
      if (puntos.length < 1) return setError('Captura al menos una solución con su lectura As-Found.')
    } else if (p !== 'funcional' && puntos.length < 2) {
      return setError('Captura al menos 2 puntos con entrada y lectura As-Found.')
    }
    if (cap.revisiones.some((r) => !r.estado)) return setError('Marca Bien, Mal o No aplica en cada revisión.')
    if (proxima && proxima <= fecha) return setError('La próxima calibración debe ser después de la fecha de esta.')
    const final = resultado || sugerido
    if (!final) return

    const datos: Omit<Calibracion, 'id'> = {
      fecha: aTimestamp(fecha),
      tecnico: { uid: user.uid, nombre: user.displayName || user.email || 'Técnico' },
      puntos: p === 'funcional' ? [] : puntos,
      tolerancia: p === 'funcional' ? 0 : nTol!,
      rangoMin: medida.rangoMin,
      rangoMax: medida.rangoMax,
      unidades: p === 'funcional' ? '' : medida.unidades,
      patron: patron.trim(),
      resultado: final,
      observaciones: observaciones.trim(),
      proxima: proxima ? aTimestamp(proxima) : null,
      tipo: cap.tipo,
      lecturaEn: medida.lecturaEn ?? 'unidades',
      salidaTransmisor: cap.salidaTransmisor,
      toleranciaEn: medida.toleranciaEn ?? '%',
      senalInvertida: medida.senalInvertida ?? false,
      disparaAl: p === 'interruptor' ? cap.disparaAl : '',
      reposicion: p === 'interruptor' ? reposicion : null,
      revisiones: cap.revisiones,
      tiempoApertura: p === 'funcional' ? numero(cap.tiempoApertura) : null,
      tiempoCierre: p === 'funcional' ? numero(cap.tiempoCierre) : null,
      pendiente: p === 'analizador' ? numero(cap.pendiente) : null,
      offset: p === 'analizador' ? numero(cap.offset) : null,
    }
    // Lo que se llenó aquí y la ficha no tenía se guarda también en la ficha.
    const paraLaFicha: Partial<InstrumentoNuevo> = {}
    if (!inst.tipo && cap.tipo) paraLaFicha.tipo = cap.tipo
    // Si en la prueba resultó de otra salida, la ficha se corrige.
    if (cap.salidaTransmisor && cap.salidaTransmisor !== (inst.salidaTransmisor || 'Lineal')) paraLaFicha.salidaTransmisor = cap.salidaTransmisor
    if (p === 'interruptor') {
      if (inst.puntoAjuste === null) paraLaFicha.puntoAjuste = puntos[0].entrada
      if (!inst.disparaAl && cap.disparaAl) paraLaFicha.disparaAl = cap.disparaAl
    }
    const masReciente = (anteriores ?? []).every((c) => c.fecha.toMillis() <= datos.fecha.toMillis())
    registrarCalibracion(inst.id, datos, masReciente, paraLaFicha, inst.tagISA)
    avisarGuardado('Calibración guardada.', 'Calibración guardada en el teléfono. Se envía cuando haya señal.')
    navigate(`/instrumentos/${inst.id}`, { replace: true })
  }

  const sugeridoPorTag = inst.tipo ? null : tipoSugerido(inst.tagISA)
  const datosTipo = datosDelTipo(inst)
  const u = medida.unidades

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold">Registrar calibración</h1>
        <p className="font-mono text-slate-600">
          {inst.tagISA}
          {inst.subArea && <span className="font-sans text-sm"> · {inst.subArea}</span>}
        </p>
      </div>
      {inst.disparaCaldera && <AvisoDisparo nota={inst.notaDisparo} />}

      {inst.tipo ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <p className="font-semibold">{inst.tipo}</p>
          {datosTipo.length > 0 && <p className="text-slate-600">{datosTipo.map((d) => `${d.k}: ${d.v}`).join(' · ')}</p>}
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-aviso-300 bg-aviso-50 p-3">
          <Campo label="Tipo de instrumento">
            <SelectorTipo value={cap.tipo} onChange={cambiarTipo} />
          </Campo>
          {sugeridoPorTag && cap.tipo !== sugeridoPorTag && (
            <button type="button" className="btn-secundario w-full" onClick={() => cambiarTipo(sugeridoPorTag)}>
              Usar «{sugeridoPorTag}» (según el tag)
            </button>
          )}
          <p className="text-xs text-slate-600">Este instrumento aún no tiene tipo. El que elijas cambia la prueba y se guarda en su ficha.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Campo label="Fecha *">
          <input
            className="campo"
            type="date"
            required
            value={fecha}
            max={hoyISO()}
            onChange={(e) => {
              setFecha(e.target.value)
              if (e.target.value && plazo) setProxima(sumarMeses(e.target.value, plazo))
            }}
          />
        </Campo>
        {p !== 'funcional' && (
          <Campo label={enUnidades ? `Tolerancia ± ${u || 'unidades'} *` : p === 'carrera' ? 'Tolerancia ± % carrera *' : 'Tolerancia ± % span *'}>
            <input className="campo" inputMode="decimal" value={cap.tolerancia} onChange={(e) => set('tolerancia', e.target.value)} />
          </Campo>
        )}
        {(p === 'general' || p === 'indicador' || p === 'transmisor') && (
          <>
            <Campo label="Rango mínimo *">
              <input className="campo" inputMode="decimal" value={cap.min} onChange={(e) => set('min', e.target.value)} />
            </Campo>
            <Campo label="Rango máximo *">
              <input className="campo" inputMode="decimal" value={cap.max} onChange={(e) => set('max', e.target.value)} />
            </Campo>
          </>
        )}
        {p === 'interruptor' && (
          <Campo label="Punto de ajuste *">
            <input
              className="campo"
              inputMode="decimal"
              value={cap.filas[0]?.entrada ?? ''}
              onChange={(e) => set('filas', [{ ...(cap.filas[0] ?? { asFound: '', asLeft: '' }), entrada: e.target.value }])}
            />
          </Campo>
        )}
        {p !== 'carrera' && p !== 'funcional' && (
          <Campo label="Unidades">
            <SelectorUnidades value={cap.unidades} onChange={(v) => set('unidades', v)} />
          </Campo>
        )}
        {p === 'funcional' ? (
          <>
            <Campo label="Tiempo para abrir (s)">
              <input className="campo" inputMode="decimal" value={cap.tiempoApertura} onChange={(e) => set('tiempoApertura', e.target.value)} />
            </Campo>
            <Campo label="Tiempo para cerrar (s)">
              <input className="campo" inputMode="decimal" value={cap.tiempoCierre} onChange={(e) => set('tiempoCierre', e.target.value)} />
            </Campo>
          </>
        ) : (
          <Campo label={p === 'analizador' ? 'Soluciones patrón (marca, lote)' : 'Patrón usado'} className={p === 'carrera' ? 'col-span-2' : ''}>
            <input
              className="campo"
              placeholder={p === 'analizador' ? 'Buffer pH lote 2310' : p === 'carrera' ? 'Calibrador de lazo Fluke 707' : 'Fluke 754'}
              value={patron}
              onChange={(e) => setPatron(e.target.value)}
            />
          </Campo>
        )}
      </div>

      {p === 'interruptor' && (
        <section className="space-y-3">
          <div>
            <span className="etiqueta">Dispara</span>
            <Segmentado etiqueta="Dispara" opciones={DISPARA_AL.map((d) => ({ valor: d, texto: d }))} valor={cap.disparaAl} onChange={(v) => set('disparaAl', v)} />
          </div>
          <h2 className="font-semibold">Prueba</h2>
          <p className="text-xs text-slate-500">
            Disparo: valor al que cambió el contacto. Reposición: valor al que regresó. As-Left vacío si no se ajustó.
          </p>
          <PruebaInterruptor cap={cap} set={set} medida={medida} calcula={calcula} reposicion={reposicion} />
        </section>
      )}

      {cap.salidaTransmisor && (
        <div>
          <span className="etiqueta">Salida del transmisor</span>
          <Segmentado
            etiqueta="Salida del transmisor"
            opciones={SALIDAS_TRANSMISOR.map((s): { valor: string; texto: string } => ({ valor: s.valor, texto: s.valor }))}
            valor={cap.salidaTransmisor}
            onChange={(v) => set('salidaTransmisor', v)}
          />
          <p className="mt-1 text-xs text-slate-500">
            {cap.salidaTransmisor === RAIZ_CUADRADA
              ? 'mA = √((entrada − mín.) / span) × 16 + 4. Con 25 % de la entrada debe dar 12 mA.'
              : 'mA = (entrada − mín.) / span × 16 + 4.'}
            {inst.tipo && cap.salidaTransmisor !== (inst.salidaTransmisor || 'Lineal') && ' Al guardar, también se corrige en su ficha.'}
          </p>
        </div>
      )}

      {p === 'transmisor' && (
        <div>
          <span className="etiqueta">Leí la salida en</span>
          <Segmentado
            etiqueta="Leí la salida en"
            opciones={[
              { valor: 'mA', texto: 'mA (4-20)' },
              { valor: 'unidades', texto: 'Unidades de proceso' },
            ]}
            valor={cap.lecturaEn}
            onChange={(v) => set('lecturaEn', v)}
          />
          {cap.salidaTransmisor === RAIZ_CUADRADA && cap.lecturaEn === 'unidades' && (
            <p className="mt-1 text-xs text-slate-500">En unidades de proceso la presión diferencial se compara igual que en uno lineal. La raíz solo se comprueba leyendo los mA.</p>
          )}
        </div>
      )}

      {p === 'carrera' && (
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
          <input type="checkbox" className="mt-1 size-5" checked={cap.senalInvertida} onChange={(e) => set('senalInvertida', e.target.checked)} />
          <span className="text-sm">
            Señal invertida
            <span className="block text-xs text-slate-500">Márcalo si con 4 mA queda 100 % abierta.</span>
          </span>
        </label>
      )}

      {p !== 'interruptor' && p !== 'funcional' && (
        <section className="space-y-2">
          <h2 className="font-semibold">{p === 'carrera' ? 'Prueba de carrera' : p === 'analizador' ? 'Soluciones patrón' : 'Puntos'}</h2>
          <p className="text-xs text-slate-500">
            {p === 'carrera'
              ? 'Señal: % que se manda al posicionador. Posición: % de abertura que se midió antes (As-Found) y después de ajustar (As-Left).'
              : p === 'analizador'
                ? 'Solución: valor de la solución patrón. As-Found: lo que marcó antes de calibrar. As-Left: después (vacío si no se calibró).'
                : `Entrada: valor aplicado con el patrón${u ? ` en ${u}` : ''}. As-Found: lo que marcó antes de ajustar${cap.lecturaEn === 'mA' && p === 'transmisor' ? ', en mA' : ''}. As-Left: después (vacío si no se ajustó).`}
          </p>
          <TablaPuntos
            filas={cap.filas}
            onChange={(f) => set('filas', f)}
            medida={medida}
            calcular={calcula}
            maximo={MAX_PUNTOS}
            titulos={
              p === 'carrera'
                ? ['Señal %', 'As-Found %', 'As-Left %']
                : p === 'analizador'
                  ? ['Solución', 'As-Found', 'As-Left']
                  : medida.lecturaEn === 'mA'
                    ? ['Entrada', 'As-Found mA', 'As-Left mA']
                    : ['Entrada', 'As-Found', 'As-Left']
            }
            bajoEntrada={
              p === 'carrera'
                ? (e) => `${(4 + 0.16 * e).toFixed(1)} mA${medida.senalInvertida ? ` · debe quedar ${esperado(medida, e)} %` : ''}`
                : medida.lecturaEn === 'mA' && conRango
                  ? (e) => `debe dar ${esperado(medida, e)!.toFixed(2)} mA`
                  : undefined
            }
          />
        </section>
      )}

      {p === 'analizador' && cap.unidades === 'pH' && (
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Pendiente (%)">
            <input className="campo" inputMode="decimal" placeholder="98" value={cap.pendiente} onChange={(e) => set('pendiente', e.target.value)} />
          </Campo>
          <Campo label="Offset (mV)">
            <input className="campo" inputMode="decimal" placeholder="-3" value={cap.offset} onChange={(e) => set('offset', e.target.value)} />
          </Campo>
        </div>
      )}

      {cap.revisiones.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Revisiones</h2>
          <ListaRevisiones revisiones={cap.revisiones} onChange={(r) => set('revisiones', r)} />
        </section>
      )}

      {p === 'funcional' && (
        <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <input type="checkbox" className="size-5" checked={cap.ajustada} onChange={(e) => set('ajustada', e.target.checked)} />
          Se ajustó o reparó algo durante la prueba
        </label>
      )}

      <Campo label="Resultado *">
        <select className="campo" value={resultado} onChange={(e) => setResultado(e.target.value as ResultadoCalibracion | '')}>
          <option value="">
            {sugerido
              ? `${p === 'funcional' ? 'Según las revisiones' : 'Según tolerancia'}: ${textoResultado(sugerido, cap.tipo)}`
              : p === 'funcional'
                ? 'Se calcula con las revisiones'
                : 'Se calcula con los puntos'}
          </option>
          {RESULTADOS_CALIBRACION.map((r) => (
            <option key={r} value={r}>
              {textoResultado(r, cap.tipo)}
            </option>
          ))}
        </select>
      </Campo>

      <div>
        <span className="etiqueta">Próxima calibración (opcional)</span>
        <div className="flex gap-2">
          <input
            className="campo"
            type="date"
            aria-label="Próxima calibración"
            value={proxima}
            min={fecha}
            onChange={(e) => {
              setProxima(e.target.value)
              setPlazo(null)
            }}
          />
          {proxima && (
            <button
              type="button"
              className="btn-secundario shrink-0 px-3"
              onClick={() => {
                setProxima('')
                setPlazo(null)
              }}
            >
              Quitar
            </button>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          {[6, 12, 24].map((m) => (
            <button
              key={m}
              type="button"
              className={`rounded-full border px-3 py-1 text-sm ${plazo === m ? 'border-marca-700 bg-marca-50 font-semibold text-marca-800' : 'border-slate-300'}`}
              onClick={() => {
                setPlazo(m)
                setProxima(sumarMeses(fecha, m))
              }}
            >
              {m} meses
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          {proxima
            ? 'La ficha del instrumento mostrará esta fecha y avisará cuando se acerque.'
            : 'Sin fecha, el instrumento queda “sin calibración programada”. Puedes ponerla después al editar el instrumento.'}
        </p>
      </div>

      <Campo label="Observaciones">
        <textarea className="campo min-h-20" value={observaciones} maxLength={2000} onChange={(e) => setObservaciones(e.target.value)} />
      </Campo>

      {error && <p className="rounded-lg bg-peligro-50 p-3 text-sm text-peligro-700">{error}</p>}
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

/** Disparo y reposición antes y después de ajustar, con el error contra el punto de ajuste y el diferencial. */
function PruebaInterruptor({
  cap,
  set,
  medida,
  calcula,
  reposicion,
}: {
  cap: Captura
  set: <K extends keyof Captura>(k: K, v: Captura[K]) => void
  medida: Medida & { unidades: string }
  calcula: boolean
  reposicion: { asFound: number | null; asLeft: number | null }
}) {
  const fila = cap.filas[0] ?? { entrada: '', asFound: '', asLeft: '' }
  const ajuste = numero(fila.entrada)
  const disparo = { asFound: numero(fila.asFound), asLeft: numero(fila.asLeft) }
  const setDisparo = (k: 'asFound' | 'asLeft', v: string) => set('filas', [{ ...fila, [k]: v }])
  const setRepo = (k: 'asFound' | 'asLeft', v: string) => set('reposicion', { ...cap.reposicion, [k]: v })
  const err = (v: number | null) => {
    if (!calcula || ajuste === null) return null
    const e = errorLectura(medida, v, ajuste)
    return e === null ? null : <span className="block text-xs text-slate-500">{textoError(e, medida)}</span>
  }
  const dif = (k: 'asFound' | 'asLeft') => {
    const d = diferencial(disparo[k], reposicion[k])
    return d === null ? '—' : `${d} ${medida.unidades}`.trim()
  }
  return (
    <div className="grid grid-cols-[auto_1fr_1fr] items-start gap-2 text-sm">
      <span />
      <span className="text-xs font-medium text-slate-600">As-Found</span>
      <span className="text-xs font-medium text-slate-600">As-Left</span>
      <span className="py-2 font-medium">Disparo</span>
      <div>
        <input className="campo px-2 py-2" inputMode="decimal" aria-label="Disparo As-Found" value={fila.asFound} onChange={(e) => setDisparo('asFound', e.target.value)} />
        {err(disparo.asFound)}
      </div>
      <div>
        <input className="campo px-2 py-2" inputMode="decimal" aria-label="Disparo As-Left" value={fila.asLeft} onChange={(e) => setDisparo('asLeft', e.target.value)} />
        {err(disparo.asLeft)}
      </div>
      <span className="py-2 font-medium">Reposición</span>
      <input className="campo px-2 py-2" inputMode="decimal" aria-label="Reposición As-Found" value={cap.reposicion.asFound} onChange={(e) => setRepo('asFound', e.target.value)} />
      <input className="campo px-2 py-2" inputMode="decimal" aria-label="Reposición As-Left" value={cap.reposicion.asLeft} onChange={(e) => setRepo('asLeft', e.target.value)} />
      <span className="font-medium text-slate-600">Diferencial</span>
      <span className="text-slate-700">{dif('asFound')}</span>
      <span className="text-slate-700">{dif('asLeft')}</span>
    </div>
  )
}
