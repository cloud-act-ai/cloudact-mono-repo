#!/bin/bash
export TZ="America/Los_Angeles"
cd /Users/gurukallam/prod-ready-apps/cloudact-mono-repo/01-fronted-system
npm run dev 2>&1 | \
  while IFS= read -r line; do echo "[$(date '+%Y-%m-%d %H:%M:%S PST')] $line"; done
