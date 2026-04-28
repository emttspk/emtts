#!/bin/sh

SERVICE_NAME="${RAILWAY_SERVICE_NAME:-}"

echo "[railway-start] service=${SERVICE_NAME:-unknown}"

case "$SERVICE_NAME" in
  Api)
    export STORAGE_PATH="${STORAGE_PATH:-/app/storage}"
    exec sh apps/api/start.sh combined
    ;;
  Worker)
    if [ -z "${DATABASE_URL:-}" ]; then
      echo "[Worker] DATABASE_URL missing. Running idle process to avoid restart loop."
      exec node deploy/worker-idle/idle.js
    fi
    export STORAGE_PATH="${STORAGE_PATH:-/app/storage}"
    exec sh apps/api/start.sh worker
    ;;
  Python)
    cd python-service || exit 1
    export PYTHONWARNINGS="ignore::DeprecationWarning"
    export PYTHONUNBUFFERED=1
    exec .venv/bin/python app.py
    ;;
  Postgres|Redis)
    echo "[railway-start] '$SERVICE_NAME' is expected to be a managed data service. App startup skipped."
    exec node deploy/worker-idle/idle.js
    ;;
  "")
    echo "[railway-start] Service name missing. Defaulting to Api startup."
    export STORAGE_PATH="${STORAGE_PATH:-/app/storage}"
    exec sh apps/api/start.sh combined
    ;;
  *)
    echo "[railway-start] Unknown service '$SERVICE_NAME'. Running idle process to avoid restart loops."
    exec node deploy/worker-idle/idle.js
    ;;
esac