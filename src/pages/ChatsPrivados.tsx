import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import type { Timestamp } from 'firebase/firestore'
import { useAuth } from '../auth/AuthContext'
import { Chat } from '../components/Chat'
import { Icono } from '../components/Icono'
import { PestanasChat } from '../components/PestanasChat'
import { hiloPrivado, idChatPrivado } from '../lib/chat'
import { otroDe, resumenDelChat, sinLeer, useChatPrivado, useChatsPrivados, useDirectorio, useMarcarLeido } from '../lib/privados'
import type { Rol } from '../types'

const ROL: Record<Rol, string> = { admin: 'Admin', tecnico: 'Técnico', operador: 'Operador' }

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function cuando(t: Timestamp | null | undefined): string {
  if (!t) return ''
  const d = t.toDate()
  if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

/** Mis conversaciones privadas y el botón para empezar una nueva. */
export function ChatsPrivados() {
  const { user } = useAuth()
  const yo = user?.uid ?? ''
  const chats = useChatsPrivados(user?.uid)
  const contactos = useDirectorio(user?.uid)
  const [eligiendo, setEligiendo] = useState(false)
  const [texto, setTexto] = useState('')
  const nombres = useMemo(() => new Map((contactos ?? []).map((c) => [c.uid, c.nombre])), [contactos])
  const q = normalizar(texto.trim())
  const opciones = (contactos ?? []).filter((c) => c.activo && (!q || normalizar(c.nombre).includes(q)))

  return (
    <div className="space-y-3 p-3">
      <PestanasChat />
      <div>
        <h1 className="text-xl font-bold">Chats privados</h1>
        <p className="text-sm text-slate-500">Cada conversación solo la ven las dos personas que están en ella.</p>
      </div>

      {!eligiendo ? (
        <button className="btn-primario w-full" onClick={() => setEligiendo(true)}>
          <Icono nombre="mas" /> Nuevo chat privado
        </button>
      ) : (
        <section className="tarjeta space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">¿Con quién quieres hablar?</h2>
            <button className="p-1 text-slate-500" aria-label="Cerrar" onClick={() => setEligiendo(false)}>
              <Icono nombre="cerrar" />
            </button>
          </div>
          <input className="campo" type="search" placeholder="Buscar por nombre" value={texto} onChange={(e) => setTexto(e.target.value)} />
          {contactos === null ? (
            <p className="text-sm text-slate-500">Cargando…</p>
          ) : opciones.length === 0 ? (
            <p className="text-sm text-slate-500">{q ? 'Nadie coincide con ese nombre.' : 'Aún no hay más personas en la app.'}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {opciones.map((c) => (
                <li key={c.uid}>
                  <Link to={`/chat/privado/${c.uid}`} className="flex items-center gap-3 py-2.5 active:bg-slate-50">
                    <Icono nombre="persona" className="size-8 rounded-full bg-marca-50 p-1.5 text-marca-700" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.nombre}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {ROL[c.rol] ?? c.rol}
                        {c.area && ` · ${c.area}`}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {chats === null ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : chats.length === 0 ? (
        <p className="text-sm text-slate-500">Aún no tienes chats privados.</p>
      ) : (
        <ul className="tarjeta divide-y divide-slate-100 p-0">
          {chats.map((c) => {
            const otro = otroDe(c, yo)
            const nuevo = sinLeer(c, yo)
            return (
              <li key={c.id}>
                <Link to={`/chat/privado/${otro}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50">
                  <Icono nombre="persona" className="size-9 rounded-full bg-marca-50 p-1.5 text-marca-700" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate ${nuevo ? 'font-bold' : 'font-semibold'}`}>{nombres.get(otro) || c.nombres[otro] || 'Usuario'}</span>
                      <span className="shrink-0 text-xs text-slate-500">{cuando(c.ultimo?.fecha)}</span>
                    </span>
                    <span className={`block truncate text-sm ${nuevo ? 'font-medium text-slate-800' : 'text-slate-500'}`}>
                      {c.ultimo?.autor === yo && 'Tú: '}
                      {c.ultimo?.texto}
                    </span>
                  </span>
                  {nuevo && <span className="size-2.5 shrink-0 rounded-full bg-peligro-600" aria-label="Sin leer" />}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Conversación con una persona. Funciona sin señal, igual que los otros chats. */
export function ConversacionPrivada() {
  const { uid: otro = '' } = useParams()
  const { user } = useAuth()
  const yo = user?.uid ?? ''
  const chatId = yo && otro && yo !== otro ? idChatPrivado(yo, otro) : null
  const chat = useChatPrivado(chatId)
  const contactos = useDirectorio(user?.uid)
  useMarcarLeido(chat, yo)
  const contacto = contactos?.find((c) => c.uid === otro)
  const nombre = contacto?.nombre || chat?.nombres[otro] || ''
  const miNombre = user?.displayName || user?.email || 'Usuario'
  const tambien = useMemo(() => resumenDelChat({ uid: yo, nombre: miNombre }, { uid: otro, nombre: nombre || 'Usuario' }), [yo, miNombre, otro, nombre])

  if (!chatId) return <Navigate to="/chat/privados" replace />
  if (contactos === null || chat === undefined) return <p className="p-6 text-slate-500">Cargando…</p>
  if (!contacto && !chat) return <p className="p-6 text-slate-500">Esta persona no está en la app.</p>

  return (
    <div className="space-y-3 p-3">
      <div>
        <Link to="/chat/privados" className="text-sm font-semibold text-marca-700">
          ← Chats privados
        </Link>
        <h1 className="text-xl font-bold">{nombre || 'Usuario'}</h1>
        <p className="flex items-center gap-1.5 text-sm text-slate-500">
          <Icono nombre="candado" className="size-4" /> Chat privado: solo lo ven tú y {nombre || 'esta persona'}.
        </p>
      </div>
      <Chat
        ruta={hiloPrivado(chatId)}
        conFotos
        alInicioAbajo
        vacio="Aún no hay mensajes. Escribe para empezar la conversación."
        cerrado={!contacto?.activo ? `${nombre || 'Esta persona'} ya no tiene acceso a la app. La conversación queda guardada.` : undefined}
        tambien={tambien}
      />
    </div>
  )
}
