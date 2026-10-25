const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

/** Token aleatorio sin caracteres ambiguos (0/O, 1/l/I) para la URL del tag. */
export function generarToken(longitud: number): string {
  const limite = 256 - (256 % ALFABETO.length)
  let salida = ''
  while (salida.length < longitud) {
    const bytes = crypto.getRandomValues(new Uint8Array(longitud * 2))
    for (const b of bytes) {
      if (b < limite && salida.length < longitud) salida += ALFABETO[b % ALFABETO.length]
    }
  }
  return salida
}

export function urlDeTag(origen: string, token: string): string {
  return `${origen}/t/${token}`
}

export function tokenDeUrl(url: string): string | null {
  const m = /\/t\/([A-Za-z0-9]{16,22})\/?$/.exec(url)
  return m ? m[1] : null
}

/**
 * Bytes que ocupa un registro NDEF URI corto con esa URL dentro del mensaje TLV.
 * El prefijo https:// (o https://www.) se comprime en un byte de identificador.
 */
export function bytesNdef(url: string): number {
  let resto = url
  if (resto.startsWith('https://www.')) resto = resto.slice(12)
  else if (resto.startsWith('https://')) resto = resto.slice(8)
  const payload = 1 + new TextEncoder().encode(resto).length
  const registro = 1 + 1 + 1 + 1 + payload // cabecera, long. tipo, long. payload, tipo 'U'
  const tlv = 2 + registro + 1 // T + L, registro, terminador 0xFE
  return tlv
}

export const NTAG213_BYTES_UTILES = 144
