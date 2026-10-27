import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Timestamp } from 'firebase/firestore'
import {
  actualizarInstrumento,
  crearInstrumento,
  instrumentoVacio,
  tagISAExiste,
  useInstrumento,
} from '../lib/instrumentos'
import { useSubareas } from '../lib/subareas'
import { ALIMENTACIONES, alimentacionConocida, unidadConocida } from '../lib/unidades'
import {
  ACCIONES_VALVULA,
  CONTACTOS,
  DISPARA_AL,
  FINALES_CARRERA,
  POSICIONADORES,
  SENSORES_TEMPERATURA,
  camposDeTipo,
  pruebaDe,
  soloDatosDelTipo,
  tipoSugerido,
} from '../lib/tipos'
import { Icono } from '../components/Icono'
import { SelectorUnidades } from '../components/SelectorUnidades'
import { SelectorTipo } from '../components/SelectorTipo'
import { Segmentado } from '../components/PruebasCalibracion'
import { permisos, useAuth } from '../auth/AuthContext'
import { AREAS, ESTADOS_INSTRUMENTO, SENALES, dondeEsta, type InstrumentoNuevo } from '../types'

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

/** Lista con las opciones; un valor que no está en ella se sigue viendo para no perderlo al guardar. */
function Opciones({ value, onChange, opciones, vacio, label }: { value: string; onChange: (v: string) => void; opciones: readonly { valor: string; texto: string }[]; vacio: string; label?: string }) {
  return (
    <select className="campo" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{vacio}</option>
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.texto}
        </option>
      ))}
      {value && !opciones.some((o) => o.valor === value) && <option value={value}>{value} (anterior)</option>}
    </select>
  )
}

const comoOpciones = (lista: readonly string[]) => lista.map((v) => ({ valor: v, texto: v }))
const OPCIONES_ALIMENTACION = ALIMENTACIONES.map((a) => ({ valor: a.valor, texto: a.texto }))

export function FormInstrumento() {
  const { id } = useParams()
  const existente = useInstrumento(id)
  const subareas = useSubareas()
  const { rol } = useAuth()
  const navigate = useNavigate()
  const [datos, setDatos] = useState<InstrumentoNuevo>(instrumentoVacio())
  const [masDatos, setMasDatos] = useState(false)
  /** En un alta, el tipo se sugiere por el tag mientras no se elija a mano. */
  const [tipoAMano, setTipoAMano] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Se carga una sola vez: las actualizaciones que llegan mientras se edita
  // (sincronización, cambios de estado de las Functions) no borran lo escrito.
  const cargado = useRef<string | null>(null)
  useEffect(() => {
    if (existente && cargado.current !== existente.id) {
      cargado.current = existente.id
      const { id: _id, sinSincronizar: _s, ...resto } = existente
      // Lo escrito a mano antes ("kg/cm2", "24 VDC lazo") se acomoda a las opciones de la lista
      // y se guarda así al pulsar Guardar.
      setDatos({
        ...resto,
        unidades: unidadConocida(resto.unidades) ?? resto.unidades,
        alimentacion: alimentacionConocida(resto.alimentacion) ?? resto.alimentacion,
      })
      setMasDatos(true)
    }
  }, [existente])

  const set = <K extends keyof InstrumentoNuevo>(k: K, v: InstrumentoNuevo[K]) => setDatos((d) => ({ ...d, [k]: v }))
  const num = (s: string) => (s.trim() === '' ? null : Number(s))
  const numDecimal = (s: string) => {
    const t = s.trim().replace(',', '.')
    return t === '' || !Number.isFinite(Number(t)) ? null : Number(t)
  }

  function cambiarTipo(tipo: string) {
    setDatos((d) => {
      // En un alta, interruptores y válvulas de corte suelen ser de señal discreta.
      const discreta = ['interruptor', 'funcional'].includes(pruebaDe(tipo))
      const senal = id || !['4-20 mA', 'Discreta'].includes(d.senal) ? d.senal : discreta ? 'Discreta' : '4-20 mA'
      return { ...d, tipo, senal }
    })
  }

  // El tag NFC y las fotos son opcionales: se pueden agregar después desde la ficha.
  async function onSubmit(e: Pick<FormEvent, 'preventDefault'>, conTagYFotos = true) {
    e.preventDefault()
    setError(null)
    const tagISA = datos.tagISA.trim().toUpperCase()
    if (!TAG_ISA.test(tagISA)) {
      setError('El tag ISA debe tener la forma PT-101, FIC-2003 o TT-15A.')
      return
    }
    setGuardando(true)
    try {
      if (await tagISAExiste(tagISA, datos.area, datos.subArea, id).catch(() => false)) {
        setError(`Ya existe ${tagISA} en ${dondeEsta(datos)}. El mismo tag solo se puede repetir en otra área o sub área.`)
        return
      }
      const limpio = soloDatosDelTipo({
        ...datos,
        tagISA,
        servicio: datos.servicio.trim(),
        notaDisparo: datos.disparaCaldera ? datos.notaDisparo.trim() : '',
        rangoResorte: datos.rangoResorte.trim(),
        presionSuministro: datos.presionSuministro.trim(),
      })
      if (id) {
        const { nfcToken: _t, docs: _d, portadaMiniatura: _p, ...editables } = limpio
        actualizarInstrumento(id, editables)
        navigate(`/instrumentos/${id}`, { replace: true })
      } else {
        const nuevoId = crearInstrumento(limpio)
        // Alta rápida en campo: después del alta se ofrece vincular el tag y tomar fotos.
        navigate(conTagYFotos ? `/instrumentos/${nuevoId}/vincular` : `/instrumentos/${nuevoId}`, { replace: true })
      }
    } finally {
      setGuardando(false)
    }
  }

  if (id && existente === undefined) return <p className="p-6 text-slate-500">Cargando…</p>

  const sugerido = tipoSugerido(datos.tagISA)
  const campos = camposDeTipo(datos.tipo, datos.accionValvula)
  const prueba = pruebaDe(datos.tipo)
  const esValvula = prueba === 'carrera' || prueba === 'funcional'
  const delArea = (subareas ?? []).filter((s) => s.area === datos.area).map((s) => s.nombre)
  // Si la sub área se quitó o renombró, la que ya tenía se sigue viendo para no perderla al guardar.
  const opciones = datos.subArea && !delArea.includes(datos.subArea) ? [...delArea, datos.subArea] : delArea

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-4">
      <h1 className="text-xl font-bold">{id ? `Editar ${datos.tagISA}` : 'Alta de instrumento'}</h1>
      {!id && (
        <p className="text-sm text-slate-500">
          Solo el tag, el área y el servicio son obligatorios. El tag NFC, las fotos y lo demás se pueden agregar después desde la ficha.{' '}
          <Link to="/instrumentos/importar" className="font-semibold text-marca-700">
            ¿Son muchos? Impórtalos desde Excel.
          </Link>
        </p>
      )}

      <Campo label="Tag ISA *">
        <input
          className="campo font-mono uppercase"
          required
          placeholder="PT-101"
          value={datos.tagISA}
          onChange={(e) => {
            const tagISA = e.target.value.toUpperCase()
            set('tagISA', tagISA)
            if (!id && !tipoAMano) cambiarTipo(tipoSugerido(tagISA) ?? '')
          }}
          autoCapitalize="characters"
        />
      </Campo>
      <div>
        <Campo label="Tipo de instrumento">
          <SelectorTipo
            value={datos.tipo}
            onChange={(v) => {
              setTipoAMano(true)
              cambiarTipo(v)
            }}
          />
        </Campo>
        <p className="mt-1 text-xs text-slate-500">
          {!id && !tipoAMano && datos.tipo
            ? 'Sugerido por el tag; cámbialo si no es. '
            : 'Define qué prueba pide su calibración. '}
          {id && !datos.tipo && sugerido && (
            <button type="button" className="font-semibold text-marca-700" onClick={() => cambiarTipo(sugerido)}>
              Usar «{sugerido}» (según el tag)
            </button>
          )}
        </p>
      </div>
      {campos.length > 0 && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-sm font-semibold">Datos de {datos.tipo.toLowerCase()}</p>
          {campos.includes('accionValvula') && (
            <div>
              <span className="etiqueta">Acción</span>
              <div role="radiogroup" aria-label="Acción" className="grid grid-cols-2 gap-2">
                {ACCIONES_VALVULA.map((a) => (
                  <button
                    key={a.valor}
                    type="button"
                    role="radio"
                    aria-checked={datos.accionValvula === a.valor}
                    className={`rounded-lg border p-2 text-left text-sm last:odd:col-span-2 ${datos.accionValvula === a.valor ? 'border-marca-700 bg-marca-50' : 'border-slate-300'}`}
                    onClick={() => set('accionValvula', datos.accionValvula === a.valor ? '' : a.valor)}
                  >
                    <span className="block font-semibold">{a.valor}</span>
                    <span className="block text-xs text-slate-600">{a.ayuda}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {campos.includes('posicionador') && (
            <Campo label="Posicionador">
              <Opciones label="Posicionador" value={datos.posicionador} onChange={(v) => set('posicionador', v)} opciones={comoOpciones(POSICIONADORES)} vacio="Sin especificar" />
            </Campo>
          )}
          {campos.includes('presionSuministro') && (
            <div className="grid grid-cols-2 gap-3">
              {campos.includes('rangoResorte') && (
                <Campo label="Rango del resorte">
                  <input className="campo" placeholder="3-15 psi" maxLength={60} value={datos.rangoResorte} onChange={(e) => set('rangoResorte', e.target.value)} />
                </Campo>
              )}
              <Campo label="Presión de suministro">
                <input className="campo" placeholder="20 psi" maxLength={60} value={datos.presionSuministro} onChange={(e) => set('presionSuministro', e.target.value)} />
              </Campo>
            </div>
          )}
          {campos.includes('finalesCarrera') && (
            <>
              <Campo label="Finales de carrera">
                <Opciones label="Finales de carrera" value={datos.finalesCarrera} onChange={(v) => set('finalesCarrera', v)} opciones={comoOpciones(FINALES_CARRERA)} vacio="Sin especificar" />
              </Campo>
              <Campo label="Alimentación del solenoide">
                <Opciones label="Alimentación del solenoide" value={datos.alimentacion} onChange={(v) => set('alimentacion', v)} opciones={OPCIONES_ALIMENTACION} vacio="Sin especificar" />
              </Campo>
            </>
          )}
          {campos.includes('sensor') && (
            <Campo label="Sensor">
              <Opciones label="Sensor" value={datos.sensor} onChange={(v) => set('sensor', v)} opciones={comoOpciones(SENSORES_TEMPERATURA)} vacio="Sin especificar" />
            </Campo>
          )}
          {campos.includes('puntoAjuste') && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Campo label={`Punto de ajuste${datos.unidades ? ` (${datos.unidades})` : ''}`}>
                  <PuntoAjuste valor={datos.puntoAjuste} onChange={(v) => set('puntoAjuste', v)} leer={numDecimal} />
                </Campo>
                <Campo label="Contacto">
                  <Opciones label="Contacto" value={datos.contacto} onChange={(v) => set('contacto', v)} opciones={CONTACTOS} vacio="Sin especificar" />
                </Campo>
              </div>
              <div>
                <span className="etiqueta">Dispara</span>
                <Segmentado etiqueta="Dispara" opciones={comoOpciones(DISPARA_AL)} valor={datos.disparaAl} onChange={(v) => set('disparaAl', v)} />
              </div>
              <p className="text-xs text-slate-500">Las unidades se eligen en “Más datos”.</p>
            </>
          )}
        </div>
      )}
      <Campo label="Área *">
        <select
          className="campo"
          value={datos.area}
          onChange={(e) => {
            const area = e.target.value as InstrumentoNuevo['area']
            // Al cambiar de área se conserva la sub área solo si también existe en la nueva.
            const sigue = (subareas ?? []).some((s) => s.area === area && s.nombre === datos.subArea)
            setDatos((d) => ({ ...d, area, subArea: sigue ? d.subArea : '' }))
          }}
        >
          {AREAS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </Campo>
      <div>
        <Campo label="Sub área">
          <select className="campo" value={datos.subArea} onChange={(e) => set('subArea', e.target.value)}>
            <option value="">Sin sub área</option>
            {opciones.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Campo>
        <p className="mt-1 text-xs text-slate-500">
          {opciones.length === 0 ? `${datos.area} aún no tiene sub áreas. ` : 'Caldera, tanque o sección. '}
          {permisos(rol).gestionarUsuarios ? (
            <Link to="/subareas" className="font-semibold text-marca-700">
              Administrar sub áreas
            </Link>
          ) : (
            opciones.length === 0 && 'El administrador las agrega.'
          )}
        </p>
      </div>
      <div className={`rounded-lg border p-3 ${datos.disparaCaldera ? 'border-peligro-300 bg-peligro-50' : 'border-slate-200 bg-white'}`}>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-5 accent-peligro-700"
            checked={datos.disparaCaldera}
            onChange={(e) => set('disparaCaldera', e.target.checked)}
          />
          <span>
            <span className="flex items-center gap-1.5 font-semibold">
              <Icono nombre="rayo" className="size-4 text-peligro-700" /> Puede disparar la caldera
            </span>
            <span className="block text-xs text-slate-600">
              Medición o retroaviso de válvula de corte o de control que, al intervenirlo, puede disparar la caldera. Se verá un aviso
              rojo en su ficha.
            </span>
          </span>
        </label>
        {datos.disparaCaldera && (
          <label className="mt-3 block">
            <span className="etiqueta">Precauciones antes de intervenir (opcional)</span>
            <textarea
              className="campo min-h-16"
              maxLength={300}
              placeholder="Avisar a operación y poner en bypass el disparo por bajo nivel antes de desconectar."
              value={datos.notaDisparo}
              onChange={(e) => set('notaDisparo', e.target.value)}
            />
          </label>
        )}
      </div>
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
            {/* La válvula se calibra de 0 a 100 % de carrera: no lleva rango ni unidades. */}
            {!esValvula && (
              <>
                <Campo label="Unidades">
                  <SelectorUnidades value={datos.unidades} onChange={(v) => set('unidades', v)} />
                </Campo>
                <Campo label={prueba === 'interruptor' ? 'Rango ajustable mín.' : 'Rango mínimo'}>
                  <input className="campo" inputMode="decimal" value={datos.rangoMin ?? ''} onChange={(e) => set('rangoMin', num(e.target.value))} />
                </Campo>
                <Campo label={prueba === 'interruptor' ? 'Rango ajustable máx.' : 'Rango máximo'}>
                  <input className="campo" inputMode="decimal" value={datos.rangoMax ?? ''} onChange={(e) => set('rangoMax', num(e.target.value))} />
                </Campo>
              </>
            )}
          </div>
          <Campo label="Señal">
            <select className="campo" value={datos.senal} onChange={(e) => set('senal', e.target.value)}>
              {SENALES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Campo>
          {/* En la válvula de corte va arriba, como la del solenoide. */}
          {prueba !== 'funcional' && (
            <Campo label="Alimentación">
              <Opciones value={datos.alimentacion} onChange={(v) => set('alimentacion', v)} opciones={OPCIONES_ALIMENTACION} vacio="Sin especificar" />
            </Campo>
          )}
          <Campo label="Estado">
            <select className="campo" value={datos.estado} onChange={(e) => set('estado', e.target.value as InstrumentoNuevo['estado'])}>
              {ESTADOS_INSTRUMENTO.map((s) => (
                <option key={s}>{s}</option>
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
                value={aFecha(datos.proximaCalibracion)}
                onChange={(e) => set('proximaCalibracion', e.target.value ? Timestamp.fromDate(new Date(`${e.target.value}T12:00:00`)) : null)}
              />
              {datos.proximaCalibracion && (
                <button type="button" className="btn-secundario shrink-0 px-3" onClick={() => set('proximaCalibracion', null)}>
                  Quitar
                </button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {datos.proximaCalibracion
                ? 'Si la pusiste por error, toca Quitar.'
                : 'Sin fecha, el instrumento queda “sin calibración programada”. También se pone al registrar una calibración.'}
            </p>
          </div>
        </>
      )}

      {error && <p className="rounded-lg bg-peligro-50 p-3 text-sm text-peligro-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-secundario flex-1" onClick={() => navigate(-1)}>
          Cancelar
        </button>
        <button className="btn-primario flex-1" disabled={guardando}>
          {id ? 'Guardar' : 'Siguiente: tag y fotos'}
        </button>
      </div>
      {!id && (
        <button
          type="button"
          className="btn-secundario w-full"
          disabled={guardando}
          onClick={(e) => {
            if (e.currentTarget.form?.reportValidity()) void onSubmit(e, false)
          }}
        >
          Guardar sin tag ni fotos
        </button>
      )}
    </form>
  )
}

/** Número con coma o punto; lo escrito se respeta mientras se teclea ("10." o "-"). */
function PuntoAjuste({ valor, onChange, leer }: { valor: number | null; onChange: (v: number | null) => void; leer: (s: string) => number | null }) {
  const [texto, setTexto] = useState(valor === null ? '' : String(valor))
  useEffect(() => {
    if (leer(texto) !== valor) setTexto(valor === null ? '' : String(valor))
    // Solo cuando el valor cambia desde fuera (al cargar el instrumento), no al teclear.
  }, [valor])
  return (
    <input
      className="campo"
      inputMode="decimal"
      aria-label="Punto de ajuste"
      value={texto}
      onChange={(e) => {
        setTexto(e.target.value)
        onChange(leer(e.target.value))
      }}
    />
  )
}
