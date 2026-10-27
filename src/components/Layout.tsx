import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigationType } from 'react-router'
import { permisos, useAuth } from '../auth/AuthContext'
import { useOnline, useSubidasPendientes } from '../hooks/useOnline'
import { useFallas } from '../lib/fallas'
import { useNoLeidosGeneral } from '../lib/chat'
import { useNoLeidosPrivados } from '../lib/privados'
import { AvisoNotificaciones } from './AvisoNotificaciones'
import { ConCarga } from './Diferida'
import { Icono } from './Icono'
import { AvisoListo } from './Listo'
import { SubidasDetenidas } from './SubidasDetenidas'

export function BarraConexion() {
  const online = useOnline()
  const { pendientes, detenidas } = useSubidasPendientes()
  const [verDetenidas, setVerDetenidas] = useState(false)
  const cerrar = useCallback(() => setVerDetenidas(false), [])
  const subidas = pendientes - detenidas
  return (
    <>
      {(!online || subidas > 0) && (
        <div className={`px-4 py-1.5 text-center text-sm font-medium ${online ? 'bg-info-100 text-info-900' : 'bg-aviso-100 text-aviso-900'}`}>
          {!online && 'Sin conexión: los cambios se guardan en el teléfono'}
          {!online && subidas > 0 && ' · '}
          {subidas > 0 && `${subidas} ${subidas === 1 ? 'archivo' : 'archivos'} por subir`}
        </div>
      )}
      {detenidas > 0 && (
        <button className="block w-full bg-peligro-100 px-4 py-1.5 text-center text-sm font-medium text-peligro-900" onClick={() => setVerDetenidas(true)}>
          {detenidas === 1 ? '1 archivo no se pudo subir' : `${detenidas} archivos no se pudieron subir`} · Ver
        </button>
      )}
      {verDetenidas && <SubidasDetenidas onCerrar={cerrar} />}
    </>
  )
}

/** Después de que el admin le pone una contraseña temporal, se le pide elegir la suya. */
function AvisoContrasena() {
  const { cambiarContrasena } = useAuth()
  const { pathname } = useLocation()
  if (!cambiarContrasena || pathname === '/cuenta') return null
  return (
    <Link to="/cuenta" className="block bg-aviso-100 px-4 py-2 text-sm font-medium text-aviso-900">
      Entraste con una contraseña temporal. Toca aquí para elegir la tuya.
    </Link>
  )
}

function Menu({
  bitacora,
  exportar,
  importar,
  usuarios,
  onSalir,
}: {
  bitacora: boolean
  exportar: boolean
  importar: boolean
  usuarios: boolean
  onSalir: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setAbierto(false), [pathname])
  const clase = 'block px-4 py-3 text-left text-slate-800 active:bg-slate-100'
  return (
    <div className="relative shrink-0">
      <button className="-my-2 rounded-lg px-2 py-3 text-sm font-medium text-white" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
        <span className="flex items-center gap-1">
          Menú <Icono nombre="abajo" className="size-4" />
        </span>
      </button>
      {abierto && (
        <>
          <button className="fixed inset-0 z-30 cursor-default" aria-label="Cerrar menú" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 z-40 mt-2 w-48 origin-top-right animate-desplegar divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-lg">
            {usuarios && (
              <Link to="/usuarios" className={clase}>
                Usuarios
              </Link>
            )}
            {usuarios && (
              <Link to="/subareas" className={clase}>
                Sub áreas
              </Link>
            )}
            <Link to="/refacciones" className={clase}>
              Refacciones
            </Link>
            <Link to="/cuenta" className={clase}>
              Cambiar contraseña
            </Link>
            {bitacora && (
              <Link to="/bitacora" className={clase}>
                Bitácora de cambios
              </Link>
            )}
            {importar && (
              <Link to="/instrumentos/importar" className={clase}>
                Importar desde Excel
              </Link>
            )}
            {exportar && (
              <Link to="/exportar" className={clase}>
                Exportar Excel / PDF
              </Link>
            )}
            <button className={`${clase} w-full text-peligro-700`} onClick={onSalir}>
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
    <span className="absolute -top-1 -right-3 rounded-full bg-peligro-600 px-1.5 text-xs leading-4 font-bold text-white">
      {n > 99 ? '99+' : n}
    </span>
  )
}

const claseNav = ({ isActive }: { isActive: boolean }) =>
  `relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${isActive ? 'font-semibold text-marca-700' : 'font-medium text-slate-500'}`

const PESTANAS = ['/', '/catalogo', '/fallas', '/chat', '/escanear']

/** Qué pestaña de abajo está abierta (la misma regla de NavLink), o -1 si ninguna. */
function pestanaActiva(pathname: string) {
  if (pathname === '/') return 0
  return PESTANAS.findIndex((p, i) => i > 0 && (pathname === p || pathname.startsWith(p + '/')))
}

/** La marca verde detrás del ícono de la pestaña abierta: se desliza a la que se toca. */
function MarcaPestana({ activa }: { activa: number }) {
  const [ultima, setUltima] = useState(Math.max(activa, 0))
  useEffect(() => {
    if (activa >= 0) setUltima(activa)
  }, [activa])
  return (
    <span
      aria-hidden="true"
      className={`absolute inset-y-0 left-0 w-1/5 motion-safe:transition-[translate,opacity] motion-safe:duration-300 motion-safe:ease-frenar ${activa < 0 ? 'opacity-0' : ''}`}
      style={{ translate: `${ultima * 100}% 0` }}
    >
      <span className="mx-auto mt-1 block h-8 w-14 rounded-full bg-marca-100" />
    </span>
  )
}

/** Cada pantalla nueva abre desde arriba; al regresar (Atrás) cada una decide. */
function ArribaAlNavegar() {
  const { pathname } = useLocation()
  const tipo = useNavigationType()
  useEffect(() => {
    if (tipo === 'PUSH') window.scrollTo(0, 0)
  }, [pathname, tipo])
  return null
}

export function Layout() {
  const { user, rol, salir } = useAuth()
  const p = permisos(rol)
  const fallas = useFallas()
  const abiertas = fallas?.filter((f) => f.estado === 'Abierta').length ?? 0
  const { pathname } = useLocation()
  const noLeidos = useNoLeidosGeneral(user?.uid)
  const privados = useNoLeidosPrivados(user?.uid)
  const sinLeer = (pathname === '/chat' ? 0 : noLeidos) + privados
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <ArribaAlNavegar />
      <header className="sticky top-0 z-20 bg-marca-700 text-white shadow">
        <div className="flex items-center justify-between gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <span className="min-w-0 text-lg font-bold">Instrumentación ADB</span>
          <Menu bitacora={p.verBitacora} exportar={p.exportar} importar={p.editarInstrumentos} usuarios={p.gestionarUsuarios} onSalir={() => void salir()} />
        </div>
        <BarraConexion />
        <AvisoContrasena />
        <AvisoNotificaciones />
        <AvisoListo />
      </header>
      {/* Cada pantalla entra con un fundido corto. Solo opacidad: un movimiento haría que los
          botones fijos (Alta, Reportar falla) se movieran con la pantalla mientras entra. */}
      <main className="flex-1 pb-24">
        <ConCarga key={pathname}>
          <div className="animate-pantalla">
            <Outlet />
          </div>
        </ConCarga>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-2xl border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <MarcaPestana activa={pestanaActiva(pathname)} />
        <NavLink to="/" end className={claseNav}>
          <Icono nombre="inicio" className="size-6" />
          Inicio
        </NavLink>
        <NavLink to="/catalogo" className={claseNav}>
          <Icono nombre="catalogo" className="size-6" />
          Catálogo
        </NavLink>
        <NavLink to="/fallas" className={claseNav}>
          <span className="relative">
            <Icono nombre="falla" className="size-6" />
            {abiertas > 0 && <Globo n={abiertas} />}
          </span>
          Fallas
        </NavLink>
        <NavLink to="/chat" className={claseNav}>
          <span className="relative">
            <Icono nombre="chat" className="size-6" />
            {sinLeer > 0 && <Globo n={sinLeer} />}
          </span>
          Chat
        </NavLink>
        <NavLink to="/escanear" className={claseNav}>
          <Icono nombre="escanear" className="size-6" />
          Escanear
        </NavLink>
      </nav>
    </div>
  )
}
