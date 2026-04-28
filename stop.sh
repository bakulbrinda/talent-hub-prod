#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Talent Hub — Stop Script
# Gracefully stops cloudflared, backend, and frontend.
# ─────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT/logs"

stop_process() {
  local name=$1
  local pid_file="$LOG_DIR/$name.pid"

  if [ ! -f "$pid_file" ]; then
    echo "   $name: no PID file (already stopped?)"
    return
  fi

  local pid
  pid=$(cat "$pid_file")

  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null
    local tries=0
    while kill -0 "$pid" 2>/dev/null && [ $tries -lt 5 ]; do
      sleep 1
      tries=$((tries + 1))
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null
      echo "✓  $name (PID $pid) force-killed"
    else
      echo "✓  $name (PID $pid) stopped"
    fi
  else
    echo "   $name (PID $pid) was not running"
  fi

  rm -f "$pid_file"
}

echo "■  Stopping Talent Hub..."
stop_process "backend"
# clean up any stale pid files from old tunnel setup
rm -f "$LOG_DIR/cloudflared.pid" "$LOG_DIR/frontend.pid"
echo ""
echo "All services stopped."
