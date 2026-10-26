import { useEffect, useState, type ReactNode } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { AuthProvider, permisos, useAuth } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { precargarMiniaturas } from './lib/instrumentos'
import { Bitacora } from './pages/Bitacora'
import { Catalogo } from './pages/Catalogo'
import { Exportar } from './pages/Exportar'
import { Imprimir } from './pages/Imprimir'
import { DetalleCalibracion } from './pages/DetalleCalibracion'
import { NuevaCalibracion } from './pages/NuevaCalibracion'
import { ChatGeneral } from './pages/ChatGeneral'
import { Cuenta } from './pages/Cuenta'
import { DetalleFalla } from './pages/DetalleFalla'
import { Escanear } from './pages/Escanear'
import { Fallas } from './pages/Fallas'
import { NuevaFalla } from './pages/NuevaFalla'
import { Ficha } from './pages/Ficha'
import { FormInstrumento } from './pages/FormInstrumento'
import { Login } from './pages/Login'
import { Tag } from './pages/Tag'
import { Usuarios } from './pages/Usuarios'
import { Vincular } from './pages/Vincular'

function ConSesion({ children }: { children: ReactNode }) {
  const { cargando, user, rol, salir } = useAuth()
  const location = useLocation()

  useEffect(() => {
    if (rol) return precargarMiniaturas()
  }, [rol])

  if (cargando) return null
  if (!user) return <Navigate to="/login" replace state={{ desde: location.pathname }} />
  if (!rol) return <SinRol onSalir={() => void salir()} />
  return <>{children}</>
}

const reclamarAdminInicial = httpsCallable(functions, 'reclamarAdminInicial')

function SinRol({ onSalir }: { onSalir: () => void }) {
  const { user } = useAuth()
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
        {mensaje && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{mensaje}</p>}
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
        <Route index element={<Catalogo />} />
        <Route path="catalogo" element={<Catalogo />} />
        <Route path="escanear" element={<Escanear />} />
        <Route path="instrumentos/nuevo" element={<SoloSi permitido={p.editarInstrumentos}><FormInstrumento /></SoloSi>} />
        <Route path="instrumentos/:id" element={<Ficha />} />
        <Route path="instrumentos/:id/editar" element={<SoloSi permitido={p.editarInstrumentos}><FormInstrumento /></SoloSi>} />
        <Route path="instrumentos/:id/vincular" element={<SoloSi permitido={p.grabarTags}><Vincular /></SoloSi>} />
        <Route path="instrumentos/:id/calibrar" element={<SoloSi permitido={p.registrarCalibraciones}><NuevaCalibracion /></SoloSi>} />
        <Route path="instrumentos/:id/calibraciones/:calId" element={<DetalleCalibracion />} />
        <Route path="fallas" element={<Fallas />} />
        <Route path="fallas/nueva" element={<SoloSi permitido={p.reportarFallas}><NuevaFalla /></SoloSi>} />
        <Route path="fallas/:id" element={<DetalleFalla />} />
        <Route path="chat" element={<ChatGeneral />} />
        <Route path="cuenta" element={<Cuenta />} />
        <Route path="bitacora" element={<SoloSi permitido={p.verBitacora}><Bitacora /></SoloSi>} />
        <Route path="exportar" element={<SoloSi permitido={p.exportar}><Exportar /></SoloSi>} />
        <Route path="usuarios" element={<SoloSi permitido={p.gestionarUsuarios}><Usuarios /></SoloSi>} />
      </Route>
      <Route
        path="/imprimir"
        element={
          <ConSesion>
            <SoloSi permitido={p.exportar}>
              <Imprimir />
            </SoloSi>
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
