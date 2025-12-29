#!/bin/bash

# Configuration
SOURCE_DIR="/Users/gurukallam/prod-ready-apps/cloudact-mono-repo"
DEST_DIR="$HOME/Library/CloudStorage/OneDrive-Personal/CloudAct.ai"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="cloudact_mono_repo_backup_${TIMESTAMP}.tar.gz"
BACKUP_PATH="${DEST_DIR}/${BACKUP_NAME}"

# Ensure destination directory exists
if [ ! -d "$DEST_DIR" ]; then
    echo "Creating destination directory: $DEST_DIR"
    mkdir -p "$DEST_DIR"
fi

echo "Starting backup of $SOURCE_DIR to $BACKUP_PATH"

# Create the archive
# Excluding node_modules to keep size manageable
tar -czf "$BACKUP_PATH" \
    --exclude="node_modules" \
    --exclude=".DS_Store" \
    --exclude=".git" \
    --exclude="__pycache__" \
    --exclude=".venv" \
    --exclude="*.pyc" \
    --exclude=".next" \
    --exclude=".pytest_cache" \
    --exclude="*.log" \
    -C "$(dirname "$SOURCE_DIR")" \
    "$(basename "$SOURCE_DIR")"

if [ $? -eq 0 ]; then
    echo "Backup completed successfully: $BACKUP_PATH"
    echo "Size: $(du -h "$BACKUP_PATH" | cut -f1)"
else
    echo "Backup failed!"
    exit 1
fi
