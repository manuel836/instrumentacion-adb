const origin = (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined) ?? window.location.origin

/** Origen que se graba en los tags. Un solo lugar para cambiarlo antes de grabar tags reales. */
export const PUBLIC_ORIGIN = origin.replace(/\/$/, '')

export const TOKEN_LENGTH = 18

export const FOTO_LADO_MAYOR = 1600
export const MINIATURA_LADO_MAYOR = 320
export const MAX_FOTOS_UBICACION = 6
