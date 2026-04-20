#!/bin/sh
# Combined startup: runs Worker in background then API in foreground.
# Both processes share the same container filesystem, so generated files
# written by the Worker are immediately accessible by the API.

set -e

echo "[startup] Starting BullMQ Worker..."
node apps/api/dist/worker.js &
WORKER_PID=$!

echo "[startup] Starting API server..."
node apps/api/dist/index.js &
API_PID=$!

# Forward SIGTERM to both child processes
trap 'kill $WORKER_PID $API_PID 2>/dev/null; exit 0' TERM INT

# Wait for either process to exit; if either dies, kill both and exit
wait $API_PID
API_EXIT=$?
kill $WORKER_PID 2>/dev/null || true
exit $API_EXIT
