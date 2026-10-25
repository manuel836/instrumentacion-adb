// Crea (o promueve) la cuenta del administrador inicial. Se corre una sola vez:
//   gcloud auth application-default login
//   GCLOUD_PROJECT=instrumentacion-adb node scripts/crear-admin.mjs correo@empresa.com "Manuel" 'contraseña'
// Con los emuladores: FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 ...
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const [email, nombre = 'Administrador', password] = process.argv.slice(2)
if (!email) {
  console.error('Uso: node scripts/crear-admin.mjs correo "Nombre" [contraseña]')
  process.exit(1)
}

initializeApp({ projectId: process.env.GCLOUD_PROJECT })
const auth = getAuth()

let user = await auth.getUserByEmail(email).catch(() => null)
if (!user) {
  if (!password) {
    console.error('El usuario no existe: indica una contraseña inicial para crearlo.')
    process.exit(1)
  }
  user = await auth.createUser({ email, password, displayName: nombre })
}
await auth.setCustomUserClaims(user.uid, { rol: 'admin' })
await getFirestore()
  .doc(`usuarios/${user.uid}`)
  .set({ nombre, email, rol: 'admin', area: '', activo: true, tokensFCM: [], creado: FieldValue.serverTimestamp() }, { merge: true })
console.log(`Listo: ${email} es admin (${user.uid}).`)
