import type { EstadoInstrumento } from '../types'

const colores: Record<string, string> = {
  Operando: 'bg-bien-100 text-bien-800',
  'Con falla': 'bg-aviso-100 text-aviso-800',
  'Fuera de servicio': 'bg-slate-200 text-slate-700',
}

export function Estado({ estado }: { estado: EstadoInstrumento | string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colores[estado] ?? colores.Operando}`}>{estado}</span>
}

export function Pendiente() {
  return (
    <span title="Sin sincronizar" className="inline-flex items-center gap-1 text-xs text-aviso-700">
      <span className="inline-block h-2 w-2 rounded-full bg-aviso-500" /> pendiente
    </span>
  )
}
