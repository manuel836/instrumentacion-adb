import { useState } from 'react'
import { UNIDADES, unidadConocida } from '../lib/unidades'

const OTRA = '__otra'

/** Lista de unidades comunes; con "Otra" aparece un campo para escribirla. */
export function SelectorUnidades({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const conocida = unidadConocida(value)
  const [escribir, setEscribir] = useState(false)
  const otra = escribir || (value.trim() !== '' && !conocida)

  return (
    <>
      <select
        className="campo"
        aria-label="Unidades"
        value={otra ? OTRA : (conocida ?? '')}
        onChange={(e) => {
          const v = e.target.value
          setEscribir(v === OTRA)
          // Al pasar a "Otra" desde una de la lista, el campo empieza vacío para escribir la nueva.
          if (v === OTRA) onChange(conocida ? '' : value)
          else onChange(v)
        }}
      >
        <option value="">Sin unidades</option>
        {UNIDADES.map((g) => (
          <optgroup key={g.grupo} label={g.grupo}>
            {g.unidades.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </optgroup>
        ))}
        <option value={OTRA}>Otra (escribirla)</option>
      </select>
      {otra && (
        <input
          className="campo mt-2"
          aria-label="Otra unidad"
          placeholder="Escribe la unidad"
          maxLength={20}
          autoFocus={escribir}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </>
  )
}
