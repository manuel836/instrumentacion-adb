import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { permisos, useAuth } from '../auth/AuthContext'
import { cerrarFalla, tomarFalla, useFalla } from '../lib/fallas'
import { hiloDeFalla } from '../lib/chat'
import { Chat } from '../components/Chat'
import { Pendiente } from '../components/Estado'
import { EstadoFalla, fechaCorta } from '../components/EstadoFalla'
import { FotoImg } from '../components/FotoImg'
import { nombreFoto, Visor } from '../components/Visor'
import { RefaccionesUsadas } from '../components/RefaccionesUsadas'
import { dondeEsta } from '../types'
import { useInstrumento } from '../lib/instrumentos'
import { AvisoDisparo } from '../components/AvisoDisparo'
import { BorrarFalla } from '../components/BorrarFalla'
import { avisarGuardado } from '../components/Listo'
import { Silueta } from '../components/Silueta'

export function DetalleFalla() {
  const { id } = useParams()
  const falla = useFalla(id)
  // El aviso de disparo de caldera sale del instrumento (puede marcarse después de reportar).
  const inst = useInstrumento(falla?.instrumentoId)
  const { user, rol } = useAuth()
  const p = permisos(rol)
  const [visor, setVisor] = useState<number | null>(null)
  const [cerrando, setCerrando] = useState(false)
  const [causa, setCausa] = useState('')
  const [accion, setAccion] = useState('')
  const [error, setError] = useState('')

  if (falla === undefined) return <Silueta />
  if (falla === null) return <p className="p-6 text-slate-500">Esta falla no existe. Puede que el administrador la haya eliminado.</p>

  const yo = { uid: user?.uid ?? '', nombre: user?.displayName || user?.email || 'Técnico' }

  function onCerrar(e: FormEvent) {
    e.preventDefault()
    if (!falla) return
    if (causa.trim().length < 3 || accion.trim().length < 3) {
      setError('La causa raíz y la acción correctiva son obligatorias.')
      return
    }
    cerrarFalla(falla.id, causa, accion, yo, !!falla.tecnicoAsignado)
    avisarGuardado('Falla cerrada.', 'Falla cerrada en el teléfono. Se envía cuando haya señal.')
    setCerrando(false)
  }

  return (
    <div className="space-y-3 p-3">
      {inst?.disparaCaldera && falla.estado !== 'Cerrada' && <AvisoDisparo nota={inst.notaDisparo} />}
      <section className="tarjeta space-y-2">
        <div className="flex items-center gap-2">
          <Link to={`/instrumentos/${falla.instrumentoId}`} className="font-mono text-2xl font-bold text-marca-700 underline">
            {falla.tagISA}
          </Link>
          <EstadoFalla estado={falla.estado} />
          {falla.sinSincronizar && <Pendiente />}
        </div>
        <p className="text-sm text-slate-500">{dondeEsta(falla)}</p>
        <p className="whitespace-pre-wrap">{falla.descripcion}</p>
        {falla.fotos.length > 0 && (
          <div className="grid grid-cols-4 gap-2 pt-1">
            {falla.fotos.map((f, i) => (
              <button key={f.ruta} onClick={() => setVisor(i)} className="overflow-hidden rounded" aria-label={nombreFoto(i, falla.fotos.length)}>
                <FotoImg url={f.miniaturaUrl} ruta={f.miniatura} alt="" className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="tarjeta">
        <h2 className="mb-2 font-semibold">Seguimiento</h2>
        <ol className="space-y-2 text-sm">
          <li>
            <span className="font-medium">Reportada</span> por {falla.reportadoPor.nombre} · {fechaCorta(falla.fechas.creada)}
          </li>
          {falla.tecnicoAsignado && (
            <li>
              <span className="font-medium">Tomada</span> por {falla.tecnicoAsignado.nombre} · {fechaCorta(falla.fechas.tomada)}
            </li>
          )}
          {falla.estado === 'Cerrada' && (
            <li>
              <span className="font-medium">Cerrada</span> · {fechaCorta(falla.fechas.cerrada)}
            </li>
          )}
        </ol>
        {falla.estado === 'Cerrada' && (
          <dl className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Causa raíz</dt>
              <dd className="whitespace-pre-wrap">{falla.causaRaiz}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Acción correctiva</dt>
              <dd className="whitespace-pre-wrap">{falla.accionCorrectiva}</dd>
            </div>
          </dl>
        )}
      </section>

      {p.atenderFallas && falla.estado !== 'Cerrada' && !cerrando && (
        <div className="grid grid-cols-2 gap-2">
          {falla.estado === 'Abierta' ? (
            <button
              className="btn-primario"
              onClick={() => {
                tomarFalla(falla.id, yo)
                avisarGuardado('Tomaste la falla: ahora está En proceso.', 'Tomaste la falla en el teléfono. Se envía cuando haya señal.')
              }}
            >
              Tomar falla
            </button>
          ) : (
            <span />
          )}
          <button className={falla.estado === 'Abierta' ? 'btn-secundario' : 'btn-primario col-span-2'} onClick={() => setCerrando(true)}>
            Cerrar falla
          </button>
        </div>
      )}

      {cerrando && (
        <form onSubmit={onCerrar} className="tarjeta origin-top animate-desplegar space-y-3">
          <h2 className="font-semibold">Cerrar falla</h2>
          <label className="block">
            <span className="etiqueta">Causa raíz *</span>
            <textarea className="campo min-h-20" value={causa} onChange={(e) => setCausa(e.target.value)} />
          </label>
          <label className="block">
            <span className="etiqueta">Acción correctiva *</span>
            <textarea className="campo min-h-20" value={accion} onChange={(e) => setAccion(e.target.value)} />
          </label>
          {error && <p className="rounded-lg bg-peligro-50 p-3 text-sm text-peligro-700">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-secundario flex-1" onClick={() => setCerrando(false)}>
              Cancelar
            </button>
            <button className="btn-primario flex-1">Cerrar</button>
          </div>
        </form>
      )}

      <RefaccionesUsadas falla={falla} />

      <section className="tarjeta space-y-3">
        <h2 className="flex items-center gap-2 font-semibold">
          Chat de la falla
          {falla.estado === 'Cerrada' && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Cerrado</span>}
        </h2>
        {/* Al cerrar la falla se cierra su chat: lo que se habló y las fotos quedan guardados para consulta. */}
        <Chat
          ruta={hiloDeFalla(falla.id)}
          conFotos
          vacio={falla.estado === 'Cerrada' ? 'No se escribió nada en el chat de esta falla.' : 'Aún no hay mensajes. Escribe para coordinar la atención.'}
          cerrado={
            falla.estado === 'Cerrada'
              ? `El chat se cerró junto con la falla (${fechaCorta(falla.fechas.cerrada)}). Lo que se habló y las fotos quedan guardados aquí.`
              : undefined
          }
        />
      </section>

      {p.borrarFallas && <BorrarFalla falla={falla} />}

      {visor !== null && (
        <Visor fotos={falla.fotos.map((f) => ({ url: f.url, ruta: f.ruta, miniaturaUrl: f.miniaturaUrl, pie: '' }))} inicio={visor} onCerrar={() => setVisor(null)} />
      )}
    </div>
  )
}
