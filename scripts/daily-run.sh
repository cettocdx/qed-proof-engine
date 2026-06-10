#!/bin/bash
# Continuous bot runner — called by macOS LaunchAgent every 15 minutes.
# Generates intraday signals (1h bars) for all 35 bots including memecoins.
# Hits the API endpoint; works whether the Next.js dev server is up or runs via tsx directly.

set -e

# launchd has a minimal PATH — add node (nvm) and homebrew
export PATH="$HOME/.nvm/versions/node/v22.22.3/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG="$PROJECT_DIR/lib/data/cron.log"

echo "$(date '+%Y-%m-%d %H:%M:%S') [cron] starting continuous bot run (35 bots, 1h bars)" >> "$LOG"

# Try API endpoint first (if dev server is running)
# Try port 3001 first, fall back to 3000
PORT=3000
if curl -sf -m 5 http://localhost:3001/ >/dev/null 2>&1; then PORT=3001; fi

if curl -sf -X POST "http://localhost:${PORT}/api/cron/run-bots" \
     -m 300 -H "Content-Type: application/json" \
     -o /tmp/agentic-cron-result.json 2>/dev/null; then
  SUMMARY=$(python3 -c "
import json
d = json.load(open('/tmp/agentic-cron-result.json'))
print('emitted=%s chain=%s' % (d['emitted'], d['chain']['ok']))
" 2>/dev/null || echo "parse-error")
  echo "$(date '+%Y-%m-%d %H:%M:%S') [cron] via API port=${PORT}: ${SUMMARY}" >> "$LOG"
else
  # Fallback: run tsx directly
  cd "$PROJECT_DIR"
  npx tsx scripts/run-bots.ts --live >> "$LOG" 2>&1
  echo "$(date '+%Y-%m-%d %H:%M:%S') [cron] via tsx (direct)" >> "$LOG"
fi
