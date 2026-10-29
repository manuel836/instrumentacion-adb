import { useEffect } from 'react'
import { Link } from 'react-router'
import { Chat } from '../components/Chat'
import { PestanasChat } from '../components/PestanasChat'
import { useInicioDelDia } from '../hooks/useHoy'
import { CANAL_GENERAL, marcarGeneralLeido } from '../lib/chat'

/** Canal general: cada día empieza en blanco; lo anterior queda en el historial. */
export function ChatGeneral() {
  const hoy = useInicioDelDia()
  useEffect(() => {
    marcarGeneralLeido()
    return marcarGeneralLeido
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="oculto-con-teclado shrink-0 space-y-3 px-3 pt-3">
        <PestanasChat />
        <div>
          <h1 className="text-xl font-bold">Canal general · hoy</h1>
          <p className="text-sm text-slate-500">
            Mensajes para todo el equipo. Cada día empieza en blanco; lo de días anteriores queda guardado en el{' '}
            <Link to="/chat/historial" className="font-semibold text-marca-700">
              historial
            </Link>
            .
          </p>
        </div>
      </div>
      <Chat ruta={CANAL_GENERAL} desde={hoy} pantalla vacio="Aún no hay mensajes hoy." />
    </div>
  )
}
