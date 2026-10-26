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

/** Lo que ya traía el tag antes de grabarlo. */
export type Revision = { grabar: true } | { grabar: false; motivo: string; otroId?: string; otroTag?: string }

/**
 * Lee el tag que se acerca y, si `revisar` lo permite, lo graba en ese mismo toque.
 * Así no se sobrescribe sin aviso un tag que ya pertenece a otro instrumento.
 * `revisar` recibe la URL que traía el tag (null si estaba vacío o no se pudo leer).
 */
export function leerYGrabar(url: string, signal: AbortSignal, revisar: (anterior: string | null) => Promise<Revision>): Promise<Revision> {
  return new Promise((resolve, reject) => {
    const r = lector()
    let ocupado = false
    const decoder = new TextDecoder()
    const terminar = async (anterior: string | null) => {
      if (ocupado) return
      ocupado = true
      cleanup()
      try {
        const revision = await revisar(anterior)
        if (revision.grabar) {
          await r.write({ records: [{ recordType: 'url', data: url }] }, { overwrite: true, signal })
          vibrar([80, 60, 80])
        } else {
          vibrar([200])
        }
        resolve(revision)
      } catch (err) {
        reject(err)
      }
    }
    const onReading = (ev: Event) => {
      const e = ev as NDEFReadingEventLike
      const rec = e.message.records.find((x) => (x.recordType === 'url' || x.recordType === 'absolute-url') && x.data)
      void terminar(rec?.data ? decoder.decode(rec.data) : null)
    }
    // Un tag nuevo de fábrica puede no tener formato NDEF: se graba directo.
    const onError = () => void terminar(null)
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
