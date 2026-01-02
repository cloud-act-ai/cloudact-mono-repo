#!/bin/bash
# Add PST timestamp to each line of input
export TZ="America/Los_Angeles"
while IFS= read -r line; do
    echo "[$(date '+%Y-%m-%d %H:%M:%S PST')] $line"
done
