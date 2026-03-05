#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Talent Hub — Start Script
# Starts backend (port 3001) and frontend (port 5173) in parallel.
# Logs go to logs/backend.log and logs/frontend.log.
# Run stop.sh to shut everything down cleanly.
# ─────────────────────────────────────────────────────────────

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"

# ── Check for stale PIDs ──────────────────────────────────────
if [ -f "$LOG_DIR/backend.pid" ] || [ -f "$LOG_DIR/frontend.pid" ]; then
  echo "⚠  Stale PID files found. Run ./stop.sh first, or delete logs/*.pid manually."
  exit 1
fi

# ── Backend ───────────────────────────────────────────────────
echo "▶  Starting backend..."
cd "$ROOT/backend"
npm run dev > "$LOG_DIR/backend.log" 2>&1 &
echo $! > "$LOG_DIR/backend.pid"
echo "   Backend PID: $(cat "$LOG_DIR/backend.pid") — logs/backend.log"

# ── Frontend ──────────────────────────────────────────────────
echo "▶  Starting frontend..."
cd "$ROOT/frontend"
npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
echo $! > "$LOG_DIR/frontend.pid"
echo "   Frontend PID: $(cat "$LOG_DIR/frontend.pid") — logs/frontend.log"

# ── Wait for ports ────────────────────────────────────────────
echo ""
echo "⏳  Waiting for services to come up..."

wait_for_port() {
  local port=$1
  local name=$2
  local tries=0
  while ! nc -z localhost "$port" 2>/dev/null; do
    sleep 1
    tries=$((tries + 1))
    if [ $tries -ge 30 ]; then
      echo "✗  $name did not start on port $port within 30s. Check logs/$name.log"
      return 1
    fi
  done
  echo "✓  $name ready on http://localhost:$port"
}

wait_for_port 3001 "backend"
wait_for_port 5173 "frontend"

echo ""
echo "🚀  Talent Hub is running."
echo "   App  →  http://localhost:5173"
echo "   API  →  http://localhost:3001/api"
echo ""
echo "Run ./stop.sh to shut down."
