import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useInstrumentos } from '../lib/instrumentos'
import { borrarSubarea, crearSubarea, enUso, renombrarSubarea, revisarNombre, useSubareas } from '../lib/subareas'
import { AREAS, type Area, type Subarea } from '../types'

const plural = (n: number) => `${n} ${n === 1 ? 'instrumento' : 'instrumentos'}`

/** El admin agrega, renombra o quita las sub áreas (calderas, tanques, secciones) de cada área. */
export function Subareas() {
  const subareas = useSubareas()
  const instrumentos = useInstrumentos()
  const [nuevo, setNuevo] = useState<Partial<Record<Area, string>>>({})
  const [editando, setEditando] = useState<{ id: string; nombre: string } | null>(null)
  const [quitando, setQuitando] = useState<string | null>(null)
  const [error, setError] = useState<{ donde: string; texto: string } | null>(null)

  if (!subareas || !instrumentos) return <p className="p-6 text-slate-500">Cargando…</p>

  function agregar(e: FormEvent, area: Area) {
    e.preventDefault()
    const nombre = nuevo[area] ?? ''
    const problema = revisarNombre(subareas!, area, nombre)
    if (problema) return setError({ donde: area, texto: problema })
    crearSubarea(area, nombre)
    setNuevo({ ...nuevo, [area]: '' })
    setError(null)
  }

  function guardarNombre(e: FormEvent, sub: Subarea) {
    e.preventDefault()
    if (!editando) return
    const problema = revisarNombre(subareas!, sub.area, editando.nombre, sub.id)
    if (problema) return setError({ donde: sub.id, texto: problema })
    renombrarSubarea(sub, editando.nombre, instrumentos!)
    setEditando(null)
    setError(null)
  }

  return (
    <div className="space-y-3 p-3">
      <div>
        <h1 className="text-xl font-bold">Sub áreas</h1>
        <p className="text-sm text-slate-500">
          Separa cada área en calderas, tanques o secciones. Al dar de alta un instrumento se elige su sub área, y el mismo tag (por ejemplo
          PT-101) puede repetirse en otra sub área.
        </p>
      </div>

      {AREAS.map((area) => {
        const subs = subareas.filter((s) => s.area === area)
        return (
          <section key={area} className="tarjeta space-y-3" aria-label={area}>
            <h2 className="font-semibold">{area}</h2>
            {subs.length === 0 ? (
              <p className="text-sm text-slate-500">Sin sub áreas todavía.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {subs.map((s) => {
                  const n = enUso(s, instrumentos)
                  return (
                    <li key={s.id} className="space-y-2 py-2.5" data-subarea={s.nombre}>
                      {editando?.id === s.id ? (
                        <form className="flex gap-2" onSubmit={(e) => guardarNombre(e, s)}>
                          <input
                            className="campo py-2"
                            aria-label={`Nuevo nombre de ${s.nombre}`}
                            value={editando.nombre}
                            maxLength={60}
                            autoFocus
                            onChange={(e) => setEditando({ id: s.id, nombre: e.target.value })}
                          />
                          <button type="button" className="btn-secundario shrink-0 px-3 py-2 text-sm" onClick={() => setEditando(null)}>
                            Cancelar
                          </button>
                          <button className="btn-primario shrink-0 px-3 py-2 text-sm">Guardar</button>
                        </form>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{s.nombre}</span>
                            <Link to={`/catalogo?${new URLSearchParams({ area, sub: s.nombre })}`} className="text-xs text-marca-700">
                              {plural(n)}
                            </Link>
                          </span>
                          <button
                            className="btn-secundario px-3 py-1.5 text-sm"
                            onClick={() => {
                              setQuitando(null)
                              setError(null)
                              setEditando({ id: s.id, nombre: s.nombre })
                            }}
                          >
                            Renombrar
                          </button>
                          <button
                            className="btn-peligro px-3 py-1.5 text-sm"
                            onClick={() => {
                              setEditando(null)
                              setQuitando(quitando === s.id ? null : s.id)
                            }}
                          >
                            Quitar
                          </button>
                        </div>
                      )}
                      {editando?.id === s.id && n > 0 && <p className="text-xs text-slate-500">El nombre nuevo se pasa a sus {plural(n)}.</p>}
                      {error?.donde === s.id && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error.texto}</p>}
                      {quitando === s.id &&
                        (n > 0 ? (
                          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                            {s.nombre} tiene {plural(n)}. Cámbialos a otra sub área (o a “Sin sub área”) antes de quitarla.
                          </p>
                        ) : (
                          <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-900">
                            <span className="flex-1">¿Quitar {s.nombre}?</span>
                            <button className="btn-secundario px-3 py-1.5 text-sm" onClick={() => setQuitando(null)}>
                              No
                            </button>
                            <button
                              className="btn-peligro px-3 py-1.5 text-sm"
                              onClick={() => {
                                borrarSubarea(s)
                                setQuitando(null)
                              }}
                            >
                              Sí, quitar
                            </button>
                          </div>
                        ))}
                    </li>
                  )
                })}
              </ul>
            )}
            <form className="flex gap-2" onSubmit={(e) => agregar(e, area)}>
              <input
                className="campo py-2"
                placeholder="Nueva sub área (ej. Caldera 3)"
                aria-label={`Nueva sub área de ${area}`}
                maxLength={60}
                value={nuevo[area] ?? ''}
                onChange={(e) => setNuevo({ ...nuevo, [area]: e.target.value })}
              />
              <button className="btn-primario shrink-0 px-4 py-2">Agregar</button>
            </form>
            {error?.donde === area && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error.texto}</p>}
          </section>
        )
      })}
    </div>
  )
}
