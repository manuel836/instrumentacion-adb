import { useEffect, useState, type FormEvent } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
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

  useEffect(
    () =>
      onSnapshot(query(collection(db, 'usuarios'), orderBy('nombre')), (s) =>
        setLista(s.docs.map((d) => ({ ...(d.data() as Usuario), uid: d.id }))),
      ),
    [],
  )

  async function accion(f: () => Promise<unknown>, ok: string) {
    setMensaje('')
    try {
      await f()
      setMensaje(ok)
    } catch (err) {
      setMensaje(`Error: ${(err as Error).message}`)
    }
  }

  async function onCrear(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    await accion(() => crearUsuario(form), `Usuario ${form.email} creado.`)
    setForm({ nombre: '', email: '', password: '', rol: 'operador', area: '' })
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
            {u.uid !== user?.uid && (
              <div className="flex gap-2 text-sm">
                <button
                  className="btn-secundario flex-1 py-1.5 text-sm"
                  disabled={!online}
                  onClick={() => void accion(() => revocarSesiones({ uid: u.uid }), 'Sesiones cerradas en todos sus teléfonos.')}
                >
                  Cerrar sesiones
                </button>
                <button
                  className={`${u.activo ? 'btn-peligro' : 'btn-secundario'} flex-1 py-1.5 text-sm`}
                  disabled={!online}
                  onClick={() =>
                    void accion(() => cambiarActivo({ uid: u.uid, activo: !u.activo }), u.activo ? 'Usuario desactivado.' : 'Usuario reactivado.')
                  }
                >
                  {u.activo ? 'Dar de baja' : 'Reactivar'}
                </button>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  )
}
