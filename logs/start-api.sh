#!/bin/bash
export TZ="America/Los_Angeles"
export PYTHONUNBUFFERED=1
cd /Users/gurukallam/prod-ready-apps/cloudact-mono-repo/02-api-service
PYTHONPATH="$(pwd)" python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload 2>&1 | \
  while IFS= read -r line; do echo "[$(date '+%Y-%m-%d %H:%M:%S PST')] $line"; done
