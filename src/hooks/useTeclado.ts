import { useEffect, useState } from 'react'

// El teclado del teléfono tapa la parte de abajo de la pantalla. El iPhone (y Chrome en
// Android) no achican la página: solo la "vista visible" (visualViewport). Para que la caja
// de escribir quede justo arriba del teclado, la pantalla del chat toma el alto de esa vista.

export interface VistaVisible {
  /** Alto de lo que se ve, sin el teclado. */
  alto: number
  /** Cuánto se recorrió la vista hacia abajo (el iPhone la empuja al abrir el teclado). */
  arriba: number
  /** El teclado está abierto. */
  teclado: boolean
}

/** Lo que el teclado le quita al alto, como mínimo (la barra de direcciones no llega a esto). */
const MIN_TECLADO = 150

function medir(maximo: number): VistaVisible {
  const vv = window.visualViewport
  // Con zoom de pellizco no se toca nada: el alto ya no dice si hay teclado.
  if (!vv || vv.scale > 1.05) return { alto: window.innerHeight, arriba: 0, teclado: false }
  return { alto: Math.round(vv.height), arriba: Math.max(0, Math.round(vv.offsetTop)), teclado: maximo - vv.height > MIN_TECLADO }
}

/** Alto y posición de lo que se ve de la pantalla, y si el teclado está abierto. */
export function useVistaVisible(activo: boolean): VistaVisible {
  const [vista, setVista] = useState(() => medir(window.innerHeight))
  useEffect(() => {
    if (!activo) return
    const vv = window.visualViewport
    // El alto sin teclado es el mayor que se ha visto con este ancho (al girar el teléfono cambia).
    let ancho = window.innerWidth
    let maximo = Math.max(window.innerHeight, vv?.height ?? 0)
    let cuadro = 0
    const actualizar = () => {
      cuadro = 0
      if (window.innerWidth !== ancho) {
        ancho = window.innerWidth
        maximo = Math.max(window.innerHeight, vv?.height ?? 0)
      }
      maximo = Math.max(maximo, vv?.height ?? 0)
      const nueva = medir(maximo)
      setVista((v) => (v.alto === nueva.alto && v.arriba === nueva.arriba && v.teclado === nueva.teclado ? v : nueva))
    }
    const pedir = () => {
      if (!cuadro) cuadro = requestAnimationFrame(actualizar)
    }
    actualizar()
    vv?.addEventListener('resize', pedir)
    vv?.addEventListener('scroll', pedir)
    window.addEventListener('resize', pedir)
    return () => {
      cancelAnimationFrame(cuadro)
      vv?.removeEventListener('resize', pedir)
      vv?.removeEventListener('scroll', pedir)
      window.removeEventListener('resize', pedir)
    }
  }, [activo])
  return vista
}

/**
 * En una pantalla larga (la falla con su chat al final): al abrir el teclado se recorre la
 * página lo necesario para que `el` quede a la vista, justo arriba del teclado.
 */
export function mostrarSobreTeclado(el: HTMLElement) {
  const vv = window.visualViewport
  const ajustar = () => {
    const abajo = vv ? vv.offsetTop + vv.height : window.innerHeight
    const sobra = el.getBoundingClientRect().bottom + 8 - abajo
    if (sobra > 0) window.scrollBy({ top: sobra })
  }
  const alCambiar = () => {
    vv?.removeEventListener('resize', alCambiar)
    ajustar()
  }
  // El teclado tarda en salir: se ajusta cuando la vista cambia de alto, y por si ya estaba abierto, al rato.
  vv?.addEventListener('resize', alCambiar)
  setTimeout(ajustar, 500)
  setTimeout(() => vv?.removeEventListener('resize', alCambiar), 1500)
}
