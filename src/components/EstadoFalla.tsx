import type { EstadoFalla as Estado } from '../types'

const colores: Record<Estado, string> = {
  Abierta: 'bg-peligro-100 text-peligro-800',
  'En proceso': 'bg-aviso-100 text-aviso-800',
  Cerrada: 'bg-bien-100 text-bien-800',
}

export function EstadoFalla({ estado }: { estado: Estado }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colores[estado]}`}>{estado}</span>
}

export function fechaCorta(t: { toDate(): Date } | null | undefined): string {
  if (!t) return 'pendiente de sincronizar'
  return t.toDate().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}
