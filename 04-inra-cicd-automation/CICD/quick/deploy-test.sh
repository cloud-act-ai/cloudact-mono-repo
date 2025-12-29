#!/bin/bash
################################################################################
# deploy-test.sh - Quick deploy to TEST environment
# Usage: ./deploy-test.sh [service] [--skip-build]
################################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CICD_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

ENV="test"
PROJECT_ID="cloudact-testing-1"
SERVICE=${1:-"all"}
SKIP_BUILD=""

[[ "$2" == "--skip-build" || "$1" == "--skip-build" ]] && SKIP_BUILD="--skip-build"

echo "Deploying to TEST environment..."
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
