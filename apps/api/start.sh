#!/bin/sh

MODE="${1:-api}"

STORAGE_ROOT="${STORAGE_PATH:-$(pwd)/storage}"

mkdir -p "$STORAGE_ROOT/uploads" "$STORAGE_ROOT/outputs"
echo "[startup] Storage root: $STORAGE_ROOT"
echo "[startup] Uploads dir: $STORAGE_ROOT/uploads"
echo "[startup] Outputs dir: $STORAGE_ROOT/outputs"

# Resolve a working Chromium binary for Puppeteer.
# Priority:
#   1) PUPPETEER_EXECUTABLE_PATH env var — ONLY if it does NOT point to a snap stub
#   2) Chrome installed by `npx puppeteer browsers install chrome` in the build cache
#   3) Nix-installed chromium (if added via nixpkgs and NOT a snap stub)
# We never use /usr/bin/chromium or /usr/bin/chromium-browser — these are Ubuntu snap stubs on Railway.
_IS_SNAP_STUB() {
  case "$1" in
    /usr/bin/chromium|/usr/bin/chromium-browser|/snap/*) return 0 ;;
    *) return 1 ;;
  esac
}

if [ -n "$PUPPETEER_EXECUTABLE_PATH" ] && ! _IS_SNAP_STUB "$PUPPETEER_EXECUTABLE_PATH"; then
  echo "[startup] Chromium: using env var at $PUPPETEER_EXECUTABLE_PATH"
else
  if [ -n "$PUPPETEER_EXECUTABLE_PATH" ]; then
    echo "[startup] WARNING: PUPPETEER_EXECUTABLE_PATH=$PUPPETEER_EXECUTABLE_PATH is a snap stub — overriding"
    unset PUPPETEER_EXECUTABLE_PATH
  fi
  # Try Puppeteer's own Chrome cache (installed by `npx puppeteer browsers install chrome`)
  PUPPETEER_CACHE="${PUPPETEER_CACHE_DIR:-/root/.cache/puppeteer}"
  PPTR_CHROME="$(find "$PUPPETEER_CACHE" -maxdepth 5 \( -name "chrome" -o -name "chrome-linux" \) -type f 2>/dev/null | head -1)"
  if [ -n "$PPTR_CHROME" ] && [ -f "$PPTR_CHROME" ]; then
    export PUPPETEER_EXECUTABLE_PATH="$PPTR_CHROME"
    echo "[startup] Chromium (Puppeteer cache): $PUPPETEER_EXECUTABLE_PATH"
  else
    # Try Nix-installed chromium — it will NOT be in /usr/bin if from Nix
    NIX_CHROME="$(which chromium 2>/dev/null || true)"
    if [ -n "$NIX_CHROME" ] && ! _IS_SNAP_STUB "$NIX_CHROME"; then
      export PUPPETEER_EXECUTABLE_PATH="$NIX_CHROME"
      echo "[startup] Chromium (Nix): $PUPPETEER_EXECUTABLE_PATH"
    else
      echo "[startup] WARNING: No non-snap Chromium found — leaving PUPPETEER_EXECUTABLE_PATH unset (Puppeteer internal default)"
      unset PUPPETEER_EXECUTABLE_PATH
    fi
  fi
fi

case "$MODE" in
  combined)
    echo "[startup] Starting BullMQ Worker..."
    node dist/worker.js &
    WORKER_PID=$!

    echo "[startup] Starting API server..."
    node dist/index.js &
    API_PID=$!

    shutdown() {
      kill "$WORKER_PID" "$API_PID" 2>/dev/null || true
    }

    trap shutdown INT TERM EXIT

    while kill -0 "$WORKER_PID" 2>/dev/null && kill -0 "$API_PID" 2>/dev/null; do
      sleep 2
    done

    if ! kill -0 "$WORKER_PID" 2>/dev/null; then
      echo "[startup] Worker exited; stopping container"
      wait "$WORKER_PID"
      EXIT_CODE=$?
    else
      echo "[startup] API exited; stopping container"
      wait "$API_PID"
      EXIT_CODE=$?
    fi

    shutdown
    exit "${EXIT_CODE:-1}"
    ;;
  api)
    echo "[startup] Starting API server only..."
    exec node dist/index.js
    ;;
  worker)
    echo "[startup] Starting BullMQ worker only..."
    exec node dist/worker.js
    ;;
  *)
    echo "[startup] Unknown mode '$MODE'"
    exit 1
    ;;
esac
