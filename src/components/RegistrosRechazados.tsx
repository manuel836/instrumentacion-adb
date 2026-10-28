import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { descartarRechazo, type Rechazo } from '../lib/rechazos'

function cuando(ms: number) {
  return new Date(ms).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}

/** Lo que el servidor no aceptó al sincronizar: la persona lo lee, lo copia y lo da por visto. */
export function RegistrosRechazados({ rechazos, onCerrar }: { rechazos: Rechazo[]; onCerrar: () => void }) {
  const [copiado, setCopiado] = useState<string | null>(null)

  useEffect(() => {
    if (rechazos.length === 0) onCerrar()
  }, [rechazos, onCerrar])

  async function copiar(r: Rechazo) {
    try {
      await navigator.clipboard.writeText(`${r.titulo}\n${r.texto}`)
      setCopiado(r.id)
    } catch {
      setCopiado(null)
    }
  }

  // Va directo en <body>: dentro del encabezado quedaría debajo de la barra de abajo.
  return createPortal(
    <div className="fixed inset-0 z-50 flex animate-aparecer items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[85dvh] w-full max-w-lg animate-subir overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-slate-900 sm:rounded-2xl">
        <h2 className="text-lg font-semibold">Lo que no se guardó</h2>
        <p className="mt-1 text-sm text-slate-600">
          Lo hiciste sin señal y, cuando el teléfono se conectó, el servidor ya no lo aceptó. Aquí está lo que escribiste para que lo copies
          y lo vuelvas a capturar o lo comentes en el chat.
        </p>
        <ul className="mt-3 space-y-3">
          {rechazos.map((r) => (
            <li key={r.id} className="rounded-xl border border-peligro-200 bg-peligro-50 p-3">
              <p className="font-semibold">{r.titulo}</p>
              <p className="text-xs text-slate-500">Hecho {cuando(r.creado)}</p>
              <p className="mt-1 text-sm text-peligro-800">{r.motivo}</p>
              {r.texto && <p className="mt-2 rounded-lg bg-white p-2 text-sm whitespace-pre-wrap">{r.texto}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {r.texto && (
                  <button className="btn-secundario text-sm" onClick={() => void copiar(r)}>
                    {copiado === r.id ? 'Copiado' : 'Copiar texto'}
                  </button>
                )}
                <Link to={r.ruta} className="btn-secundario text-sm" onClick={onCerrar}>
                  Ver
                </Link>
                <button className="btn-secundario ml-auto text-sm" onClick={() => void descartarRechazo(r.id)}>
                  Ya lo vi
                </button>
              </div>
            </li>
          ))}
        </ul>
        <button className="btn-secundario mt-3 w-full" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    </div>,
    document.body,
  )
}
