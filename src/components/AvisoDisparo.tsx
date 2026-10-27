import { Icono } from './Icono'

/**
 * Aviso rojo para los instrumentos que pueden disparar la caldera: se ve antes de
 * intervenirlos (ficha, falla, calibración, hoja de vida y la vista del tag).
 */
export function AvisoDisparo({ nota, className = '' }: { nota?: string; className?: string }) {
  return (
    <div role="alert" className={`flex gap-3 rounded-lg border border-peligro-300 bg-peligro-50 p-3 text-peligro-900 ${className}`}>
      <Icono nombre="rayo" className="mt-0.5 size-6 text-peligro-700" />
      <div className="min-w-0 text-sm">
        <p className="font-bold text-peligro-800">Puede disparar la caldera</p>
        <p>Antes de intervenirlo o darle mantenimiento, coordina con operación.</p>
        {nota && <p className="mt-1 font-medium whitespace-pre-wrap">{nota}</p>}
      </div>
    </div>
  )
}
