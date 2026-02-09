#!/usr/bin/env bash
set -euo pipefail

echo "Starting backend..."
cd "$(dirname "$0")/.."
python -m backend.main &
BACKEND_PID=$!

echo "Starting Vite..."
cd app
npm run dev -- --host --port 5173

echo "Stopping backend..."
kill $BACKEND_PID 2>/dev/null || true
