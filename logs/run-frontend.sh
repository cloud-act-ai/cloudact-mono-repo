#!/bin/bash
# CRITICAL: Frontend MUST run on port 3000 - NEVER use fallback ports
cd /Users/gurukallam/prod-ready-apps/cloudact-mono-repo/01-fronted-system

# Check if port 3000 is already in use
if lsof -i:3000 -sTCP:LISTEN 2>/dev/null | grep -q LISTEN; then
    echo "ERROR: Port 3000 is already in use!"
    echo "Kill the process first: lsof -ti:3000 | xargs kill -9"
    exit 1
fi

# Run explicitly on port 3000 with webpack (NOT turbopack - has type export bugs)
npx next dev --webpack --port 3000 2>&1 | while IFS= read -r line; do
    # Strip ANSI codes and add timestamp
    clean_line=$(echo "$line" | sed 's/\x1b\[[0-9;]*m//g')
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $clean_line"
done
