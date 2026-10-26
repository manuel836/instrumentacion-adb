import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onIdTokenChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase'
import type { Rol } from '../types'

interface AuthState {
  cargando: boolean
  user: User | null
  rol: Rol | null
  /** El admin le puso una contraseña temporal: hay que pedirle que elija una nueva. */
  cambiarContrasena: boolean
  /** Área asignada por el admin ('' = todas). */
  area: string
  entrar: (email: string, password: string) => Promise<void>
  salir: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

function aRol(claim: unknown): Rol | null {
  return claim === 'admin' || claim === 'tecnico' || claim === 'operador' ? claim : null
}

/**
 * El token dura una hora y sin señal Firebase no lo puede renovar ni entregar, pero el último
 * sigue guardado en el teléfono: de ahí se lee el rol para seguir trabajando sin señal. Solo
 * decide qué pantallas se ven; el servidor revisa el token nuevo cuando el teléfono sincroniza.
 */
function rolDelUltimoToken(u: User): Rol | null {
  try {
    const { stsTokenManager } = u.toJSON() as { stsTokenManager?: { accessToken?: string } }
    const datos = stsTokenManager?.accessToken?.split('.')[1]
    if (!datos) return null
    return aRol((JSON.parse(atob(datos.replace(/-/g, '+').replace(/_/g, '/'))) as { rol?: unknown }).rol)
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [rol, setRol] = useState<Rol | null>(null)
  const [cambiarContrasena, setCambiarContrasena] = useState(false)
  const [area, setArea] = useState('')

  useEffect(() => {
    let vuelta = 0
    return onIdTokenChanged(auth, async (u) => {
      const esta = ++vuelta
      let r: Rol | null = null
      if (u) {
        // El rol viaja como custom claim. Si el token venció y no hay señal para renovarlo,
        // se usa el último que quedó en el teléfono.
        const token = await u.getIdTokenResult().catch(() => null)
        r = token ? aRol(token.claims.rol) : rolDelUltimoToken(u)
      }
      // Otro cambio llegó mientras se leía este token: manda el más nuevo.
      if (esta !== vuelta) return
      setUser(u)
      setRol(r)
      setCargando(false)
    })
  }, [])

  // Al volver la señal se renueva el token si ya venció, y onIdTokenChanged trae el rol vigente.
  useEffect(() => {
    if (!user) return
    const alVolver = () => void user.getIdToken().catch(() => undefined)
    window.addEventListener('online', alVolver)
    return () => window.removeEventListener('online', alVolver)
  }, [user])

  // Cuando el Admin cambia el rol, la Function marca rolActualizado y aquí se renueva el token.
  useEffect(() => {
    setCambiarContrasena(false)
    setArea('')
    if (!user) return
    let primero = true
    return onSnapshot(
      doc(db, 'usuarios', user.uid),
      (snap) => {
        setCambiarContrasena(snap.get('cambiarContrasena') === true)
        setArea((snap.get('area') as string | undefined) ?? '')
        if (primero) {
          primero = false
          return
        }
        if (snap.metadata.fromCache) return
        void user.getIdToken(true).catch(() => undefined)
      },
      () => undefined,
    )
  }, [user])

  const value: AuthState = {
    cargando,
    user,
    rol,
    cambiarContrasena,
    area,
    entrar: async (email, password) => {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    },
    salir: () => signOut(auth),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fuera de AuthProvider')
  return ctx
}

/** Permisos de la tabla de roles de la especificación. */
export function permisos(rol: Rol | null) {
  const tecnico = rol === 'admin' || rol === 'tecnico'
  return {
    verCatalogo: rol !== null,
    editarInstrumentos: tecnico,
    borrarInstrumentos: rol === 'admin',
    grabarTags: tecnico,
    gestionarFotos: tecnico,
    reportarFallas: rol !== null,
    atenderFallas: tecnico,
    /** Eliminar una falla reportada por error, en cualquier estado. */
    borrarFallas: rol === 'admin',
    registrarCalibraciones: tecnico,
    verBitacora: tecnico,
    exportar: tecnico,
    gestionarUsuarios: rol === 'admin',
    /** Dar de alta refacciones y registrar entradas, salidas y conteos. */
    refacciones: tecnico,
    borrarRefacciones: rol === 'admin',
  }
}
