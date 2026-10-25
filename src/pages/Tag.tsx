import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../auth/AuthContext'
import { buscarPorToken } from '../lib/instrumentos'
import type { Publico } from '../types'
import { Estado } from '../components/Estado'
import { FotoImg } from '../components/FotoImg'
import { Visor } from '../components/Visor'
import { ordenarConPortada } from '../components/Galeria'

/** Destino de la URL grabada en el tag: ficha completa con sesión, vista de invitado sin ella. */
export function Tag() {
  const { token = '' } = useParams()
  const { user, rol, cargando } = useAuth()
  const [destino, setDestino] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (cargando || !user || !rol) return
    buscarPorToken(token)
      .then(setDestino)
      .catch(() => setDestino(null))
  }, [token, user, rol, cargando])

  if (cargando) return null
  if (!user || !rol) return <VistaInvitado token={token} />
  if (destino === undefined) return <p className="p-6 text-slate-500">Buscando instrumento…</p>
  if (destino === null) return <TagDesconocido />
  return <Navigate to={`/instrumentos/${destino}`} replace />
}

function TagDesconocido() {
  return (
    <div className="p-8 text-center">
      <p className="text-lg font-semibold">Este tag no está vinculado</p>
      <p className="mt-2 text-slate-500">Puede que el instrumento se haya reasignado a un tag nuevo.</p>
    </div>
  )
}

function VistaInvitado({ token }: { token: string }) {
  const [pub, setPub] = useState<Publico | null | undefined>(undefined)
  const [visor, setVisor] = useState<number | null>(null)

  useEffect(() => {
    getDoc(doc(db, 'publico', token))
      .then((s) => setPub(s.exists() ? (s.data() as Publico) : null))
      .catch(() => setPub(null))
  }, [token])

  if (pub === undefined) return <p className="p-6 text-center text-slate-500">Cargando…</p>
  if (pub === null) return <TagDesconocido />

  const fotos = ordenarConPortada(pub.fotosUbicacion.map((f, i) => ({ ...f, orden: i })))

  return (
    <div className="mx-auto min-h-dvh max-w-2xl space-y-3 p-3">
      <section className="tarjeta">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-mono text-2xl font-bold">{pub.tagISA}</h1>
            <p className="text-slate-700">{pub.servicio}</p>
            <p className="text-sm text-slate-500">{pub.area}</p>
          </div>
          <Estado estado={pub.estado} />
        </div>
        {pub.ubicacionTexto && <p className="mt-2 text-sm">📍 {pub.ubicacionTexto}</p>}
      </section>

      {fotos.length > 0 && (
        <section className="tarjeta space-y-3">
          <h2 className="font-semibold">Ubicación en campo</h2>
          <button className="block w-full overflow-hidden rounded-lg" onClick={() => setVisor(0)}>
            <FotoImg url={fotos[0].url ?? fotos[0].miniaturaUrl} alt={fotos[0].pie} className="aspect-[4/3] w-full object-cover" />
          </button>
          {fotos[0].pie && <p className="text-sm">{fotos[0].pie}</p>}
          {fotos.length > 1 && (
            <div className="grid grid-cols-5 gap-2">
              {fotos.slice(1).map((f, i) => (
                <button key={i} onClick={() => setVisor(i + 1)} className="overflow-hidden rounded">
                  <FotoImg url={f.miniaturaUrl} alt={f.pie} className="aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <p className="px-2 text-center text-xs text-slate-400">
        Vista pública de Instrumentación ADB. <a href="/login" className="underline">Entrar</a> para ver la ficha completa.
      </p>

      {visor !== null && <Visor fotos={fotos} inicio={visor} onCerrar={() => setVisor(null)} />}
    </div>
  )
}
