#!/usr/bin/env bash
# Manda un correo cuando una Cloud Function falla (avisos de fallas, bitácora, borrar fotos,
# aviso de calibraciones). Sin esto, un error en el servidor pasa sin que nadie se entere.
# Se corre una sola vez en Google Cloud Shell:
#   bash scripts/alerta-errores.sh               (avisa al correo con el que entraste a Cloud Shell)
#   bash scripts/alerta-errores.sh otro@correo   (avisa a otro correo)
# Volver a correrlo no duplica nada. A lo más llega un correo por hora mientras siga fallando.
set -euo pipefail

PROYECTO=instrumentacion-adb
NOMBRE='Instrumentación ADB: error en el servidor'
CORREO="${1:-$(gcloud config get-value account 2>/dev/null)}"
if [ -z "$CORREO" ]; then
  echo 'No sé a qué correo avisar. Corre: gcloud auth login, o pon el correo al final del comando.'
  exit 1
fi

echo "Activando Cloud Monitoring…"
gcloud services enable monitoring.googleapis.com --project "$PROYECTO"

CANAL=$(gcloud alpha monitoring channels list --project "$PROYECTO" \
  --filter="type=email AND labels.email_address=\"$CORREO\"" --format='value(name)' | head -n1)
if [ -z "$CANAL" ]; then
  echo "Dando de alta el correo $CORREO…"
  CANAL=$(gcloud alpha monitoring channels create --project "$PROYECTO" --type=email \
    --display-name="Correo $CORREO" --channel-labels=email_address="$CORREO" --format='value(name)')
fi

if gcloud alpha monitoring policies list --project "$PROYECTO" --filter="displayName=\"$NOMBRE\"" --format='value(name)' | grep -q .; then
  echo "La alerta ya existía: los avisos llegan a los correos que tenga dados de alta."
  exit 0
fi

POLITICA=$(mktemp --suffix=.json)
trap 'rm -f "$POLITICA"' EXIT
# Las Functions (2a generación) corren en Cloud Run: cualquier error que anoten cuenta.
cat > "$POLITICA" <<EOF
{
  "displayName": "$NOMBRE",
  "documentation": {
    "content": "Una Cloud Function de Instrumentación ADB anotó un error. Revisa el detalle en Cloud Logging (botón View logs) o pásaselo a quien te ayuda con la app. Si la app funciona normal, puede ser algo pasajero.",
    "mimeType": "text/markdown"
  },
  "combiner": "OR",
  "conditions": [
    {
      "displayName": "Error en una Function",
      "conditionMatchedLog": { "filter": "resource.type=\"cloud_run_revision\" AND severity>=ERROR" }
    }
  ],
  "alertStrategy": { "notificationRateLimit": { "period": "3600s" }, "autoClose": "1800s" },
  "notificationChannels": ["$CANAL"]
}
EOF
gcloud alpha monitoring policies create --project "$PROYECTO" --policy-from-file="$POLITICA" >/dev/null

echo
echo "Listo: si una Function falla, llega un correo a $CORREO (máximo uno por hora)."
