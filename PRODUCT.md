# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Técnicos de instrumentación**: trabajan en campo junto a los equipos. Dan de alta instrumentos, graban tags NFC y fotos de ubicación, toman, atienden y cierran fallas, registran calibraciones y usan el chat.
- **Operadores**: recorren la planta, consultan fichas, reportan fallas con fotos y usan el chat. No cambian datos del instrumento ni el estado de las fallas.
- **Administrador (Manuel)**: todo lo anterior, más usuarios y roles, sub áreas, importar desde Excel, bitácora y exportes.
- **Invitado sin cuenta**: cualquiera que acerque un teléfono a un tag. Ve solo ese instrumento: servicio, área, estado y fotos de ubicación.

Menos de 20 usuarios y menos de 500 instrumentos, repartidos en tres áreas: Generación de vapor, Almacenamiento de amoniaco y Tratamiento de agua.

## Product Purpose

Instrumentación ADB concentra el inventario de instrumentación de Agroindustrias del Balsas, identifica cada instrumento con un tag NFC y gestiona sus fallas de punta a punta, junto con calibraciones, chat del equipo, bitácora de cambios, refacciones y exportes, incluso sin señal.

Éxito, según los criterios de aceptación de la especificación: en modo avión se busca un instrumento, se abre su ficha y se ven sus fotos; un invitado escanea un tag y ve solo ese instrumento; un operador reporta una falla sin señal y, al reconectar, los técnicos reciben el aviso en menos de un minuto; cada edición queda en la bitácora con valor anterior y nuevo; los exportes abren bien en Excel y en el teléfono.

## Positioning

Está hecha para esta planta y su forma de trabajar, no es un CMMS genérico:

- El tag físico lleva directo a la ficha del instrumento, con o sin sesión, y su token no se puede adivinar.
- Todo el catálogo vive en el teléfono: buscar, abrir fichas, reportar y calibrar funcionan sin señal, y las fotos esperan en cola hasta que la hay.
- La calibración cambia según el tipo de instrumento: transmisor (leído en unidades de proceso o en mA), interruptor (disparo, reposición y diferencial), válvula de control (carrera, señal invertida) y válvula de corte KV (prueba funcional, incluidas las de doble efecto).
- Los instrumentos que pueden disparar la caldera llevan un aviso rojo antes de intervenirlos.
- Las sub áreas permiten el mismo tag ISA en la Caldera 1 y en la Caldera 2.

## Operating Context

- Planta industrial con zonas sin señal junto a los equipos, cerca de calderas y de amoniaco.
- Teléfonos Android con Chrome y NFC (Web NFC solo existe ahí). También hay quien usa iPhone: puede consultar y reportar, pero no grabar ni leer tags dentro de la app, y sus fotos salen en JPEG.
- Tags NTAG213 comunes, montados con separador de ferrita o en placa no metálica, fijados a un soporte frío.
- La app se instala como PWA, en vertical, en español de México.
- Avisos push: falla nueva a los técnicos de su área, mensajes de chat, y un resumen de calibraciones vencidas y por vencer cada lunes a las 7:00.
- El administrador publica desde Google Cloud Shell.
- El teléfono se usa con las manos descubiertas (sin guantes) y, por lo general, a la sombra.
- Sin confirmar: si el administrador usa también computadora para importar y exportar.

## Capabilities and Constraints

- Ficha con tag ISA-5.1 (ej. PT-101), lazo, servicio, área, sub área, ubicación, P&ID, marca, modelo, serie, rango, unidades, señal (4-20 mA, HART…), alimentación (24 VCD o 120 VCA), tipo de instrumento y documentos (hojas de datos, manuales, fotos, PDF).
- Galería de ubicación de 1 a 6 fotos con pie de texto y portada, a pantalla completa con zoom.
- Estados del instrumento: Operando, Con falla, Fuera de servicio. Estados de la falla: Abierta, En proceso, Cerrada. Al cerrar, causa raíz y acción correctiva son obligatorias. El chat de una falla queda de solo lectura al cerrarse.
- Calibraciones As-Found / As-Left con tolerancia y próxima calibración opcional. Hoja de vida en PDF.
- Chat: canal general que empieza en blanco cada día (con historial por día), chat por falla y chats privados. El administrador no puede leer chats privados ajenos.
- Refacciones con kardex (entradas, salidas, conteo, uso en una falla).
- Importar instrumentos desde Excel o CSV; exportar a Excel (instrumentos, fallas por periodo, calibraciones) y a PDF por vista de impresión.
- Los permisos se aplican en el servidor (reglas de Firestore y Storage); la interfaz solo los refleja. El invitado nunca ve rangos, setpoints, fallas, calibraciones ni documentos.
- La bitácora la escriben las Functions; nadie la edita ni la borra.
- Fotos: 1600 px de lado mayor más miniatura de 320 px; Storage rechaza fotos de 3 MB o más y documentos de 25 MB o más.
- El dominio `instrumentacion-adb-fertinal.web.app` va grabado en cada tag: cambiarlo obliga a regrabarlos. No se usa `makeReadOnly()`.
- Fuera de alcance: integración con PLC/SCADA.

Vocabulario de la planta que la interfaz ya usa: Ficha, Hoja de vida, Vincular tag, Escanear, Reportar falla, Tomar, Cerrar, Bitácora de cambios, Refacciones, Sub área, Canal general, "Puede disparar la caldera".

## Brand Commitments

- Nombre: **Instrumentación ADB**, con "Agroindustrias del Balsas" como subtítulo en el acceso; nombre corto al instalar: "Instrumentos".
- Ícono: `public/icons/icon.svg` (y sus PNG de 192 y 512 px).
- Color: el verde del logo de Fertinal (#238029) es el color de la app (encabezado, botón principal, enlaces, ícono y barra del teléfono). Los colores van por su papel en `src/index.css`: `marca`, `bien` (el mismo verde), `aviso` (ámbar), `peligro` (rojo) e `info` (azul); en el código se usan esos nombres, no `red-`, `amber-` ni `emerald-`.
- Voz: español sencillo y directo, de tú, que dice qué pasa y qué hacer ("Sin conexión: los cambios se guardan en el teléfono", "Toca aquí para elegir la tuya").
- La app debe llevar el **logo oficial de Fertinal** (lo pidió Manuel el 27 de octubre de 2026 y mandó el archivo): `docs/marca/logo-fertinal.png`, símbolo arriba y la palabra "Fertinal" abajo, con ®. Usar ese archivo tal cual; no redibujarlo, recortarle partes ni cambiarle los colores.

## Evidence on Hand

- Especificación del 24 de octubre de 2026 (PDF de Manuel, fuera del repositorio).
- Logo oficial de Fertinal: `docs/marca/logo-fertinal.png` (PNG de 2792 × 1646 px).
- Pruebas de punta a punta en `e2e/` y pruebas unitarias y de reglas en `src/`, `functions/src` y `tests/`.
- No hay en el repositorio fotos reales de la planta, cifras de uso, testimonios ni datos reales del catálogo: no inventarlos.

## Product Principles

1. **Sin señal también funciona.** Todo flujo de campo trabaja sin conexión y deja claro qué falta por subir o sincronizar.
2. **La seguridad del proceso va primero.** El aviso de disparo de caldera y el estado de falla no se pueden pasar por alto.
3. **Del tag a la acción en pocos toques.** Escanear, ver la ficha y reportar o atender una falla es el camino principal.
4. **Se habla como en la planta.** Términos ISA y nombres de los equipos, en español sencillo.
5. **Los permisos viven en el servidor.** La interfaz muestra solo lo que cada rol puede hacer, pero no es la que protege los datos.
