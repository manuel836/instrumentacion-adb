import { initializeApp } from 'firebase/app'
import { browserLocalPersistence, connectAuthEmulator, initializeAuth } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'
import { connectStorageEmulator, getStorage } from 'firebase/storage'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'

const env = import.meta.env

export const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || 'demo-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'demo-instrumentacion-adb',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'demo-instrumentacion-adb.appspot.com',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
})

// Teléfonos personales: la sesión persiste hasta que el usuario sale o el Admin la revoca.
export const auth = initializeAuth(app, { persistence: browserLocalPersistence })

// Caché persistente en IndexedDB: el catálogo completo queda en el teléfono y
// las escrituras sin señal se encolan y se sincronizan solas.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

export const storage = getStorage(app)
export const functions = getFunctions(app, 'us-central1')

if (env.VITE_USE_EMULATORS === 'true') {
  const host = window.location.hostname
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true })
  connectFirestoreEmulator(db, host, 8080)
  connectStorageEmulator(storage, host, 9199)
  connectFunctionsEmulator(functions, host, 5001)
}
