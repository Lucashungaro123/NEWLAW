#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/scripts/vps.env"
SYNC_SCRIPT="$ROOT_DIR/scripts/vps-sync.sh"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

VPS_USER="${VPS_USER:-lucas}"
VPS_HOST="${VPS_HOST:-76.13.165.119}"
VPS_PATH="${VPS_PATH:-/opt/newlaw}"
VPS_SERVICE="${VPS_SERVICE:-newlaw-api}"
API_BASE_URL="${API_BASE_URL:-https://api.newlaw.app.br}"

DO_SYNC=1
DO_INSTALL=1
DO_RESTART=1
DO_CHECK=1

usage() {
  cat <<'EOF'
Uso:
  ./scripts/vps-deploy.sh [--sync-only] [--restart-only] [--no-check]

Opcoes:
  --sync-only     Faz apenas sincronizacao de arquivos (rsync).
  --skip-install  Pula instalacao de dependencias Python no VPS.
  --restart-only  Reinicia apenas o servico no VPS.
  --no-check      Pula validacoes HTTP apos restart.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --sync-only)
      DO_SYNC=1
      DO_INSTALL=0
      DO_RESTART=0
      DO_CHECK=0
      ;;
    --skip-install)
      DO_INSTALL=0
      ;;
    --restart-only)
      DO_SYNC=0
      DO_INSTALL=0
      DO_RESTART=1
      DO_CHECK=1
      ;;
    --no-check)
      DO_CHECK=0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Opcao invalida: $arg"
      usage
      exit 1
      ;;
  esac
done

if [[ "$DO_SYNC" -eq 1 ]]; then
  "$SYNC_SCRIPT"
fi

if [[ "$DO_INSTALL" -eq 1 ]]; then
  echo "Instalando dependencias Python no VPS..."
  ssh "${VPS_USER}@${VPS_HOST}" "
    set -e
    cd ${VPS_PATH}
    source backend/.venv/bin/activate
    pip install -r backend/requirements.txt
  "
fi

if [[ "$DO_RESTART" -eq 1 ]]; then
  echo "Reiniciando servico ${VPS_SERVICE} no VPS..."
  ssh "${VPS_USER}@${VPS_HOST}" "
    set -e
    sudo systemctl restart ${VPS_SERVICE}
    sleep 2
    sudo systemctl --no-pager --full status ${VPS_SERVICE} | sed -n '1,20p'
  "
fi

if [[ "$DO_CHECK" -eq 1 ]]; then
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT

  echo "Validando endpoints..."
  health_code=""
  for _ in {1..12}; do
    health_code="$(curl -sS -o "$TMP_DIR/health.out" -w '%{http_code}' "${API_BASE_URL}/health" || true)"
    if [[ "$health_code" == "200" ]]; then
      break
    fi
    sleep 2
  done

  invite_code="$(curl -sS -o "$TMP_DIR/invite.out" -w '%{http_code}' "${API_BASE_URL}/invite" || true)"
  capacity_code="$(curl -sS -o "$TMP_DIR/capacity.out" -w '%{http_code}' "${API_BASE_URL}/team-members/capacity" || true)"

  echo "health  : ${health_code} (esperado 200)"
  echo "invite  : ${invite_code} (esperado 400 sem token)"
  echo "capacity: ${capacity_code} (esperado 401 sem login)"

  if [[ "$health_code" != "200" ]]; then
    echo "Falha no /health. Primeiros bytes da resposta:"
    head -c 400 "$TMP_DIR/health.out" || true
    echo
    exit 1
  fi

  if [[ "$invite_code" != "400" ]]; then
    echo "Aviso: /invite retornou codigo inesperado."
    head -c 400 "$TMP_DIR/invite.out" || true
    echo
  fi

  if [[ "$capacity_code" != "401" ]]; then
    echo "Aviso: /team-members/capacity retornou codigo inesperado."
    head -c 400 "$TMP_DIR/capacity.out" || true
    echo
  fi
fi

echo "Deploy para VPS finalizado."
