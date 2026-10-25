import { Link } from 'react-router'
import type { ConPendiente } from '../lib/instrumentos'
import type { Falla } from '../types'
import { Pendiente } from './Estado'
import { EstadoFalla, fechaCorta } from './EstadoFalla'

export function ListaFallas({ fallas, conTag = true }: { fallas: ConPendiente<Falla>[]; conTag?: boolean }) {
  return (
    <ul className="divide-y divide-slate-100">
      {fallas.map((f) => (
        <li key={f.id}>
          <Link to={`/fallas/${f.id}`} className="block space-y-1 py-3 active:bg-slate-50">
            <div className="flex items-center gap-2">
              {conTag && <span className="font-mono font-bold">{f.tagISA}</span>}
              <EstadoFalla estado={f.estado} />
              {f.sinSincronizar && <Pendiente />}
              <span className="ml-auto text-xs text-slate-400">{fechaCorta(f.fechas.creada)}</span>
            </div>
            <p className="line-clamp-2 text-sm text-slate-700">{f.descripcion}</p>
            <p className="text-xs text-slate-500">
              Reportó {f.reportadoPor.nombre}
              {f.tecnicoAsignado && ` · atiende ${f.tecnicoAsignado.nombre}`}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  )
}
