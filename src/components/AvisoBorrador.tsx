import type { ControlBorrador } from '../hooks/useBorrador'

/** "Recuperé lo que llevabas escrito": arriba del formulario, con la opción de empezar de nuevo. */
export function AvisoBorrador({ borrador }: { borrador: ControlBorrador }) {
  if (borrador.recuperado === null) return null
  const cuando = new Date(borrador.recuperado).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <div className="flex animate-desplegar items-center gap-3 rounded-lg border border-info-200 bg-info-50 p-3 text-sm text-info-900" role="status">
      <p className="flex-1">Recuperé lo que llevabas escrito ({cuando}).</p>
      <button type="button" className="shrink-0 font-semibold text-info-800 underline" onClick={borrador.descartar}>
        Empezar de nuevo
      </button>
    </div>
  )
}
