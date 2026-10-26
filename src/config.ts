const origin = (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined) ?? window.location.origin

/** Origen que se graba en los tags. Un solo lugar para cambiarlo antes de grabar tags reales. */
export const PUBLIC_ORIGIN = origin.replace(/\/$/, '')

export const TOKEN_LENGTH = 18

export const FOTO_LADO_MAYOR = 1600
export const MINIATURA_LADO_MAYOR = 320
export const MAX_FOTOS_UBICACION = 6
/** Storage rechaza fotos de este tamaño o más (storage.rules). */
export const MAX_BYTES_FOTO = 3 * 1024 * 1024
/** Storage rechaza documentos de este tamaño o más (storage.rules). */
export const MAX_BYTES_DOCUMENTO = 25 * 1024 * 1024
