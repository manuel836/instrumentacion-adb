/** Una barra gris que late suave mientras llegan los datos. */
function Barra({ className }: { className: string }) {
  return <span className={`block animate-silueta rounded-md bg-slate-200 ${className}`} />
}

function Renglones({ n }: { n: number }) {
  return (
    <ul className="divide-y divide-slate-100">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="space-y-2 py-3">
          <span className="flex items-center gap-2">
            <Barra className="h-5 w-20" />
            <Barra className="h-5 w-16 rounded-full" />
          </span>
          <Barra className={`h-4 ${i % 2 ? 'w-4/5' : 'w-full'}`} />
          <Barra className="h-3 w-2/5" />
        </li>
      ))}
    </ul>
  )
}

type Forma = 'pantalla' | 'ficha' | 'lista' | 'catalogo' | 'chat' | 'inicio'

/**
 * Mientras carga: siluetas grises con la forma de lo que viene, en lugar de "Cargando…".
 * Esperan un instante antes de verse: si los datos ya están en el teléfono, ni aparecen.
 * Las de "pantalla" y "ficha" traen su propio margen; las demás van dentro del de su lugar.
 */
export function Silueta({ forma = 'pantalla' }: { forma?: Forma }) {
  return (
    <div role="status" className="animate-aparecer-tarde">
      <span className="sr-only">Cargando…</span>
      {forma === 'ficha' ? (
        <div className="space-y-3 p-3" aria-hidden="true">
          <div className="tarjeta space-y-2.5">
            <span className="flex justify-between">
              <Barra className="h-7 w-28" />
              <Barra className="h-6 w-20 rounded-full" />
            </span>
            <Barra className="h-5 w-3/4" />
            <Barra className="h-4 w-1/2" />
            <Barra className="h-4 w-2/5" />
            <Barra className="mt-4 h-11 w-full rounded-lg" />
          </div>
          <div className="tarjeta space-y-3">
            <Barra className="h-5 w-40" />
            <Barra className="aspect-[4/3] w-full rounded-lg" />
          </div>
        </div>
      ) : forma === 'lista' ? (
        <div aria-hidden="true">
          <Renglones n={6} />
        </div>
      ) : forma === 'catalogo' ? (
        <ul className="divide-y divide-slate-100 bg-white" aria-hidden="true">
          {Array.from({ length: 7 }, (_, i) => (
            <li key={i} className="flex min-h-19 items-center gap-3 px-3 py-2">
              <Barra className="size-14 shrink-0 rounded-lg" />
              <span className="flex-1 space-y-2">
                <Barra className="h-5 w-24" />
                <Barra className={`h-4 ${i % 2 ? 'w-3/5' : 'w-4/5'}`} />
                <Barra className="h-3 w-2/5" />
              </span>
            </li>
          ))}
        </ul>
      ) : forma === 'chat' ? (
        <div className="space-y-2" aria-hidden="true">
          <Barra className="h-12 w-2/3 rounded-2xl" />
          <Barra className="ml-auto h-10 w-1/2 rounded-2xl" />
          <Barra className="h-16 w-3/5 rounded-2xl" />
        </div>
      ) : forma === 'inicio' ? (
        <div className="space-y-3" aria-hidden="true">
          {[3, 3, 2].map((n, i) => (
            <div key={i} className="tarjeta space-y-3">
              <Barra className="h-5 w-32" />
              <span className={`grid gap-2 ${n === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {Array.from({ length: n }, (_, j) => (
                  <Barra key={j} className="h-16" />
                ))}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3 p-3" aria-hidden="true">
          <div className="tarjeta space-y-2.5">
            <Barra className="h-6 w-1/2" />
            <Barra className="h-4 w-full" />
            <Barra className="h-4 w-4/5" />
            <Barra className="h-4 w-3/5" />
          </div>
          <div className="tarjeta">
            <Renglones n={3} />
          </div>
        </div>
      )}
    </div>
  )
}
