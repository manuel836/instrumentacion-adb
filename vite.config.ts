/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Instrumentación ADB',
        short_name: 'Instrumentos',
        description: 'Inventario de instrumentación y fallas de Agroindustrias del Balsas',
        lang: 'es-MX',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0f766e',
        background_color: '#f8fafc',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  build: {
    // El archivo de Firebase pesa ~650 kB (~195 kB comprimido) y no se puede partir más.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Firebase y React casi no cambian entre versiones: en archivos aparte, el teléfono
        // los conserva y al actualizar la app solo baja el código propio.
        manualChunks(id) {
          // Las notificaciones se cargan aparte, solo cuando hacen falta.
          if (/node_modules\/(@firebase\/(messaging|installations)|firebase\/messaging)/.test(id)) return
          if (/node_modules\/(@firebase|firebase)\//.test(id)) return 'firebase'
          if (/node_modules\/(react|react-dom|react-router|scheduler|@tanstack)\//.test(id)) return 'react'
        },
      },
    },
  },
  test: {
    environment: 'node',
  },
})
