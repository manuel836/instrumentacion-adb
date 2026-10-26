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
| 4. Bitácora y exportes | Bitácora de cambios (quién, qué, cuándo, antes y después) escrita por Functions; Excel (3 reportes) y vista de impresión a PDF | En producción |
| 5. Mejoras | Contraseña temporal puesta por el admin; borrar instrumentos con todo lo suyo; el catálogo recuerda búsqueda, filtros y posición; revisar el tag antes de grabarlo; importar desde Excel o CSV; pantalla de inicio con resumen; avisos de fallas por área; aviso semanal de calibraciones; hoja de vida en PDF; app más ligera e íconos propios; refacciones con kardex | En producción |
| 6. Orden y seguridad | Canal general que empieza en blanco cada día, con historial por día y chats privados; el chat de una falla se cierra con ella y conserva lo hablado; próxima calibración opcional; sub áreas editables (el mismo tag puede repetirse en otra caldera); marca "Puede disparar la caldera" con aviso rojo antes de intervenir | Lista para prueba en campo |

## Desarrollo local con emuladores

Requisitos: Node 22, Java 21 (emulador de Firestore) y `npm i -g firebase-tools`.

```bash
npm install
npm --prefix functions install
npm --prefix functions run build
printf 'VITE_PUBLIC_ORIGIN=http://localhost:4173\nVITE_USE_EMULATORS=true\n' > .env.local
echo 'ADMIN_INICIAL=manuel@adb.test' > functions/.env.local
firebase emulators:start --project demo-instrumentacion-adb --only auth,firestore,storage,functions

# En otra terminal: crea el admin inicial en los emuladores
cd functions && FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  GCLOUD_PROJECT=demo-instrumentacion-adb node scripts/crear-admin.mjs manuel@adb.test "Manuel" 'Prueba1234'

npm run dev
```

Con `VITE_USE_EMULATORS=true`, los IDs de proyecto vacíos caen en `demo-instrumentacion-adb`.
No copies `.env.example` tal cual: trae el ID del proyecto real y las Functions del emulador rechazan
las llamadas (error de CORS).

Pruebas:

- `npm test`: pruebas unitarias (token del tag, tamaño NDEF, cálculos de calibración, lectura de Excel
  y CSV para importar, y el aviso semanal de calibraciones de las Functions).
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
- `node e2e/usuarios.cjs`: un usuario cambia su propia contraseña (Menú > Cambiar contraseña) y el
  admin lo elimina (ya no puede entrar y queda en la bitácora). Solo necesita el admin de prueba.
- `node e2e/restablecer.cjs`: el admin pone una contraseña temporal; al entrar, la app pide cambiarla.
- `node e2e/borrar.cjs`: borrar un instrumento con fotos, documentos, calibraciones y fallas (con chat).
- `node e2e/catalogo.cjs`: búsqueda en más campos, filtros extra y regresar al mismo lugar de la lista.
- `node e2e/tags.cjs`: grabar un tag en blanco, uno de otro instrumento (pasarlo) y uno con otra URL.
- `node e2e/areas.cjs`: el admin asigna el área de cada usuario y los avisos de fallas siguen el área.
- `node e2e/aviso-calibraciones.cjs`: a quién le llega el aviso de los lunes y que sus números sean
  los del inicio y el catálogo (llama directo a la lógica: el emulador no corre funciones programadas).
- `node e2e/hoja-de-vida.cjs`: hoja de vida con datos, fotos, calibraciones, fallas y su PDF.
- `node e2e/ligera.cjs`: las pantallas raras se bajan al abrirlas y la app se recupera de una versión vieja.
- `node e2e/refacciones.cjs`: alta, entradas, salidas, conteo, uso en una falla, inventario en Excel.
- `node e2e/chat.cjs`: el canal general solo muestra lo de hoy, el historial por día (solo para leer),
  un chat privado entre una operadora y un técnico con foto y globo de no leídos, y que el admin no
  pueda ver chats privados ajenos.
- `node e2e/falla-cerrada.cjs`: al cerrar la falla su chat queda de solo lectura con lo hablado y las fotos.
- `node e2e/calibracion-opcional.cjs`: calibración sin próxima fecha (la ficha queda sin programar) y con el atajo de 6 meses.
- `node e2e/subareas.cjs`: el admin da de alta sub áreas, el mismo tag en dos calderas, filtro del
  catálogo, renombrar y no dejar quitar una sub área en uso.
- `node e2e/dispara-caldera.cjs`: la marca de disparo en el formulario, la ficha, el catálogo, al
  calibrar, en la falla y en la vista del tag sin cuenta.
- `node e2e/importar.cjs`: plantilla, 520 filas con errores, actualizar existentes y CSV con acentos.
  Va casi al final: las 520 altas disparan muchos registros de bitácora que retrasan a las demás.
- `node e2e/inicio.cjs`: cada número del inicio coincide con la lista a la que lleva. Va al final.

Con los emuladores recién arrancados y el admin creado, el orden que funciona es: fase1, fase2, fase3,
fase4, usuarios, restablecer, borrar, catalogo, tags, areas, aviso-calibraciones, hoja-de-vida,
ligera, refacciones, chat, falla-cerrada, calibracion-opcional, subareas, dispara-caldera, importar e inicio.

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
- `src/components/Diferida.tsx`: las pantallas que se usan poco se descargan al abrirlas; si se publicó
  una versión nueva y el archivo viejo ya no existe, la app recarga una vez.
- `src/components/Icono.tsx`: íconos propios (SVG) en lugar de emojis.
- `functions/src/calibraciones.ts`: el aviso de los lunes a las 7:00 (hora de la planta) con las
  calibraciones vencidas y por vencer de cada área. Usa Cloud Scheduler (el primer despliegue lo activa).
- `src/lib/refacciones.ts`: cada entrada o salida es un documento en `movimientos` que se escribe en el
  mismo lote que la existencia; las reglas solo aceptan el cambio si cuadra con el movimiento.
- `src/lib/chat.ts` y `src/lib/privados.ts`: el canal general filtra los mensajes desde la medianoche
  (el historial los agrupa por día, nada se borra). Un chat privado vive en `chats_privados/{uidA_uidB}`
  (los dos uid ordenados), así las reglas saben quién puede leerlo sin consultar otro documento.
  La lista de personas sale de `directorio/{uid}`, que una Function mantiene igual que `usuarios`.
- `src/lib/subareas.ts`: las sub áreas son documentos en `subareas` que edita el admin. El tag ISA es
  único por área y sub área, por eso el mismo PT-101 puede existir en la Caldera 1 y en la Caldera 2.
- `src/components/AvisoDisparo.tsx`: el aviso rojo de los instrumentos marcados con
  "Puede disparar la caldera"; sale en la ficha, la hoja de vida, al calibrar, en la falla y en el tag.
