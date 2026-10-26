import { Link } from 'react-router'
import { NOMBRE_ACCION, NOMBRE_COLECCION, nombreCampo, textoValor, type EntradaBitacora } from '../lib/bitacora'

/** A dónde lleva cada entrada al tocarla. */
function enlace(e: EntradaBitacora): string | null {
  if (e.accion === 'borrar') return null
  if (e.coleccion === 'fallas') return `/fallas/${e.docId}`
  if (e.coleccion === 'calibraciones' && e.instrumentoId) return `/instrumentos/${e.instrumentoId}/calibraciones/${e.docId}`
  if (e.instrumentoId) return `/instrumentos/${e.instrumentoId}`
  if (e.coleccion === 'usuarios') return '/usuarios'
  if (e.coleccion === 'refacciones') return `/refacciones/${e.docId}`
  return null
}

const coloresAccion = { crear: 'bg-emerald-100 text-emerald-800', editar: 'bg-sky-100 text-sky-800', borrar: 'bg-red-100 text-red-800' }

export function ListaBitacora({ entradas, conEtiqueta = true }: { entradas: EntradaBitacora[]; conEtiqueta?: boolean }) {
  return (
    <ul className="divide-y divide-slate-100">
      {entradas.map((e) => {
        const campos = Object.keys({ ...e.antes, ...e.despues })
        const href = enlace(e)
        const titulo = (
          <span className="flex flex-wrap items-center gap-2">
            {conEtiqueta && <span className="font-mono font-bold">{e.etiqueta}</span>}
            <span className="text-sm text-slate-600">{NOMBRE_COLECCION[e.coleccion] ?? e.coleccion}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${coloresAccion[e.accion]}`}>{NOMBRE_ACCION[e.accion]}</span>
          </span>
        )
        return (
          <li key={e.id} className="space-y-1.5 py-3">
            {href ? (
              <Link to={href} className="block">
                {titulo}
              </Link>
            ) : (
              titulo
            )}
            <p className="text-xs text-slate-500">
              {e.usuario?.nombre ?? 'Sistema'} ·{' '}
              {e.fecha?.toDate().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) ?? '—'}
            </p>
            {campos.length > 0 && (
              <dl className="space-y-1 rounded-lg bg-slate-50 p-2 text-sm">
                {campos.map((c) => (
                  <div key={c} className="grid grid-cols-[minmax(0,2fr)_minmax(0,5fr)] gap-2">
                    <dt className="text-xs text-slate-500">{nombreCampo(c)}</dt>
                    <dd className="break-words">
                      {e.accion === 'editar' ? (
                        <>
                          <span className="text-slate-500 line-through">{textoValor(c, e.antes[c])}</span>
                          {' → '}
                          <span className="font-medium">{textoValor(c, e.despues[c])}</span>
                        </>
                      ) : (
                        <span>{textoValor(c, e.accion === 'crear' ? e.despues[c] : e.antes[c])}</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        )
      })}
    </ul>
  )
}
