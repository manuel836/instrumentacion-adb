// Web NFC solo existe en Chrome para Android, con HTTPS y la app en primer plano.

interface NDEFRecordLike {
  recordType: string
  data?: DataView
  encoding?: string
}
interface NDEFReadingEventLike extends Event {
  serialNumber: string
  message: { records: NDEFRecordLike[] }
}
interface NDEFReaderLike extends EventTarget {
  scan(opts?: { signal?: AbortSignal }): Promise<void>
  write(message: { records: { recordType: string; data: string }[] }, opts?: { overwrite?: boolean; signal?: AbortSignal }): Promise<void>
}

declare global {
  interface Window {
    NDEFReader?: new () => NDEFReaderLike
  }
}

export function nfcDisponible(): boolean {
  return typeof window !== 'undefined' && 'NDEFReader' in window
}

function lector(): NDEFReaderLike {
  if (!window.NDEFReader) throw new Error('Este navegador no tiene NFC. Usa Chrome en un teléfono Android con NFC.')
  return new window.NDEFReader()
}

function vibrar(patron: number | number[]) {
  navigator.vibrate?.(patron)
}

/** Graba la URL como único registro NDEF. No bloquea el tag (makeReadOnly queda fuera de la v1). */
export async function grabarUrl(url: string, signal?: AbortSignal): Promise<void> {
  await lector().write({ records: [{ recordType: 'url', data: url }] }, { overwrite: true, signal })
  vibrar([80, 60, 80])
}

/** Espera un tag y devuelve la primera URL que contenga. */
export function escanearUrl(signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = lector()
    const onReading = (ev: Event) => {
      const e = ev as NDEFReadingEventLike
      const decoder = new TextDecoder()
      for (const rec of e.message.records) {
        if ((rec.recordType === 'url' || rec.recordType === 'absolute-url') && rec.data) {
          vibrar(80)
          cleanup()
          resolve(decoder.decode(rec.data))
          return
        }
      }
      reject(new Error('El tag no tiene una URL de instrumento.'))
      cleanup()
    }
    const onError = () => {
      cleanup()
      reject(new Error('No se pudo leer el tag. Acércalo de nuevo.'))
    }
    const cleanup = () => {
      r.removeEventListener('reading', onReading)
      r.removeEventListener('readingerror', onError)
    }
    r.addEventListener('reading', onReading)
    r.addEventListener('readingerror', onError)
    r.scan({ signal }).catch((err) => {
      cleanup()
      reject(err)
    })
  })
}
