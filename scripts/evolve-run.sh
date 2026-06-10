#!/bin/bash
# Nightly evolution cycle — skill reassignment + parameter optimization + LLM coach.
set -e
export PATH="$HOME/.nvm/versions/node/v22.22.3/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG="$PROJECT_DIR/lib/data/cron.log"

echo "$(date '+%Y-%m-%d %H:%M:%S') [evolve] starting nightly evolution" >> "$LOG"

PORT=3000
if curl -sf -m 5 http://localhost:3001/ >/dev/null 2>&1; then PORT=3001; fi

if curl -sf -X POST "http://localhost:${PORT}/api/cron/evolve" \
     -m 300 -o /tmp/agentic-evolve-result.json 2>/dev/null; then
  SUMMARY=$(python3 -c "
import json
d = json.load(open('/tmp/agentic-evolve-result.json'))
print('evolved=%s optimized=%s coached=%s' % (d['evolved'], d['optimized'], d['coached']))
" 2>/dev/null || echo "parse-error")
  echo "$(date '+%Y-%m-%d %H:%M:%S') [evolve] done: ${SUMMARY}" >> "$LOG"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') [evolve] FAILED — server unreachable" >> "$LOG"
fi
