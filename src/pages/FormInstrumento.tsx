import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Timestamp } from 'firebase/firestore'
import {
  actualizarInstrumento,
  crearInstrumento,
  instrumentoVacio,
  tagISAExiste,
  useInstrumento,
} from '../lib/instrumentos'
import { AREAS, ESTADOS_INSTRUMENTO, SENALES, type InstrumentoNuevo } from '../types'

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="etiqueta">{label}</span>
      {children}
    </label>
  )
}

const TAG_ISA = /^[A-Z]{1,5}-?\d{1,5}[A-Z]?$/

function aFecha(t: Timestamp | null): string {
  return t ? t.toDate().toISOString().slice(0, 10) : ''
}

export function FormInstrumento() {
  const { id } = useParams()
  const existente = useInstrumento(id)
  const navigate = useNavigate()
  const [datos, setDatos] = useState<InstrumentoNuevo>(instrumentoVacio())
  const [masDatos, setMasDatos] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Se carga una sola vez: las actualizaciones que llegan mientras se edita
  // (sincronización, cambios de estado de las Functions) no borran lo escrito.
  const cargado = useRef<string | null>(null)
  useEffect(() => {
    if (existente && cargado.current !== existente.id) {
      cargado.current = existente.id
      const { id: _id, sinSincronizar: _s, ...resto } = existente
      setDatos(resto)
      setMasDatos(true)
    }
  }, [existente])

  const set = <K extends keyof InstrumentoNuevo>(k: K, v: InstrumentoNuevo[K]) => setDatos((d) => ({ ...d, [k]: v }))
  const num = (s: string) => (s.trim() === '' ? null : Number(s))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const tagISA = datos.tagISA.trim().toUpperCase()
    if (!TAG_ISA.test(tagISA)) {
      setError('El tag ISA debe tener la forma PT-101, FIC-2003 o TT-15A.')
      return
    }
    setGuardando(true)
    try {
      if (await tagISAExiste(tagISA, id).catch(() => false)) {
        setError(`Ya existe un instrumento con el tag ${tagISA}.`)
        return
      }
      const limpio = { ...datos, tagISA, servicio: datos.servicio.trim() }
      if (id) {
        const { nfcToken: _t, docs: _d, portadaMiniatura: _p, ...editables } = limpio
        actualizarInstrumento(id, editables)
        navigate(`/instrumentos/${id}`, { replace: true })
      } else {
        const nuevoId = crearInstrumento(limpio)
        // Alta rápida en campo: después del alta se vincula el tag y se toma la foto obligatoria.
        navigate(`/instrumentos/${nuevoId}/vincular`, { replace: true })
      }
    } finally {
      setGuardando(false)
    }
  }

  if (id && existente === undefined) return <p className="p-6 text-slate-500">Cargando…</p>

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-4">
      <h1 className="text-xl font-bold">{id ? `Editar ${datos.tagISA}` : 'Alta de instrumento'}</h1>
      {!id && <p className="text-sm text-slate-500">Solo el tag, el área y el servicio son obligatorios; lo demás se completa después.</p>}

      <Campo label="Tag ISA *">
        <input
          className="campo font-mono uppercase"
          required
          placeholder="PT-101"
          value={datos.tagISA}
          onChange={(e) => set('tagISA', e.target.value.toUpperCase())}
          autoCapitalize="characters"
        />
      </Campo>
      <Campo label="Área *">
        <select className="campo" value={datos.area} onChange={(e) => set('area', e.target.value as InstrumentoNuevo['area'])}>
          {AREAS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </Campo>
      <Campo label="Servicio *">
        <input className="campo" required placeholder="Presión de vapor a cabezal" value={datos.servicio} onChange={(e) => set('servicio', e.target.value)} />
      </Campo>
      <Campo label="Ubicación (texto)">
        <input className="campo" placeholder="Caldera B, nivel 2" value={datos.ubicacionTexto} onChange={(e) => set('ubicacionTexto', e.target.value)} />
      </Campo>

      {!masDatos ? (
        <button type="button" className="text-sm font-semibold text-marca-700" onClick={() => setMasDatos(true)}>
          + Más datos (técnicos, lazo, P&ID)
        </button>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Lazo">
              <input className="campo" value={datos.lazo} onChange={(e) => set('lazo', e.target.value)} />
            </Campo>
            <Campo label="P&ID">
              <input className="campo" value={datos.pid} onChange={(e) => set('pid', e.target.value)} />
            </Campo>
            <Campo label="Marca">
              <input className="campo" value={datos.marca} onChange={(e) => set('marca', e.target.value)} />
            </Campo>
            <Campo label="Modelo">
              <input className="campo" value={datos.modelo} onChange={(e) => set('modelo', e.target.value)} />
            </Campo>
            <Campo label="Serie">
              <input className="campo" value={datos.serie} onChange={(e) => set('serie', e.target.value)} />
            </Campo>
            <Campo label="Unidades">
              <input className="campo" placeholder="kg/cm²" value={datos.unidades} onChange={(e) => set('unidades', e.target.value)} />
            </Campo>
            <Campo label="Rango mínimo">
              <input className="campo" inputMode="decimal" value={datos.rangoMin ?? ''} onChange={(e) => set('rangoMin', num(e.target.value))} />
            </Campo>
            <Campo label="Rango máximo">
              <input className="campo" inputMode="decimal" value={datos.rangoMax ?? ''} onChange={(e) => set('rangoMax', num(e.target.value))} />
            </Campo>
          </div>
          <Campo label="Señal">
            <select className="campo" value={datos.senal} onChange={(e) => set('senal', e.target.value)}>
              {SENALES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Alimentación">
            <input className="campo" placeholder="24 VDC lazo" value={datos.alimentacion} onChange={(e) => set('alimentacion', e.target.value)} />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Estado">
              <select className="campo" value={datos.estado} onChange={(e) => set('estado', e.target.value as InstrumentoNuevo['estado'])}>
                {ESTADOS_INSTRUMENTO.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Próxima calibración">
              <input
                className="campo"
                type="date"
                value={aFecha(datos.proximaCalibracion)}
                onChange={(e) => set('proximaCalibracion', e.target.value ? Timestamp.fromDate(new Date(`${e.target.value}T12:00:00`)) : null)}
              />
            </Campo>
          </div>
        </>
      )}

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-secundario flex-1" onClick={() => navigate(-1)}>
          Cancelar
        </button>
        <button className="btn-primario flex-1" disabled={guardando}>
          {id ? 'Guardar' : 'Siguiente: tag y fotos'}
        </button>
      </div>
    </form>
  )
}
