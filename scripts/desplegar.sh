#!/usr/bin/env bash
# Compila y publica la app completa (Hosting, reglas, índices y Cloud Functions).
# Pensado para Google Cloud Shell: bash scripts/desplegar.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# Vite y las Functions necesitan Node 22.
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' 2>/dev/null; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  source "$NVM_DIR/nvm.sh"
  nvm install 22 >/dev/null
  nvm use 22 >/dev/null
fi

FIREBASE="npx -y firebase-tools@15"
if ! $FIREBASE projects:list >/dev/null 2>&1; then
  echo "Primero inicia sesión en Firebase (sigue el enlace que aparece):"
  $FIREBASE login --no-localhost
fi

echo "Instalando dependencias…"
npm ci --no-audit --no-fund
npm --prefix functions ci --no-audit --no-fund

echo "Compilando la app…"
npm run build

echo "Publicando en Firebase…"
$FIREBASE deploy --project instrumentacion-adb

echo
echo "Listo: https://instrumentacion-adb-fertinal.web.app"
