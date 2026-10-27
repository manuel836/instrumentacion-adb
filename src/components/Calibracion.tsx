import type { Timestamp } from 'firebase/firestore'
import { textoResultado } from '../lib/tipos'
import { vencimiento } from '../lib/tolerancia'
import type { ResultadoCalibracion } from '../types'

const colores: Record<ResultadoCalibracion, string> = {
  'Aprobada sin ajuste': 'bg-bien-100 text-bien-800',
  Ajustada: 'bg-info-100 text-info-800',
  'Fuera de tolerancia': 'bg-peligro-100 text-peligro-800',
}

/** `tipo` cambia cómo se lee: en la válvula de corte "Fuera de tolerancia" es "No pasó la prueba". */
export function ResultadoCal({ resultado, tipo }: { resultado: ResultadoCalibracion; tipo?: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colores[resultado] ?? colores.Ajustada}`}>{textoResultado(resultado, tipo)}</span>
}

export const fechaDia = (t: Timestamp | null | undefined) => t?.toDate().toLocaleDateString('es-MX', { dateStyle: 'medium' })

/** Próxima calibración con aviso si ya venció o vence en 30 días. */
export function ProximaCalibracion({ proxima }: { proxima: Timestamp | null }) {
  const v = vencimiento(proxima)
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
      Próxima calibración: <span className="font-medium text-slate-800">{fechaDia(proxima) ?? 'sin programar'}</span>
      {v === 'vencida' && <span className="rounded-full bg-peligro-100 px-2 py-0.5 text-xs font-semibold text-peligro-800">Vencida</span>}
      {v === 'pronto' && <span className="rounded-full bg-aviso-100 px-2 py-0.5 text-xs font-semibold text-aviso-800">Vence pronto</span>}
    </p>
  )
}
