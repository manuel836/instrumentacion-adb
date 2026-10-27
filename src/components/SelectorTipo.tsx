import { TIPOS, TIPOS_INSTRUMENTO } from '../lib/tipos'

/** Lista de tipos de instrumento, agrupada. Vacío = sin tipo (calibración general). */
export function SelectorTipo({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <select id={id} className="campo" aria-label="Tipo de instrumento" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Sin tipo (calibración general)</option>
      {TIPOS_INSTRUMENTO.map((g) => (
        <optgroup key={g.grupo} label={g.grupo}>
          {g.tipos.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.texto ?? t.valor}
            </option>
          ))}
        </optgroup>
      ))}
      {/* Un tipo que ya no está en la lista se sigue viendo para no perderlo al guardar. */}
      {value && !TIPOS.includes(value) && <option value={value}>{value} (anterior)</option>}
    </select>
  )
}
