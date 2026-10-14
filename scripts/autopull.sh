#!/bin/bash
# Whirlcrypt autopull: deploy origin/main when it moves.
#
# Runs from cron every few minutes, needs no sudo: install, build, test, then
# restart by signalling the service process and letting systemd's
# Restart=always bring it back on the new code. Exits quietly when already
# up to date. Logs go to stdout (cron appends them to autopull.log).
set -u

APP_DIR=/home/andrei/whirlcrypt
export PATH=/usr/local/bin:/usr/bin:/bin

stamp() { date -u +%FT%TZ; }

exec 9>"$APP_DIR/.autopull.lock"
flock -n 9 || { echo "$(stamp) autopull: another run holds the lock; exiting"; exit 0; }

cd "$APP_DIR" || exit 1

git fetch origin main --quiet || { echo "$(stamp) autopull: fetch failed"; exit 1; }
BEFORE=$(git rev-parse HEAD)
AFTER=$(git rev-parse origin/main)
if [ "$BEFORE" = "$AFTER" ]; then
  exit 0
fi
echo "$(stamp) autopull: deploying $BEFORE -> $AFTER"

git pull --ff-only origin main || { echo "$(stamp) autopull: pull failed (non-fast-forward?)"; exit 1; }

CHANGED=$(git diff --name-only "$BEFORE" "$AFTER")
if ! echo "$CHANGED" | grep -qE '^(backend|frontend|shared)/|^package-lock\.json$'; then
  echo "$(stamp) autopull: docs/config-only change; no rebuild needed"
  exit 0
fi

if echo "$CHANGED" | grep -qE '(^|/)package\.json$|^package-lock\.json$'; then
  echo "$(stamp) autopull: dependencies changed; installing..."
  npm ci || { echo "$(stamp) autopull: npm ci failed"; exit 1; }
fi

echo "$(stamp) autopull: building..."
npm run build || { echo "$(stamp) autopull: build failed"; exit 1; }

echo "$(stamp) autopull: testing..."
(cd backend && npm test) || { echo "$(stamp) autopull: backend tests failed"; exit 1; }
(cd frontend && npm test) || { echo "$(stamp) autopull: frontend tests failed"; exit 1; }

PID=$(systemctl show whirlcrypt -p MainPID --value)
if [ -z "$PID" ] || [ "$PID" = "0" ]; then
  echo "$(stamp) autopull: service not running; cannot start without sudo - needs a human"
  exit 1
fi
echo "$(stamp) autopull: restarting service (PID $PID)..."
kill "$PID" || { echo "$(stamp) autopull: signal failed"; exit 1; }

sleep 20
if curl -s -o /dev/null --max-time 10 http://localhost:3001/api/health; then
  echo "$(stamp) autopull: deployed $AFTER, health OK"
else
  echo "$(stamp) autopull: deployed $AFTER BUT health check failed - needs a human"
  exit 1
fi
