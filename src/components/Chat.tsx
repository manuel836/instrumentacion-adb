import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { enviarMensaje, MAX_FOTOS_MENSAJE, useMensajes, type Tambien } from '../lib/chat'
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

/**
 * Hilo de chat: lista de mensajes y caja para escribir. Funciona sin señal:
 * lo escrito queda en el teléfono y se envía al reconectar.
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
}) {
  const mensajes = useMensajes(ruta, desde, hasta)
  const { user } = useAuth()
  const [texto, setTexto] = useState('')
  const [fotos, setFotos] = useState<File[]>([])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [visor, setVisor] = useState<{ fotos: FotoVisor[]; i: number } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const fin = useRef<HTMLDivElement>(null)
  const antes = useRef<number | null>(null)

  const previews = useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  // Al llegar mensajes nuevos se baja hasta el último.
  useEffect(() => {
    if (!mensajes) return
    const n = mensajes.length
    if (antes.current === null ? alInicioAbajo : n > antes.current) fin.current?.scrollIntoView({ block: 'nearest' })
    antes.current = n
  }, [mensajes, alInicioAbajo])

  async function onEnviar(e: FormEvent) {
    e.preventDefault()
    if (!user || (!texto.trim() && fotos.length === 0)) return
    setEnviando(true)
    setError('')
    try {
      await enviarMensaje(ruta, texto, fotos, { uid: user.uid, nombre: user.displayName || user.email || 'Usuario' }, tambien)
      setTexto('')
      setFotos([])
    } catch (err) {
      setError(`No se pudo enviar: ${(err as Error).message}`)
    } finally {
      setEnviando(false)
    }
  }

  let diaAnterior = ''
  return (
    <div className="space-y-3">
      {mensajes === null ? (
        <Silueta forma="chat" />
      ) : mensajes.length === 0 ? (
        <p className="text-sm text-slate-500">{vacio}</p>
      ) : (
        <ol className="space-y-2">
          {mensajes.map((m) => {
            const mio = m.autor.uid === user?.uid
            const fecha = m.fecha?.toDate() ?? new Date()
            const d = dia(fecha)
            const separador = d !== diaAnterior
            diaAnterior = d
            return (
              <li key={m.id}>
                {separador && <p className="py-1 text-center text-xs font-medium text-slate-500">{d}</p>}
                <div className={`flex ${mio ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${mio ? 'rounded-br-sm bg-marca-700 text-white' : 'rounded-bl-sm bg-slate-100'}`}>
                    {!mio && <p className="text-xs font-semibold text-marca-700">{m.autor.nombre}</p>}
                    {m.fotos.length > 0 && (
                      <div className={`my-1 grid gap-1 ${m.fotos.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {m.fotos.map((f, i) => (
                          <button
                            key={f.ruta}
                            type="button"
                            className="overflow-hidden rounded-lg"
                            aria-label={`${nombreFoto(i, m.fotos.length)}, ${mio ? 'tu mensaje' : `mensaje de ${m.autor.nombre}`}`}
                            onClick={() => setVisor({ fotos: m.fotos.map((x) => ({ url: x.url, ruta: x.ruta, miniaturaUrl: x.miniaturaUrl, pie: '' })), i })}
                          >
                            <FotoImg url={f.miniaturaUrl} ruta={f.miniatura} alt="" className="aspect-square w-full min-w-24 object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                    {m.texto && <p className="break-words whitespace-pre-wrap">{m.texto}</p>}
                    <p className={`mt-0.5 text-right text-xs ${mio ? 'text-marca-50' : 'text-slate-600'}`}>
                      {m.sinSincronizar ? (
                        <span className="inline-flex items-center gap-1">
                          <Icono nombre="reloj" className="size-3" /> por enviar
                        </span>
                      ) : (
                        fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
                      )}
                    </p>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
      <div ref={fin} />

      {cerrado ? (
        <p className="flex items-start gap-2 rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
          <Icono nombre="candado" className="mt-0.5 size-4" />
          {cerrado}
        </p>
      ) : (
        <form onSubmit={onEnviar} className="space-y-2">
          {fotos.length > 0 && (
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
            {conFotos && (
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
              className="campo max-h-32 min-h-11 resize-none py-2"
              rows={1}
              placeholder="Escribe un mensaje"
              value={texto}
              maxLength={2000}
              onChange={(e) => setTexto(e.target.value)}
            />
            <button className="btn-primario shrink-0 px-4" disabled={enviando || (!texto.trim() && fotos.length === 0)}>
              Enviar
            </button>
          </div>
          {error && <p className="rounded-lg bg-peligro-50 p-3 text-sm text-peligro-700">{error}</p>}
        </form>
      )}

      {visor && <Visor fotos={visor.fotos} inicio={visor.i} onCerrar={() => setVisor(null)} />}
    </div>
  )
}
