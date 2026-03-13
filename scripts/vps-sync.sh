#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/scripts/vps.env"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

VPS_USER="${VPS_USER:-lucas}"
VPS_HOST="${VPS_HOST:-76.13.165.119}"
VPS_PATH="${VPS_PATH:-/opt/newlaw}"
REMOTE="${VPS_USER}@${VPS_HOST}:${VPS_PATH}/"

echo "Sincronizando projeto local para ${REMOTE}"

rsync -az --delete \
  --exclude '.git/' \
  --exclude '.DS_Store' \
  --exclude 'data.db' \
  --exclude 'storage/' \
  --exclude 'backend/.venv/' \
  --exclude 'app/node_modules/' \
  --exclude 'app/dist/' \
  --exclude 'src-tauri/target/' \
  --exclude 'src-tauri/.cargo/' \
  --exclude '.idea/' \
  --exclude '.vscode/' \
  "$ROOT_DIR/" "$REMOTE"

echo "Sincronizacao concluida."
