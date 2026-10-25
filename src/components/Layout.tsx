import { NavLink, Outlet, useLocation } from 'react-router'
import { permisos, useAuth } from '../auth/AuthContext'
import { useOnline, useSubidasPendientes } from '../hooks/useOnline'
import { useFallas } from '../lib/fallas'
import { useNoLeidosGeneral } from '../lib/chat'
import { AvisoNotificaciones } from './AvisoNotificaciones'

export function BarraConexion() {
  const online = useOnline()
  const subidas = useSubidasPendientes()
  if (online && subidas === 0) return null
  return (
    <div className={`px-4 py-1.5 text-center text-sm font-medium ${online ? 'bg-sky-100 text-sky-900' : 'bg-amber-100 text-amber-900'}`}>
      {!online && 'Sin conexión: los cambios se guardan en el teléfono'}
      {!online && subidas > 0 && ' · '}
      {subidas > 0 && `${subidas} ${subidas === 1 ? 'archivo' : 'archivos'} por subir`}
    </div>
  )
}

function Globo({ n }: { n: number }) {
  return (
    <span className="absolute -top-1 -right-3 rounded-full bg-red-600 px-1.5 text-[10px] leading-4 font-bold text-white">
      {n > 99 ? '99+' : n}
    </span>
  )
}

const claseNav = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${isActive ? 'text-marca-700' : 'text-slate-500'}`

export function Layout() {
  const { user, rol, salir } = useAuth()
  const p = permisos(rol)
  const fallas = useFallas()
  const abiertas = fallas?.filter((f) => f.estado === 'Abierta').length ?? 0
  const { pathname } = useLocation()
  const noLeidos = useNoLeidosGeneral(user?.uid)
  const sinLeer = pathname === '/chat' ? 0 : noLeidos
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="sticky top-0 z-20 bg-marca-700 text-white shadow">
        <div className="flex items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <span className="text-lg font-bold">Instrumentación ADB</span>
          <button className="text-sm text-white/80" onClick={() => void salir()}>
            Salir
          </button>
        </div>
        <BarraConexion />
        <AvisoNotificaciones />
      </header>
      <main className="flex-1 pb-24">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-2xl border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <NavLink to="/" end className={claseNav}>
          <span className="text-xl">☰</span>Catálogo
        </NavLink>
        <NavLink to="/fallas" className={claseNav}>
          <span className="relative text-xl">
            ⚠
            {abiertas > 0 && <Globo n={abiertas} />}
          </span>
          Fallas
        </NavLink>
        <NavLink to="/chat" className={claseNav}>
          <span className="relative text-xl">
            💬
            {sinLeer > 0 && <Globo n={sinLeer} />}
          </span>
          Chat
        </NavLink>
        <NavLink to="/escanear" className={claseNav}>
          <span className="text-xl">⌁</span>Escanear
        </NavLink>
        {p.editarInstrumentos && (
          <NavLink to="/instrumentos/nuevo" className={claseNav}>
            <span className="text-xl">＋</span>Alta
          </NavLink>
        )}
        {p.gestionarUsuarios && (
          <NavLink to="/usuarios" className={claseNav}>
            <span className="text-xl">👤</span>Usuarios
          </NavLink>
        )}
      </nav>
    </div>
  )
}
