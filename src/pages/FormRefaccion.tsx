import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { actualizarRefaccion, crearRefaccion, useRefaccion } from '../lib/refacciones'
import type { RefaccionNueva } from '../types'
import { SelectorInstrumentos } from '../components/SelectorInstrumentos'

function Campo({ label, ayuda, children }: { label: string; ayuda?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="etiqueta">{label}</span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-slate-500">{ayuda}</span>}
    </label>
  )
}

const UNIDADES = ['pza', 'juego', 'kit', 'm', 'kg', 'l', 'caja', 'rollo']

const vacia = (instrumento: string | null): RefaccionNueva => ({
  nombre: '',
  numeroParte: '',
  marca: '',
  ubicacion: '',
  unidad: 'pza',
  minimo: 0,
  instrumentos: instrumento ? [instrumento] : [],
  notas: '',
})

/** Alta y edición de una refacción. La existencia solo se captura al dar de alta. */
export function FormRefaccion() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const existente = useRefaccion(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const [datos, setDatos] = useState<RefaccionNueva>(() => vacia(params.get('instrumento')))
  const [minimo, setMinimo] = useState('0')
  const [inicial, setInicial] = useState('0')
  const [error, setError] = useState('')

  // Se carga una sola vez para no borrar lo que se está escribiendo.
  const cargado = useRef<string | null>(null)
  useEffect(() => {
    if (existente && cargado.current !== existente.id) {
      cargado.current = existente.id
      const { nombre, numeroParte, marca, ubicacion, unidad, minimo: m, instrumentos, notas } = existente
      setDatos({ nombre, numeroParte, marca, ubicacion, unidad, minimo: m, instrumentos, notas })
      setMinimo(String(m))
    }
  }, [existente])

  if (id && existente === undefined) return <p className="p-6 text-slate-500">Cargando…</p>
  if (id && existente === null) return <p className="p-6 text-slate-500">Esta refacción no existe.</p>

  const set = <K extends keyof RefaccionNueva>(k: K, v: RefaccionNueva[K]) => setDatos((d) => ({ ...d, [k]: v }))
  const entero = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : null)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const nombre = datos.nombre.trim()
    const m = entero(minimo)
    const n = entero(inicial)
    if (nombre.length < 2) return setError('Escribe el nombre de la refacción.')
    if (m === null || m > 100000) return setError('El mínimo debe ser un número entero (0 si no se tiene en existencia).')
    if (!id && (n === null || n > 100000)) return setError('La existencia inicial debe ser un número entero.')
    const limpio: RefaccionNueva = {
      ...datos,
      nombre,
      numeroParte: datos.numeroParte.trim(),
      marca: datos.marca.trim(),
      ubicacion: datos.ubicacion.trim(),
      unidad: datos.unidad.trim() || 'pza',
      notas: datos.notas.trim(),
      minimo: m,
    }
    if (id) {
      actualizarRefaccion(id, limpio)
      navigate(`/refacciones/${id}`, { replace: true })
    } else {
      const quien = { uid: user?.uid ?? '', nombre: user?.displayName || user?.email || 'Técnico' }
      const nuevoId = crearRefaccion(limpio, n ?? 0, quien)
      navigate(`/refacciones/${nuevoId}`, { replace: true })
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-4">
      <h1 className="text-xl font-bold">{id ? 'Editar refacción' : 'Nueva refacción'}</h1>
      <Campo label="Nombre *">
        <input className="campo" required maxLength={120} value={datos.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Sello de diafragma" />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Número de parte">
          <input className="campo" maxLength={60} value={datos.numeroParte} onChange={(e) => set('numeroParte', e.target.value)} />
        </Campo>
        <Campo label="Marca">
          <input className="campo" maxLength={60} value={datos.marca} onChange={(e) => set('marca', e.target.value)} />
        </Campo>
      </div>
      <Campo label="Ubicación en almacén" ayuda="Dónde encontrarla: almacén, anaquel, gaveta…">
        <input className="campo" maxLength={120} value={datos.ubicacion} onChange={(e) => set('ubicacion', e.target.value)} />
      </Campo>
      <div className="grid grid-cols-3 gap-3">
        <Campo label="Unidad">
          <input className="campo" list="unidades" maxLength={20} value={datos.unidad} onChange={(e) => set('unidad', e.target.value)} />
          <datalist id="unidades">
            {UNIDADES.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </Campo>
        <Campo label="Mínimo">
          <input className="campo" inputMode="numeric" value={minimo} onChange={(e) => setMinimo(e.target.value)} aria-label="Mínimo" />
        </Campo>
        {!id && (
          <Campo label="Hay ahora">
            <input className="campo" inputMode="numeric" value={inicial} onChange={(e) => setInicial(e.target.value)} aria-label="Existencia inicial" />
          </Campo>
        )}
      </div>
      <p className="-mt-2 text-xs text-slate-500">
        Al llegar al mínimo aparece en “Por pedir”. {id ? 'La existencia cambia con entradas, salidas o un conteo desde la refacción.' : ''}
      </p>
      <div>
        <span className="etiqueta">Instrumentos donde se usa</span>
        <SelectorInstrumentos ids={datos.instrumentos} onCambio={(ids) => set('instrumentos', ids)} />
      </div>
      <Campo label="Notas">
        <textarea className="campo" rows={3} maxLength={1000} value={datos.notas} onChange={(e) => set('notas', e.target.value)} />
      </Campo>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-secundario" onClick={() => navigate(-1)}>
          Cancelar
        </button>
        <button className="btn-primario flex-1">{id ? 'Guardar cambios' : 'Dar de alta'}</button>
      </div>
    </form>
  )
}
