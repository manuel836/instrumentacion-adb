// Aviso semanal de calibraciones: qué instrumentos ya vencieron y cuáles vencen pronto.
// Sin acceso a Firebase para poder probarlo solo.

export interface InstrumentoCal {
  tagISA: string
  area: string
  proxima: Date | null
}

export interface ResumenCal {
  vencidas: string[]
  porVencer: string[]
}

export interface AvisoCal {
  titulo: string
  cuerpo: string
  ruta: string
}

const DIA = 86_400_000
/** Igual que en la app: "pronto" es dentro de 30 días. */
export const DIAS_POR_VENCER = 30

/**
 * Medianoche de hoy en la planta (Ciudad de México, UTC-6 todo el año desde 2022),
 * para contar los días igual que el teléfono.
 */
export function inicioDelDia(ahora: Date): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(ahora)
  return new Date(`${ymd}T00:00:00-06:00`)
}

/** Fecha límite para buscar en Firestore: todo lo que vence antes de ella entra en el aviso. */
export function limitePorVencer(ahora: Date): Date {
  return new Date(inicioDelDia(ahora).getTime() + (DIAS_POR_VENCER + 1) * DIA)
}

/** Tags vencidos y por vencer de un área ('' = todas), ordenados por fecha. */
export function resumenCalibraciones(instrumentos: InstrumentoCal[], area: string, ahora: Date): ResumenCal {
  const hoy = inicioDelDia(ahora).getTime()
  const r: ResumenCal = { vencidas: [], porVencer: [] }
  const delArea = instrumentos
    .filter((i) => i.proxima && (!area || i.area === area))
    .sort((a, b) => a.proxima!.getTime() - b.proxima!.getTime() || a.tagISA.localeCompare(b.tagISA))
  for (const i of delArea) {
    // Días completos, igual que en la app (la fecha se guarda a mediodía).
    const dias = Math.floor((i.proxima!.getTime() - hoy) / DIA)
    if (dias < 0) r.vencidas.push(i.tagISA)
    else if (dias <= DIAS_POR_VENCER) r.porVencer.push(i.tagISA)
  }
  return r
}

/** "PT-101, FT-202, LT-300 y 4 más" */
function lista(tags: string[], max = 3): string {
  if (tags.length <= max) return tags.join(', ')
  return `${tags.slice(0, max).join(', ')} y ${tags.length - max} más`
}

const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Texto del push. Sin nada pendiente no hay aviso (null). */
export function avisoCalibraciones(r: ResumenCal, area: string): AvisoCal | null {
  if (r.vencidas.length === 0 && r.porVencer.length === 0) return null
  const partes: string[] = []
  if (r.vencidas.length) partes.push(`${cuantos(r.vencidas.length, 'vencida', 'vencidas')}: ${lista(r.vencidas)}.`)
  if (r.porVencer.length) partes.push(`${cuantos(r.porVencer.length, 'vence', 'vencen')} en 30 días: ${lista(r.porVencer)}.`)
  // Lleva al catálogo ya filtrado; primero lo más urgente.
  const q = new URLSearchParams({ ...(area ? { area } : {}), filtro: r.vencidas.length ? 'vencidas' : 'por-vencer' })
  return {
    titulo: `Calibraciones${area ? ` · ${area}` : ''}`,
    cuerpo: partes.join(' '),
    ruta: `/catalogo?${q}`,
  }
}
