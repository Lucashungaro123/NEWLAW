#!/bin/bash
# Atalho para rodar backend + Tauri em modo desenvolvimento com um clique.

set -euo pipefail

ROOT="$HOME/Documents/NEWLAW"
PYBIN="$ROOT/backend/.venv/bin/python"

cd "$ROOT" || exit 1

# Libera porta do Vite, se estiver presa
pkill -f "vite --host --port 5173" 2>/dev/null || true

# Sobe backend FastAPI
source "$ROOT/backend/.venv/bin/activate"
"$PYBIN" -m uvicorn backend.main:app --reload --port 8000 &
BACK_PID=$!

# Roda Tauri (sobe o frontend Vite e abre a janela)
cargo tauri dev

# Ao sair do Tauri, derruba o backend
kill "$BACK_PID" 2>/dev/null || true
