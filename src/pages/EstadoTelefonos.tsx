import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, type Timestamp } from 'firebase/firestore'
import { db } from '../firebase'
import type { EstadoTelefono } from '../lib/telefono'
import { textoVersion, VERSION } from '../lib/version'
import { Silueta } from '../components/Silueta'

interface Telefono extends EstadoTelefono {
  id: string
  actualizado: Timestamp | null
}

const HORA = 3_600_000

function haceCuanto(ms: number): string {
  const min = Math.round((Date.now() - ms) / 60_000)
  if (min < 2) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `hace ${h} h`
  return `hace ${Math.round(h / 24)} días`
}

const fechaHora = (ms: number) => new Date(ms).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

function plural(n: number, una: string, varias: string) {
  return `${n} ${n === 1 ? una : varias}`
}

/** Lo que el admin tiene que atender en ese teléfono, de lo más grave a lo menos. */
function avisos(t: Telefono) {
  const lista: { texto: string; tono: 'peligro' | 'aviso' }[] = []
  if (t.rechazos > 0) lista.push({ texto: `${plural(t.rechazos, 'registro rechazado', 'registros rechazados')} por el servidor`, tono: 'peligro' })
  if (t.detenidas > 0) lista.push({ texto: `${plural(t.detenidas, 'archivo detenido', 'archivos detenidos')} (no se pudo subir)`, tono: 'peligro' })
  const porEnviar = t.sinConfirmar + t.subidas
  if (porEnviar > 0) lista.push({ texto: `${plural(porEnviar, 'cosa', 'cosas')} por enviar`, tono: 'aviso' })
  if (t.version < VERSION) lista.push({ texto: `Versión vieja de la app (${textoVersion(t.version)})`, tono: 'aviso' })
  // Solo importa mientras tenga algo guardado sin enviar.
  if (!t.almacenamientoProtegido && porEnviar + t.detenidas > 0) {
    lista.push({ texto: 'El teléfono puede borrar lo pendiente si se le llena la memoria', tono: 'aviso' })
  }
  return lista
}

/** Menú > Estado de los teléfonos (solo admin): qué tiene cada uno sin enviar, su versión y sus errores. */
export function EstadoTelefonos() {
  const [lista, setLista] = useState<Telefono[] | null>(null)
  const [nombres, setNombres] = useState<Map<string, string> | null>(null)
  const [quitar, setQuitar] = useState<string | null>(null)

  useEffect(
    () =>
      onSnapshot(collection(db, 'telefonos'), (s) =>
        setLista(
          s.docs.map((d) => {
            const t = d.data({ serverTimestamps: 'estimate' }) as Omit<Telefono, 'id'>
            return { ...t, errores: t.errores ?? [], id: d.id }
          }),
        ),
      ),
    [],
  )
  // Con la lista de usuarios se ven los nombres actuales y se ocultan los de cuentas eliminadas.
  useEffect(
    () => onSnapshot(collection(db, 'usuarios'), (s) => setNombres(new Map(s.docs.map((d) => [d.id, String(d.get('nombre') ?? d.get('email') ?? '')])))),
    [],
  )

  if (!lista || !nombres) return <Silueta />

  const visibles = lista
    .filter((t) => nombres.has(t.uid))
    .map((t) => ({ t, avisos: avisos(t), visto: t.actualizado?.toMillis() ?? 0 }))
    .sort((a, b) => Number(b.avisos.length > 0 || b.t.errores.length > 0) - Number(a.avisos.length > 0 || a.t.errores.length > 0) || b.visto - a.visto)

  return (
    <div className="space-y-3 p-4">
      <div>
        <h1 className="text-xl font-bold">Estado de los teléfonos</h1>
        <p className="text-sm text-slate-600">
          Lo que cada teléfono contó la última vez que tuvo señal con la app abierta. Primero los que tienen algo pendiente o algún error.
        </p>
      </div>
      {visibles.length === 0 && <p className="text-slate-500">Aún no se reporta ningún teléfono. Aparecen en cuanto cada persona abre la app con señal.</p>}
      <ul className="space-y-3">
        {visibles.map(({ t, avisos: lista, visto }) => (
          <li key={t.id} className="tarjeta space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">{nombres.get(t.uid) || t.nombre}</p>
                <p className="text-sm text-slate-500">
                  {t.dispositivo}
                  {t.instalada ? ' · instalada' : ' · en el navegador'}
                </p>
              </div>
              <p className={`shrink-0 text-right text-sm ${visto && Date.now() - visto > 48 * HORA ? 'font-semibold text-aviso-800' : 'text-slate-500'}`}>
                {visto ? haceCuanto(visto) : 'sin dato'}
              </p>
            </div>
            {lista.length === 0 && t.errores.length === 0 ? (
              <p className="text-sm font-medium text-bien-700">Todo enviado, versión al día y sin errores.</p>
            ) : (
              <ul className="space-y-1">
                {lista.map((a) => (
                  <li
                    key={a.texto}
                    className={`rounded-lg px-2.5 py-1.5 text-sm font-medium ${a.tono === 'peligro' ? 'bg-peligro-50 text-peligro-800' : 'bg-aviso-50 text-aviso-900'}`}
                  >
                    {a.texto}
                  </li>
                ))}
              </ul>
            )}
            {t.errores.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-slate-700">{plural(t.errores.length, 'error reciente', 'errores recientes')}</summary>
                <ul className="mt-2 space-y-2">
                  {t.errores.map((e) => (
                    <li key={`${e.fecha}${e.mensaje}`} className="rounded-lg bg-slate-50 p-2">
                      <p className="text-xs text-slate-500">
                        {fechaHora(e.fecha)} · {e.donde}
                      </p>
                      <p className="font-mono text-xs break-words text-slate-800">{e.mensaje}</p>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="flex justify-end">
              {quitar === t.id ? (
                <button className="btn-peligro text-sm" onClick={() => void deleteDoc(doc(db, 'telefonos', t.id)).then(() => setQuitar(null))}>
                  Sí, quitar de la lista
                </button>
              ) : (
                <button className="text-sm text-slate-500 underline" onClick={() => setQuitar(t.id)}>
                  Quitar (ya no usa este teléfono)
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
