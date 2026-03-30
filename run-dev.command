#!/bin/bash
# Atalho para rodar backend + Tauri em modo desenvolvimento com um clique.

set -euo pipefail

ROOT="$HOME/Documents/NEWLAW"
API_URL="${VITE_API_URL:-https://api.newlaw.app.br}"
PYBIN="$ROOT/backend/.venv312/bin/python"
if [ ! -x "$PYBIN" ]; then
  PYBIN="$ROOT/backend/.venv/bin/python"
fi

cd "$ROOT" || exit 1

echo "Using API: $API_URL"

# Libera porta do Vite, se estiver presa
pkill -f "vite --host --port 5173" 2>/dev/null || true

BACK_PID=""
if [ "$API_URL" = "http://127.0.0.1:8000" ] || [ "$API_URL" = "http://localhost:8000" ]; then
  # Sobe backend FastAPI apenas quando o app for usar a API local.
  source "$(dirname "$PYBIN")/activate"
  "$PYBIN" -m uvicorn backend.main:app --reload --port 8000 &
  BACK_PID=$!
fi

# Roda Tauri (sobe o frontend Vite e abre a janela)
VITE_API_URL="$API_URL" cargo tauri dev

# Ao sair do Tauri, derruba o backend
if [ -n "$BACK_PID" ]; then
  kill "$BACK_PID" 2>/dev/null || true
fi
