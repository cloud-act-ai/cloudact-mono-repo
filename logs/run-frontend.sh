#!/bin/bash
cd /Users/gurukallam/prod-ready-apps/cloudact-mono-repo/01-fronted-system
npm run dev 2>&1 | while IFS= read -r line; do
    # Strip ANSI codes and add timestamp
    clean_line=$(echo "$line" | sed 's/\x1b\[[0-9;]*m//g')
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $clean_line"
done
