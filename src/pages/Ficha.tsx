import { useRef } from 'react'
import { Link, useParams } from 'react-router'
import { permisos, useAuth } from '../auth/AuthContext'
import { adjuntarDocumento, quitarDocumento, useInstrumento } from '../lib/instrumentos'
import { Estado, Pendiente } from '../components/Estado'
import { Galeria } from '../components/Galeria'
import { ListaFallas } from '../components/ListaFallas'
import { useFallasDeInstrumento } from '../lib/fallas'
import { useCalibraciones } from '../lib/calibraciones'
import { fechaDia, ProximaCalibracion, ResultadoCal } from '../components/Calibracion'
import { BorrarInstrumento } from '../components/BorrarInstrumento'
import { RefaccionesDelInstrumento } from '../components/RefaccionesUsadas'
import { Icono } from '../components/Icono'

function Dato({ k, v }: { k: string; v: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{k}</dt>
      <dd className="font-medium">{v === null || v === undefined || v === '' ? '—' : v}</dd>
    </div>
  )
}

export function Ficha() {
  const { id } = useParams()
  const inst = useInstrumento(id)
  const { rol } = useAuth()
  const p = permisos(rol)
  const archivo = useRef<HTMLInputElement>(null)
  const fallas = useFallasDeInstrumento(id)
  const calibraciones = useCalibraciones(id)

  if (inst === undefined) return <p className="p-6 text-slate-500">Cargando…</p>
  if (inst === null) return <p className="p-6 text-slate-500">Este instrumento no existe.</p>

  const rango =
    inst.rangoMin !== null || inst.rangoMax !== null ? `${inst.rangoMin ?? '?'} a ${inst.rangoMax ?? '?'} ${inst.unidades}` : ''

  return (
    <div className="space-y-3 p-3">
      <section className="tarjeta">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="font-mono text-2xl font-bold">{inst.tagISA}</h1>
            <p className="text-slate-700">{inst.servicio}</p>
            <p className="text-sm text-slate-500">{inst.area}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Estado estado={inst.estado} />
            {inst.sinSincronizar && <Pendiente />}
          </div>
        </div>
        {inst.ubicacionTexto && (
          <p className="mt-2 flex items-start gap-1.5 text-sm">
            <Icono nombre="ubicacion" className="mt-0.5 size-4 text-slate-500" />
            {inst.ubicacionTexto}
          </p>
        )}
        {!inst.nfcToken && <p className="mt-2 text-sm text-slate-500">Sin tag NFC todavía.</p>}
        <div className="mt-2">
          <ProximaCalibracion proxima={inst.proximaCalibracion} />
        </div>
        {p.editarInstrumentos && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link to={`/instrumentos/${inst.id}/editar`} className="btn-secundario">
              Editar
            </Link>
            <Link to={`/instrumentos/${inst.id}/vincular`} className="btn-primario">
              {inst.nfcToken ? 'Regrabar tag' : 'Vincular tag'}
            </Link>
          </div>
        )}
      </section>

      <Galeria instrumentoId={inst.id} editable={p.gestionarFotos} />

      <section className="tarjeta">
        <h2 className="mb-3 font-semibold">Datos técnicos</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Dato k="Lazo" v={inst.lazo} />
          <Dato k="P&ID" v={inst.pid} />
          <Dato k="Marca" v={inst.marca} />
          <Dato k="Modelo" v={inst.modelo} />
          <Dato k="Serie" v={inst.serie} />
          <Dato k="Rango" v={rango} />
          <Dato k="Señal" v={inst.senal} />
          <Dato k="Alimentación" v={inst.alimentacion} />
        </dl>
      </section>

      <section className="tarjeta space-y-2">
        <h2 className="font-semibold">Documentos</h2>
        {inst.docs.length === 0 && <p className="text-sm text-slate-500">Sin hojas de datos ni manuales.</p>}
        {inst.docs.map((d) => (
          <div key={d.ruta} className="flex items-center justify-between gap-2 text-sm">
            {d.url ? (
              <a href={d.url} target="_blank" rel="noreferrer" className="truncate text-marca-700 underline">
                {d.nombre}
              </a>
            ) : (
              <span className="truncate text-slate-500">{d.nombre} (por subir)</span>
            )}
            {p.editarInstrumentos && (
              <button className="shrink-0 text-red-700" onClick={() => quitarDocumento(inst, d.ruta)}>
                Quitar
              </button>
            )}
          </div>
        ))}
        {p.editarInstrumentos && (
          <>
            <button className="btn-secundario w-full" onClick={() => archivo.current?.click()}>
              Adjuntar documento
            </button>
            <input
              ref={archivo}
              type="file"
              hidden
              accept=".pdf,image/*,.doc,.docx,.xls,.xlsx"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void adjuntarDocumento(inst, f)
                e.target.value = ''
              }}
            />
          </>
        )}
      </section>

      <section className="tarjeta">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Calibraciones</h2>
          {p.registrarCalibraciones && (
            <Link to={`/instrumentos/${inst.id}/calibrar`} className="text-sm font-semibold text-marca-700">
              + Registrar
            </Link>
          )}
        </div>
        {!calibraciones || calibraciones.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Sin calibraciones registradas.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {calibraciones.map((c) => (
              <li key={c.id}>
                <Link to={`/instrumentos/${inst.id}/calibraciones/${c.id}`} className="flex items-center gap-2 py-3 text-sm active:bg-slate-50">
                  <span className="font-medium">{fechaDia(c.fecha)}</span>
                  <ResultadoCal resultado={c.resultado} />
                  {c.sinSincronizar && <Pendiente />}
                  <span className="ml-auto truncate text-xs text-slate-500">{c.tecnico.nombre}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tarjeta">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Historial de fallas</h2>
          {p.reportarFallas && (
            <Link to={`/fallas/nueva?instrumento=${inst.id}`} className="flex items-center gap-1 text-sm font-semibold text-red-700">
              <Icono nombre="falla" className="size-4" /> Reportar falla
            </Link>
          )}
        </div>
        {fallas.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Sin fallas registradas.</p>
        ) : (
          <ListaFallas fallas={fallas} conTag={false} />
        )}
      </section>
      <RefaccionesDelInstrumento instrumentoId={inst.id} />
      <Link to={`/instrumentos/${inst.id}/hoja-de-vida`} className="btn-secundario w-full">
        <Icono nombre="documento" /> Hoja de vida (imprimir o PDF)
      </Link>
      {p.verBitacora && (
        <Link to={`/bitacora?instrumento=${inst.id}`} className="block py-2 text-center text-sm font-semibold text-marca-700">
          Ver bitácora de cambios de {inst.tagISA}
        </Link>
      )}
      {p.borrarInstrumentos && <BorrarInstrumento inst={inst} fallas={fallas} calibraciones={calibraciones} />}
    </div>
  )
}
