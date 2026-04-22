#!/bin/sh

SERVICE_NAME="${RAILWAY_SERVICE_NAME:-}"

echo "[railway-start] service=${SERVICE_NAME:-unknown}"

case "$SERVICE_NAME" in
  Api)
    export STORAGE_PATH="${STORAGE_PATH:-/app/storage}"
    exec sh apps/api/start.sh combined
    ;;
  Worker)
    echo "[Worker] Standalone worker disabled. Queue processing runs inside the Api service container."
    exec node deploy/worker-idle/idle.js
    ;;
  Python)
    cd python-service || exit 1
    export PYTHONWARNINGS="ignore::DeprecationWarning"
    export PYTHONUNBUFFERED=1
    exec .venv/bin/python app.py
    ;;
  *)
    echo "[railway-start] Unknown service '$SERVICE_NAME'. Falling back to Api startup."
    export STORAGE_PATH="${STORAGE_PATH:-/app/storage}"
    exec sh apps/api/start.sh combined
    ;;
esac