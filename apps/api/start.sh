#!/bin/sh
# Combined startup: runs Worker in background then API in foreground.
# Both processes share the same container filesystem, so generated files
# written by the Worker are immediately accessible by the API.

STORAGE_ROOT="${STORAGE_PATH:-$(pwd)/storage}"

mkdir -p "$STORAGE_ROOT/uploads" "$STORAGE_ROOT/outputs"
echo "[startup] Storage root: $STORAGE_ROOT"
echo "[startup] Uploads dir: $STORAGE_ROOT/uploads"
echo "[startup] Outputs dir: $STORAGE_ROOT/outputs"

# Prefer non-snap Chromium path in Railway containers.
export CHROME_PATH="${CHROME_PATH:-/usr/bin/chromium}"
export PUPPETEER_EXECUTABLE_PATH="${PUPPETEER_EXECUTABLE_PATH:-$CHROME_PATH}"
echo "[startup] Chromium path: $PUPPETEER_EXECUTABLE_PATH"

echo "[startup] Starting BullMQ Worker..."
node dist/worker.js &
WORKER_PID=$!

echo "[startup] Starting API server..."
node dist/index.js &

# Deployment touch (v3): keep runtime/start script changes inside /apps/api to satisfy Railway watch patterns.
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
