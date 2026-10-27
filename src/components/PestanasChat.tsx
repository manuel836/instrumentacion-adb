import { NavLink, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { useNoLeidosGeneral } from '../lib/chat'
import { useNoLeidosPrivados } from '../lib/privados'

const clase = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold ${isActive ? 'bg-white text-marca-700 shadow-sm' : 'text-slate-600'}`

function Cuantos({ n }: { n: number }) {
  return <span className="rounded-full bg-peligro-600 px-1.5 text-xs leading-4 font-bold text-white">{n > 99 ? '99+' : n}</span>
}

/** Canal general de hoy, chats privados e historial de días anteriores. */
export function PestanasChat() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const general = useNoLeidosGeneral(user?.uid)
  const privados = useNoLeidosPrivados(user?.uid)
  return (
    <nav className="flex gap-1 rounded-xl bg-slate-200/70 p-1" aria-label="Chats">
      <NavLink to="/chat" end className={clase}>
        General {pathname !== '/chat' && general > 0 && <Cuantos n={general} />}
      </NavLink>
      <NavLink to="/chat/privados" className={clase}>
        Privados {privados > 0 && <Cuantos n={privados} />}
      </NavLink>
      <NavLink to="/chat/historial" className={clase}>
        Historial
      </NavLink>
    </nav>
  )
}
