import { useEffect, useState, type FormEvent } from 'react'
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../firebase'
import { useAuth } from '../auth/AuthContext'
import { AREAS, type Rol, type Usuario } from '../types'
import { useOnline } from '../hooks/useOnline'

const crearUsuario = httpsCallable<{ nombre: string; email: string; password: string; rol: Rol; area: string }, { uid: string }>(
  functions,
  'crearUsuario',
)
const asignarRol = httpsCallable<{ uid: string; rol: Rol }>(functions, 'asignarRol')
const cambiarActivo = httpsCallable<{ uid: string; activo: boolean }>(functions, 'cambiarActivo')
const revocarSesiones = httpsCallable<{ uid: string }>(functions, 'revocarSesiones')
const eliminarUsuario = httpsCallable<{ uid: string }>(functions, 'eliminarUsuario')
const restablecerContrasena = httpsCallable<{ uid: string; password: string }>(functions, 'restablecerContrasena')

/** Contraseña temporal fácil de dictar: sin letras que se confunden (l, 1, o, 0). */
function contrasenaTemporal(): string {
  const letras = 'abcdefghjkmnpqrstuvwxyz23456789'
  const azar = crypto.getRandomValues(new Uint32Array(8))
  const s = Array.from(azar, (n) => letras[n % letras.length]).join('')
  return `${s.slice(0, 4)}-${s.slice(4)}`
}

/** Qué avisos de fallas le llegan según su rol y su área. */
function textoAvisos(u: Usuario): string {
  if (u.rol === 'operador') return 'Le llegan avisos solo de las fallas que reporta. Su inicio abre en esta área.'
  return u.area ? `Le llegan avisos de fallas nuevas solo de ${u.area}.` : 'Le llegan avisos de fallas nuevas de todas las áreas.'
}

const ROLES: { v: Rol; t: string }[] = [
  { v: 'operador', t: 'Operador' },
  { v: 'tecnico', t: 'Técnico' },
  { v: 'admin', t: 'Admin' },
]

export function Usuarios() {
  const { user } = useAuth()
  const online = useOnline()
  const [lista, setLista] = useState<Usuario[]>([])
  const [mensaje, setMensaje] = useState('')
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'operador' as Rol, area: '' })
  const [enviando, setEnviando] = useState(false)
  const [porEliminar, setPorEliminar] = useState<string | null>(null)
  const [nuevaClave, setNuevaClave] = useState<{ uid: string; password: string } | null>(null)

  useEffect(
    () =>
      onSnapshot(query(collection(db, 'usuarios'), orderBy('nombre')), (s) =>
        setLista(s.docs.map((d) => ({ ...(d.data() as Usuario), uid: d.id }))),
      ),
    [],
  )

  async function accion(f: () => Promise<unknown>, ok: string): Promise<boolean> {
    setMensaje('')
    try {
      await f()
      setMensaje(ok)
      // El aviso sale arriba: se sube para que el admin lo vea (lleva la contraseña temporal).
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return true
    } catch (err) {
      const code = (err as { code?: string }).code
      setMensaje(
        code === 'functions/internal' || code === 'functions/unavailable'
          ? 'Error: no se pudo contactar al servidor. Revisa tu señal o avisa al administrador del sistema.'
          : `Error: ${(err as Error).message}`,
      )
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return false
    }
  }

  async function onCrear(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    // Si falla se conservan los datos para corregir y reintentar.
    if (await accion(() => crearUsuario(form), `Usuario ${form.email} creado.`)) {
      setForm({ nombre: '', email: '', password: '', rol: 'operador', area: '' })
    }
    setEnviando(false)
  }

  return (
    <div className="space-y-4 p-3">
      {!online && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Gestionar usuarios necesita señal.</p>}
      {mensaje && <p className="rounded-lg bg-slate-100 p-3 text-sm">{mensaje}</p>}

      <form onSubmit={onCrear} className="tarjeta space-y-3">
        <h2 className="font-semibold">Nuevo usuario</h2>
        <input className="campo" placeholder="Nombre" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        <input className="campo" type="email" placeholder="Correo" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input
          className="campo"
          type="text"
          placeholder="Contraseña inicial (mín. 8)"
          minLength={8}
          required
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-2">
          <select className="campo" value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value as Rol })}>
            {ROLES.map((r) => (
              <option key={r.v} value={r.v}>
                {r.t}
              </option>
            ))}
          </select>
          <select className="campo" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>
            <option value="">Todas las áreas</option>
            {AREAS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-slate-500">
          El área define de qué fallas le llegan avisos a técnicos y admins, y qué resumen ve primero en el inicio. Con “Todas las áreas”
          recibe todo.
        </p>
        <button className="btn-primario w-full" disabled={!online || enviando}>
          Crear usuario
        </button>
      </form>

      <section className="space-y-2">
        {lista.map((u) => (
          <div key={u.uid} className={`tarjeta space-y-2 ${u.activo ? '' : 'opacity-60'}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {u.nombre} {!u.activo && <span className="text-xs font-normal text-red-700">(desactivado)</span>}
                </p>
                <p className="truncate text-sm text-slate-500">{u.email}</p>
              </div>
              <select
                className="campo w-auto py-1.5 text-sm"
                value={u.rol}
                disabled={!online || u.uid === user?.uid}
                onChange={(e) => void accion(() => asignarRol({ uid: u.uid, rol: e.target.value as Rol }), 'Rol actualizado.')}
              >
                {ROLES.map((r) => (
                  <option key={r.v} value={r.v}>
                    {r.t}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <select
                className="campo py-1.5 text-sm"
                aria-label={`Área de ${u.nombre}`}
                value={u.area ?? ''}
                disabled={!online}
                onChange={(e) => {
                  const area = e.target.value
                  void accion(() => updateDoc(doc(db, 'usuarios', u.uid), { area }), `Área de ${u.nombre}: ${area || 'todas las áreas'}.`)
                }}
              >
                <option value="">Todas las áreas</option>
                {AREAS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500">{textoAvisos(u)}</p>
            </div>
            {u.uid !== user?.uid && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <button
                  className="btn-secundario py-1.5 text-sm"
                  disabled={!online}
                  onClick={() => {
                    setPorEliminar(null)
                    setNuevaClave({ uid: u.uid, password: contrasenaTemporal() })
                  }}
                >
                  Nueva contraseña
                </button>
                <button
                  className="btn-secundario py-1.5 text-sm"
                  disabled={!online}
                  onClick={() => void accion(() => revocarSesiones({ uid: u.uid }), 'Sesiones cerradas en todos sus teléfonos.')}
                >
                  Cerrar sesiones
                </button>
                <button
                  className={`${u.activo ? 'btn-peligro' : 'btn-secundario'} py-1.5 text-sm`}
                  disabled={!online}
                  onClick={() =>
                    void accion(() => cambiarActivo({ uid: u.uid, activo: !u.activo }), u.activo ? 'Usuario desactivado.' : 'Usuario reactivado.')
                  }
                >
                  {u.activo ? 'Dar de baja' : 'Reactivar'}
                </button>
                <button
                  className="btn-peligro py-1.5 text-sm"
                  disabled={!online}
                  onClick={() => {
                    setNuevaClave(null)
                    setPorEliminar(u.uid)
                  }}
                >
                  Eliminar
                </button>
              </div>
            )}
            {nuevaClave?.uid === u.uid && (
              <form
                className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm"
                onSubmit={(e) => {
                  e.preventDefault()
                  const { password } = nuevaClave
                  setNuevaClave(null)
                  void accion(
                    () => restablecerContrasena({ uid: u.uid, password }),
                    `Listo. Dale a ${u.nombre} esta contraseña temporal: ${password}. Al entrar, la app le pedirá elegir una nueva.`,
                  )
                }}
              >
                <p>
                  Contraseña temporal para <b>{u.nombre}</b>. Puedes dejar la que sugerimos o escribir otra. Sus sesiones abiertas se cerrarán.
                </p>
                <input
                  className="campo font-mono"
                  aria-label="Contraseña temporal"
                  minLength={8}
                  required
                  value={nuevaClave.password}
                  onChange={(e) => setNuevaClave({ uid: u.uid, password: e.target.value })}
                />
                <div className="flex gap-2">
                  <button type="button" className="btn-secundario flex-1 py-1.5 text-sm" onClick={() => setNuevaClave(null)}>
                    Cancelar
                  </button>
                  <button className="btn-primario flex-1 py-1.5 text-sm" disabled={!online}>
                    Poner contraseña
                  </button>
                </div>
              </form>
            )}
            {porEliminar === u.uid && (
              <div className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-900">
                <p>
                  ¿Eliminar a <b>{u.nombre}</b> para siempre? Ya no podrá entrar. Sus fallas, mensajes y calibraciones se conservan con su
                  nombre.
                </p>
                <div className="flex gap-2">
                  <button className="btn-secundario flex-1 py-1.5 text-sm" onClick={() => setPorEliminar(null)}>
                    Cancelar
                  </button>
                  <button
                    className="btn-peligro flex-1 py-1.5 text-sm"
                    disabled={!online}
                    onClick={() => {
                      setPorEliminar(null)
                      void accion(() => eliminarUsuario({ uid: u.uid }), `Usuario ${u.email} eliminado.`)
                    }}
                  >
                    Sí, eliminar
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  )
}
