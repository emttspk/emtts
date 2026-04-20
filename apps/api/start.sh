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

# Forward termination signals to all child processes in this process group.
trap "kill 0" INT TERM

# Keep the container alive while both processes are expected to run.
wait $WORKER_PID $API_PID
