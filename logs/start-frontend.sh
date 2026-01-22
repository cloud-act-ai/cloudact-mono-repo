#!/bin/bash
export TZ="America/Los_Angeles"
cd /Users/gurukallam/prod-ready-apps/cloudact-mono-repo/01-fronted-system

# Strip ANSI color codes for clean logs
npm run dev 2>&1 | perl -pe 's/\e\[[0-9;]*m//g' | \
  while IFS= read -r line; do echo "[$(date '+%Y-%m-%d %H:%M:%S PST')] $line"; done
