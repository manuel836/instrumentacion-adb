import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { useCalibraciones } from '../lib/calibraciones'
import { duracionCierre, useFallasDeInstrumento } from '../lib/fallas'
import { useFotosUbicacion, useInstrumento } from '../lib/instrumentos'
import { useRefacciones } from '../lib/refacciones'
import { errorMaximo, textoError, textoTolerancia, vencimiento } from '../lib/tolerancia'
import { datosDelTipo, detallePrueba, pruebaDe, textoResultado } from '../lib/tipos'
import { fechaDia } from '../components/Calibracion'
import { FotoImg } from '../components/FotoImg'
import type { Calibracion, Falla } from '../types'
import { AvisoDisparo } from '../components/AvisoDisparo'

const HORA = 3_600_000
const cuantas = (n: number, una: string, varias: string) => `${n} ${n === 1 ? una : varias}`

/** "3.5 h" o "2.1 días" entre el reporte y el cierre. */
function duracion(f: Falla): string {
  const inicio = f.fechas.creada?.toMillis()
  const fin = f.fechas.cerrada?.toMillis()
  if (!inicio || !fin || fin < inicio) return '—'
  const h = (fin - inicio) / HORA
  return h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} días`
}

/** Mayor error de las lecturas antes y después del ajuste (en % del span o en unidades). */
function textoErrorMaximo(c: Calibracion, cual: 'asFound' | 'asLeft'): string {
  const peor = errorMaximo(c, cual)
  return peor === null ? '—' : textoError(peor, c)
}

function Dato({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="break-inside-avoid">
      <dt className="text-xs text-slate-500 print:text-[11px]">{k}</dt>
      <dd className="font-medium">{v === null || v === undefined || v === '' ? '—' : v}</dd>
    </div>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-5 break-inside-avoid-page">
      <h2 className="mb-2 border-b border-slate-300 pb-1 text-sm font-bold tracking-wide text-marca-800 uppercase">{titulo}</h2>
      {children}
    </section>
  )
}

const th = 'border border-slate-300 bg-slate-100 px-1.5 py-1 text-left font-semibold whitespace-nowrap'
const td = 'border border-slate-300 px-1.5 py-1 align-top'

/**
 * Hoja de vida del instrumento: datos, fotos, calibraciones, fallas y documentos en
 * una hoja que el navegador imprime o guarda como PDF. Va fuera del menú de la app.
 */
export function HojaDeVida() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const inst = useInstrumento(id)
  const fotos = useFotosUbicacion(id)
  const calibraciones = useCalibraciones(id)
  const fallas = useFallasDeInstrumento(id)
  const refacciones = (useRefacciones() ?? []).filter((r) => id && r.instrumentos.includes(id))
  const [preparando, setPreparando] = useState(false)

  if (inst === undefined || calibraciones === null) return <p className="p-6 text-slate-500">Cargando…</p>
  if (inst === null) return <p className="p-6 text-slate-500">Este instrumento no existe.</p>

  const rango = inst.rangoMin !== null || inst.rangoMax !== null ? `${inst.rangoMin ?? '?'} a ${inst.rangoMax ?? '?'} ${inst.unidades}` : ''
  const v = vencimiento(inst.proximaCalibracion)
  const portada = fotos.find((f) => f.esPortada) ?? fotos[0]
  const otras = fotos.filter((f) => f !== portada)
  const cerradas = fallas.filter((f) => f.estado === 'Cerrada')
  const horas = cerradas
    .map((f) => ((f.fechas.cerrada?.toMillis() ?? 0) - (f.fechas.creada?.toMillis() ?? 0)) / HORA)
    .filter((h) => h > 0)
  const promedio = horas.length ? horas.reduce((s, h) => s + h, 0) / horas.length : null
  const ultima = calibraciones[0]

  /** Espera a que carguen las fotos para que salgan en el PDF. */
  async function imprimir() {
    setPreparando(true)
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('main img'))
    const espera = Promise.all(imgs.map((img) => (img.complete ? null : img.decode().catch(() => null))))
    await Promise.race([espera, new Promise((r) => setTimeout(r, 8000))])
    setPreparando(false)
    window.print()
  }

  return (
    <div className="min-h-dvh bg-white p-4 text-slate-900 print:p-0">
      <style>{'@page { size: letter; margin: 12mm; }'}</style>
      <title>{`Hoja de vida ${inst.tagISA}`}</title>
      <div className="mb-3 flex gap-2 print:hidden">
        <button className="btn-secundario" onClick={() => navigate(-1)}>
          Volver
        </button>
        <button className="btn-primario flex-1" disabled={preparando} onClick={() => void imprimir()}>
          {preparando ? 'Preparando fotos…' : 'Imprimir / Guardar PDF'}
        </button>
      </div>
      <p className="mb-4 text-sm text-slate-500 print:hidden">En el teléfono elige “Guardar como PDF” como impresora. Luego puedes enviarlo por correo o WhatsApp.</p>

      <main className="mx-auto max-w-3xl text-sm print:max-w-none print:text-[11px]">
        <header className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1 border-b-2 border-marca-700 pb-2">
          <div>
            <p className="text-xs text-slate-500">Agroindustrias del Balsas · Instrumentación</p>
            <h1 className="text-xl font-bold">
              Hoja de vida · <span className="font-mono whitespace-nowrap">{inst.tagISA}</span>
            </h1>
            <p className="text-slate-700">{inst.servicio}</p>
          </div>
          <p className="shrink-0 text-[11px] text-slate-500 sm:text-right print:text-right">
            Generada el {new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
            {user ? <><br />por {user.displayName || user.email}</> : null}
          </p>
        </header>

        {inst.disparaCaldera && <AvisoDisparo nota={inst.notaDisparo} className="mt-3 print:break-inside-avoid" />}

        <div className="mt-4 flex flex-col gap-4 sm:flex-row print:flex-row">
          {portada && (
            <figure className="shrink-0 sm:w-56 print:w-56">
              <FotoImg url={portada.url ?? portada.miniaturaUrl} ruta={portada.ruta} alt={portada.pie || 'Ubicación'} className="max-h-72 w-full rounded border border-slate-300 object-cover sm:max-h-none print:max-h-none" />
              {portada.pie && <figcaption className="mt-1 text-xs text-slate-600 print:text-[11px]">{portada.pie}</figcaption>}
            </figure>
          )}
          <dl className="grid flex-1 grid-cols-2 content-start gap-x-4 gap-y-2 sm:grid-cols-3 print:grid-cols-3">
            {inst.tipo && <Dato k="Tipo" v={inst.tipo} />}
            {datosDelTipo(inst).map((d) => (
              <Dato key={d.k} k={d.k} v={d.v} />
            ))}
            <Dato k="Área" v={inst.area} />
            {inst.subArea && <Dato k="Sub área" v={inst.subArea} />}
            <Dato k="Estado" v={inst.estado} />
            <Dato k="Ubicación" v={inst.ubicacionTexto} />
            <Dato k="Lazo" v={inst.lazo} />
            <Dato k="P&ID" v={inst.pid} />
            <Dato k="Señal" v={inst.senal} />
            <Dato k="Marca" v={inst.marca} />
            <Dato k="Modelo" v={inst.modelo} />
            <Dato k="Serie" v={inst.serie} />
            {!['carrera', 'funcional'].includes(pruebaDe(inst.tipo)) && <Dato k="Rango" v={rango} />}
            <Dato k="Alimentación" v={inst.alimentacion} />
            <Dato k="Tag NFC" v={inst.nfcToken ? 'Vinculado' : 'Sin tag'} />
            <Dato
              k="Próxima calibración"
              v={
                <>
                  {fechaDia(inst.proximaCalibracion) ?? 'sin programar'}
                  {v === 'vencida' && <span className="font-semibold text-red-700"> (vencida)</span>}
                  {v === 'pronto' && <span className="font-semibold text-amber-700"> (vence pronto)</span>}
                </>
              }
            />
          </dl>
        </div>

        <Seccion titulo="Resumen">
          <p>
            {calibraciones.length === 0
              ? 'Sin calibraciones registradas.'
              : `${calibraciones.length} ${calibraciones.length === 1 ? 'calibración' : 'calibraciones'}; la última el ${fechaDia(ultima.fecha)} (${textoResultado(ultima.resultado, ultima.tipo).toLowerCase()}).`}{' '}
            {fallas.length === 0
              ? 'Sin fallas registradas.'
              : `${fallas.length} ${fallas.length === 1 ? 'falla' : 'fallas'}: ${cuantas(cerradas.length, 'cerrada', 'cerradas')}, ${cuantas(fallas.length - cerradas.length, 'abierta o en proceso', 'abiertas o en proceso')}.`}
            {promedio !== null && ` Tiempo promedio para cerrar una falla: ${duracionCierre(promedio)}.`}
          </p>
        </Seccion>

        <Seccion titulo={`Calibraciones (${calibraciones.length})`}>
          {calibraciones.length === 0 ? (
            <p className="text-slate-500">Sin calibraciones registradas.</p>
          ) : (
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full border-collapse text-[11px] leading-snug print:text-[9.5px]">
                <thead>
                  <tr>
                    <th className={th}>Fecha</th>
                    <th className={th}>Resultado</th>
                    <th className={th}>Error máx. antes</th>
                    <th className={th}>Error máx. después</th>
                    <th className={th}>Tolerancia</th>
                    <th className={th}>Patrón</th>
                    <th className={th}>Técnico</th>
                    <th className={th}>Próxima</th>
                    <th className={th}>Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {calibraciones.map((c) => (
                    <tr key={c.id} className="break-inside-avoid">
                      <td className={`${td} whitespace-nowrap`}>{fechaDia(c.fecha)}</td>
                      <td className={`${td} min-w-28`}>
                        <span className={c.resultado === 'Fuera de tolerancia' ? 'font-semibold text-red-700' : ''}>{textoResultado(c.resultado, c.tipo)}</span>
                        {detallePrueba(c) && <span className="block text-slate-600">{detallePrueba(c)}</span>}
                      </td>
                      <td className={`${td} whitespace-nowrap`}>{textoErrorMaximo(c, 'asFound')}</td>
                      <td className={`${td} whitespace-nowrap`}>{textoErrorMaximo(c, 'asLeft')}</td>
                      <td className={`${td} whitespace-nowrap`}>{c.tolerancia > 0 ? textoTolerancia(c) : '—'}</td>
                      <td className={td}>{c.patron || '—'}</td>
                      <td className={td}>{c.tecnico.nombre}</td>
                      <td className={`${td} whitespace-nowrap`}>{fechaDia(c.proxima) ?? '—'}</td>
                      <td className={`${td} min-w-40`}>{c.observaciones || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Seccion>

        <Seccion titulo={`Historial de fallas (${fallas.length})`}>
          {fallas.length === 0 ? (
            <p className="text-slate-500">Sin fallas registradas.</p>
          ) : (
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full border-collapse text-[11px] leading-snug print:text-[9.5px]">
                <thead>
                  <tr>
                    <th className={th}>Reportada</th>
                    <th className={th}>Falla</th>
                    <th className={th}>Estado</th>
                    <th className={th}>Atendió</th>
                    <th className={th}>Causa raíz</th>
                    <th className={th}>Acción correctiva</th>
                    <th className={th}>Tardó</th>
                  </tr>
                </thead>
                <tbody>
                  {fallas.map((f) => (
                    <tr key={f.id} className="break-inside-avoid">
                      <td className={`${td} whitespace-nowrap`}>
                        {fechaDia(f.fechas.creada) ?? 'sin sincronizar'}
                        <span className="block text-slate-500">{f.reportadoPor.nombre}</span>
                      </td>
                      <td className={`${td} min-w-40`}>{f.descripcion}</td>
                      <td className={`${td} whitespace-nowrap`}>{f.estado}</td>
                      <td className={td}>{f.tecnicoAsignado?.nombre ?? '—'}</td>
                      <td className={`${td} min-w-32`}>{f.causaRaiz || '—'}</td>
                      <td className={`${td} min-w-32`}>{f.accionCorrectiva || '—'}</td>
                      <td className={`${td} whitespace-nowrap`}>{duracion(f)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Seccion>

        <Seccion titulo={`Documentos (${inst.docs.length})`}>
          {inst.docs.length === 0 ? (
            <p className="text-slate-500">Sin hojas de datos ni manuales.</p>
          ) : (
            <ul className="list-disc pl-5">
              {inst.docs.map((d) => (
                <li key={d.ruta}>{d.nombre}</li>
              ))}
            </ul>
          )}
        </Seccion>

        {refacciones.length > 0 && (
          <Seccion titulo={`Refacciones (${refacciones.length})`}>
            <table className="w-full border-collapse text-[11px] leading-snug print:text-[9.5px]">
              <thead>
                <tr>
                  <th className={th}>Refacción</th>
                  <th className={th}>Número de parte</th>
                  <th className={th}>Ubicación en almacén</th>
                  <th className={th}>Existencia</th>
                </tr>
              </thead>
              <tbody>
                {refacciones.map((r) => (
                  <tr key={r.id} className="break-inside-avoid">
                    <td className={td}>{r.nombre}</td>
                    <td className={td}>{r.numeroParte || '—'}</td>
                    <td className={td}>{r.ubicacion || '—'}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      {r.existencia} {r.unidad}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Seccion>
        )}

        {otras.length > 0 && (
          <Seccion titulo="Más fotos de ubicación">
            <div className="grid grid-cols-3 gap-2 print:grid-cols-4">
              {otras.map((f) => (
                <figure key={f.id} className="break-inside-avoid">
                  <FotoImg url={f.miniaturaUrl ?? f.url} ruta={f.miniatura} alt={f.pie || 'Ubicación'} className="aspect-square w-full rounded border border-slate-300 object-cover" />
                  {f.pie && <figcaption className="mt-0.5 text-xs leading-tight text-slate-600 print:text-[10px]">{f.pie}</figcaption>}
                </figure>
              ))}
            </div>
          </Seccion>
        )}

        <footer className="mt-16 grid break-inside-avoid grid-cols-2 gap-8 text-center text-[11px] text-slate-600">
          <p className="border-t border-slate-400 pt-1">Elaboró</p>
          <p className="border-t border-slate-400 pt-1">Revisó</p>
        </footer>
      </main>
    </div>
  )
}
