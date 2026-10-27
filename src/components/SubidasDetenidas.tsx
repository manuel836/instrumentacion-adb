import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { descartarSubida, reintentarDetenidas, subidasDetenidas, suscribirPendientes, type Subida } from '../lib/uploadQueue'
import { FotoImg } from './FotoImg'

function queEs(s: Subida): string {
  const r = s.ruta
  if (r.startsWith('instrumentos/') && r.includes('/docs/')) return `Documento: ${r.split('/').pop()?.replace(/^\d+_/, '')}`
  const foto = r.startsWith('fallas/')
    ? r.includes('/mensajes/')
      ? 'Foto del chat de una falla'
      : 'Foto del reporte de una falla'
    : r.startsWith('chats_privados/')
      ? 'Foto de un chat privado'
      : 'Foto de ubicación de un instrumento'
  return r.includes('_min.') ? `${foto} (miniatura)` : foto
}

function porQue(s: Subida): string {
  const e = s.error ?? ''
  if (/NotReadable|NotFound|InvalidState|EncodingError/.test(e)) return 'El teléfono ya no puede leer el archivo.'
  if (e.includes('storage/unauthorized') || e.includes('permission-denied')) return 'El servidor no la aceptó.'
  return e || 'No se pudo subir.'
}

/** Lo que el servidor rechazó varias veces: la persona lo reintenta o lo descarta. */
export function SubidasDetenidas({ onCerrar }: { onCerrar: () => void }) {
  const [lista, setLista] = useState<Subida[] | null>(null)
  const [confirmar, setConfirmar] = useState<string | null>(null)

  useEffect(() => suscribirPendientes(() => void subidasDetenidas().then(setLista)), [])
  useEffect(() => {
    if (lista?.length === 0) onCerrar()
  }, [lista, onCerrar])

  // Va directo en <body>: dentro del encabezado quedaría debajo de la barra de abajo.
  return createPortal(
    <div className="fixed inset-0 z-50 flex animate-aparecer items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[85dvh] w-full max-w-lg animate-subir overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-slate-900 sm:rounded-2xl">
        <h2 className="text-lg font-semibold">Archivos que no se pudieron subir</h2>
        <p className="mt-1 text-sm text-slate-600">
          Siguen guardados en este teléfono. Puedes intentarlo otra vez o descartarlos; si los descartas, los demás no los verán.
        </p>
        <ul className="mt-3 divide-y divide-slate-100">
          {lista?.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3">
              {s.contentType.startsWith('image/') && (
                <FotoImg url={null} ruta={s.ruta} alt="" className="size-14 shrink-0 rounded object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{queEs(s)}</p>
                <p className="text-xs text-slate-500">{porQue(s)}</p>
              </div>
              {confirmar === s.id ? (
                <button className="btn-peligro shrink-0 text-sm" onClick={() => void descartarSubida(s.id)}>
                  Sí, descartar
                </button>
              ) : (
                <button className="btn-secundario shrink-0 text-sm" onClick={() => setConfirmar(s.id)}>
                  Descartar
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <button className="btn-secundario flex-1" onClick={onCerrar}>
            Cerrar
          </button>
          <button
            className="btn-primario flex-1"
            onClick={() => {
              void reintentarDetenidas()
              onCerrar()
            }}
          >
            Reintentar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
