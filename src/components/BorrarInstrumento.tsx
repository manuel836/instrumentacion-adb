import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useOnline } from '../hooks/useOnline'
import { borrarInstrumento, useFotosUbicacion, type ConPendiente } from '../lib/instrumentos'
import type { Calibracion, Falla, Instrumento } from '../types'
import { avisar } from './Listo'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/**
 * Zona de peligro de la ficha (solo admin): borra el instrumento con todo lo suyo.
 * Pide escribir el tag para que no se borre por un toque equivocado.
 */
export function BorrarInstrumento({
  inst,
  fallas,
  calibraciones,
}: {
  inst: Instrumento
  fallas: ConPendiente<Falla>[]
  calibraciones: Calibracion[] | null
}) {
  const online = useOnline()
  const navigate = useNavigate()
  const fotos = useFotosUbicacion(inst.id)
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [borrando, setBorrando] = useState(false)
  const [error, setError] = useState('')

  const coincide = texto.trim().toUpperCase() === inst.tagISA

  async function borrar() {
    setBorrando(true)
    setError('')
    try {
      await borrarInstrumento(inst.id)
      avisar(`${inst.tagISA} se borró.`)
      navigate('/catalogo', { replace: true })
    } catch (err) {
      const code = (err as { code?: string }).code
      setError(
        code === 'functions/internal' || code === 'functions/unavailable'
          ? 'No se pudo contactar al servidor. Revisa tu señal e intenta de nuevo.'
          : (err as Error).message,
      )
      setBorrando(false)
    }
  }

  if (!abierto) {
    return (
      <button className="btn-peligro w-full" onClick={() => setAbierto(true)}>
        Borrar instrumento
      </button>
    )
  }

  const lista = [
    plural(fotos.length, 'foto de ubicación', 'fotos de ubicación'),
    plural(calibraciones?.length ?? 0, 'calibración', 'calibraciones'),
    plural(fallas.length, 'falla con su chat', 'fallas con su chat'),
    plural(inst.docs.length, 'documento', 'documentos'),
  ]

  return (
    <section className="origin-top animate-desplegar space-y-3 rounded-xl border border-peligro-200 bg-peligro-50 p-4 text-sm text-peligro-900">
      <h2 className="font-semibold">¿Borrar {inst.tagISA} para siempre?</h2>
      <p>Se borrará la ficha junto con:</p>
      <ul className="list-disc pl-5">
        {lista.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      {inst.nfcToken && <p>Su tag NFC dejará de abrir la ficha. Podrás grabarlo de nuevo para otro instrumento.</p>}
      <p>
        No se puede deshacer. Si el instrumento solo se retiró de planta, mejor cámbiale el estado a <b>Fuera de servicio</b> en Editar.
      </p>
      <label className="block">
        <span className="mb-1 block font-medium">
          Para confirmar escribe <span className="font-mono">{inst.tagISA}</span>
        </span>
        <input
          className="campo font-mono uppercase"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          autoCapitalize="characters"
          aria-label="Escribe el tag para confirmar"
        />
      </label>
      {!online && <p className="font-medium">Borrar necesita señal.</p>}
      {error && <p className="rounded-lg bg-white p-3 text-peligro-700">{error}</p>}
      <div className="flex gap-2">
        <button
          className="btn-secundario flex-1"
          disabled={borrando}
          onClick={() => {
            setAbierto(false)
            setTexto('')
          }}
        >
          Cancelar
        </button>
        <button className="btn flex-1 bg-peligro-700 text-white" disabled={!coincide || !online || borrando} onClick={() => void borrar()}>
          {borrando ? 'Borrando…' : 'Sí, borrar'}
        </button>
      </div>
    </section>
  )
}
