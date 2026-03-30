#!/usr/bin/env bash
set -euo pipefail

echo "Starting backend..."
cd "$(dirname "$0")/.."
PYBIN="backend/.venv312/bin/python"
if [ ! -x "$PYBIN" ]; then
  PYBIN="backend/.venv/bin/python"
fi
"$PYBIN" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

echo "Starting Vite..."
cd app
npm run dev -- --host --port 5173

echo "Stopping backend..."
kill $BACKEND_PID 2>/dev/null || true
