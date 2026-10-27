import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { iniciarCola } from './lib/uploadQueue'
import '@fontsource-variable/figtree'
import '@fontsource-variable/atkinson-hyperlegible-mono'
import './index.css'

registerSW({ immediate: true })
iniciarCola()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
