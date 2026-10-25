# Instrumentación ADB

PWA para Android que concentra el inventario de instrumentación de Agroindustrias del Balsas,
identifica cada instrumento con un tag NFC (NTAG213) y funciona sin señal en campo.

Stack: Vite + React + TypeScript + Tailwind · vite-plugin-pwa (Workbox) · Web NFC ·
Firebase (Auth, Firestore con caché persistente, Storage, Cloud Functions, Hosting).

## Estado

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1. Base | Login y roles, catálogo offline, grabar y leer NTAG213, galería de ubicación, vista de invitado | En producción |
| 2. Fallas | Abierta → En proceso → Cerrada, fotos con cola offline, push a técnicos | En producción |
| 3. Chat y calibraciones | Chat por falla (con fotos) y canal general con push; calibraciones As-Found / As-Left con tolerancia y próxima calibración | En producción |
| 4. Bitácora y exportes | Bitácora de cambios (quién, qué, cuándo, antes y después) escrita por Functions; Excel (3 reportes) y vista de impresión a PDF | Lista para prueba en campo |

## Desarrollo local con emuladores

Requisitos: Node 22, Java 21 (emulador de Firestore) y `npm i -g firebase-tools`.

```bash
npm install
npm --prefix functions install
npm --prefix functions run build
cp .env.example .env.local          # deja VITE_USE_EMULATORS=true
echo 'ADMIN_INICIAL=manuel@adb.test' > functions/.env.local
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
- `node e2e/fase2.cjs`: fallas de punta a punta (alta de usuarios, reporte sin señal, tomar, cerrar y
  estado del instrumento). Correr después de `fase1.cjs`.
- `node e2e/fase3.cjs`: chat de falla sin señal y con foto, canal general con globo de no leídos,
  calibración registrada sin señal y próxima calibración en la ficha. Correr después de `fase1.cjs`.
- `node e2e/fase4.cjs`: bitácora (edición con valor anterior y nuevo, altas de usuarios, fallas,
  calibraciones), permisos del operador, los tres Excel y el PDF de la vista de impresión.
  En los emuladores la bitácora muestra `fake-auth-id@gmail.com` como autor de las ediciones:
  el emulador no manda el usuario real al trigger; en producción sale el nombre de quien editó.

Para correr las pruebas de punta a punta, compila apuntando a los emuladores con
`npx vite build --mode e2e` (con `npm run build` manda la configuración de producción de `.env.production`).

Las notificaciones push no se pueden probar con emuladores (FCM no tiene emulador): se prueban en el
proyecto real con `VITE_FIREBASE_VAPID_KEY` configurada.

## Puesta en producción

El proyecto Firebase `instrumentacion-adb` ya tiene Blaze, Authentication (correo y contraseña),
Firestore (nam5) y Storage. Su configuración web está en `.env.production`.
La dirección oficial (la que se graba en los tags) es **instrumentacion-adb-fertinal.web.app**;
el despliegue publica también en el sitio por defecto, instrumentacion-adb.web.app.

1. En la consola de Firebase, **Authentication → Usuarios → Agregar usuario**: crea la cuenta del administrador.
2. Abre [Google Cloud Shell](https://shell.cloud.google.com) con la misma cuenta de Google y corre:

   ```bash
   git clone https://github.com/manuel836/instrumentacion-adb && cd instrumentacion-adb
   bash scripts/desplegar.sh
   ```

   La primera vez pide iniciar sesión en Firebase y el valor de `ADMIN_INICIAL`: escribe el correo del paso 1.
3. Abre https://instrumentacion-adb-fertinal.web.app, entra con esa cuenta y pulsa **Soy el administrador inicial**.
   Solo funciona para ese correo y mientras no exista otro admin. Desde ahí se dan de alta los demás usuarios.

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
  el documento `publico/{token}` que alimenta la vista de invitado y, en fallas, el push a técnicos y
  el estado del instrumento ("Con falla" mientras haya fallas abiertas o en proceso).
- `src/sw.ts`: service worker propio (Workbox + Firebase Messaging) para el app shell, la caché de fotos
  y los avisos push con la app cerrada.
- `firestore.rules` y `storage.rules`: los permisos de la tabla de roles se aplican en el servidor.
