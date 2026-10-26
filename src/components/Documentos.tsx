import { useRef, useState, type RefObject } from 'react'
import { MAX_BYTES_DOCUMENTO } from '../config'
import { adjuntarDocumentos, quitarDocumento } from '../lib/instrumentos'
import type { Instrumento } from '../types'
import { Icono, type NombreIcono } from './Icono'

/** Sin image/*: así el teléfono abre sus archivos (Descargas, Drive…) y no la galería. */
const ACEPTA_ARCHIVO = [
  'application/pdf',
  '.pdf',
  'application/msword',
  '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.docx',
  'application/vnd.ms-excel',
  '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xlsx',
].join(',')

/** La cámara le pone a la foto un nombre como "1730000000000.jpg": se le da uno que se entienda. */
function nombrarFoto(f: File): File {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const ext = f.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '.jpg'
  const nombre = `Foto ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}${ext}`
  return new File([f], nombre, { type: f.type || 'image/jpeg', lastModified: f.lastModified })
}

/** Hojas de datos, manuales y fotos de placas: con la cámara, de la galería o de los archivos del teléfono. */
export function Documentos({ inst, editable }: { inst: Instrumento; editable: boolean }) {
  const camara = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)
  const archivo = useRef<HTMLInputElement>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  function agregar(lista: FileList | null, deCamara: boolean) {
    const todos = Array.from(lista ?? [])
    const grandes = todos.filter((f) => f.size >= MAX_BYTES_DOCUMENTO)
    const buenos = todos.filter((f) => f.size < MAX_BYTES_DOCUMENTO).map((f) => (deCamara ? nombrarFoto(f) : f))
    setAviso(grandes.length ? `No se agregó ${grandes.map((f) => `“${f.name}”`).join(', ')}: pesa 25 MB o más.` : null)
    if (buenos.length) void adjuntarDocumentos(inst, buenos)
  }

  const entrada = (ref: RefObject<HTMLInputElement | null>, props: { accept: string; capture?: 'environment'; multiple?: boolean }) => (
    <input
      ref={ref}
      type="file"
      hidden
      {...props}
      onChange={(e) => {
        agregar(e.target.files, props.capture !== undefined)
        e.target.value = ''
      }}
    />
  )

  const opciones: { nombre: string; icono: NombreIcono; ref: RefObject<HTMLInputElement | null> }[] = [
    { nombre: 'Tomar foto', icono: 'camara', ref: camara },
    { nombre: 'Galería', icono: 'imagen', ref: galeria },
    { nombre: 'Documento', icono: 'documento', ref: archivo },
  ]

  return (
    <section className="tarjeta space-y-2">
      <h2 className="font-semibold">Documentos</h2>
      {inst.docs.length === 0 && <p className="text-sm text-slate-500">Sin hojas de datos, manuales ni fotos de placa.</p>}
      {inst.docs.map((d) => (
        <div key={d.ruta} className="flex items-center justify-between gap-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <Icono nombre={d.tipo.startsWith('image/') ? 'imagen' : 'documento'} className="size-4 text-slate-500" />
            {d.url ? (
              <a href={d.url} target="_blank" rel="noreferrer" className="truncate text-marca-700 underline">
                {d.nombre}
              </a>
            ) : (
              <span className="truncate text-slate-500">{d.nombre} (por subir)</span>
            )}
          </span>
          {editable && (
            <button className="shrink-0 text-red-700" onClick={() => quitarDocumento(inst, d.ruta)}>
              Quitar
            </button>
          )}
        </div>
      ))}
      {editable && (
        <>
          <p className="pt-2 text-sm font-medium text-slate-600">Agregar</p>
          <div className="grid grid-cols-3 gap-2">
            {opciones.map((o) => (
              <button
                key={o.nombre}
                type="button"
                className="flex flex-col items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-3 text-sm font-semibold text-slate-800 active:bg-slate-50"
                onClick={() => o.ref.current?.click()}
              >
                <Icono nombre={o.icono} className="size-6 text-marca-700" />
                {o.nombre}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">Documento: PDF, Word o Excel guardado en el teléfono. Hasta 25 MB cada uno.</p>
          {entrada(camara, { accept: 'image/*', capture: 'environment' })}
          {entrada(galeria, { accept: 'image/*', multiple: true })}
          {entrada(archivo, { accept: ACEPTA_ARCHIVO, multiple: true })}
          {aviso && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{aviso}</p>}
        </>
      )}
    </section>
  )
}
