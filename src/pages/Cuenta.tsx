import { useState, type FormEvent } from 'react'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth'
import { useAuth } from '../auth/AuthContext'
import { useOnline } from '../hooks/useOnline'

const mensajes: Record<string, string> = {
  'auth/invalid-credential': 'La contraseña actual no es correcta.',
  'auth/wrong-password': 'La contraseña actual no es correcta.',
  'auth/weak-password': 'La contraseña nueva es muy débil.',
  'auth/password-does-not-meet-requirements': 'La contraseña nueva no cumple los requisitos.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
  'auth/network-request-failed': 'Sin conexión. Cambiar la contraseña necesita señal.',
}

export function Cuenta() {
  const { user } = useAuth()
  const online = useOnline()
  const [form, setForm] = useState({ actual: '', nueva: '', repetir: '' })
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user?.email) return
    if (form.nueva !== form.repetir) return setMensaje({ ok: false, texto: 'Las contraseñas nuevas no coinciden.' })
    if (form.nueva === form.actual) return setMensaje({ ok: false, texto: 'La contraseña nueva debe ser distinta de la actual.' })
    setMensaje(null)
    setEnviando(true)
    try {
      // Firebase pide confirmar la contraseña actual antes de cambiarla.
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, form.actual))
      await updatePassword(user, form.nueva)
      setForm({ actual: '', nueva: '', repetir: '' })
      setMensaje({ ok: true, texto: 'Listo: tu contraseña cambió. Úsala la próxima vez que entres.' })
    } catch (err) {
      setMensaje({ ok: false, texto: mensajes[(err as { code?: string }).code ?? ''] ?? 'No se pudo cambiar la contraseña.' })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-4 p-3">
      <div className="tarjeta">
        <p className="font-semibold">{user?.displayName ?? 'Mi cuenta'}</p>
        <p className="text-sm text-slate-500">{user?.email}</p>
      </div>
      {!online && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Cambiar la contraseña necesita señal.</p>}
      <form onSubmit={onSubmit} className="tarjeta space-y-3">
        <h2 className="font-semibold">Cambiar contraseña</h2>
        <div>
          <label className="etiqueta" htmlFor="actual">Contraseña actual</label>
          <input
            id="actual"
            className="campo"
            type="password"
            autoComplete="current-password"
            required
            value={form.actual}
            onChange={(e) => setForm({ ...form, actual: e.target.value })}
          />
        </div>
        <div>
          <label className="etiqueta" htmlFor="nueva">Contraseña nueva (mín. 8)</label>
          <input
            id="nueva"
            className="campo"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={form.nueva}
            onChange={(e) => setForm({ ...form, nueva: e.target.value })}
          />
        </div>
        <div>
          <label className="etiqueta" htmlFor="repetir">Repite la contraseña nueva</label>
          <input
            id="repetir"
            className="campo"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={form.repetir}
            onChange={(e) => setForm({ ...form, repetir: e.target.value })}
          />
        </div>
        {mensaje && (
          <p className={`rounded-lg p-3 text-sm ${mensaje.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{mensaje.texto}</p>
        )}
        <button className="btn-primario w-full" disabled={!online || enviando}>
          {enviando ? 'Guardando…' : 'Cambiar contraseña'}
        </button>
      </form>
    </div>
  )
}
