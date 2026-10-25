import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { activarAvisos, avisosDisponibles, renovarAvisos } from '../lib/avisos'

/** Invita a activar los avisos de fallas la primera vez; después solo renueva el token. */
export function AvisoNotificaciones() {
  const { user } = useAuth()
  const [mostrar, setMostrar] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    void avisosDisponibles().then((ok) => {
      if (!ok) return
      if (Notification.permission === 'default') setMostrar(true)
      else void renovarAvisos(user.uid)
    })
  }, [user])

  if (!mostrar || !user) return null
  return (
    <div className="flex items-center gap-3 bg-marca-50 px-4 py-2 text-sm text-marca-800">
      <span className="flex-1">{error || 'Activa los avisos para enterarte de fallas nuevas y mensajes.'}</span>
      <button
        className="rounded-md bg-marca-700 px-3 py-1.5 font-semibold text-white"
        onClick={() =>
          void activarAvisos(user.uid)
            .then((p) => (p === 'granted' ? setMostrar(false) : setError('Sin permiso: actívalos en la configuración de Chrome.')))
            .catch(() => setError('No se pudieron activar los avisos. Intenta con señal.'))
        }
      >
        Activar
      </button>
    </div>
  )
}
