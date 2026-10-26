import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { MAX_FOTOS_UBICACION, PUBLIC_ORIGIN, TOKEN_LENGTH } from '../config'
import { useAuth } from '../auth/AuthContext'
import { agregarFotosUbicacion, asignarToken, instrumentoPorToken, quitarToken, useFotosUbicacion, useInstrumento } from '../lib/instrumentos'
import { grabarUrl, leerYGrabar, nfcDisponible, type Revision } from '../lib/nfc'
import { bytesNdef, generarToken, tokenDeUrl, urlDeTag } from '../lib/token'
import { SelectorFotos, type FotoNueva } from '../components/SelectorFotos'

type EstadoNfc = 'inicio' | 'esperando' | 'conflicto' | 'grabado' | 'error'
type Conflicto = Extract<Revision, { grabar: false }>

export function Vincular() {
  const { id } = useParams()
  const inst = useInstrumento(id)
  const fotosExistentes = useFotosUbicacion(id)
  const { user } = useAuth()
  const navigate = useNavigate()

  // Un token nuevo por visita: regrabar deja inválido el token anterior.
  const token = useMemo(() => generarToken(TOKEN_LENGTH), [])
  const url = urlDeTag(PUBLIC_ORIGIN, token)
  const [estado, setEstado] = useState<EstadoNfc>('inicio')
  const [error, setError] = useState('')
  const [conflicto, setConflicto] = useState<Conflicto | null>(null)
  const abortar = useRef<AbortController | null>(null)

  const [fotos, setFotos] = useState<FotoNueva[]>([])
  const [portada, setPortada] = useState(0)
  const [guardando, setGuardando] = useState(false)

  if (inst === undefined) return <p className="p-6 text-slate-500">Cargando…</p>
  if (inst === null) return <p className="p-6 text-slate-500">Este instrumento no existe.</p>

  /** Antes de grabar se lee lo que trae el tag, para no quitarle el tag a otro instrumento sin aviso. */
  async function revisar(anterior: string | null): Promise<Revision> {
    if (!inst || !anterior) return { grabar: true }
    const tokenAnterior = tokenDeUrl(anterior)
    if (!tokenAnterior) {
      // Trae una dirección de otra cosa (no de esta app).
      return /^https?:\/\//.test(anterior)
        ? { grabar: false, motivo: `Este tag ya tiene otra información grabada (${anterior}).` }
        : { grabar: true }
    }
    if (tokenAnterior === inst.nfcToken) return { grabar: true }
    const otro = await instrumentoPorToken(tokenAnterior).catch(() => null)
    if (!otro || otro.id === inst.id) return { grabar: true }
    return {
      grabar: false,
      motivo: `Este tag ya pertenece a ${otro.tagISA} (${otro.servicio}).`,
      otroId: otro.id,
      otroTag: otro.tagISA,
    }
  }

  async function grabar(forzar = false) {
    if (!inst) return
    setError('')
    setEstado('esperando')
    abortar.current = new AbortController()
    try {
      if (forzar) {
        await grabarUrl(url, abortar.current.signal)
        if (conflicto?.otroId) quitarToken(conflicto.otroId)
      } else {
        const r = await leerYGrabar(url, abortar.current.signal, revisar)
        if (!r.grabar) {
          abortar.current.abort()
          setConflicto(r)
          setEstado('conflicto')
          return
        }
      }
      abortar.current.abort()
      asignarToken(inst.id, token)
      setEstado('grabado')
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setEstado('inicio')
        return
      }
      setEstado('error')
      setError(
        (err as Error).name === 'NotAllowedError'
          ? 'Chrome no tiene permiso de NFC. Actívalo en la configuración del sitio y vuelve a intentar.'
          : `No se pudo grabar: ${(err as Error).message}`,
      )
    }
  }

  async function guardarFotos() {
    if (!inst) return
    setGuardando(true)
    try {
      // La portada elegida va primero para que quede marcada como tal.
      const ordenadas = [fotos[portada], ...fotos.filter((_, i) => i !== portada)]
      await agregarFotosUbicacion(inst.id, ordenadas, user?.displayName || user?.email || '', 0, false)
      navigate(`/instrumentos/${inst.id}`, { replace: true })
    } finally {
      setGuardando(false)
    }
  }

  const necesitaFotos = fotosExistentes.length === 0

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold">
        Tag NFC de <span className="font-mono">{inst.tagISA}</span>
      </h1>

      <section className="tarjeta space-y-3">
        <h2 className="font-semibold">1. Grabar el tag (opcional)</h2>
        {inst.nfcToken && estado !== 'grabado' && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Este instrumento ya tiene un tag. Si grabas uno nuevo, el anterior deja de funcionar.
          </p>
        )}
        {!nfcDisponible() ? (
          <p className="rounded-lg bg-slate-100 p-3 text-sm">
            Este navegador no puede grabar tags. Usa Chrome en un teléfono Android con NFC activado.
          </p>
        ) : estado === 'grabado' ? (
          <p className="rounded-lg bg-emerald-50 p-3 font-medium text-emerald-800">✓ Tag grabado y vinculado.</p>
        ) : estado === 'conflicto' && conflicto ? (
          <div className="space-y-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">No se grabó.</p>
            <p>{conflicto.motivo}</p>
            {conflicto.otroTag ? (
              <p>
                Si lo grabas para <b>{inst.tagISA}</b>, <b>{conflicto.otroTag}</b> se quedará sin tag y habrá que ponerle uno nuevo.
              </p>
            ) : (
              <p>Si lo grabas, esa información se borra.</p>
            )}
            <div className="flex gap-2">
              <button
                className="btn-secundario flex-1"
                onClick={() => {
                  setConflicto(null)
                  setEstado('inicio')
                }}
              >
                Usar otro tag
              </button>
              <button className="btn-primario flex-1" onClick={() => void grabar(true)}>
                {conflicto.otroTag ? `Pasarlo a ${inst.tagISA}` : 'Grabar de todos modos'}
              </button>
            </div>
          </div>
        ) : estado === 'esperando' ? (
          <div className="space-y-3 text-center">
            <div className="mx-auto h-20 w-20 animate-pulse rounded-full bg-marca-100" />
            <p className="font-medium">
              {conflicto ? 'Acerca otra vez el mismo tag…' : 'Acerca el tag a la parte trasera del teléfono…'}
            </p>
            <button className="btn-secundario" onClick={() => abortar.current?.abort()}>
              Cancelar
            </button>
          </div>
        ) : (
          <button className="btn-primario w-full" onClick={() => void grabar()}>
            Grabar tag
          </button>
        )}
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <p className="break-all text-xs text-slate-400">
          {url} · {bytesNdef(url)} de 144 bytes
        </p>
      </section>

      <section className="tarjeta space-y-3">
        <h2 className="font-semibold">2. Fotos de ubicación (opcional)</h2>
        {necesitaFotos ? (
          <>
            <p className="text-sm text-slate-600">
              De 1 a {MAX_FOTOS_UBICACION} fotos: una toma general (equipo, nivel, columna) y una de cerca. Agrega un pie
              para que cualquiera lo encuentre, por ejemplo “Nivel 2, lado norte de la caldera B”.
            </p>
            <SelectorFotos fotos={fotos} onChange={setFotos} max={MAX_FOTOS_UBICACION} portada={portada} onPortada={setPortada} />
            {fotos.length > 0 ? (
              <button className="btn-primario w-full" disabled={guardando} onClick={() => void guardarFotos()}>
                {guardando ? 'Procesando fotos…' : 'Guardar y terminar'}
              </button>
            ) : (
              <Link to={`/instrumentos/${inst.id}`} replace className="btn-secundario w-full">
                Terminar sin fotos
              </Link>
            )}
            <p className="text-xs text-slate-500">Puedes grabar el tag y agregar fotos después desde la ficha.</p>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              Ya tiene {fotosExistentes.length} {fotosExistentes.length === 1 ? 'foto' : 'fotos'}. Puedes cambiarlas desde la ficha.
            </p>
            <Link to={`/instrumentos/${inst.id}`} className="btn-primario w-full">
              Ir a la ficha
            </Link>
          </>
        )}
      </section>
    </div>
  )
}
