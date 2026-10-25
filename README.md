# Instrumentación ADB

PWA para Android que concentra el inventario de instrumentación de Agroindustrias del Balsas,
identifica cada instrumento con un tag NFC (NTAG213) y funciona sin señal en campo.

Stack: Vite + React + TypeScript + Tailwind · vite-plugin-pwa (Workbox) · Web NFC ·
Firebase (Auth, Firestore con caché persistente, Storage, Cloud Functions, Hosting).

## Estado

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1. Base | Login y roles, catálogo offline, grabar y leer NTAG213, galería de ubicación, vista de invitado | Lista para prueba en campo |
| 2. Fallas | Abierta → En proceso → Cerrada, fotos con cola offline, push a técnicos | Pendiente |
| 3. Chat y calibraciones | Chat por falla y canal general, As-Found / As-Left | Pendiente |
| 4. Bitácora y exportes | Auditoría, Excel y PDF | Pendiente |

## Desarrollo local con emuladores

Requisitos: Node 22, Java 21 (emulador de Firestore) y `npm i -g firebase-tools`.

```bash
npm install
npm --prefix functions install
npm --prefix functions run build
cp .env.example .env.local          # deja VITE_USE_EMULATORS=true
firebase emulators:start --project demo-instrumentacion-adb --only auth,firestore,storage,functions

# En otra terminal: crea el admin inicial en los emuladores
cd functions && FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  GCLOUD_PROJECT=demo-instrumentacion-adb node scripts/crear-admin.mjs manuel@adb.test "Manuel" 'Prueba1234'

npm run dev
```

Con `VITE_USE_EMULATORS=true`, los IDs de proyecto vacíos caen en `demo-instrumentacion-adb`.

Pruebas:

- `npm test`: pruebas unitarias (token del tag, tamaño NDEF).
- `npm run test:reglas`: reglas de Firestore contra el emulador.
- `node e2e/fase1.cjs`: flujo completo con Playwright contra `npm run build && npx vite preview --port 4173`
  y los emuladores (alta, grabar tag con NFC simulado, fotos, invitado, modo avión y cola de subida).

## Puesta en producción

1. Crear el proyecto en Firebase con ID `instrumentacion-adb` (así el dominio queda
   `instrumentacion-adb.web.app`), activar plan Blaze y una alerta de presupuesto en Google Cloud.
2. Activar Authentication (correo y contraseña), Firestore, Storage y Hosting.
3. Llenar `.env.local` con la configuración web del proyecto, `VITE_USE_EMULATORS=false` y
   `VITE_PUBLIC_ORIGIN=https://instrumentacion-adb.web.app`.
4. `npm run build && firebase deploy`
5. Crear el admin: `gcloud auth application-default login` y luego
   `GCLOUD_PROJECT=instrumentacion-adb node functions/scripts/crear-admin.mjs correo "Manuel" 'contraseña'`.

**El dominio queda grabado en cada tag.** No grabes tags reales hasta tener el dominio definitivo;
cambiarlo después obliga a regrabarlos. La pantalla de vincular muestra la URL exacta que se grabará.

## Cómo está armado

- `src/firebase.ts`: Firestore con `persistentLocalCache`; el catálogo completo vive en el teléfono
  y las escrituras sin señal se sincronizan solas.
- `src/lib/uploadQueue.ts`: Storage no encola subidas offline, así que fotos y documentos esperan en
  IndexedDB y se suben al recuperar señal. La barra superior muestra cuántos faltan.
- `src/lib/images.ts`: cada foto se reduce en el teléfono a 1600 px en WebP más una miniatura de 320 px.
- `src/lib/nfc.ts`: Web NFC (`NDEFReader`). Cada tag guarda una URL `https://<dominio>/t/<token>`
  con un token aleatorio de 18 caracteres (unos 50 de los 144 bytes del NTAG213). No se usa `makeReadOnly()`.
- `functions/src/index.ts`: alta de usuarios y roles (custom claim `rol`), baja y cierre de sesiones,
  y el documento `publico/{token}` que alimenta la vista de invitado.
- `firestore.rules` y `storage.rules`: los permisos de la tabla de roles se aplican en el servidor.
