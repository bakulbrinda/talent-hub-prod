#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Talent Hub — Local Start Script
# Starts backend on port 3002. Frontend is served from the same port.
# Access: http://localhost:3002
#
# Run ./stop.sh to shut down.
# ─────────────────────────────────────────────────────────────

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT/logs"
ENV_FILE="$ROOT/backend/.env"

mkdir -p "$LOG_DIR"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC}  $*"; }
info() { echo -e "${BOLD}▶${NC}  $*"; }
fail() { echo -e "${RED}✗${NC}  $*"; exit 1; }

# ── Stale PID guard ───────────────────────────────────────────
if [ -f "$LOG_DIR/backend.pid" ]; then
  echo -e "${YELLOW}⚠${NC}  Stale PID file found for 'backend'. Run ./stop.sh first."
  exit 1
fi

# ── Kill any orphan process already on backend port ──────────
BACKEND_PORT=$(grep -E '^PORT=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 | tr -d ' ' || echo "3002")
ORPHAN=$(lsof -ti :"$BACKEND_PORT" 2>/dev/null || true)
if [ -n "$ORPHAN" ]; then
  echo -e "${YELLOW}⚠${NC}  Port $BACKEND_PORT in use (PID $ORPHAN) — killing before restart..."
  kill "$ORPHAN" 2>/dev/null || true
  sleep 1
fi

# ── Backend ───────────────────────────────────────────────────
info "Starting backend..."
cd "$ROOT/backend"
npm run dev > "$LOG_DIR/backend.log" 2>&1 &
echo $! > "$LOG_DIR/backend.pid"
echo "   PID $(cat "$LOG_DIR/backend.pid") — logs/backend.log"

# ── Wait for backend ──────────────────────────────────────────
echo ""
echo "   Waiting for backend to be ready..."
tries=0
while ! nc -z localhost "$BACKEND_PORT" 2>/dev/null; do
  sleep 1
  tries=$((tries + 1))
  if [ $tries -ge 40 ]; then
    fail "Backend did not start on port $BACKEND_PORT within 40 s. Check logs/backend.log"
  fi
done
ok "Backend ready  →  http://localhost:$BACKEND_PORT"

# ── Summary ───────────────────────────────────────────────────
echo ""
echo -e "${BOLD}🚀  Talent Hub is running locally.${NC}"
echo ""
echo -e "   Open  →  ${BOLD}http://localhost:$BACKEND_PORT${NC}"
echo "   Login →  admin@company.com / Admin@123"
echo ""
echo    "   Run ./stop.sh to shut down."
