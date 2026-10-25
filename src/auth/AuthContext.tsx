import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onIdTokenChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase'
import type { Rol } from '../types'

interface AuthState {
  cargando: boolean
  user: User | null
  rol: Rol | null
  entrar: (email: string, password: string) => Promise<void>
  salir: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [rol, setRol] = useState<Rol | null>(null)

  useEffect(
    () =>
      onIdTokenChanged(auth, async (u) => {
        setUser(u)
        if (u) {
          // Sin señal se usa el token guardado; el rol viaja como custom claim.
          const token = await u.getIdTokenResult().catch(() => null)
          const claim = token?.claims.rol
          setRol(claim === 'admin' || claim === 'tecnico' || claim === 'operador' ? claim : null)
        } else {
          setRol(null)
        }
        setCargando(false)
      }),
    [],
  )

  // Cuando el Admin cambia el rol, la Function marca rolActualizado y aquí se renueva el token.
  useEffect(() => {
    if (!user) return
    let primero = true
    return onSnapshot(
      doc(db, 'usuarios', user.uid),
      (snap) => {
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
    grabarTags: tecnico,
    gestionarFotos: tecnico,
    reportarFallas: rol !== null,
    atenderFallas: tecnico,
    registrarCalibraciones: tecnico,
    gestionarUsuarios: rol === 'admin',
  }
}
