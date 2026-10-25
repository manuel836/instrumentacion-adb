import { useEffect } from 'react'
import { Chat } from '../components/Chat'
import { CANAL_GENERAL, marcarGeneralLeido } from '../lib/chat'

export function ChatGeneral() {
  useEffect(() => {
    marcarGeneralLeido()
    return marcarGeneralLeido
  }, [])

  return (
    <div className="space-y-3 p-3">
      <div>
        <h1 className="text-xl font-bold">Canal general</h1>
        <p className="text-sm text-slate-500">Mensajes para todo el equipo de instrumentación.</p>
      </div>
      <Chat ruta={CANAL_GENERAL} alInicioAbajo vacio="Aún no hay mensajes en el canal." />
    </div>
  )
}
