import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../auth/AuthContext'
import { useBorrador } from '../hooks/useBorrador'
import { mostrarSobreTeclado } from '../hooks/useTeclado'
import {
  editarMensaje,
  eliminarMensaje,
  enviarMensaje,
  MAX_FOTOS_MENSAJE,
  resumenMensaje,
  useMensaje,
  useMensajes,
  type AlCorregir,
  type Tambien,
} from '../lib/chat'
import type { Mensaje, RespuestaA } from '../types'
import { FotoImg } from './FotoImg'
import { nombreFoto, Visor, type FotoVisor } from './Visor'
import { Icono } from './Icono'
import { Silueta } from './Silueta'

function dia(d: Date): string {
  const hoy = new Date()
  const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1)
  if (d.toDateString() === hoy.toDateString()) return 'Hoy'
  if (d.toDateString() === ayer.toDateString()) return 'Ayer'
  return d.toLocaleDateString('es-MX', { dateStyle: 'medium' })
}

/** Alto máximo de la caja de texto (max-h-32): más renglones se recorren dentro de ella. */
const ALTO_MAX_CAJA = 128

/** El mensaje al que se responde: el de la lista, o leído aparte si es más viejo que los que se ven. */
function useOriginal(mensajes: Mensaje[], ruta: string, id: string) {
  const cargado = mensajes.find((x) => x.id === id)
  const suelto = useMensaje(cargado ? null : ruta, id)
  return { m: cargado ?? suelto, enLista: cargado !== undefined }
}

const quien = (r: RespuestaA, yo: string | undefined) => (r.autor.uid === yo ? 'Tú' : r.autor.nombre)

function textoDeCita(m: Mensaje | null | undefined): string {
  if (m === undefined) return '…'
  if (m === null) return 'Este mensaje ya no está'
  return resumenMensaje(m)
}

/** La cita arriba de una respuesta. Al tocarla se va al mensaje original. */
function Cita({ r, mensajes, ruta, yo, mia, onIr }: { r: RespuestaA; mensajes: Mensaje[]; ruta: string; yo?: string; mia: boolean; onIr: (id: string) => void }) {
  const { m, enLista } = useOriginal(mensajes, ruta, r.id)
  const texto = textoDeCita(m)
  const clase = `mb-1 block w-full min-w-0 rounded-lg border-l-4 px-2 py-1 text-left ${mia ? 'border-marca-200 bg-marca-800 text-marca-50' : 'border-marca-600 bg-white text-slate-700'}`
  const contenido = (
    <>
      <span className={`block text-xs font-semibold ${mia ? 'text-white' : 'text-marca-700'}`}>{quien(r, yo)}</span>
      <span className={`line-clamp-2 text-sm break-words ${!m || m.eliminado ? 'italic' : ''}`}>{texto}</span>
    </>
  )
  if (!enLista) return <div className={clase}>{contenido}</div>
  return (
    <button
      type="button"
      className={clase}
      aria-label={`Responde a ${quien(r, yo)}: ${texto}. Toca para ir a ese mensaje.`}
      onClick={(e) => {
        e.stopPropagation()
        onIr(r.id)
      }}
    >
      {contenido}
    </button>
  )
}

/** Arriba de la caja de texto: a qué mensaje se responde, o cuál se está corrigiendo. */
function Contexto({ titulo, texto, cursiva, cerrar, onCerrar }: { titulo: string; texto: string; cursiva?: boolean; cerrar: string; onCerrar: () => void }) {
  return (
    <div className="flex animate-aparecer items-center gap-2 rounded-lg border-l-4 border-marca-600 bg-slate-100 py-1.5 pr-1 pl-3">
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-marca-700">{titulo}</p>
        <p className={`truncate text-slate-600 ${cursiva ? 'italic' : ''}`}>{texto}</p>
      </div>
      <button type="button" className="shrink-0 rounded-full p-2.5 text-slate-500" aria-label={cerrar} onClick={onCerrar}>
        <Icono nombre="cerrar" />
      </button>
    </div>
  )
}

function RespondiendoA({ r, mensajes, ruta, yo, onCerrar }: { r: RespuestaA; mensajes: Mensaje[]; ruta: string; yo?: string; onCerrar: () => void }) {
  const { m } = useOriginal(mensajes, ruta, r.id)
  return (
    <Contexto
      titulo={r.autor.uid === yo ? 'Respondiendo a tu mensaje' : `Respondiendo a ${r.autor.nombre}`}
      texto={textoDeCita(m)}
      cursiva={!m || m.eliminado}
      cerrar="No responder a ese mensaje"
      onCerrar={onCerrar}
    />
  )
}

/** Hoja de abajo con lo que se puede hacer con un mensaje: responder y, si es mío, editar o eliminar. */
function Acciones({
  m,
  mio,
  onResponder,
  onEditar,
  onEliminar,
  onCerrar,
}: {
  m: Mensaje
  mio: boolean
  onResponder: () => void
  onEditar: () => void
  onEliminar: () => void
  onCerrar: () => void
}) {
  const [confirmar, setConfirmar] = useState(false)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])

  let cuerpo: ReactNode
  if (!confirmar) {
    cuerpo = (
      <div className="mt-3 flex flex-col gap-2">
        <button className="btn-secundario justify-start" onClick={onResponder}>
          <Icono nombre="responder" /> Responder
        </button>
        {mio && (
          <button className="btn-secundario justify-start" onClick={onEditar}>
            <Icono nombre="editar" /> Editar
          </button>
        )}
        {mio && (
          <button className="btn-peligro justify-start" onClick={() => setConfirmar(true)}>
            <Icono nombre="basura" /> Eliminar
          </button>
        )}
        <button className="btn text-slate-600" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    )
  } else {
    cuerpo = (
      <div className="mt-3 animate-aparecer space-y-3">
        <h2 className="text-lg font-semibold">¿Eliminar este mensaje?</h2>
        <p className="text-sm text-slate-600">
          Se quita para todos los de este chat{m.fotos.length > 0 && ', con sus fotos'}. En su lugar queda «Se eliminó este mensaje». No
          se puede deshacer.
        </p>
        <div className="flex gap-2">
          <button className="btn-secundario flex-1" onClick={() => setConfirmar(false)}>
            Cancelar
          </button>
          <button className="btn flex-1 bg-peligro-700 text-white" onClick={onEliminar}>
            Sí, eliminar
          </button>
        </div>
      </div>
    )
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex animate-aparecer items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={mio ? 'Tu mensaje' : `Mensaje de ${m.autor.nombre}`}
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-lg animate-subir rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-slate-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm">
          <p className="text-xs font-semibold text-marca-700">{mio ? 'Tu mensaje' : m.autor.nombre}</p>
          <p className="line-clamp-3 break-words whitespace-pre-wrap text-slate-700">{resumenMensaje(m)}</p>
        </div>
        {cuerpo}
      </div>
    </div>,
    document.body,
  )
}

/**
 * Hilo de chat: lista de mensajes y caja para escribir. Funciona sin señal: lo escrito queda
 * en el teléfono y se envía al reconectar. Al tocar un mensaje se puede responder a él y, si es
 * propio, corregirlo o eliminarlo.
 *
 * `pantalla`: el chat ocupa toda la pantalla (canal general, chat privado). Los mensajes se
 * recorren por dentro y la caja de escribir queda siempre abajo, justo arriba del teclado.
 * Sin `pantalla` va dentro de una página larga (la falla) y al escribir se recorre la página.
 */
export function Chat({
  ruta,
  conFotos = false,
  vacio,
  alInicioAbajo = false,
  desde,
  hasta,
  cerrado,
  tambien,
  alCorregir,
  pantalla = false,
}: {
  ruta: string
  conFotos?: boolean
  vacio: string
  alInicioAbajo?: boolean
  /** Solo los mensajes desde esta hora; con `hasta`, un día del historial. */
  desde?: Date
  hasta?: Date
  /** Ya no se puede escribir: este aviso va en lugar de la caja de texto. */
  cerrado?: string
  /** Escrituras que acompañan a cada mensaje (el resumen de un chat privado). */
  tambien?: Tambien
  /** Escrituras que acompañan a una corrección o un borrado (el resumen, si era el último). */
  alCorregir?: AlCorregir
  pantalla?: boolean
}) {
  const mensajes = useMensajes(ruta, desde, hasta)
  const { user } = useAuth()
  const yo = user?.uid
  const [texto, setTexto] = useState('')
  const [fotos, setFotos] = useState<File[]>([])
  const [respondeA, setRespondeA] = useState<RespuestaA | null>(null)
  // Lo que se corrige va aparte: el borrador del mensaje nuevo se queda como estaba.
  const [editando, setEditando] = useState<Mensaje | null>(null)
  const [textoEdicion, setTextoEdicion] = useState('')
  const [elegido, setElegido] = useState<Mensaje | null>(null)
  const [resaltado, setResaltado] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [visor, setVisor] = useState<{ fotos: FotoVisor[]; i: number } | null>(null)
  // Lo que se está escribiendo (sus fotos y a qué responde) sobrevive si Android cierra Chrome al abrir la cámara.
  useBorrador(cerrado ? null : `chat:${ruta}`, { texto, fotos, respondeA }, true, (d) => {
    setTexto(d.texto)
    setFotos(d.fotos)
    setRespondeA(d.respondeA ?? null)
  })
  const input = useRef<HTMLInputElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const formulario = useRef<HTMLFormElement>(null)
  const caja = useRef<HTMLDivElement>(null)
  const lista = useRef<HTMLOListElement>(null)
  const fin = useRef<HTMLDivElement>(null)
  const antes = useRef<number | null>(null)
  /** En `pantalla`: se estaba viendo lo último, así que lo nuevo (o el teclado) no lo debe esconder. */
  const abajo = useRef(true)
  const quitarResalte = useRef<ReturnType<typeof setTimeout>>(undefined)

  const previews = useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])
  useEffect(() => () => clearTimeout(quitarResalte.current), [])

  const bajar = () => {
    const c = caja.current
    if (c) c.scrollTop = c.scrollHeight
  }

  // Al llegar mensajes nuevos se baja hasta el último.
  useEffect(() => {
    if (!mensajes) return
    const n = mensajes.length
    const primera = antes.current === null
    const nuevos = !primera && n > (antes.current ?? 0)
    if (pantalla) {
      // Si se estaba leyendo más arriba, solo baja con lo que escribió uno mismo.
      if (primera || (nuevos && (abajo.current || mensajes[n - 1]?.autor.uid === yo))) {
        bajar()
        abajo.current = true
      }
    } else if (primera ? alInicioAbajo : nuevos) {
      fin.current?.scrollIntoView({ block: 'nearest' })
    }
    antes.current = n
  }, [mensajes, alInicioAbajo, pantalla, yo])

  // Cuando la lista se achica (sale el teclado, crece la caja de texto) o crece (carga una foto), lo último sigue a la vista.
  const hayMensajes = !!mensajes && mensajes.length > 0
  useEffect(() => {
    const c = caja.current
    if (!pantalla || !c) return
    const ro = new ResizeObserver(() => {
      if (abajo.current) bajar()
    })
    ro.observe(c)
    if (lista.current) ro.observe(lista.current)
    return () => ro.disconnect()
  }, [pantalla, hayMensajes])

  const valor = editando ? textoEdicion : texto
  // La caja crece con lo que se escribe (hasta 5 renglones) para ver todo el texto.
  useLayoutEffect(() => {
    const a = area.current
    if (!a) return
    a.style.height = 'auto'
    a.style.height = `${Math.min(a.scrollHeight + a.offsetHeight - a.clientHeight, ALTO_MAX_CAJA)}px`
  }, [valor])

  const persona = () => ({ uid: user?.uid ?? '', nombre: user?.displayName || user?.email || 'Usuario' })

  /** Abre el teclado en la caja de texto (debe pasar dentro del toque para que el iPhone lo abra). */
  function escribir(alFinal = false) {
    const a = area.current
    if (!a) return
    a.focus({ preventScroll: pantalla })
    if (alFinal) a.setSelectionRange(a.value.length, a.value.length)
  }

  function irA(id: string) {
    const el = document.getElementById(`mensaje-${id}`)
    if (!el) return
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ block: 'center', behavior: quieto ? 'auto' : 'smooth' })
    setResaltado(id)
    clearTimeout(quitarResalte.current)
    quitarResalte.current = setTimeout(() => setResaltado(null), 1600)
  }

  function abrirAcciones(m: Mensaje) {
    // Con el teclado abierto la hoja quedaría detrás de él.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setElegido(m)
  }

  function responder(m: Mensaje) {
    setElegido(null)
    setEditando(null)
    setRespondeA({ id: m.id, autor: m.autor })
    escribir()
  }

  function editar(m: Mensaje) {
    setElegido(null)
    setEditando(m)
    setTextoEdicion(m.texto)
    setError('')
    // El texto se pone antes de enfocar, para dejar el cursor al final.
    if (area.current) area.current.value = m.texto
    escribir(true)
  }

  function eliminar(m: Mensaje) {
    setElegido(null)
    if (editando?.id === m.id) setEditando(null)
    if (respondeA?.id === m.id) setRespondeA(null)
    void eliminarMensaje(ruta, m, alCorregir)
  }

  async function onEnviar(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    if (editando) {
      const nuevo = textoEdicion.trim()
      if (nuevo !== editando.texto && (nuevo || editando.fotos.length > 0)) void editarMensaje(ruta, editando, nuevo, alCorregir)
      setEditando(null)
      setTextoEdicion('')
      return
    }
    if (!texto.trim() && fotos.length === 0) return
    // La caja se vacía ya: con el teclado abierto se puede seguir escribiendo el siguiente
    // mensaje sin que este, al terminar de guardarse, lo borre.
    const enviado = { texto, fotos, respondeA }
    setTexto('')
    setFotos([])
    setRespondeA(null)
    setEnviando(true)
    setError('')
    try {
      await enviarMensaje(ruta, enviado.texto, enviado.fotos, persona(), tambien, enviado.respondeA)
    } catch (err) {
      setError(`No se pudo enviar: ${(err as Error).message}`)
      // Se regresa lo que no se envió, si no se ha escrito otra cosa encima.
      setTexto((t) => t || enviado.texto)
      setFotos((f) => (f.length > 0 ? f : enviado.fotos))
      setRespondeA((r) => r ?? enviado.respondeA)
    } finally {
      setEnviando(false)
    }
  }

  const sePuedeTocar = (m: Mensaje) => !cerrado && !m.eliminado
  let diaAnterior = ''
  const contenido =
    mensajes === null ? (
      <Silueta forma="chat" />
    ) : mensajes.length === 0 ? (
      <p className="text-sm text-slate-500">{vacio}</p>
    ) : (
      <>
        {!cerrado && <p className="pb-2 text-center text-xs text-slate-500">Toca un mensaje para responderlo. Los tuyos también los puedes editar o eliminar.</p>}
        <ol ref={lista} className="space-y-2">
          {mensajes.map((m) => {
            const mio = m.autor.uid === yo
            const fecha = m.fecha?.toDate() ?? new Date()
            const d = dia(fecha)
            const separador = d !== diaAnterior
            diaAnterior = d
            const tocable = sePuedeTocar(m)
            const hora = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
            return (
              <li key={m.id} id={`mensaje-${m.id}`} className="scroll-my-4">
                {separador && <p className="py-1 text-center text-xs font-medium text-slate-500">{d}</p>}
                <div className={`flex ${mio ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] min-w-0 rounded-2xl px-3 py-2 transition-shadow duration-300 ${mio ? 'rounded-br-sm bg-marca-700 text-white' : 'rounded-bl-sm bg-slate-100'} ${tocable ? 'cursor-pointer active:brightness-95' : ''} ${resaltado === m.id ? 'ring-3 ring-aviso-400 ring-offset-2 ring-offset-slate-50' : ''}`}
                    onClick={tocable ? () => abrirAcciones(m) : undefined}
                    onKeyDown={
                      tocable
                        ? (e) => {
                            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault()
                              abrirAcciones(m)
                            }
                          }
                        : undefined
                    }
                    tabIndex={tocable ? 0 : undefined}
                  >
                    {!mio && <p className="text-xs font-semibold text-marca-700">{m.autor.nombre}</p>}
                    {m.respondeA && !m.eliminado && <Cita r={m.respondeA} mensajes={mensajes} ruta={ruta} yo={yo} mia={mio} onIr={irA} />}
                    {m.fotos.length > 0 && (
                      <div className={`my-1 grid gap-1 ${m.fotos.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {m.fotos.map((f, i) => (
                          <button
                            key={f.ruta}
                            type="button"
                            className="overflow-hidden rounded-lg"
                            aria-label={`${nombreFoto(i, m.fotos.length)}, ${mio ? 'tu mensaje' : `mensaje de ${m.autor.nombre}`}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setVisor({ fotos: m.fotos.map((x) => ({ url: x.url, ruta: x.ruta, miniaturaUrl: x.miniaturaUrl, pie: '' })), i })
                            }}
                          >
                            <FotoImg url={f.miniaturaUrl} ruta={f.miniatura} alt="" className="aspect-square w-full min-w-24 object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                    {m.eliminado ? (
                      <p className={`flex items-center gap-1.5 italic ${mio ? 'text-marca-50' : 'text-slate-500'}`}>
                        <Icono nombre="prohibido" className="size-4" />
                        {mio ? 'Eliminaste este mensaje' : 'Se eliminó este mensaje'}
                      </p>
                    ) : (
                      m.texto && <p className="break-words whitespace-pre-wrap">{m.texto}</p>
                    )}
                    <p className={`mt-0.5 text-right text-xs ${mio ? 'text-marca-50' : 'text-slate-600'}`}>
                      {m.sinSincronizar ? (
                        <span className="inline-flex items-center gap-1">
                          <Icono nombre="reloj" className="size-3" /> por enviar
                        </span>
                      ) : (
                        <>
                          {m.editado && !m.eliminado && 'Editado · '}
                          {hora}
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </>
    )

  const cajaDeTexto = cerrado ? (
    <p className="flex items-start gap-2 rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
      <Icono nombre="candado" className="mt-0.5 size-4" />
      {cerrado}
    </p>
  ) : (
    <form ref={formulario} onSubmit={onEnviar} className="space-y-2">
      {editando ? (
        <Contexto
          titulo="Editando tu mensaje"
          texto={resumenMensaje(editando)}
          cerrar="Cancelar la corrección"
          onCerrar={() => {
            setEditando(null)
            setTextoEdicion('')
          }}
        />
      ) : (
        respondeA && mensajes && <RespondiendoA r={respondeA} mensajes={mensajes} ruta={ruta} yo={yo} onCerrar={() => setRespondeA(null)} />
      )}
      {!editando && fotos.length > 0 && (
        <div className="flex gap-2">
          {previews.map((u, i) => (
            <div key={u} className="relative">
              <img src={u} alt="" className="h-16 w-16 rounded object-cover" />
              <button
                type="button"
                aria-label="Quitar foto"
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-slate-800 text-xs leading-5 text-white"
                onClick={() => setFotos(fotos.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        {conFotos && !editando && (
          <>
            <button
              type="button"
              aria-label="Agregar foto"
              className="btn-secundario shrink-0 px-3"
              disabled={fotos.length >= MAX_FOTOS_MENSAJE}
              onClick={() => input.current?.click()}
            >
              <Icono nombre="camara" />
            </button>
            <input
              ref={input}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                setFotos([...fotos, ...Array.from(e.target.files ?? [])].slice(0, MAX_FOTOS_MENSAJE))
                e.target.value = ''
              }}
            />
          </>
        )}
        <textarea
          ref={area}
          className="campo max-h-32 min-h-11 resize-none py-2"
          rows={1}
          placeholder={editando ? 'Corrige tu mensaje' : 'Escribe un mensaje'}
          aria-label={editando ? 'Corrige tu mensaje' : 'Escribe un mensaje'}
          value={valor}
          maxLength={2000}
          onChange={(e) => (editando ? setTextoEdicion(e.target.value) : setTexto(e.target.value))}
          onFocus={() => {
            if (!pantalla && formulario.current) mostrarSobreTeclado(formulario.current)
          }}
        />
        {/* Sin quitarle el foco a la caja: el teclado se queda abierto para seguir escribiendo. */}
        <button
          className="btn-primario shrink-0 px-4"
          onMouseDown={(e) => e.preventDefault()}
          disabled={editando ? !textoEdicion.trim() && editando.fotos.length === 0 : enviando || (!texto.trim() && fotos.length === 0)}
        >
          {editando ? 'Guardar' : 'Enviar'}
        </button>
      </div>
      {error && <p className="rounded-lg bg-peligro-50 p-3 text-sm text-peligro-700">{error}</p>}
    </form>
  )

  return (
    <div className={pantalla ? 'flex min-h-0 flex-1 flex-col' : 'space-y-3'}>
      <div
        ref={caja}
        className={pantalla ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3' : undefined}
        onScroll={
          pantalla
            ? (e) => {
                const c = e.currentTarget
                abajo.current = c.scrollHeight - c.scrollTop - c.clientHeight < 80
              }
            : undefined
        }
      >
        {contenido}
        <div ref={fin} />
      </div>
      <div className={pantalla ? 'shrink-0 border-t border-slate-200 bg-white px-3 py-2' : undefined}>{cajaDeTexto}</div>

      {visor && <Visor fotos={visor.fotos} inicio={visor.i} onCerrar={() => setVisor(null)} />}
      {elegido && (
        <Acciones
          m={elegido}
          mio={elegido.autor.uid === yo}
          onResponder={() => responder(elegido)}
          onEditar={() => editar(elegido)}
          onEliminar={() => eliminar(elegido)}
          onCerrar={() => setElegido(null)}
        />
      )}
    </div>
  )
}
