import type { Timestamp } from 'firebase/firestore'

export type Rol = 'admin' | 'tecnico' | 'operador'

export const AREAS = ['Generación de vapor', 'Almacenamiento de amoniaco', 'Tratamiento de agua'] as const
export type Area = (typeof AREAS)[number]

/** Sub área dentro de un área (la da de alta el admin). */
export interface Subarea {
  id: string
  area: Area
  nombre: string
}

/** "Generación de vapor · Caldera 2" */
export const dondeEsta = (x: { area: string; subArea?: string }) => (x.subArea ? `${x.area} · ${x.subArea}` : x.area)

export const ESTADOS_INSTRUMENTO = ['Operando', 'Con falla', 'Fuera de servicio'] as const
export type EstadoInstrumento = (typeof ESTADOS_INSTRUMENTO)[number]

export const SENALES = ['4-20 mA', '4-20 mA + HART', 'HART', '0-10 V', 'Discreta', 'Foundation Fieldbus', 'Profibus', 'Modbus', 'Otra'] as const

export interface DocAdjunto {
  nombre: string
  ruta: string
  url: string | null
  tipo: string
}

export interface Instrumento {
  id: string
  tagISA: string
  lazo: string
  servicio: string
  area: Area
  /** Caldera, tanque o sección dentro del área ('' = sin sub área). El tag se puede repetir en otra sub área. */
  subArea: string
  ubicacionTexto: string
  pid: string
  marca: string
  modelo: string
  serie: string
  rangoMin: number | null
  rangoMax: number | null
  unidades: string
  senal: string
  alimentacion: string
  nfcToken: string | null
  estado: EstadoInstrumento
  proximaCalibracion: Timestamp | null
  docs: DocAdjunto[]
  /** Ruta y URL de la miniatura de portada, copiadas aquí para listas y precarga offline. */
  portadaMiniatura: string | null
  actualizado?: Timestamp
}

export type InstrumentoNuevo = Omit<Instrumento, 'id'>

export interface FotoUbicacion {
  id: string
  ruta: string
  miniatura: string
  url: string | null
  miniaturaUrl: string | null
  pie: string
  orden: number
  esPortada: boolean
  autor: string
  fecha: Timestamp | null
  /** true mientras las imágenes siguen en la cola local del teléfono. */
  pendiente?: boolean
}

export interface Usuario {
  uid: string
  nombre: string
  email: string
  rol: Rol
  area: string
  activo: boolean
  tokensFCM: string[]
}

export interface Publico {
  tagISA: string
  servicio: string
  area: string
  subArea?: string
  estado: string
  ubicacionTexto: string
  fotosUbicacion: { url: string | null; miniaturaUrl: string | null; pie: string; esPortada: boolean }[]
}

export const ESTADOS_FALLA = ['Abierta', 'En proceso', 'Cerrada'] as const
export type EstadoFalla = (typeof ESTADOS_FALLA)[number]

export interface Persona {
  uid: string
  nombre: string
}

export interface FotoFalla {
  ruta: string
  miniatura: string
  url: string | null
  miniaturaUrl: string | null
}

export interface Falla {
  id: string
  instrumentoId: string
  tagISA: string
  area: string
  /** La sub área del instrumento cuando se reportó. */
  subArea?: string
  estado: EstadoFalla
  reportadoPor: Persona
  tecnicoAsignado: Persona | null
  descripcion: string
  fotos: FotoFalla[]
  causaRaiz: string
  accionCorrectiva: string
  fechas: { creada: Timestamp | null; tomada: Timestamp | null; cerrada: Timestamp | null }
}

export interface Mensaje {
  id: string
  autor: Persona
  texto: string
  fotos: FotoFalla[]
  fecha: Timestamp | null
}

export const RESULTADOS_CALIBRACION = ['Aprobada sin ajuste', 'Ajustada', 'Fuera de tolerancia'] as const
export type ResultadoCalibracion = (typeof RESULTADOS_CALIBRACION)[number]

export interface PuntoCalibracion {
  /** Valor aplicado con el patrón, en unidades de proceso. */
  entrada: number
  /** Lectura del instrumento antes de ajustar. */
  asFound: number | null
  /** Lectura del instrumento después de ajustar. */
  asLeft: number | null
}

export interface Calibracion {
  id: string
  fecha: Timestamp
  tecnico: Persona
  puntos: PuntoCalibracion[]
  /** Tolerancia en % del span. */
  tolerancia: number
  rangoMin: number
  rangoMax: number
  unidades: string
  patron: string
  resultado: ResultadoCalibracion
  observaciones: string
  proxima: Timestamp | null
}

/** Refacción del almacén: cuántas hay, cuándo pedir y para qué instrumentos sirve. */
export interface Refaccion {
  id: string
  nombre: string
  numeroParte: string
  marca: string
  /** Dónde está en el almacén (anaquel, gaveta…). */
  ubicacion: string
  unidad: string
  /** Solo la cambian los movimientos (entradas, salidas y ajustes). */
  existencia: number
  /** Al llegar a esta cantidad hay que pedir más. 0 = no se tiene en existencia. */
  minimo: number
  /** Instrumentos compatibles (ids). */
  instrumentos: string[]
  notas: string
  ultimoMovimiento: string | null
  actualizado?: Timestamp
}

export type RefaccionNueva = Omit<Refaccion, 'id' | 'existencia' | 'ultimoMovimiento' | 'actualizado'>

export const TIPOS_MOVIMIENTO = { entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste por conteo' } as const
export type TipoMovimiento = keyof typeof TIPOS_MOVIMIENTO

/** Kardex: cada entrada o salida queda registrada y no se edita. */
export interface Movimiento {
  id: string
  refaccionId: string
  refaccionNombre: string
  tipo: TipoMovimiento
  /** Positiva entra, negativa sale. */
  cantidad: number
  nota: string
  quien: Persona
  fecha: Timestamp | null
  /** En qué falla e instrumento se usó (salidas). */
  fallaId: string | null
  instrumentoId: string | null
  tagISA: string | null
}
