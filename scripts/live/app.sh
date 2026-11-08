#!/usr/bin/env bash
# Run loop for the live app (devbox): restarts the server whenever it exits.
# Usage: scripts/live/app.sh <port>   (cwd = the live checkout, env from its .env.local)
PORT="${1:-3400}"
while true; do
  echo "[app] start $(date -Is)"
  ./node_modules/.bin/next dev --turbopack -H 0.0.0.0 --port "$PORT"
  echo "[app] exited $? $(date -Is)"; sleep 2
done
