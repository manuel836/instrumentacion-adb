// Piezas del formulario de calibración que cambian según el tipo de instrumento.
import type { ReactNode } from 'react'
import { ESTADOS_REVISION } from '../lib/tipos'
import { errorLectura, textoError, type Medida } from '../lib/tolerancia'
import type { EstadoRevision, Revision } from '../types'

export interface Fila {
  entrada: string
  asFound: string
  asLeft: string
}

/** Acepta coma o punto decimal; vacío es null. */
export function numero(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Botones de una sola opción (como radio), grandes para el dedo. */
export function Segmentado<T extends string>({
  etiqueta,
  opciones,
  valor,
  onChange,
}: {
  etiqueta: string
  opciones: readonly { valor: T; texto: string }[]
  valor: T | ''
  onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="flex gap-1 rounded-lg bg-slate-100 p-1">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          className={`min-h-10 flex-1 rounded-md px-2 py-2 text-sm ${valor === o.valor ? 'bg-white font-semibold text-marca-800 shadow-sm' : 'text-slate-600'}`}
          onClick={() => onChange(o.valor)}
        >
          {o.texto}
        </button>
      ))}
    </div>
  )
}

const COLOR: Record<EstadoRevision, string> = {
  Bien: 'border-bien-600 bg-bien-600 text-white',
  Mal: 'border-peligro-600 bg-peligro-600 text-white',
  'No aplica': 'border-slate-500 bg-slate-500 text-white',
}

/** Cada revisión de la válvula con Bien, Mal o No aplica. */
export function ListaRevisiones({ revisiones, onChange }: { revisiones: Revision[]; onChange: (r: Revision[]) => void }) {
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {revisiones.map((r, i) => (
        <li key={r.nombre} className="space-y-2 p-3">
          <p className={`text-sm ${r.estado === 'Mal' ? 'font-semibold text-peligro-700' : ''}`}>{r.nombre}</p>
          <div role="radiogroup" aria-label={r.nombre} className="grid grid-cols-3 gap-2">
            {ESTADOS_REVISION.map((e) => (
              <button
                key={e}
                type="button"
                role="radio"
                aria-checked={r.estado === e}
                className={`min-h-11 rounded-lg border py-2 text-sm ${r.estado === e ? `${COLOR[e]} font-semibold` : 'border-slate-300 text-slate-700'}`}
                onClick={() => onChange(revisiones.map((x, j) => (j === i ? { ...x, estado: e } : x)))}
              >
                {e}
              </button>
            ))}
          </div>
        </li>
      ))}
    </ul>
  )
}

function ErrorBajo({ v, m }: { v: number | null; m: Medida & { unidades: string } }) {
  if (v === null) return null
  return <span className="block text-xs text-slate-500">{textoError(v, m)}</span>
}

/**
 * Tabla de puntos: entrada aplicada contra lectura antes y después de ajustar,
 * con el error de cada lectura debajo. `bajoEntrada` agrega una nota bajo cada entrada
 * (el mA que debe dar, por ejemplo).
 */
export function TablaPuntos({
  filas,
  onChange,
  medida,
  calcular,
  titulos,
  bajoEntrada,
  maximo,
}: {
  filas: Fila[]
  onChange: (f: Fila[]) => void
  medida: Medida & { unidades: string }
  /** false mientras falte el rango para calcular el error. */
  calcular: boolean
  titulos: [string, string, string]
  bajoEntrada?: (entrada: number) => ReactNode
  maximo: number
}) {
  const setFila = (i: number, k: keyof Fila, v: string) => onChange(filas.map((f, j) => (j === i ? { ...f, [k]: v } : f)))
  return (
    <>
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs font-medium text-slate-600">
        <span>{titulos[0]}</span>
        <span>{titulos[1]}</span>
        <span>{titulos[2]}</span>
        <span className="w-6" />
      </div>
      {filas.map((f, i) => {
        const e = numero(f.entrada)
        return (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-start gap-2">
            <div>
              <input className="campo px-2 py-2" inputMode="decimal" aria-label={`Entrada ${i + 1}`} value={f.entrada} onChange={(ev) => setFila(i, 'entrada', ev.target.value)} />
              {e !== null && bajoEntrada && <span className="block text-xs text-slate-500">{bajoEntrada(e)}</span>}
            </div>
            <div>
              <input className="campo px-2 py-2" inputMode="decimal" aria-label={`As-Found ${i + 1}`} value={f.asFound} onChange={(ev) => setFila(i, 'asFound', ev.target.value)} />
              {calcular && e !== null && <ErrorBajo v={errorLectura(medida, numero(f.asFound), e)} m={medida} />}
            </div>
            <div>
              <input className="campo px-2 py-2" inputMode="decimal" aria-label={`As-Left ${i + 1}`} value={f.asLeft} onChange={(ev) => setFila(i, 'asLeft', ev.target.value)} />
              {calcular && e !== null && <ErrorBajo v={errorLectura(medida, numero(f.asLeft), e)} m={medida} />}
            </div>
            <button type="button" aria-label="Quitar punto" className="w-6 py-2 text-peligro-700" onClick={() => onChange(filas.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        )
      })}
      {filas.length < maximo && (
        <button type="button" className="text-sm font-semibold text-marca-700" onClick={() => onChange([...filas, { entrada: '', asFound: '', asLeft: '' }])}>
          + Agregar punto
        </button>
      )}
    </>
  )
}
