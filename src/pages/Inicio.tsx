import { useMemo, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { permisos, useAuth } from '../auth/AuthContext'
import { duracionCierre, useFallas } from '../lib/fallas'
import { useInstrumentos } from '../lib/instrumentos'
import { porPedir, sinExistencia, useRefacciones } from '../lib/refacciones'
import { vencimiento } from '../lib/tolerancia'
import { AREAS } from '../types'
import { ListaFallas } from '../components/ListaFallas'
import { Icono, type NombreIcono } from '../components/Icono'

/**
 * Un número grande que lleva a la lista filtrada. Sin marco: solo lo que pide acción
 * (rojo o ámbar con algo pendiente) lleva fondo de color, para que resalte entre los ceros.
 */
function Cifra({ n, texto, a, tono = 'normal' }: { n: number; texto: string; a: string; tono?: 'normal' | 'rojo' | 'ambar' | 'verde' }) {
  const pendiente = n > 0 && (tono === 'rojo' || tono === 'ambar')
  const color = {
    normal: 'text-slate-800',
    rojo: n > 0 ? 'text-red-700' : 'text-slate-800',
    ambar: n > 0 ? 'text-amber-700' : 'text-slate-800',
    verde: 'text-emerald-700',
  }[tono]
  const fondo = pendiente ? (tono === 'rojo' ? 'bg-red-50 active:bg-red-100' : 'bg-amber-50 active:bg-amber-100') : 'active:bg-slate-100'
  return (
    <Link to={a} data-cifra className={`block rounded-lg px-3 py-2.5 ${fondo}`}>
      <span className={`block text-2xl font-bold ${color}`}>{n}</span>
      <span className={`block text-xs leading-tight ${pendiente ? 'font-medium text-slate-800' : 'text-slate-600'}`}>{texto}</span>
    </Link>
  )
}

function Tarjeta({ titulo, children, enlace }: { titulo: string; children: ReactNode; enlace?: { a: string; texto: string } }) {
  return (
    <section className="tarjeta space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{titulo}</h2>
        {enlace && (
          <Link to={enlace.a} className="accion">
            {enlace.texto}
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

function Atajo({ a, icono, texto }: { a: string; icono: NombreIcono; texto: string }) {
  return (
    <Link to={a} className="flex flex-col items-center gap-1 rounded-xl bg-white p-3 text-center text-xs font-semibold text-slate-700 shadow-sm active:bg-slate-50">
      <Icono nombre={icono} className="size-7 text-marca-700" />
      {texto}
    </Link>
  )
}

const DIA = 86_400_000

/** Pantalla de inicio: lo pendiente de un vistazo, con atajos a cada lista. Funciona sin señal. */
export function Inicio() {
  const { user, rol, area: miArea } = useAuth()
  const p = permisos(rol)
  const instrumentos = useInstrumentos()
  const fallas = useFallas()
  const refacciones = useRefacciones()
  // El área elegida va en la dirección para que siga igual al regresar de una lista.
  // Sin elegir, se usa el área del usuario (si el admin le asignó una).
  const [params, setParams] = useSearchParams()
  const elegida = params.get('area')
  const filtroArea = elegida === null ? miArea : elegida === 'todas' ? '' : elegida

  const r = useMemo(() => {
    const insts = (instrumentos ?? []).filter((i) => !filtroArea || i.area === filtroArea)
    const fs = (fallas ?? []).filter((f) => !filtroArea || f.area === filtroArea)
    const ahora = Date.now()
    const cerradas30 = fs.filter((f) => f.estado === 'Cerrada' && (f.fechas.cerrada?.toMillis() ?? 0) > ahora - 30 * DIA)
    const horas = cerradas30
      .map((f) => ((f.fechas.cerrada?.toMillis() ?? 0) - (f.fechas.creada?.toMillis() ?? 0)) / 3_600_000)
      .filter((h) => h > 0)
    return {
      total: insts.length,
      porArea: AREAS.map((a) => ({ a, n: (instrumentos ?? []).filter((i) => i.area === a).length })),
      conFalla: insts.filter((i) => i.estado === 'Con falla').length,
      fuera: insts.filter((i) => i.estado === 'Fuera de servicio').length,
      sinTag: insts.filter((i) => !i.nfcToken).length,
      sinFotos: insts.filter((i) => !i.portadaMiniatura).length,
      vencidas: insts.filter((i) => vencimiento(i.proximaCalibracion) === 'vencida').length,
      porVencer: insts.filter((i) => vencimiento(i.proximaCalibracion) === 'pronto').length,
      sinCal: insts.filter((i) => !i.proximaCalibracion).length,
      abiertas: fs.filter((f) => f.estado === 'Abierta').length,
      enProceso: fs.filter((f) => f.estado === 'En proceso').length,
      cerradas30: cerradas30.length,
      horasPromedio: horas.length ? horas.reduce((s, h) => s + h, 0) / horas.length : null,
      mias: fs.filter((f) => f.estado === 'En proceso' && f.tecnicoAsignado?.uid === user?.uid),
      reportadas: fs.filter((f) => f.estado !== 'Cerrada' && f.reportadoPor.uid === user?.uid),
    }
  }, [instrumentos, fallas, filtroArea, user?.uid])

  const q = (base: string, extra: Record<string, string>) => {
    const s = new URLSearchParams({ ...(filtroArea ? { area: filtroArea } : {}), ...extra }).toString()
    return s ? `${base}?${s}` : base
  }
  const nombre = (user?.displayName || user?.email || '').split(/[\s@]/)[0]
  const hoy = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
  const cargando = instrumentos === null || fallas === null

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-end justify-between gap-2 px-1">
        <div>
          <h1 className="text-xl font-bold">Hola{nombre ? `, ${nombre}` : ''}</h1>
          <p className="text-sm text-slate-500 first-letter:uppercase">{hoy}</p>
        </div>
        <select
          className="campo min-h-11 w-auto max-w-[55%] py-1.5 text-sm"
          value={filtroArea}
          onChange={(e) => setParams({ area: e.target.value || 'todas' }, { replace: true })}
          aria-label="Área del resumen"
        >
          <option value="">Todas las áreas</option>
          {AREAS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </div>

      <div className={`grid gap-2 ${p.editarInstrumentos ? 'grid-cols-4' : 'grid-cols-2'}`}>
        <Atajo a="/escanear" icono="escanear" texto="Escanear tag" />
        <Atajo a="/fallas/nueva" icono="falla" texto="Reportar falla" />
        {p.editarInstrumentos && <Atajo a="/instrumentos/nuevo" icono="mas" texto="Alta" />}
        {p.editarInstrumentos && <Atajo a="/instrumentos/importar" icono="importar" texto="Importar Excel" />}
      </div>

      {cargando && <p className="p-4 text-center text-slate-500">Cargando…</p>}

      {!cargando && (
        <>
          {p.atenderFallas && r.mias.length > 0 && (
            <Tarjeta titulo={`Atiendes ${r.mias.length === 1 ? '1 falla' : `${r.mias.length} fallas`}`}>
              <ListaFallas fallas={r.mias.slice(0, 3)} />
            </Tarjeta>
          )}
          {!p.atenderFallas && r.reportadas.length > 0 && (
            <Tarjeta titulo="Fallas que reportaste">
              <ListaFallas fallas={r.reportadas.slice(0, 3)} />
            </Tarjeta>
          )}

          <Tarjeta titulo="Fallas" enlace={{ a: q('/fallas', {}), texto: 'Ver todas' }}>
            <div className="grid grid-cols-3 gap-2">
              <Cifra n={r.abiertas} texto="abiertas, sin atender" a={q('/fallas', { estado: 'Abierta' })} tono="rojo" />
              <Cifra n={r.enProceso} texto="en proceso" a={q('/fallas', { estado: 'En proceso' })} tono="ambar" />
              <Cifra n={r.cerradas30} texto="cerradas en 30 días" a={q('/fallas', { estado: 'Cerrada' })} tono="verde" />
            </div>
            {r.horasPromedio !== null && (
              <p className="text-sm text-slate-600">
                En los últimos 30 días una falla tardó en promedio{' '}
                <b>{duracionCierre(r.horasPromedio)}</b> en cerrarse.
              </p>
            )}
          </Tarjeta>

          <Tarjeta titulo="Calibraciones">
            <div className="grid grid-cols-3 gap-2">
              <Cifra n={r.vencidas} texto="vencidas" a={q('/catalogo', { filtro: 'vencidas' })} tono="rojo" />
              <Cifra n={r.porVencer} texto="vencen en 30 días" a={q('/catalogo', { filtro: 'por-vencer' })} tono="ambar" />
              <Cifra n={r.sinCal} texto="sin fecha programada" a={q('/catalogo', { filtro: 'sin-calibracion' })} />
            </div>
          </Tarjeta>

          <Tarjeta titulo={`Catálogo: ${r.total} ${r.total === 1 ? 'instrumento' : 'instrumentos'}`} enlace={{ a: q('/catalogo', {}), texto: 'Abrir' }}>
            <div className="grid grid-cols-2 gap-2">
              <Cifra n={r.conFalla} texto="con falla" a={q('/catalogo', { estado: 'Con falla' })} tono="ambar" />
              <Cifra n={r.fuera} texto="fuera de servicio" a={q('/catalogo', { estado: 'Fuera de servicio' })} />
              <Cifra n={r.sinTag} texto="sin tag NFC" a={q('/catalogo', { filtro: 'sin-tag' })} />
              <Cifra n={r.sinFotos} texto="sin fotos de ubicación" a={q('/catalogo', { filtro: 'sin-fotos' })} />
            </div>
            {!filtroArea && r.total > 0 && (
              <ul className="space-y-1.5 text-sm">
                {r.porArea.map(({ a, n }) => (
                  <li key={a}>
                    <Link to={`/catalogo?area=${encodeURIComponent(a)}`} className="block">
                      <span className="flex justify-between text-slate-600">
                        <span>{a}</span>
                        <span className="font-semibold text-slate-800">{n}</span>
                      </span>
                      <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <span className="block h-full rounded-full bg-marca-600" style={{ width: `${(n / r.total) * 100}%` }} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
          {refacciones && refacciones.length > 0 && (
            <Tarjeta titulo="Refacciones" enlace={{ a: '/refacciones', texto: 'Abrir' }}>
              <div className="grid grid-cols-2 gap-2">
                <Cifra n={refacciones.filter(porPedir).length} texto="por pedir (llegaron al mínimo)" a="/refacciones?filtro=por-pedir" tono="ambar" />
                <Cifra n={refacciones.filter(sinExistencia).length} texto="sin existencia" a="/refacciones?filtro=sin-existencia" tono="rojo" />
              </div>
            </Tarjeta>
          )}
        </>
      )}
    </div>
  )
}
