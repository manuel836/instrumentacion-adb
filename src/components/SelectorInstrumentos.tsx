import { useMemo, useState } from 'react'
import { useInstrumentos } from '../lib/instrumentos'
import { Icono } from './Icono'

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Elige instrumentos por tag o servicio (para las refacciones compatibles). */
export function SelectorInstrumentos({ ids, onCambio }: { ids: string[]; onCambio: (ids: string[]) => void }) {
  const lista = useInstrumentos()
  const [texto, setTexto] = useState('')
  const porId = useMemo(() => new Map((lista ?? []).map((i) => [i.id, i])), [lista])
  const q = normalizar(texto.trim())
  const sugerencias = useMemo(() => {
    if (!q || !lista) return []
    return lista.filter((i) => !ids.includes(i.id) && normalizar(`${i.tagISA} ${i.servicio}`).includes(q)).slice(0, 6)
  }, [lista, q, ids])

  return (
    <div className="space-y-2">
      {ids.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {ids.map((id) => (
            <li key={id} className="flex items-center gap-1 rounded-full bg-marca-50 py-1 pr-1 pl-3 text-sm font-medium text-marca-800">
              <span className="font-mono">{porId.get(id)?.tagISA ?? '…'}</span>
              <button type="button" className="rounded-full p-1" aria-label={`Quitar ${porId.get(id)?.tagISA ?? ''}`} onClick={() => onCambio(ids.filter((x) => x !== id))}>
                <Icono nombre="cerrar" className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        className="campo"
        type="search"
        placeholder="Buscar tag o servicio para agregar…"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        aria-label="Buscar instrumento compatible"
      />
      {sugerencias.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {sugerencias.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                className="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm active:bg-slate-50"
                onClick={() => {
                  onCambio([...ids, i.id])
                  setTexto('')
                }}
              >
                <span className="font-mono font-semibold">{i.tagISA}</span>
                <span className="truncate text-slate-500">{i.servicio}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
