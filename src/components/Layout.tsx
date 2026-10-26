import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
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

/** Después de que el admin le pone una contraseña temporal, se le pide elegir la suya. */
function AvisoContrasena() {
  const { cambiarContrasena } = useAuth()
  const { pathname } = useLocation()
  if (!cambiarContrasena || pathname === '/cuenta') return null
  return (
    <Link to="/cuenta" className="block bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900">
      Entraste con una contraseña temporal. Toca aquí para elegir la tuya.
    </Link>
  )
}

function Menu({ bitacora, exportar, onSalir }: { bitacora: boolean; exportar: boolean; onSalir: () => void }) {
  const [abierto, setAbierto] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setAbierto(false), [pathname])
  const clase = 'block px-4 py-3 text-left text-slate-800 active:bg-slate-100'
  return (
    <div className="relative">
      <button className="rounded-lg px-2 py-1 text-sm font-medium text-white/90" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
        Menú ▾
      </button>
      {abierto && (
        <>
          <button className="fixed inset-0 z-30 cursor-default" aria-label="Cerrar menú" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 z-40 mt-2 w-48 divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-lg">
            <Link to="/cuenta" className={clase}>
              Cambiar contraseña
            </Link>
            {bitacora && (
              <Link to="/bitacora" className={clase}>
                Bitácora de cambios
              </Link>
            )}
            {exportar && (
              <Link to="/exportar" className={clase}>
                Exportar Excel / PDF
              </Link>
            )}
            <button className={`${clase} w-full text-red-700`} onClick={onSalir}>
              Salir
            </button>
          </div>
        </>
      )}
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
          <Menu bitacora={p.verBitacora} exportar={p.exportar} onSalir={() => void salir()} />
        </div>
        <BarraConexion />
        <AvisoContrasena />
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
