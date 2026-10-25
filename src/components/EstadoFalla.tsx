import type { EstadoFalla as Estado } from '../types'

const colores: Record<Estado, string> = {
  Abierta: 'bg-red-100 text-red-800',
  'En proceso': 'bg-amber-100 text-amber-800',
  Cerrada: 'bg-emerald-100 text-emerald-800',
}

export function EstadoFalla({ estado }: { estado: Estado }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colores[estado]}`}>{estado}</span>
}

export function fechaCorta(t: { toDate(): Date } | null | undefined): string {
  if (!t) return 'pendiente de sincronizar'
  return t.toDate().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}
