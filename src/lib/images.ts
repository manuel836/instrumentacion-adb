import { FOTO_LADO_MAYOR, MAX_BYTES_FOTO, MINIATURA_LADO_MAYOR } from '../config'

/** Formatos de foto que aceptan las reglas de Storage. */
export type TipoFoto = 'image/webp' | 'image/jpeg'

export interface FotoComprimida {
  completa: Blob
  miniatura: Blob
  tipo: TipoFoto
  /** Extensión para la ruta en Storage. */
  ext: 'webp' | 'jpg'
}

let tipoDelTelefono: Promise<TipoFoto> | null = null

/**
 * WebP si el navegador sabe hacerlo. Safari (y todos los navegadores del iPhone)
 * no lo sabe: entrega PNG, que pesa varias veces más y Storage lo rechaza. Ahí se usa JPEG.
 */
function tipoFoto(): Promise<TipoFoto> {
  tipoDelTelefono ??= new OffscreenCanvas(1, 1)
    .convertToBlob({ type: 'image/webp' })
    .then(
      (b): TipoFoto => (b.type === 'image/webp' ? 'image/webp' : 'image/jpeg'),
      (): TipoFoto => 'image/jpeg',
    )
  return tipoDelTelefono
}

async function redimensionar(bitmap: ImageBitmap, ladoMayor: number, calidad: number, tipo: TipoFoto): Promise<Blob> {
  const escala = Math.min(1, ladoMayor / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * escala)
  const h = Math.round(bitmap.height * escala)
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la imagen')
  ctx.drawImage(bitmap, 0, 0, w, h)
  return canvas.convertToBlob({ type: tipo, quality: calidad })
}

/** Si una foto con mucho detalle pasa del límite de Storage, se baja la calidad hasta que quepa. */
async function dentroDelLimite(bitmap: ImageBitmap, ladoMayor: number, calidad: number, tipo: TipoFoto): Promise<Blob> {
  let blob = await redimensionar(bitmap, ladoMayor, calidad, tipo)
  for (const menor of [0.6, 0.4]) {
    if (blob.size < MAX_BYTES_FOTO || menor >= calidad) break
    blob = await redimensionar(bitmap, ladoMayor, menor, tipo)
  }
  return blob
}

/** Reduce la foto en el teléfono: 1600 px de lado mayor más una miniatura de 320 px. */
export async function comprimirFoto(archivo: Blob): Promise<FotoComprimida> {
  const tipo = await tipoFoto()
  const bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' })
  try {
    const [completa, miniatura] = await Promise.all([
      dentroDelLimite(bitmap, FOTO_LADO_MAYOR, 0.8, tipo),
      dentroDelLimite(bitmap, MINIATURA_LADO_MAYOR, 0.7, tipo),
    ])
    return { completa, miniatura, tipo, ext: tipo === 'image/webp' ? 'webp' : 'jpg' }
  } finally {
    bitmap.close()
  }
}

/**
 * Vuelve a codificar una foto que se guardó en la cola con un formato que Storage
 * no acepta (los PNG que hizo el iPhone antes de este arreglo). Conserva su tamaño.
 */
export async function recodificar(foto: Blob): Promise<{ blob: Blob; tipo: TipoFoto }> {
  const tipo = await tipoFoto()
  const bitmap = await createImageBitmap(foto)
  try {
    return { blob: await dentroDelLimite(bitmap, FOTO_LADO_MAYOR, 0.8, tipo), tipo }
  } finally {
    bitmap.close()
  }
}
