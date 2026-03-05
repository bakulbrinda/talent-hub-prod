#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Talent Hub — Stop Script
# Gracefully stops backend and frontend started by start.sh.
# ─────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT/logs"

stop_process() {
  local name=$1
  local pid_file="$LOG_DIR/$name.pid"

  if [ ! -f "$pid_file" ]; then
    echo "   $name: no PID file found (already stopped?)"
    return
  fi

  local pid
  pid=$(cat "$pid_file")

  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null
    # Wait up to 5s for graceful exit, then force-kill
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
stop_process "frontend"
stop_process "backend"
echo ""
echo "All services stopped."
