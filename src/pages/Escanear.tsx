import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { escanearUrl, nfcDisponible } from '../lib/nfc'
import { tokenDeUrl } from '../lib/token'
import { Icono } from '../components/Icono'
import { OndasNfc, PalomitaNfc, vibrar } from '../components/Nfc'

export function Escanear() {
  const navigate = useNavigate()
  const [leyendo, setLeyendo] = useState(false)
  const [leido, setLeido] = useState(false)
  const [error, setError] = useState('')
  const abortar = useRef<AbortController | null>(null)

  useEffect(() => () => abortar.current?.abort(), [])

  async function escanear() {
    setError('')
    setLeyendo(true)
    abortar.current = new AbortController()
    try {
      const url = await escanearUrl(abortar.current.signal)
      const token = tokenDeUrl(url)
      if (!token) throw new Error('Este tag no pertenece a la app de instrumentación.')
      abortar.current.abort()
      // Vibra y se ve la palomita un instante antes de abrir la ficha.
      vibrar()
      setLeido(true)
      await new Promise((r) => setTimeout(r, 500))
      navigate(`/t/${token}`)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message)
    } finally {
      setLeyendo(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 p-8 text-center">
      {!nfcDisponible() ? (
        <p className="rounded-lg bg-slate-100 p-4">
          Este navegador no lee tags NFC. Usa Chrome en Android, o acerca el teléfono al tag con la app cerrada.
        </p>
      ) : leido ? (
        <>
          <PalomitaNfc />
          <p className="text-lg font-medium">Tag leído</p>
        </>
      ) : leyendo ? (
        <>
          <OndasNfc />
          <p className="text-lg font-medium">Acerca el tag del instrumento…</p>
          <button className="btn-secundario" onClick={() => abortar.current?.abort()}>
            Cancelar
          </button>
        </>
      ) : (
        <>
          <p className="text-slate-600">Lee el tag NFC de un instrumento para abrir su ficha. Funciona sin señal.</p>
          <div className="grid size-44 place-items-center">
            <button className="btn-primario size-32 flex-col gap-1 rounded-full text-lg shadow-md" onClick={() => void escanear()}>
              <Icono nombre="escanear" className="size-9" />
              Escanear
            </button>
          </div>
        </>
      )}
      {error && <p className="rounded-lg bg-peligro-50 p-3 text-sm text-peligro-700">{error}</p>}
    </div>
  )
}
