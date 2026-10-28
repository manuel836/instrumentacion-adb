# Respaldos y cómo recuperar algo borrado

Todo se hace en [Google Cloud Shell](https://shell.cloud.google.com/?show=terminal), entrando con la
cuenta dueña del proyecto. Si un comando dice `You do not currently have an active account selected`,
corre primero `gcloud auth login` y sigue el enlace.

## Qué queda respaldado

Se activa una sola vez con estos cuatro comandos:

```bash
gcloud firestore databases update --database='(default)' --enable-pitr --project=instrumentacion-adb
gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=14d --project=instrumentacion-adb
gcloud firestore backups schedules create --database='(default)' --recurrence=weekly --day-of-week=SUN --retention=14w --project=instrumentacion-adb
gcloud storage buckets update gs://instrumentacion-adb.firebasestorage.app --soft-delete-duration=30d --project=instrumentacion-adb
```

| Qué | Hasta cuándo se puede recuperar |
| --- | --- |
| Fichas, fallas, chat, calibraciones, refacciones, usuarios y bitácora, **al minuto** | 7 días |
| Lo mismo, como estaba cada día | 14 días |
| Lo mismo, como estaba cada domingo | 14 semanas |
| Fotos y documentos borrados | 30 días |

Los respaldos viven en Google Cloud, fuera de la app: borrar algo en la app no borra el respaldo.

Para comprobar que siguen activos:

```bash
gcloud firestore backups schedules list --database='(default)' --project=instrumentacion-adb
gcloud firestore backups list --project=instrumentacion-adb
```

## Antes de recuperar

Anota **qué** se borró (el tag del instrumento, la falla) y **cuándo**, aunque sea aproximado. La
bitácora de cambios (Menú > Bitácora de cambios) dice a qué hora se eliminó un instrumento.

La recuperación nunca toca la app directamente: primero se saca una copia aparte llamada
`recuperada`, de ahí se devuelve solo lo que se borró, y al final se borra la copia.

## 1. Sacar una copia de cómo estaba

**Si pasó en los últimos 7 días**, pide la copia de un minuto antes del error. La hora va con la zona
de la planta (`-06:00`) y en minutos cerrados:

```bash
gcloud firestore databases clone \
  --source-database='projects/instrumentacion-adb/databases/(default)' \
  --snapshot-time='2026-10-27T15:29:00-06:00' \
  --destination-database=recuperada --project=instrumentacion-adb
```

**Si fue hace más**, busca el respaldo diario o del domingo anterior al error:

```bash
gcloud firestore backups list --project=instrumentacion-adb --format='table(name,snapshotTime)'
```

y copia el `name` del que sirva en este comando:

```bash
gcloud firestore databases restore \
  --source-backup=projects/instrumentacion-adb/locations/LUGAR/backups/ID \
  --destination-database=recuperada --project=instrumentacion-adb
```

Tarda unos minutos. Termina cuando `gcloud firestore databases list --project=instrumentacion-adb`
muestra `recuperada`.

## 2. Devolver lo que se borró

```bash
cd ~/instrumentacion-adb && git pull && npm --prefix functions ci
gcloud auth application-default login
cd functions
```

Un instrumento con todas sus fallas (y su chat), por su tag. Primero con `--ver` para ver qué haría:

```bash
GCLOUD_PROJECT=instrumentacion-adb node scripts/recuperar.mjs --tag=PT-101 --ver
GCLOUD_PROJECT=instrumentacion-adb node scripts/recuperar.mjs --tag=PT-101
```

O algo en particular por su ruta, que es lo que sale en la dirección de la app
(`/fallas/abc123` → `fallas/abc123`):

```bash
GCLOUD_PROJECT=instrumentacion-adb node scripts/recuperar.mjs fallas/abc123
```

Lo que ya existe en la app no se toca: solo regresa lo que falta. Al devolver una falla, los técnicos
reciben otra vez el aviso, como si se acabara de reportar.

Al final el script imprime los comandos para devolver las fotos y documentos de lo que regresó
(si se borraron hace menos de 30 días). Pégalos tal cual; pueden tardar hasta una hora en aparecer.

## 3. Borrar la copia

La copia cobra almacenamiento mientras exista. Cuando ya esté todo de vuelta:

```bash
gcloud firestore databases delete --database=recuperada --project=instrumentacion-adb
```

Fíjate que diga `recuperada`. **Nunca** pongas `(default)` en ese comando: esa es la de la app.

## Solo una foto o un documento

Si se borró solo un archivo (por ejemplo, un PDF de la ficha), no hace falta la copia de Firestore.
Búscalo, recupéralo y bájalo a tu computadora:

```bash
gcloud storage ls --soft-deleted "gs://instrumentacion-adb.firebasestorage.app/instrumentos/ID/**"
gcloud storage restore "gs://instrumentacion-adb.firebasestorage.app/instrumentos/ID/docs/ARCHIVO"
gcloud storage cp "gs://instrumentacion-adb.firebasestorage.app/instrumentos/ID/docs/ARCHIVO" .
cloudshell download ARCHIVO
```

`ID` es lo que sale en la dirección de la ficha (`/instrumentos/abc123`). Después súbelo otra vez
desde la app, en Editar de la ficha.
