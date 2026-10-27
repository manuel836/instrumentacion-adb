import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { BarraConexion } from '../components/Layout'
import logoFertinal from '../assets/logo-fertinal.png'

const mensajes: Record<string, string> = {
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/wrong-password': 'Correo o contraseña incorrectos.',
  'auth/user-not-found': 'Correo o contraseña incorrectos.',
  'auth/user-disabled': 'Tu usuario está desactivado. Habla con el administrador.',
  'auth/network-request-failed': 'Sin conexión. La primera vez necesitas señal para entrar.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
}

export function Login() {
  const { entrar } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await entrar(email, password)
    } catch (err) {
      setError(mensajes[(err as { code?: string }).code ?? ''] ?? 'No se pudo entrar.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <BarraConexion />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center p-6">
        <div className="mb-8 text-center">
          <img src={logoFertinal} alt="Fertinal" width={480} height={369} className="mx-auto mb-6 h-auto w-28" />
          <h1 className="text-2xl font-bold">Instrumentación ADB</h1>
          <p className="text-slate-500">Agroindustrias del Balsas</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="etiqueta" htmlFor="email">Correo</label>
            <input id="email" className="campo" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="etiqueta" htmlFor="pass">Contraseña</label>
            <input id="pass" className="campo" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button className="btn-primario w-full" disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          ¿Olvidaste tu contraseña? Pídele al administrador que te ponga una temporal desde Usuarios.
        </p>
        <p className="mt-3 text-center text-sm text-slate-500">
          ¿Solo quieres ver un instrumento? Acerca el teléfono a su tag NFC.
        </p>
      </div>
    </div>
  )
}
