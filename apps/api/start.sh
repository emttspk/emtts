#!/bin/sh
# Combined startup: runs Worker in background then API in foreground.
# Both processes share the same container filesystem, so generated files
# written by the Worker are immediately accessible by the API.

echo "[startup] Starting BullMQ Worker..."
node dist/worker.js &
WORKER_PID=$!

echo "[startup] Starting API server..."
node dist/index.js &
API_PID=$!

trap "kill 0" SIGINT SIGTERM

# Keep the container alive while both processes are expected to run.
wait $WORKER_PID $API_PID
