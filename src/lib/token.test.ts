import { describe, expect, it } from 'vitest'
import { NTAG213_BYTES_UTILES, bytesNdef, generarToken, tokenDeUrl, urlDeTag } from './token'

describe('token de tag', () => {
  it('genera tokens de la longitud pedida y sin caracteres ambiguos', () => {
    for (let i = 0; i < 200; i++) {
      const t = generarToken(18)
      expect(t).toHaveLength(18)
      expect(t).not.toMatch(/[0O1lI]/)
    }
  })

  it('recupera el token de la URL grabada', () => {
    const url = urlDeTag('https://instrumentacion-adb.web.app', 'k7Qx9mP2vR4tLwAbCd')
    expect(tokenDeUrl(url)).toBe('k7Qx9mP2vR4tLwAbCd')
    expect(tokenDeUrl('https://otro.com/x')).toBeNull()
  })

  it('cabe holgadamente en un NTAG213', () => {
    const url = urlDeTag('https://instrumentacion-adb-fertinal.web.app', generarToken(22))
    expect(bytesNdef(url)).toBeLessThan(NTAG213_BYTES_UTILES)
    expect(bytesNdef(url)).toBeLessThanOrEqual(72)
  })
})
