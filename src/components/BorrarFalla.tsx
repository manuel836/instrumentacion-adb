import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useOnline } from '../hooks/useOnline'
import { hiloDeFalla, useMensajes } from '../lib/chat'
import { borrarFalla } from '../lib/fallas'
import { useMovimientosDeFalla } from '../lib/refacciones'
import type { Falla } from '../types'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/**
 * Zona de peligro de una falla (solo admin): la elimina con su chat y sus fotos, esté
 * abierta, en proceso o cerrada. Es para las que se reportaron por error.
 */
export function BorrarFalla({ falla }: { falla: Falla }) {
  const [abierto, setAbierto] = useState(false)
  if (!abierto) {
    return (
      <button className="btn-peligro w-full" onClick={() => setAbierto(true)}>
        Eliminar falla
      </button>
    )
  }
  return <Confirmar falla={falla} onCancelar={() => setAbierto(false)} />
}

function Confirmar({ falla, onCancelar }: { falla: Falla; onCancelar: () => void }) {
  const online = useOnline()
  const navigate = useNavigate()
  // Las mismas consultas que ya tiene abiertas la pantalla de la falla.
  const mensajes = useMensajes(hiloDeFalla(falla.id))
  const usadas = useMovimientosDeFalla(falla.id)

  const fotosChat = (mensajes ?? []).reduce((n, m) => n + m.fotos.length, 0)
  const lista = [
    falla.fotos.length > 0 ? `la descripción y ${plural(falla.fotos.length, 'foto', 'fotos')}` : 'la descripción',
    mensajes && mensajes.length > 0
      ? `su chat: ${plural(mensajes.length, 'mensaje', 'mensajes')}${fotosChat > 0 ? ` y ${plural(fotosChat, 'foto', 'fotos')}` : ''}`
      : 'su chat (sin mensajes)',
    ...(falla.estado === 'Cerrada' ? ['la causa raíz y la acción correctiva'] : []),
  ]

  function eliminar() {
    // Desaparece al momento; sin señal, el servidor la borra al reconectar.
    borrarFalla(falla.id).catch((err) => console.error('No se pudo eliminar la falla', err))
    navigate(`/fallas?estado=${encodeURIComponent(falla.estado)}`, {
      replace: true,
      state: { aviso: online ? `Se eliminó la falla de ${falla.tagISA}.` : `La falla de ${falla.tagISA} se eliminará al recuperar la señal.` },
    })
  }

  return (
    <section className="space-y-3 rounded-xl border border-peligro-200 bg-peligro-50 p-4 text-sm text-peligro-900">
      <h2 className="font-semibold">¿Eliminar esta falla de {falla.tagISA}?</h2>
      <p>Úsalo si se reportó por error. Se borrará para siempre junto con:</p>
      <ul className="list-disc pl-5">
        {lista.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      {usadas && usadas.length > 0 && (
        <p>
          Las refacciones que se registraron aquí siguen descontadas del almacén. Si no se usaron, regrésalas con una <b>entrada</b> en
          Refacciones.
        </p>
      )}
      {falla.estado !== 'Cerrada' && <p>Si {falla.tagISA} no tiene otra falla pendiente, vuelve a quedar en «Operando».</p>}
      <p>No se puede deshacer. La bitácora guarda quién la eliminó y qué decía.</p>
      <div className="flex gap-2">
        <button className="btn-secundario flex-1" onClick={onCancelar}>
          Cancelar
        </button>
        <button className="btn flex-1 bg-peligro-700 text-white" onClick={eliminar}>
          Sí, eliminar
        </button>
      </div>
    </section>
  )
}
