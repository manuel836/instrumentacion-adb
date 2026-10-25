import type { Timestamp } from 'firebase/firestore'

export type Rol = 'admin' | 'tecnico' | 'operador'

export const AREAS = ['Generación de vapor', 'Almacenamiento de amoniaco', 'Tratamiento de agua'] as const
export type Area = (typeof AREAS)[number]

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
  estado: string
  ubicacionTexto: string
  fotosUbicacion: { url: string | null; miniaturaUrl: string | null; pie: string; esPortada: boolean }[]
}
