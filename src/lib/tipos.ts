// Tipos de instrumento: qué datos lleva su ficha y qué prueba pide su calibración.
// Sin Firebase para poder probarlo solo.

import type { Calibracion, EstadoRevision, Instrumento, ResultadoCalibracion, Revision } from '../types'

/** Qué prueba lleva la calibración de cada tipo. */
export type Prueba = 'general' | 'transmisor' | 'indicador' | 'interruptor' | 'carrera' | 'funcional' | 'analizador'

/** Tipos del menú, agrupados. `texto` es lo que se ve en la lista cuando no basta el nombre. */
export const TIPOS_INSTRUMENTO: { grupo: string; tipos: { valor: string; texto?: string }[] }[] = [
  {
    grupo: 'Transmisores',
    tipos: [
      { valor: 'Transmisor de presión' },
      { valor: 'Transmisor de presión diferencial' },
      { valor: 'Transmisor de temperatura' },
      { valor: 'Transmisor de nivel' },
      { valor: 'Transmisor de flujo' },
    ],
  },
  { grupo: 'Indicadores locales', tipos: [{ valor: 'Manómetro' }, { valor: 'Termómetro' }] },
  {
    grupo: 'Interruptores',
    tipos: [
      { valor: 'Interruptor de presión' },
      { valor: 'Interruptor de temperatura' },
      { valor: 'Interruptor de nivel' },
      { valor: 'Interruptor de flujo' },
    ],
  },
  {
    grupo: 'Válvulas',
    tipos: [
      { valor: 'Válvula de control', texto: 'Válvula de control (FCV, PCV, LCV, TCV)' },
      { valor: 'Válvula de corte', texto: 'Válvula de corte (KV, XV, on/off)' },
    ],
  },
  { grupo: 'Analizadores', tipos: [{ valor: 'Analizador', texto: 'Analizador (pH, conductividad, oxígeno…)' }] },
  { grupo: 'Otros', tipos: [{ valor: 'Otro', texto: 'Otro (calibración general)' }] },
]

export const TIPOS = TIPOS_INSTRUMENTO.flatMap((g) => g.tipos.map((t) => t.valor))

export function pruebaDe(tipo: string | null | undefined): Prueba {
  if (!tipo) return 'general'
  if (tipo.startsWith('Transmisor')) return 'transmisor'
  if (tipo === 'Manómetro' || tipo === 'Termómetro') return 'indicador'
  if (tipo.startsWith('Interruptor')) return 'interruptor'
  if (tipo === 'Válvula de control') return 'carrera'
  if (tipo === 'Válvula de corte') return 'funcional'
  if (tipo === 'Analizador') return 'analizador'
  return 'general'
}

const VARIABLE: Record<string, string> = { P: 'presión', PD: 'presión', T: 'temperatura', L: 'nivel', F: 'flujo' }

/**
 * El tipo que indican las letras del tag según ISA-5.1: PT-101 es transmisor de presión,
 * PSH-3 interruptor de presión, FCV-70 válvula de control, KV-12 válvula de corte.
 * null si las letras no dicen el tipo (FE, PIC, PSV…).
 */
export function tipoSugerido(tagISA: string): string | null {
  const letras = /^[A-Z]+/.exec(tagISA.trim().toUpperCase())?.[0] ?? ''
  if (/^(KV|XV|SDV|ESDV|BDV|UV)$/.test(letras)) return 'Válvula de corte'
  if (/^(PD|P|T|L|F)C?V$/.test(letras)) return 'Válvula de control'
  let m = /^(PD|P|T|L|F)S(H|L|HH|LL|HL)?$/.exec(letras)
  if (m) return `Interruptor de ${VARIABLE[m[1]]}`
  m = /^(PD|P|T|L|F|A)I?T$/.exec(letras)
  if (m) {
    if (m[1] === 'A') return 'Analizador'
    if (m[1] === 'PD') return 'Transmisor de presión diferencial'
    return `Transmisor de ${VARIABLE[m[1]]}`
  }
  if (/^(PD|P)[IG]$/.test(letras)) return 'Manómetro'
  if (/^T[IG]$/.test(letras)) return 'Termómetro'
  return null
}

/** El tipo escrito como sea ("valvula de corte", "PT") al de la lista; null si no se reconoce. */
export function tipoConocido(v: string): string | null {
  const k = clave(v)
  if (!k) return null
  const exacto = TIPOS.find((t) => clave(t) === k)
  if (exacto) return exacto
  // Solo las letras del tag: "PT", "KV", "PSH".
  const porLetras = /^[a-z]{1,5}$/.test(k) ? tipoSugerido(k) : null
  if (porLetras) return porLetras
  if (k.includes('onoff') || k.includes('corte') || k.includes('shutoff')) return 'Válvula de corte'
  return null
}

const clave = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

// ---------- Datos extra de la ficha según el tipo ----------

export const ACCIONES_VALVULA = [
  { valor: 'Aire para abrir', ayuda: 'Sin aire cierra (falla cerrada)' },
  { valor: 'Aire para cerrar', ayuda: 'Sin aire abre (falla abierta)' },
  { valor: 'Aire para abrir y cerrar', ayuda: 'Doble efecto, sin resorte' },
] as const

/** La válvula de doble efecto no tiene resorte: el aire la mueve para los dos lados. */
export const DOBLE_EFECTO = ACCIONES_VALVULA[2].valor

export const POSICIONADORES = ['Neumático', 'Electroneumático', 'Digital (HART)', 'Sin posicionador'] as const
export const FINALES_CARRERA = ['Abierta y cerrada', 'Solo abierta', 'Solo cerrada', 'Sin finales de carrera'] as const
export const SENSORES_TEMPERATURA = ['RTD Pt100', 'RTD Pt1000', 'Termopar J', 'Termopar K', 'Termopar T', 'Termopar E', 'Otro'] as const
export const DISPARA_AL = ['Al subir', 'Al bajar'] as const

/** Cómo va la salida de 4 a 20 mA con la variable. La de raíz cuadrada es la del flujo medido por presión diferencial. */
export const SALIDAS_TRANSMISOR = [
  { valor: 'Lineal', ayuda: 'Los mA suben parejo con la variable' },
  { valor: 'Raíz cuadrada', ayuda: 'Flujo por presión diferencial' },
] as const
export const RAIZ_CUADRADA = SALIDAS_TRANSMISOR[1].valor
export const CONTACTOS = [
  { valor: 'NA', texto: 'NA (normalmente abierto)' },
  { valor: 'NC', texto: 'NC (normalmente cerrado)' },
] as const

/** Campos de la ficha que solo tienen sentido en algunos tipos. */
export type CampoDeTipo =
  | 'accionValvula'
  | 'posicionador'
  | 'rangoResorte'
  | 'presionSuministro'
  | 'finalesCarrera'
  | 'sensor'
  | 'salidaTransmisor'
  | 'puntoAjuste'
  | 'disparaAl'
  | 'contacto'

const VACIOS: Record<CampoDeTipo, string | null> = {
  accionValvula: '',
  posicionador: '',
  rangoResorte: '',
  presionSuministro: '',
  finalesCarrera: '',
  sensor: '',
  salidaTransmisor: '',
  puntoAjuste: null,
  disparaAl: '',
  contacto: '',
}

export function camposDeTipo(tipo: string, accion = ''): CampoDeTipo[] {
  const p = pruebaDe(tipo)
  if (p === 'carrera') {
    // La de doble efecto no tiene resorte.
    return accion === DOBLE_EFECTO ? ['accionValvula', 'posicionador', 'presionSuministro'] : ['accionValvula', 'posicionador', 'rangoResorte', 'presionSuministro']
  }
  if (p === 'funcional') return ['accionValvula', 'finalesCarrera']
  if (p === 'interruptor') return ['puntoAjuste', 'disparaAl', 'contacto']
  if (tipo === 'Transmisor de temperatura') return ['sensor']
  // La de temperatura siempre es lineal; las demás pueden sacar la raíz (flujo por DP).
  if (p === 'transmisor') return ['salidaTransmisor']
  return []
}

/** Vacía los datos que no son de su tipo (por ejemplo, si una válvula pasó a ser transmisor). */
export function soloDatosDelTipo<T extends Pick<Instrumento, 'tipo' | CampoDeTipo>>(d: T): T {
  const propios = new Set(camposDeTipo(d.tipo, d.accionValvula))
  const limpio = { ...d }
  for (const k of Object.keys(VACIOS) as CampoDeTipo[]) {
    if (!propios.has(k)) (limpio as Record<string, unknown>)[k] = VACIOS[k]
  }
  return limpio
}

/** "Aire para abrir · sin aire cierra" para la ficha. */
export function textoAccion(accion: string): string {
  const a = ACCIONES_VALVULA.find((x) => x.valor === accion)
  return a ? `${a.valor} · ${a.ayuda.toLowerCase()}` : accion
}

/** Datos propios del tipo para mostrarlos en la ficha y la hoja de vida (solo los que tienen valor). */
export function datosDelTipo(i: Pick<Instrumento, 'tipo' | 'unidades' | CampoDeTipo>): { k: string; v: string }[] {
  const campos = camposDeTipo(i.tipo, i.accionValvula)
  const r: { k: string; v: string }[] = []
  const agregar = (k: string, v: string | number | null) => {
    if (v !== null && v !== '') r.push({ k, v: String(v) })
  }
  for (const c of campos) {
    if (c === 'accionValvula') agregar('Acción', i.accionValvula && textoAccion(i.accionValvula))
    if (c === 'posicionador') agregar('Posicionador', i.posicionador)
    if (c === 'rangoResorte') agregar('Rango del resorte', i.rangoResorte)
    if (c === 'presionSuministro') agregar('Presión de suministro', i.presionSuministro)
    if (c === 'finalesCarrera') agregar('Finales de carrera', i.finalesCarrera)
    if (c === 'sensor') agregar('Sensor', i.sensor)
    // Sin elegir es lineal, como todos los de antes.
    if (c === 'salidaTransmisor') agregar('Salida', i.salidaTransmisor || 'Lineal')
    if (c === 'puntoAjuste') agregar('Punto de ajuste', i.puntoAjuste === null ? null : `${i.puntoAjuste} ${i.unidades}`.trim())
    if (c === 'disparaAl') agregar('Dispara', i.disparaAl.toLowerCase())
    if (c === 'contacto') agregar('Contacto', CONTACTOS.find((x) => x.valor === i.contacto)?.texto ?? i.contacto)
  }
  return r
}

// ---------- Revisiones de las válvulas ----------

/**
 * Cómo se prueba que la válvula va a su posición segura, según su acción. La de resorte va
 * sola al quitarle el aire; la de doble efecto se queda donde está sin aire, así que se prueba
 * quitándole la señal (el solenoide en la de corte) para que el aire la lleve.
 */
function posicionSegura(accion: string, prueba: Prueba): string {
  if (accion === 'Aire para abrir') return 'Sin aire cierra sola (posición segura)'
  if (accion === 'Aire para cerrar') return 'Sin aire abre sola (posición segura)'
  if (accion === DOBLE_EFECTO) return prueba === 'funcional' ? 'Al desenergizar el solenoide va a su posición segura' : 'Al quitar la señal va a su posición segura'
  return 'Sin aire va sola a su posición segura'
}

/** En la de doble efecto el aire de un lado no debe pasar al otro (diafragma o sellos dañados). */
const entreCamaras = (accion: string) => (accion === DOBLE_EFECTO ? ['Sin paso de aire entre cámaras (diafragma o pistón sano)'] : [])

/** Lo que se revisa en la prueba de cada válvula, en orden. */
export function revisionesDe(prueba: Prueba, i: Pick<Instrumento, 'accionValvula' | 'finalesCarrera'>): string[] {
  if (prueba === 'carrera') {
    return [
      'Cierra hermético (sin paso)',
      'Sin fugas de aire',
      ...entreCamaras(i.accionValvula),
      'Se mueve suave, sin brincos ni pegarse',
      'Retroaviso de posición correcto',
      posicionSegura(i.accionValvula, prueba),
    ]
  }
  if (prueba === 'funcional') {
    const f = i.finalesCarrera
    return [
      'Abre completo',
      'Cierra completo',
      posicionSegura(i.accionValvula, prueba),
      'Cierra hermético (sin paso)',
      ...(f === 'Solo cerrada' || f === 'Sin finales de carrera' ? [] : ['Final de carrera abierta (ZSO) señaliza']),
      ...(f === 'Solo abierta' || f === 'Sin finales de carrera' ? [] : ['Final de carrera cerrada (ZSC) señaliza']),
      'Solenoide energiza y desenergiza bien',
      'Sin fugas de aire',
      ...entreCamaras(i.accionValvula),
    ]
  }
  return []
}

export const ESTADOS_REVISION: EstadoRevision[] = ['Bien', 'Mal', 'No aplica']

/**
 * Resultado de la válvula de corte: si algo salió mal no pasó; si todo bien, pasó con o
 * sin ajuste. null mientras falte marcar alguna revisión.
 */
export function resultadoRevisiones(revisiones: Revision[], ajustada: boolean): ResultadoCalibracion | null {
  if (revisiones.length === 0 || revisiones.some((r) => !r.estado)) return null
  if (revisiones.some((r) => r.estado === 'Mal')) return 'Fuera de tolerancia'
  return ajustada ? 'Ajustada' : 'Aprobada sin ajuste'
}

/** En la válvula de corte "Fuera de tolerancia" se lee como lo que es. */
export function textoResultado(resultado: ResultadoCalibracion, tipo?: string): string {
  if (pruebaDe(tipo) === 'funcional' && resultado === 'Fuera de tolerancia') return 'No pasó la prueba'
  return resultado
}

// ---------- Resumen de la prueba (hoja de vida y Excel) ----------

/** Número sin ceros de más: 10.5, no 10.5000. */
const n = (v: number) => String(Number(v.toFixed(4)))

/** Diferencia entre disparo y reposición de un interruptor. */
export function diferencial(disparo: number | null, reposicion: number | null): number | null {
  return disparo === null || reposicion === null ? null : Number(Math.abs(disparo - reposicion).toFixed(4))
}

/** "6 bien, 1 mal (Cierra completo), 1 no aplica" */
export function resumenRevisiones(revisiones: Revision[]): string {
  const cuenta = (e: EstadoRevision) => revisiones.filter((r) => r.estado === e)
  const malas = cuenta('Mal')
  return [
    cuenta('Bien').length && `${cuenta('Bien').length} bien`,
    malas.length && `${malas.length} mal (${malas.map((r) => r.nombre).join(', ')})`,
    cuenta('No aplica').length && `${cuenta('No aplica').length} no aplica`,
  ]
    .filter(Boolean)
    .join(', ')
}

type CalResumible = Pick<
  Calibracion,
  'tipo' | 'lecturaEn' | 'salidaTransmisor' | 'senalInvertida' | 'puntos' | 'unidades' | 'disparaAl' | 'reposicion' | 'revisiones' | 'tiempoApertura' | 'tiempoCierre' | 'pendiente' | 'offset'
>

/** "abre en 4 s, cierra en 3 s" → "Abre en 4 s, cierra en 3 s." */
const frase = (partes: (string | false)[]) => {
  const t = partes.filter(Boolean).join(', ')
  return t && `${t[0].toUpperCase()}${t.slice(1)}.`
}

/** Lo propio de la prueba de su tipo, en una línea. Vacío en la calibración general. */
export function detallePrueba(c: CalResumible): string {
  const p = pruebaDe(c.tipo)
  const u = c.unidades ? ` ${c.unidades}` : ''
  const partes: string[] = []
  if (p === 'transmisor' && c.salidaTransmisor === RAIZ_CUADRADA) partes.push('Salida en raíz cuadrada.')
  if (p === 'transmisor' && c.lecturaEn === 'mA') partes.push('Salida leída en mA (4-20).')
  if (p === 'interruptor' && c.puntos[0]) {
    const { entrada, asFound, asLeft } = c.puntos[0]
    const r = c.reposicion ?? { asFound: null, asLeft: null }
    const ajustado = asLeft !== null || r.asLeft !== null
    const par = (a: number | null, b: number | null) => `${a === null ? '—' : n(a)}${ajustado ? ` / ${b === null ? '—' : n(b)}` : ''}`
    partes.push(frase([`ajuste ${n(entrada)}${u}`, !!c.disparaAl && `dispara ${c.disparaAl.toLowerCase()}`]))
    partes.push(`Disparo ${par(asFound, asLeft)}, reposición ${par(r.asFound, r.asLeft)}${ajustado ? ' (antes / después)' : ''}.`)
    const d = diferencial(asLeft ?? asFound, r.asLeft ?? r.asFound)
    if (d !== null) partes.push(`Diferencial ${n(d)}${u}.`)
  }
  if (p === 'carrera' && c.senalInvertida) partes.push('Señal invertida (4 mA = abierta).')
  if (p === 'funcional') {
    partes.push(frase([c.tiempoApertura !== null && `abre en ${n(c.tiempoApertura)} s`, c.tiempoCierre !== null && `cierra en ${n(c.tiempoCierre)} s`]))
  }
  if ((p === 'carrera' || p === 'funcional') && c.revisiones.length) partes.push(`Revisiones: ${resumenRevisiones(c.revisiones)}.`)
  if (p === 'analizador') {
    partes.push(frase([c.pendiente !== null && `pendiente ${n(c.pendiente)} %`, c.offset !== null && `offset ${n(c.offset)} mV`]))
  }
  return partes.filter(Boolean).join(' ')
}
