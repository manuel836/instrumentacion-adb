import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { initializeApp } from 'firebase/app'
import { getMessaging } from 'firebase/messaging/sw'

declare let self: ServiceWorkerGlobalScope

self.skipWaiting()
clientsClaim()

// App shell en caché: la app abre sin señal después de la primera carga.
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

// Fotos y documentos de Storage: una vez vistos quedan disponibles sin señal.
registerRoute(
  ({ url }) => url.hostname === 'firebasestorage.googleapis.com' || url.hostname.endsWith('.firebasestorage.app'),
  new CacheFirst({
    cacheName: 'storage-media',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      // Si el teléfono se queda sin espacio se borran estas copias antes que lo pendiente.
      new ExpirationPlugin({ maxEntries: 6000, maxAgeSeconds: 60 * 60 * 24 * 180, purgeOnQuotaError: true }),
    ],
  }),
)

// Notificaciones push (FCM). Los avisos llevan `webpush.notification`, así que
// el SDK los muestra solo y abre `fcmOptions.link` al tocarlos.
const env = import.meta.env
if (env.VITE_FIREBASE_MESSAGING_SENDER_ID && env.VITE_FIREBASE_APP_ID) {
  getMessaging(
    initializeApp({
      apiKey: env.VITE_FIREBASE_API_KEY,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    }),
  )
}

// Con la app en primer plano el SDK no muestra nada: la página nos pasa el aviso.
self.addEventListener('message', (ev) => {
  const d = ev.data as { tipo?: string; titulo?: string; cuerpo?: string; ruta?: string } | null
  if (d?.tipo === 'mostrar-aviso' && d.titulo) {
    ev.waitUntil(
      self.registration.showNotification(d.titulo, { body: d.cuerpo, icon: '/icons/icon-192.png', tag: d.ruta, data: { ruta: d.ruta } }),
    )
  }
})

self.addEventListener('notificationclick', (ev) => {
  const ruta = (ev.notification.data as { ruta?: string } | null)?.ruta
  if (!ruta) return
  ev.notification.close()
  ev.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const abierta = ventanas[0] as WindowClient | undefined
      if (abierta) {
        await abierta.focus()
        await abierta.navigate(ruta)
      } else {
        await self.clients.openWindow(ruta)
      }
    })(),
  )
})
