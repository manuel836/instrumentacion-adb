import type { EstadoInstrumento } from '../types'

const colores: Record<string, string> = {
  Operando: 'bg-emerald-100 text-emerald-800',
  'Con falla': 'bg-amber-100 text-amber-800',
  'Fuera de servicio': 'bg-slate-200 text-slate-700',
}

export function Estado({ estado }: { estado: EstadoInstrumento | string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colores[estado] ?? colores.Operando}`}>{estado}</span>
}

export function Pendiente() {
  return (
    <span title="Sin sincronizar" className="inline-flex items-center gap-1 text-xs text-amber-700">
      <span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> pendiente
    </span>
  )
}
