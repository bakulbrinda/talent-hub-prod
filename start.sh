#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Talent Hub — Start Script
# 1. Installs cloudflared if missing (via Homebrew)
# 2. Starts Cloudflare quick tunnel → captures URL → patches backend/.env
# 3. Starts backend (port 3001) — reads the live APP_URL on boot
# 4. Starts frontend (port 5179)
#
# Run ./stop.sh to shut everything down cleanly.
# ─────────────────────────────────────────────────────────────

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT/logs"
ENV_FILE="$ROOT/backend/.env"
CF_LOG="$LOG_DIR/cloudflared.log"

mkdir -p "$LOG_DIR"

# ── Colour helpers ────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC}  $*"; }
info() { echo -e "${BOLD}▶${NC}  $*"; }
fail() { echo -e "${RED}✗${NC}  $*"; exit 1; }

# ── Stale PID guard ───────────────────────────────────────────
for svc in cloudflared backend frontend; do
  if [ -f "$LOG_DIR/$svc.pid" ]; then
    echo -e "${YELLOW}⚠${NC}  Stale PID file found for '$svc'. Run ./stop.sh first."
    exit 1
  fi
done

# ── Kill any orphan process already on port 3001 ─────────────
# (handles case where backend was started manually, not via start.sh)
ORPHAN=$(lsof -ti :3001 2>/dev/null || true)
if [ -n "$ORPHAN" ]; then
  echo -e "${YELLOW}⚠${NC}  Port 3001 in use (PID $ORPHAN) — killing before restart..."
  kill "$ORPHAN" 2>/dev/null || true
  sleep 1
fi

# ── Install cloudflared if missing ────────────────────────────
if ! command -v cloudflared &>/dev/null; then
  info "cloudflared not found — installing via Homebrew..."
  brew install cloudflared
  ok "cloudflared installed"
fi

# ── Cloudflare Tunnel ─────────────────────────────────────────
info "Starting Cloudflare tunnel..."
> "$CF_LOG"
cloudflared tunnel --url http://localhost:3001 >> "$CF_LOG" 2>&1 &
echo $! > "$LOG_DIR/cloudflared.pid"

echo "   Waiting for tunnel URL (up to 30 s)..."
TUNNEL_URL=""
for i in $(seq 1 30); do
  TUNNEL_URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' "$CF_LOG" 2>/dev/null | head -1)
  [ -n "$TUNNEL_URL" ] && break
  sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
  fail "Could not capture tunnel URL after 30 s. Check $CF_LOG for details."
fi
ok "Tunnel URL: ${BOLD}$TUNNEL_URL${NC}"

# ── Patch APP_URL in backend/.env ─────────────────────────────
if grep -q "^APP_URL=" "$ENV_FILE" 2>/dev/null; then
  sed -i '' "s|^APP_URL=.*|APP_URL=$TUNNEL_URL|" "$ENV_FILE"
else
  echo "APP_URL=$TUNNEL_URL" >> "$ENV_FILE"
fi
ok "APP_URL patched in backend/.env"

# ── Backend ───────────────────────────────────────────────────
info "Starting backend..."
cd "$ROOT/backend"
npm run dev > "$LOG_DIR/backend.log" 2>&1 &
echo $! > "$LOG_DIR/backend.pid"
echo "   PID $(cat "$LOG_DIR/backend.pid") — logs/backend.log"

# ── Frontend ──────────────────────────────────────────────────
info "Starting frontend..."
cd "$ROOT/frontend"
npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
echo $! > "$LOG_DIR/frontend.pid"
echo "   PID $(cat "$LOG_DIR/frontend.pid") — logs/frontend.log"

# ── Wait for ports ────────────────────────────────────────────
echo ""
echo "   Waiting for services..."

wait_for_port() {
  local port=$1 name=$2 tries=0
  while ! nc -z localhost "$port" 2>/dev/null; do
    sleep 1
    tries=$((tries + 1))
    if [ $tries -ge 40 ]; then
      fail "$name did not start on port $port within 40 s. Check logs/$name.log"
    fi
  done
  ok "$name ready  →  http://localhost:$port"
}

wait_for_port 3001 "backend"
wait_for_port 5179 "frontend"

# ── Summary ───────────────────────────────────────────────────
echo ""
echo -e "${BOLD}🚀  Talent Hub is running.${NC}"
echo ""
echo    "   Local   →  http://localhost:5179"
echo -e "   Public  →  ${BOLD}$TUNNEL_URL${NC}"
echo ""
echo -e "   ${YELLOW}Invite links will use:${NC} ${BOLD}$TUNNEL_URL/invite/<token>${NC}"
echo ""
echo    "   Run ./stop.sh to shut down."
