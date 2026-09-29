#!/usr/bin/env bash
# yt-service starter — restarts uvicorn if it dies, logs to yt-service.log
cd "$(dirname "$0")"
PY=/home/z/.venv/bin/python3
PORT=3031

while true; do
  echo "[yt-service] starting on :$PORT $(date)"
  "$PY" -m uvicorn app:app --host 127.0.0.1 --port "$PORT" --log-level warning
  code=$?
  echo "[yt-service] exited with $code — restarting in 2s"
  sleep 2
done
