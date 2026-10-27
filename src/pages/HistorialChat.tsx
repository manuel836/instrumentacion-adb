import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { Chat } from '../components/Chat'
import { PestanasChat } from '../components/PestanasChat'
import { claveDia, desdeClave, useInicioDelDia } from '../hooks/useHoy'
import { CANAL_GENERAL, useDiasDelCanal } from '../lib/chat'

const POR_PAGINA = 300

/** "Ayer" o "lunes, 19 de octubre de 2026". */
function nombreDia(d: Date, hoy: Date): string {
  const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1)
  if (d.getTime() === ayer.getTime()) return 'Ayer'
  return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function quienes(personas: string[]): string {
  if (personas.length <= 3) return personas.join(', ')
  return `${personas.slice(0, 3).join(', ')} y ${personas.length - 3} más`
}

/** Días anteriores del canal general: cada uno queda guardado y se puede volver a leer. */
export function HistorialChat() {
  const hoy = useInicioDelDia()
  const [cuantos, setCuantos] = useState(POR_PAGINA)
  const r = useDiasDelCanal(hoy, cuantos)
  const navigate = useNavigate()
  const ayer = claveDia(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1))

  return (
    <div className="space-y-3 p-3">
      <PestanasChat />
      <div>
        <h1 className="text-xl font-bold">Historial del canal general</h1>
        <p className="text-sm text-slate-500">Los mensajes de cada día quedan guardados aquí. Toca un día para leerlo.</p>
      </div>
      <label className="block">
        <span className="etiqueta">Ir a una fecha</span>
        <input
          className="campo"
          type="date"
          max={ayer}
          aria-label="Ir a una fecha"
          onChange={(e) => {
            if (e.target.value) navigate(`/chat/historial/${e.target.value}`)
          }}
        />
      </label>

      {r === null ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : r.dias.length === 0 ? (
        <p className="text-sm text-slate-500">Aún no hay días anteriores con mensajes.</p>
      ) : (
        <ul className="tarjeta divide-y divide-slate-100 p-0">
          {r.dias.map((d) => (
            <li key={d.clave}>
              <Link to={`/chat/historial/${d.clave}`} className="block space-y-0.5 px-4 py-3 active:bg-slate-50">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold first-letter:uppercase">{nombreDia(d.fecha, hoy)}</span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {d.mensajes} {d.mensajes === 1 ? 'mensaje' : 'mensajes'}
                  </span>
                </div>
                <p className="truncate text-sm text-slate-600">{d.ultimo}</p>
                <p className="truncate text-xs text-slate-500">{quienes(d.personas)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {r?.hayMas && (
        <button className="btn-secundario w-full" onClick={() => setCuantos((c) => c + POR_PAGINA)}>
          Ver días anteriores
        </button>
      )}
    </div>
  )
}

/** Un día del historial: solo para leer. */
export function DiaChat() {
  const { dia = '' } = useParams()
  const hoy = useInicioDelDia()
  const desde = desdeClave(dia)
  if (!desde) return <Navigate to="/chat/historial" replace />
  if (desde.getTime() >= hoy.getTime()) return <Navigate to="/chat" replace />
  const hasta = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + 1)

  return (
    <div className="space-y-3 p-3">
      <PestanasChat />
      <div>
        <Link to="/chat/historial" className="text-sm font-semibold text-marca-700">
          ← Todos los días
        </Link>
        <h1 className="text-xl font-bold first-letter:uppercase">{nombreDia(desde, hoy)}</h1>
      </div>
      <Chat
        key={dia}
        ruta={CANAL_GENERAL}
        desde={desde}
        hasta={hasta}
        vacio="Ese día no hubo mensajes en el canal general."
        cerrado="Historial: los mensajes de días anteriores se pueden leer, pero ya no se puede escribir aquí."
      />
    </div>
  )
}
