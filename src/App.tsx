import { useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { AuthProvider, permisos, useAuth } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { precargarMiniaturas } from './lib/instrumentos'
import { Catalogo } from './pages/Catalogo'
import { Escanear } from './pages/Escanear'
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
  if (!rol)
    return (
      <div className="p-8 text-center">
        <p className="font-semibold">Tu cuenta no tiene un rol asignado.</p>
        <p className="mt-2 text-slate-500">Pide al administrador que te asigne uno.</p>
        <button className="btn-secundario mt-6" onClick={() => void salir()}>
          Salir
        </button>
      </div>
    )
  return <>{children}</>
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
        <Route path="escanear" element={<Escanear />} />
        <Route path="instrumentos/nuevo" element={<SoloSi permitido={p.editarInstrumentos}><FormInstrumento /></SoloSi>} />
        <Route path="instrumentos/:id" element={<Ficha />} />
        <Route path="instrumentos/:id/editar" element={<SoloSi permitido={p.editarInstrumentos}><FormInstrumento /></SoloSi>} />
        <Route path="instrumentos/:id/vincular" element={<SoloSi permitido={p.grabarTags}><Vincular /></SoloSi>} />
        <Route path="usuarios" element={<SoloSi permitido={p.gestionarUsuarios}><Usuarios /></SoloSi>} />
      </Route>
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
