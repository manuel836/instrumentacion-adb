import { useEffect, useState, type ReactNode } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { AuthProvider, permisos, useAuth } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { precargarMiniaturas } from './lib/instrumentos'
import { anotarEnDirectorio } from './lib/privados'
import { revisarSesionesAnteriores } from './lib/rechazos'
import { iniciarEstadoTelefono } from './lib/telefono'
import { Catalogo } from './pages/Catalogo'
import { Inicio } from './pages/Inicio'
import { ChatGeneral } from './pages/ChatGeneral'
import { DetalleFalla } from './pages/DetalleFalla'
import { Escanear } from './pages/Escanear'
import { Fallas } from './pages/Fallas'
import { NuevaFalla } from './pages/NuevaFalla'
import { Ficha } from './pages/Ficha'
import { Login } from './pages/Login'
import { Tag } from './pages/Tag'
import { ConCarga, diferida } from './components/Diferida'
import { useOnline } from './hooks/useOnline'

// Pantallas que se usan poco: se descargan al abrirlas.
const Bitacora = diferida(() => import('./pages/Bitacora'), 'Bitacora')
const Exportar = diferida(() => import('./pages/Exportar'), 'Exportar')
const Imprimir = diferida(() => import('./pages/Imprimir'), 'Imprimir')
const HojaDeVida = diferida(() => import('./pages/HojaDeVida'), 'HojaDeVida')
const Importar = diferida(() => import('./pages/Importar'), 'Importar')
const DetalleCalibracion = diferida(() => import('./pages/DetalleCalibracion'), 'DetalleCalibracion')
const NuevaCalibracion = diferida(() => import('./pages/NuevaCalibracion'), 'NuevaCalibracion')
const Cuenta = diferida(() => import('./pages/Cuenta'), 'Cuenta')
const FormInstrumento = diferida(() => import('./pages/FormInstrumento'), 'FormInstrumento')
const Usuarios = diferida(() => import('./pages/Usuarios'), 'Usuarios')
const Vincular = diferida(() => import('./pages/Vincular'), 'Vincular')
const Refacciones = diferida(() => import('./pages/Refacciones'), 'Refacciones')
const DetalleRefaccion = diferida(() => import('./pages/DetalleRefaccion'), 'DetalleRefaccion')
const FormRefaccion = diferida(() => import('./pages/FormRefaccion'), 'FormRefaccion')
const HistorialChat = diferida(() => import('./pages/HistorialChat'), 'HistorialChat')
const DiaChat = diferida(() => import('./pages/HistorialChat'), 'DiaChat')
const ChatsPrivados = diferida(() => import('./pages/ChatsPrivados'), 'ChatsPrivados')
const Subareas = diferida(() => import('./pages/Subareas'), 'Subareas')
const EstadoTelefonos = diferida(() => import('./pages/EstadoTelefonos'), 'EstadoTelefonos')
const ConversacionPrivada = diferida(() => import('./pages/ChatsPrivados'), 'ConversacionPrivada')

function ConSesion({ children }: { children: ReactNode }) {
  const { cargando, user, rol, area, salir } = useAuth()
  const location = useLocation()

  useEffect(() => {
    if (rol) return precargarMiniaturas()
  }, [rol])

  useEffect(() => {
    if (!user || !rol) return
    // Lo que quedó sin respuesta del servidor la vez anterior se revisa al reconectar.
    void revisarSesionesAnteriores(user.uid)
    // Que el teléfono no borre lo guardado sin señal cuando se le llena la memoria.
    void navigator.storage?.persist?.().catch(() => false)
    // El admin ve en Estado de los teléfonos lo que este tiene pendiente y sus errores.
    return iniciarEstadoTelefono(user)
  }, [user, rol])

  // Para que los demás lo encuentren al abrir un chat privado.
  useEffect(() => {
    if (user && rol) void anotarEnDirectorio(user.uid, user.displayName || user.email || 'Usuario', rol, area)
  }, [user, rol, area])

  if (cargando) return null
  if (!user) return <Navigate to="/login" replace state={{ desde: location.pathname }} />
  if (!rol) return <SinRol onSalir={() => void salir()} />
  return <>{children}</>
}

const reclamarAdminInicial = httpsCallable(functions, 'reclamarAdminInicial')

function SinRol({ onSalir }: { onSalir: () => void }) {
  const { user } = useAuth()
  const online = useOnline()
  const [mensaje, setMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function reclamar() {
    setEnviando(true)
    setMensaje('')
    try {
      await reclamarAdminInicial()
      await user?.getIdToken(true)
    } catch (err) {
      setMensaje((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  // Sin señal no se puede preguntar al servidor: no hay que asustar con "no tienes rol".
  if (!online) {
    return (
      <div className="p-8 text-center">
        <p className="font-semibold">Sin conexión</p>
        <p className="mt-2 text-slate-500">No se pudo comprobar tu cuenta sin señal. Conéctate a internet y la app se abrirá sola.</p>
      </div>
    )
  }

  return (
    <div className="p-8 text-center">
      <p className="font-semibold">Tu cuenta no tiene un rol asignado.</p>
      <p className="mt-2 text-slate-500">Pide al administrador que te asigne uno.</p>
      <div className="mt-6 flex flex-col items-center gap-3">
        <button className="btn-secundario" onClick={onSalir}>
          Salir
        </button>
        {/* Solo funciona para el correo configurado como administrador inicial y mientras no haya otro admin. */}
        <button className="text-sm text-marca-700 underline" disabled={enviando} onClick={() => void reclamar()}>
          Soy el administrador inicial
        </button>
        {mensaje && <p className="rounded-lg bg-peligro-50 p-3 text-sm text-peligro-700">{mensaje}</p>}
      </div>
    </div>
  )
}

function SoloSi({ permitido, children }: { permitido: boolean; children: ReactNode }) {
  return permitido ? <>{children}</> : <Navigate to="/" replace />
}

function PaginaLogin() {
  const { cargando, user } = useAuth()
  const location = useLocation()
  if (cargando) return null
  if (user) return <Navigate to={(location.state as { desde?: string } | null)?.desde ?? '/'} replace />
  return <Login />
}

function Rutas() {
  const { rol } = useAuth()
  const p = permisos(rol)
  return (
    <Routes>
      <Route path="/login" element={<PaginaLogin />} />
      <Route path="/t/:token" element={<Tag />} />
      <Route
        element={
          <ConSesion>
            <Layout />
          </ConSesion>
        }
      >
        <Route index element={<Inicio />} />
        <Route path="catalogo" element={<Catalogo />} />
        <Route path="escanear" element={<Escanear />} />
        <Route path="instrumentos/nuevo" element={<SoloSi permitido={p.editarInstrumentos}><FormInstrumento /></SoloSi>} />
        <Route path="instrumentos/importar" element={<SoloSi permitido={p.editarInstrumentos}><Importar /></SoloSi>} />
        <Route path="instrumentos/:id" element={<Ficha />} />
        <Route path="instrumentos/:id/editar" element={<SoloSi permitido={p.editarInstrumentos}><FormInstrumento /></SoloSi>} />
        <Route path="instrumentos/:id/vincular" element={<SoloSi permitido={p.grabarTags}><Vincular /></SoloSi>} />
        <Route path="instrumentos/:id/calibrar" element={<SoloSi permitido={p.registrarCalibraciones}><NuevaCalibracion /></SoloSi>} />
        <Route path="instrumentos/:id/calibraciones/:calId" element={<DetalleCalibracion />} />
        <Route path="fallas" element={<Fallas />} />
        <Route path="fallas/nueva" element={<SoloSi permitido={p.reportarFallas}><NuevaFalla /></SoloSi>} />
        <Route path="fallas/:id" element={<DetalleFalla />} />
        <Route path="chat" element={<ChatGeneral />} />
        <Route path="chat/historial" element={<HistorialChat />} />
        <Route path="chat/historial/:dia" element={<DiaChat />} />
        <Route path="chat/privados" element={<ChatsPrivados />} />
        <Route path="chat/privado/:uid" element={<ConversacionPrivada />} />
        <Route path="cuenta" element={<Cuenta />} />
        <Route path="bitacora" element={<SoloSi permitido={p.verBitacora}><Bitacora /></SoloSi>} />
        <Route path="exportar" element={<SoloSi permitido={p.exportar}><Exportar /></SoloSi>} />
        <Route path="usuarios" element={<SoloSi permitido={p.gestionarUsuarios}><Usuarios /></SoloSi>} />
        <Route path="subareas" element={<SoloSi permitido={p.gestionarUsuarios}><Subareas /></SoloSi>} />
        <Route path="telefonos" element={<SoloSi permitido={p.gestionarUsuarios}><EstadoTelefonos /></SoloSi>} />
        <Route path="refacciones" element={<Refacciones />} />
        <Route path="refacciones/nueva" element={<SoloSi permitido={p.refacciones}><FormRefaccion /></SoloSi>} />
        <Route path="refacciones/:id" element={<DetalleRefaccion />} />
        <Route path="refacciones/:id/editar" element={<SoloSi permitido={p.refacciones}><FormRefaccion /></SoloSi>} />
      </Route>
      <Route
        path="/imprimir"
        element={
          <ConSesion>
            <SoloSi permitido={p.exportar}>
              <ConCarga>
                <Imprimir />
              </ConCarga>
            </SoloSi>
          </ConSesion>
        }
      />
      <Route
        path="/instrumentos/:id/hoja-de-vida"
        element={
          <ConSesion>
            <ConCarga>
              <HojaDeVida />
            </ConCarga>
          </ConSesion>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Rutas />
      </BrowserRouter>
    </AuthProvider>
  )
}
