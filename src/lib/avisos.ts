import { arrayUnion, doc, updateDoc } from 'firebase/firestore'
import { app, db } from '../firebase'

const VAPID = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined

// La parte de notificaciones de Firebase se descarga solo cuando hace falta.
const fcm = () => import('firebase/messaging')

/** Push web necesita la clave VAPID del proyecto real; en los emuladores no hay FCM. */
export async function avisosDisponibles(): Promise<boolean> {
  if (!VAPID || import.meta.env.VITE_USE_EMULATORS === 'true' || !('Notification' in window)) return false
  return (await fcm()).isSupported()
}

let escuchando = false

async function registrarToken(uid: string) {
  const { getMessaging, getToken, onMessage } = await fcm()
  const messaging = getMessaging(app)
  const token = await getToken(messaging, {
    vapidKey: VAPID,
    serviceWorkerRegistration: await navigator.serviceWorker.ready,
  })
  if (token) await updateDoc(doc(db, 'usuarios', uid), { tokensFCM: arrayUnion(token) })
  if (!escuchando) {
    escuchando = true
    // Con la app abierta FCM no muestra la notificación: se la pedimos al service worker.
    onMessage(messaging, (m) => {
      const n = m.notification
      // Si ya está viendo esa falla o ese chat, el mensaje aparece en pantalla sin aviso.
      if (m.data?.ruta && m.data.ruta === location.pathname && document.visibilityState === 'visible') return
      void navigator.serviceWorker.ready.then((r) =>
        r.active?.postMessage({ tipo: 'mostrar-aviso', titulo: n?.title, cuerpo: n?.body, ruta: m.data?.ruta }),
      )
    })
  }
}

/** Pide permiso (debe llamarse desde un toque del usuario) y guarda el token del teléfono. */
export async function activarAvisos(uid: string): Promise<NotificationPermission> {
  const permiso = await Notification.requestPermission()
  if (permiso === 'granted') await registrarToken(uid)
  return permiso
}

/** Al abrir la app con permiso ya dado, renueva el token por si cambió. */
export async function renovarAvisos(uid: string) {
  if (!(await avisosDisponibles()) || Notification.permission !== 'granted' || !navigator.onLine) return
  await registrarToken(uid).catch(() => undefined)
}
