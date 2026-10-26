import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useOnline } from '../hooks/useOnline'
import { analizar, COLUMNAS, type Analisis, type Existente } from '../lib/importar'
import { guardarImportacion, useInstrumentos } from '../lib/instrumentos'
import { leerArchivo, type HojaLeida } from '../lib/xlsx'
import { nombreCampo } from '../lib/bitacora'

/** Plantilla con una hoja para llenar y otra con instrucciones (la librería se carga solo aquí). */
async function descargarPlantilla() {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const negrita = (value: string) => ({ value, fontWeight: 'bold' as const })
  const ejemplo2: Record<string, string | number> = {
    tagISA: 'TT-202',
    servicio: 'Temperatura agua de alimentación',
    area: 'Tratamiento de agua',
    senal: '4-20 mA',
    estado: 'Operando',
  }
  await writeXlsxFile(
    [
      {
        sheet: 'Instrumentos',
        stickyRowsCount: 1,
        columns: COLUMNAS.map((c) => ({ width: Math.max(12, c.titulo.length + 4) })),
        data: [
          COLUMNAS.map((c) => negrita(c.titulo)),
          COLUMNAS.map((c) => ({ value: c.ejemplo })),
          COLUMNAS.map((c) => (ejemplo2[c.campo] === undefined ? null : { value: ejemplo2[c.campo] })),
        ],
      },
      {
        sheet: 'Instrucciones',
        columns: [{ width: 22 }, { width: 80 }, { width: 28 }],
        data: [
          [negrita('Cómo llenar la plantilla'), null, null],
          [{ value: 'Una fila por instrumento. Borra las dos filas de ejemplo antes de importar (o cámbialas por tus datos).' }, null, null],
          [{ value: 'Si un tag ya existe en la app, puedes elegir actualizar sus datos: las celdas vacías no borran nada.' }, null, null],
          [{ value: 'El tag NFC y las fotos no van en el Excel: se agregan después desde la ficha de cada instrumento.' }, null, null],
          [null, null, null],
          [negrita('Columna'), negrita('Qué poner'), negrita('Ejemplo')],
          ...COLUMNAS.map((c) => [{ value: c.titulo }, { value: c.ayuda }, { value: String(c.ejemplo) }]),
        ],
      },
    ],
  ).toFile('plantilla-instrumentos.xlsx')
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

function valorCorto(v: unknown): string {
  if (v instanceof Date) return v.toLocaleDateString('es-MX', { dateStyle: 'medium' })
  if (v === null || v === undefined || v === '') return '—'
  return String(v)
}

export function Importar() {
  const instrumentos = useInstrumentos()
  const online = useOnline()
  const input = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<{ nombre: string; hojas: HojaLeida[] } | null>(null)
  const [actualizar, setActualizar] = useState(true)
  const [error, setError] = useState('')
  const [avance, setAvance] = useState<{ hechos: number; total: number } | null>(null)
  const [listo, setListo] = useState<{ nuevos: number; actualizados: number } | null>(null)
  // Mientras se guarda, el catálogo cambia y el análisis se recalcularía: se muestra el del inicio.
  const [enCurso, setEnCurso] = useState<Analisis | null>(null)

  const existentes: Existente[] = useMemo(
    () => (instrumentos ?? []).map((i) => ({ id: i.id, tagISA: i.tagISA, datos: i as unknown as Existente['datos'] })),
    [instrumentos],
  )

  const analisis = useMemo((): Analisis | string | null => {
    if (!archivo || !instrumentos) return null
    try {
      return analizar(archivo.hojas, existentes, actualizar)
    } catch (err) {
      return (err as Error).message
    }
  }, [archivo, instrumentos, existentes, actualizar])

  async function elegir(f: File) {
    setError('')
    setListo(null)
    setArchivo(null)
    try {
      setArchivo({ nombre: f.name, hojas: await leerArchivo(f) })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function importar(a: Analisis) {
    setError('')
    setEnCurso(a)
    try {
      await guardarImportacion(a, (hechos, total) => setAvance({ hechos, total }))
      setListo({ nuevos: a.nuevos.length, actualizados: a.actualizar.length })
      setArchivo(null)
    } catch (err) {
      setError(`Se detuvo a la mitad: ${(err as Error).message}. Lo que ya se guardó saldrá como "sin cambios" si vuelves a subir el archivo.`)
    } finally {
      setAvance(null)
      setEnCurso(null)
    }
  }

  const a = enCurso ?? (typeof analisis === 'object' ? analisis : null)
  const total = a ? a.nuevos.length + a.actualizar.length : 0

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold">Importar desde Excel</h1>
        <p className="text-sm text-slate-500">Da de alta muchos instrumentos de una vez, o corrige datos de los que ya existen.</p>
      </div>

      <section className="tarjeta space-y-3">
        <h2 className="font-semibold">1. Prepara tu archivo</h2>
        <p className="text-sm text-slate-600">
          Usa la plantilla: una fila por instrumento. Solo el tag, el servicio y el área son obligatorios. También sirve el Excel que
          sale de <b>Exportar › Listado de instrumentos</b>: edítalo y vuelve a subirlo.
        </p>
        <button className="btn-secundario w-full" onClick={() => void descargarPlantilla().catch((e: Error) => setError(e.message))}>
          Descargar plantilla
        </button>
      </section>

      <section className="tarjeta space-y-3">
        <h2 className="font-semibold">2. Elige el archivo</h2>
        <button className="btn-primario w-full" onClick={() => input.current?.click()} disabled={!!avance}>
          {archivo ? 'Elegir otro archivo' : 'Elegir archivo (.xlsx o .csv)'}
        </button>
        <input
          ref={input}
          type="file"
          hidden
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void elegir(f)
            e.target.value = ''
          }}
        />
        {archivo && <p className="text-sm text-slate-600">Archivo: {archivo.nombre}</p>}
        {archivo && !instrumentos && <p className="text-sm text-slate-500">Cargando el catálogo para comparar…</p>}
      </section>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {typeof analisis === 'string' && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{analisis}</p>}

      {listo && (
        <section className="tarjeta space-y-3 border-emerald-300 bg-emerald-50">
          <p className="font-semibold text-emerald-800">
            Listo: {plural(listo.nuevos, 'instrumento nuevo', 'instrumentos nuevos')} y {plural(listo.actualizados, 'actualizado', 'actualizados')}.
          </p>
          <p className="text-sm text-emerald-900">Ahora puedes grabarles el tag NFC y tomarles fotos desde la ficha de cada uno.</p>
          <Link to="/catalogo?filtro=sin-tag" className="btn-primario w-full">
            Ver instrumentos sin tag
          </Link>
        </section>
      )}

      {a && (
        <section className="tarjeta space-y-4">
          <h2 className="font-semibold">3. Revisa antes de importar</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-800">{plural(a.nuevos.length, 'nuevo', 'nuevos')}</span>
            {actualizar ? (
              <span className="rounded-full bg-sky-100 px-3 py-1 font-semibold text-sky-800">{plural(a.actualizar.length, 'se actualiza', 'se actualizan')}</span>
            ) : (
              <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{plural(a.existentesOmitidos, 'ya existía', 'ya existían')}</span>
            )}
            {a.sinCambios > 0 && <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{a.sinCambios} sin cambios</span>}
            {a.errores.length > 0 && (
              <span className="rounded-full bg-red-100 px-3 py-1 font-semibold text-red-800">{plural(a.errores.length, 'fila con error', 'filas con error')}</span>
            )}
          </div>

          <p className="text-xs text-slate-500">
            Hoja «{a.hoja}». Columnas reconocidas: {a.columnas.map((c) => c.titulo).join(', ')}.
            {a.ignoradas.length > 0 && ` Se ignoran: ${a.ignoradas.join(', ')}.`}
          </p>

          <fieldset className="space-y-2 text-sm">
            <legend className="etiqueta">Si un tag ya existe en la app</legend>
            <label className="flex items-start gap-2">
              <input type="radio" className="mt-1" checked={actualizar} onChange={() => setActualizar(true)} />
              <span>Actualizar sus datos con los del archivo (las celdas vacías no borran nada)</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" className="mt-1" checked={!actualizar} onChange={() => setActualizar(false)} />
              <span>Dejarlo como está</span>
            </label>
          </fieldset>

          {a.errores.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-red-800">Filas con error (no se importan)</h3>
              <ul className="max-h-60 space-y-1 overflow-auto rounded-lg bg-red-50 p-2 text-sm text-red-900">
                {a.errores.map((e) => (
                  <li key={e.fila}>
                    <b>Fila {e.fila}</b>
                    {e.tag && <span className="font-mono"> · {e.tag}</span>}: {e.mensaje}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-500">Corrígelas en Excel y vuelve a subir el archivo; lo que ya haya entrado saldrá como «sin cambios».</p>
            </div>
          )}

          {a.avisos.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
              {a.avisos.map((e) => (
                <li key={`${e.fila}-${e.mensaje}`}>
                  <b>Fila {e.fila}</b> · <span className="font-mono">{e.tag}</span>: {e.mensaje}
                </li>
              ))}
            </ul>
          )}

          {a.nuevos.length > 0 && (
            <details className="text-sm" open={a.nuevos.length <= 10}>
              <summary className="cursor-pointer font-semibold">Nuevos ({a.nuevos.length})</summary>
              <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-auto">
                {a.nuevos.map((n) => (
                  <li key={n.fila} className="py-1.5">
                    <span className="font-mono font-bold">{n.datos.tagISA}</span> {n.datos.servicio}
                    <span className="block text-xs text-slate-500">{n.datos.area}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {a.actualizar.length > 0 && (
            <details className="text-sm" open={a.actualizar.length <= 10}>
              <summary className="cursor-pointer font-semibold">Se actualizan ({a.actualizar.length})</summary>
              <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-auto">
                {a.actualizar.map((u) => (
                  <li key={u.fila} className="py-1.5">
                    <span className="font-mono font-bold">{u.tagISA}</span>
                    {Object.entries(u.cambios).map(([k, v]) => (
                      <span key={k} className="block text-xs text-slate-600">
                        {nombreCampo(k)}: {valorCorto(v)}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {!online && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Importar necesita señal.</p>}
          {avance && (
            <div className="space-y-1">
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-marca-600 transition-all" style={{ width: `${avance.total ? (avance.hechos / avance.total) * 100 : 0}%` }} />
              </div>
              <p className="text-sm text-slate-600">
                Guardando {avance.hechos} de {avance.total}…
              </p>
            </div>
          )}
          <button className="btn-primario w-full" disabled={total === 0 || !online || !!avance} onClick={() => void importar(a)}>
            {total === 0
              ? 'No hay nada que importar'
              : `Importar ${[a.nuevos.length && plural(a.nuevos.length, 'nuevo', 'nuevos'), a.actualizar.length && `actualizar ${a.actualizar.length}`].filter(Boolean).join(' y ')}`}
          </button>
        </section>
      )}
    </div>
  )
}
