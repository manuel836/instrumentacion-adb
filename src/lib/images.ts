import { FOTO_LADO_MAYOR, MINIATURA_LADO_MAYOR } from '../config'

export interface FotoComprimida {
  completa: Blob
  miniatura: Blob
}

async function redimensionar(bitmap: ImageBitmap, ladoMayor: number, calidad: number): Promise<Blob> {
  const escala = Math.min(1, ladoMayor / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * escala)
  const h = Math.round(bitmap.height * escala)
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la imagen')
  ctx.drawImage(bitmap, 0, 0, w, h)
  return canvas.convertToBlob({ type: 'image/webp', quality: calidad })
}

/** Reduce la foto en el teléfono: 1600 px de lado mayor en WebP más una miniatura de 320 px. */
export async function comprimirFoto(archivo: Blob): Promise<FotoComprimida> {
  const bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' })
  try {
    const [completa, miniatura] = await Promise.all([
      redimensionar(bitmap, FOTO_LADO_MAYOR, 0.8),
      redimensionar(bitmap, MINIATURA_LADO_MAYOR, 0.7),
    ])
    return { completa, miniatura }
  } finally {
    bitmap.close()
  }
}
