import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { NOMBRE_COLECCION, useBitacora, useBitacoraDeInstrumento, type ColeccionBitacora, type EntradaBitacora } from '../lib/bitacora'
import { useInstrumento } from '../lib/instrumentos'
import { ListaBitacora } from '../components/ListaBitacora'
import { Silueta } from '../components/Silueta'

function Filtrada({ entradas, conEtiqueta }: { entradas: EntradaBitacora[]; conEtiqueta: boolean }) {
  const [tipo, setTipo] = useState<ColeccionBitacora | ''>('')
  const [texto, setTexto] = useState('')
  const vista = useMemo(() => {
    const q = texto.trim().toLowerCase()
    return entradas.filter(
      (e) =>
        (!tipo || e.coleccion === tipo) &&
        (!q || `${e.etiqueta} ${e.usuario?.nombre ?? 'sistema'}`.toLowerCase().includes(q)),
    )
  }, [entradas, tipo, texto])

  return (
    <>
      <div className="flex gap-2">
        {conEtiqueta && (
          <input className="campo py-2 text-sm" type="search" placeholder="Tag o persona" value={texto} onChange={(e) => setTexto(e.target.value)} />
        )}
        <select className="campo py-2 text-sm" value={tipo} onChange={(e) => setTipo(e.target.value as ColeccionBitacora | '')} aria-label="Tipo de cambio">
          <option value="">Todos los cambios</option>
          {Object.entries(NOMBRE_COLECCION).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {vista.length === 0 ? <p className="p-6 text-center text-slate-500">Sin cambios registrados.</p> : <ListaBitacora entradas={vista} conEtiqueta={conEtiqueta} />}
    </>
  )
}

function DeInstrumento({ id }: { id: string }) {
  const inst = useInstrumento(id)
  const entradas = useBitacoraDeInstrumento(id)
  return (
    <div className="space-y-3 p-3">
      <h1 className="text-xl font-bold">
        Bitácora de <span className="font-mono">{inst?.tagISA ?? '…'}</span>
      </h1>
      {entradas === null ? <Silueta forma="lista" /> : <Filtrada entradas={entradas} conEtiqueta={false} />}
    </div>
  )
}

function General() {
  const { entradas, hayMas, cargando, cargarMas } = useBitacora()
  return (
    <div className="space-y-3 p-3">
      <div>
        <h1 className="text-xl font-bold">Bitácora de cambios</h1>
        <p className="text-sm text-slate-500">Quién cambió qué y cuándo, con el valor anterior y el nuevo. Nadie puede editarla.</p>
      </div>
      {entradas === null ? <Silueta forma="lista" /> : <Filtrada entradas={entradas} conEtiqueta />}
      {hayMas && (
        <button className="btn-secundario w-full" disabled={cargando} onClick={() => void cargarMas()}>
          {cargando ? 'Cargando…' : 'Cargar cambios anteriores'}
        </button>
      )}
    </div>
  )
}

export function Bitacora() {
  const [params] = useSearchParams()
  const instrumento = params.get('instrumento')
  return instrumento ? <DeInstrumento id={instrumento} /> : <General />
}
