import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { SiFalla } from './components/Diferida'
import { esDeLaApp, registrarError } from './lib/telefono'
import { iniciarCola } from './lib/uploadQueue'
import { avisarVersionNueva } from './lib/version'
import '@fontsource-variable/figtree'
import '@fontsource-variable/atkinson-hyperlegible-mono'
import './index.css'

// La versión nueva no recarga la app a media captura: espera a que nadie esté escribiendo.
registerSW({ immediate: true, onNeedReload: avisarVersionNueva })
iniciarCola()

// Lo que falla fuera de una pantalla (promesas sin atender, scripts) también queda anotado.
// Solo cuenta lo que viene del código de la app: el navegador y sus extensiones (carteras de
// criptomonedas, traductores, el bloqueador de anuncios de Brave) meten scripts propios que
// también fallan. En las promesas eso lo revisa registrarError con la pila del error.
window.addEventListener('error', (e) => {
  if (esDeLaApp(e.filename)) registrarError(e.error ?? e.message)
})
window.addEventListener('unhandledrejection', (e) => registrarError(e.reason))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SiFalla completa>
      <App />
    </SiFalla>
  </StrictMode>,
)
