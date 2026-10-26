// Opciones fijas del formulario de instrumento: unidades de ingeniería y alimentación.

/** Unidades más usadas en planta, por variable. Con "Otra" se puede escribir cualquiera. */
export const UNIDADES = [
  { grupo: 'Presión', unidades: ['kg/cm²', 'psi', 'bar', 'kPa', 'MPa', 'inH₂O', 'mmH₂O', 'mmHg'] },
  { grupo: 'Temperatura', unidades: ['°C', '°F'] },
  { grupo: 'Nivel y posición', unidades: ['%', 'm', 'cm', 'mm', 'in'] },
  { grupo: 'Flujo', unidades: ['m³/h', 'L/min', 'L/s', 'GPM', 'kg/h', 't/h', 'lb/h', 'Nm³/h', 'SCFM'] },
  { grupo: 'Análisis', unidades: ['pH', 'µS/cm', 'mS/cm', 'ppm', 'ppb', 'mg/L', 'NTU'] },
  { grupo: 'Eléctricas y otras', unidades: ['mA', 'V', 'mV', 'A', 'Hz', 'rpm', 'mm/s'] },
] as const

/** Sin mayúsculas ni espacios, y con ² ³ ° µ escritos como sea ("kg/cm2", "uS/cm", "ºC"). */
const clave = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[²₂]/g, '2')
    .replace(/³/g, '3')
    .replace(/[°º]/g, '')
    .replace(/[µμ]/g, 'u')

/** Otras formas comunes de escribir la misma unidad. */
const ALIAS: Record<string, string> = {
  'kgf/cm2': 'kg/cm²',
  'ton/h': 't/h',
  tph: 't/h',
  lpm: 'L/min',
  'm3/hr': 'm³/h',
  inwc: 'inH₂O',
  mmwc: 'mmH₂O',
}

const POR_CLAVE = new Map<string, string>([
  ...UNIDADES.flatMap((g) => g.unidades.map((u): [string, string] => [clave(u), u])),
  ...Object.entries(ALIAS).map(([k, u]): [string, string] => [clave(k), u]),
])

/** La unidad de la lista que corresponde a lo escrito ("kg/cm2" → "kg/cm²"), o null si no está. */
export function unidadConocida(v: string): string | null {
  return POR_CLAVE.get(clave(v)) ?? null
}

/** En planta solo se usan estas dos. */
export const ALIMENTACIONES = [
  { valor: '24 VCD', texto: '24 VCD · corriente directa' },
  { valor: '120 VCA', texto: '120 VCA · corriente alterna' },
] as const

const DIRECTA = new Set(['vcd', 'vdc', 'cd', 'dc', 'directa', 'continua', 'lazo', 'loop'])
const ALTERNA = new Set(['vca', 'vac', 'ca', 'ac', 'alterna'])

/** "24 VDC lazo" → "24 VCD", "127 V" → "120 VCA"; null si no es ninguna de las dos. */
export function alimentacionConocida(v: string): string | null {
  const t =
    v
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .match(/\d+|[a-z]+/g) ?? []
  const directa = t.some((x) => DIRECTA.has(x))
  const alterna = t.some((x) => ALTERNA.has(x))
  const numeros = t.filter((x) => /^\d/.test(x))
  const solo = (permitidos: string[]) => numeros.every((n) => permitidos.includes(n))
  if (directa && alterna) return null
  if (!alterna && solo(['24']) && (directa || numeros.length > 0)) return '24 VCD'
  if (!directa && solo(['110', '115', '120', '127']) && (alterna || numeros.length > 0)) return '120 VCA'
  return null
}
