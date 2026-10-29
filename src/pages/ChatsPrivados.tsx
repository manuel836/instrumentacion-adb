import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import type { Timestamp } from 'firebase/firestore'
import { useAuth } from '../auth/AuthContext'
import { Chat } from '../components/Chat'
import { Icono } from '../components/Icono'
import { avisarGuardado } from '../components/Listo'
import { PestanasChat } from '../components/PestanasChat'
import { hiloPrivado, idChatPrivado } from '../lib/chat'
import {
  borrarChatParaAmbos,
  borrarChatParaMi,
  corregirResumen,
  otroDe,
  resumenDelChat,
  sinLeer,
  useChatPrivado,
  useChatsPrivados,
  useDirectorio,
  useMarcarLeido,
  vistoDesde,
} from '../lib/privados'
import type { Rol } from '../types'
import { Silueta } from '../components/Silueta'

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
            <Silueta forma="lista" />
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
        <Silueta forma="lista" />
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

/** Eliminar la conversación: solo para mí (la otra persona la sigue viendo) o para los dos. */
function EliminarChat({ chatId, nombre, onCerrar }: { chatId: string; nombre: string; onCerrar: () => void }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [paraAmbos, setParaAmbos] = useState(false)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])

  function eliminar(ambos: boolean) {
    if (!user) return
    // Se quita al momento; sin señal, el servidor se entera al reconectar.
    const hecho = ambos ? borrarChatParaAmbos(chatId) : borrarChatParaMi(chatId, user.uid)
    hecho.catch((err) => console.error('No se pudo eliminar el chat', err))
    avisarGuardado(`Se eliminó el chat con ${nombre}.`, `El chat con ${nombre} se quitó; se termina de eliminar al recuperar la señal.`)
    navigate('/chat/privados', { replace: true })
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex animate-aparecer items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-eliminar-chat"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-lg animate-subir space-y-3 rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-slate-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {!paraAmbos ? (
          <>
            <h2 id="titulo-eliminar-chat" className="text-lg font-semibold">
              ¿Eliminar el chat con {nombre}?
            </h2>
            <button className="btn-secundario w-full flex-col items-start gap-0.5 text-left" onClick={() => eliminar(false)}>
              <span>Eliminar solo para mí</span>
              <span className="text-sm font-normal text-slate-600">
                Se quita de tu lista y ya no ves sus mensajes. {nombre} lo sigue viendo completo. Si te vuelve a escribir, el chat aparece de
                nuevo solo con lo nuevo.
              </span>
            </button>
            <button className="btn-peligro w-full flex-col items-start gap-0.5 text-left" onClick={() => setParaAmbos(true)}>
              <span>Eliminar para ambos</span>
              <span className="text-sm font-normal text-peligro-900">Se borran todos los mensajes y fotos, para ti y para {nombre}.</span>
            </button>
            <button className="btn w-full text-slate-600" onClick={onCerrar}>
              Cancelar
            </button>
          </>
        ) : (
          <div className="animate-aparecer space-y-3">
            <h2 id="titulo-eliminar-chat" className="text-lg font-semibold">
              ¿Eliminar el chat para ti y para {nombre}?
            </h2>
            <p className="text-sm text-slate-600">
              Todos los mensajes y fotos de esta conversación se borran para los dos. No se puede deshacer.
            </p>
            <div className="flex gap-2">
              <button className="btn-secundario flex-1" onClick={() => setParaAmbos(false)}>
                Cancelar
              </button>
              <button className="btn flex-1 bg-peligro-700 text-white" onClick={() => eliminar(true)}>
                Sí, eliminar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
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
  const [eliminando, setEliminando] = useState(false)
  useMarcarLeido(chat, yo)
  const contacto = contactos?.find((c) => c.uid === otro)
  const nombre = contacto?.nombre || chat?.nombres[otro] || ''
  const miNombre = user?.displayName || user?.email || 'Usuario'
  const tambien = useMemo(() => resumenDelChat({ uid: yo, nombre: miNombre }, { uid: otro, nombre: nombre || 'Usuario' }), [yo, miNombre, otro, nombre])
  const alCorregir = useMemo(() => corregirResumen(chat), [chat])
  // Lo de antes de que lo eliminara (para mí o para ambos) ya no se ve.
  const desde = vistoDesde(chat, yo) ?? undefined

  if (!chatId) return <Navigate to="/chat/privados" replace />
  if (contactos === null || chat === undefined) return <Silueta />
  if (!contacto && !chat) return <p className="p-6 text-slate-500">Esta persona no está en la app.</p>

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-3 pt-3">
        <Link to="/chat/privados" className="oculto-con-teclado text-sm font-semibold text-marca-700">
          ← Chats privados
        </Link>
        <div className="flex items-center justify-between gap-2">
          <h1 className="min-w-0 truncate text-xl font-bold">{nombre || 'Usuario'}</h1>
          {chat?.ultimo && (
            <button
              className="oculto-con-teclado -my-2 inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-3 text-sm font-semibold text-peligro-700"
              onClick={() => setEliminando(true)}
            >
              <Icono nombre="basura" className="size-4" /> Eliminar chat
            </button>
          )}
        </div>
        <p className="oculto-con-teclado flex items-center gap-1.5 text-sm text-slate-500">
          <Icono nombre="candado" className="size-4" /> Chat privado: solo lo ven tú y {nombre || 'esta persona'}.
        </p>
      </div>
      <Chat
        ruta={hiloPrivado(chatId)}
        conFotos
        pantalla
        desde={desde}
        vacio="Aún no hay mensajes. Escribe para empezar la conversación."
        cerrado={!contacto?.activo ? `${nombre || 'Esta persona'} ya no tiene acceso a la app. La conversación queda guardada.` : undefined}
        tambien={tambien}
        alCorregir={alCorregir}
      />
      {eliminando && chat && <EliminarChat chatId={chat.id} nombre={nombre || 'esta persona'} onCerrar={() => setEliminando(false)} />}
    </div>
  )
}
