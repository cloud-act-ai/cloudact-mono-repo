#!/bin/bash
################################################################################
# deploy-stage.sh - Quick deploy to STAGE environment
# Usage: ./deploy-stage.sh [service] [--skip-build]
################################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CICD_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

ENV="stage"
PROJECT_ID="cloudact-stage"
SERVICE=${1:-"all"}
SKIP_BUILD=""

[[ "$2" == "--skip-build" || "$1" == "--skip-build" ]] && SKIP_BUILD="--skip-build"

echo "Deploying to STAGE environment..."
echo "Project: $PROJECT_ID"
echo ""

if [ "$SERVICE" == "all" ] || [ "$SERVICE" == "--skip-build" ]; then
    $CICD_DIR/deploy-all.sh $ENV $SKIP_BUILD
else
    TAG=$(date +%Y%m%d-%H%M%S)
    if [ -z "$SKIP_BUILD" ]; then
        $CICD_DIR/cicd.sh $SERVICE $ENV $PROJECT_ID $TAG
    else
        $CICD_DIR/deploy/deploy.sh $SERVICE $ENV $PROJECT_ID "${ENV}-latest"
    fi
fi
